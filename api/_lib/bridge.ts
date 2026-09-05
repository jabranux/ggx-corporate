/**
 * bridge — shared server-only helpers for the GGX Corporate support proxy (BFF).
 *
 * Architecture (see docs/migration/ggx-corporate-heyq-live-ticketing.md):
 *
 *   GGX Corporate Browser → Corporate /api/support/* (this file's callers) →
 *   QuadX Bridge → HeyQ/Supabase
 *
 * Every route under /api/support/* funnels its outbound call through
 * `bridgeFetch`, which is the ONLY place `QUADX_BRIDGE_API_KEY` is read and
 * attached. This module lives under /api specifically so Vercel deploys it as
 * a server-only function bundle — Vite never bundles anything under /api into
 * the browser build, so the key can never end up in client code or a network
 * payload the browser can see.
 *
 * ── Server-verified identity ─────────────────────────────────────────────
 * The browser cannot be trusted to state its own identity: a browser-supplied
 * `externalUserId`/`externalOrgId`, and later a browser-supplied opaque
 * `demoAccountId`, were both forgeable (a caller who knew another valid
 * account's identifier could impersonate that account — see the handoff
 * doc's "Server-verified support identity" section for the audit history).
 * Fix: `requireSessionIdentity` below derives identity from the signed,
 * httpOnly session cookie (`api/_lib/session.ts`) set by `api/auth/login.ts`
 * — the browser can send it but never read, construct, or edit it — and maps
 * the verified user id to a Bridge identity via `resolveBridgeIdentity`
 * (`api/_lib/demoUsers.ts`). Every route below MUST call
 * `requireSessionIdentity` and use ONLY its result — never read
 * `externalUserId`/`externalOrgId`/`demoAccountId` directly off the request.
 * Still a small, fixed POC account set, not general-purpose auth — see
 * `session.ts` and `demoUsers.ts`'s docblocks for the exact boundary.
 */
import { readVerifiedSession, SessionConfigError } from './session.js';
import { resolveBridgeIdentity, resolveDisplayName, resolveAccountName, type BridgeIdentity } from './demoUsers.js';

export { SessionConfigError } from './session.js';

export class BridgeConfigError extends Error {}

interface BridgeConfig {
  apiKey: string;
  baseUrl: string;
}

let cached: BridgeConfig | null = null;

/**
 * Read + validate the two server-only env vars this proxy needs. Throws
 * `BridgeConfigError` with a clear, specific message when either is missing —
 * routes turn that into a 500 rather than a confusing downstream failure.
 * Never logs or returns the key itself.
 */
export function getBridgeConfig(): BridgeConfig {
  if (cached) return cached;

  const apiKey = process.env.QUADX_BRIDGE_API_KEY?.trim();
  if (!apiKey) {
    throw new BridgeConfigError(
      'QUADX_BRIDGE_API_KEY is not set on the server. The support proxy refuses ' +
      'to call QuadX Bridge without it — set it in the deployment environment ' +
      '(server-side only; never a VITE_-prefixed variable, never committed).',
    );
  }

  const baseUrl = process.env.QUADX_BRIDGE_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new BridgeConfigError(
      'QUADX_BRIDGE_URL is not set on the server. Point it at the deployed ' +
      'QuadX Bridge origin (server-side only) before the support proxy can reach it.',
    );
  }

  cached = { apiKey, baseUrl };
  return cached;
}

export interface BridgeFetchInit {
  method: 'GET' | 'POST';
  body?: unknown;
  /** Extra headers to forward as-is (e.g. Idempotency-Key, X-Bridge-Message-Id). */
  headers?: Record<string, string>;
}

/**
 * Call QuadX Bridge with the server-only key attached via the approved header
 * (`X-Corporate-Internal-Key`, per docs/migration/quadx-bridge-heyq-reconnection.md
 * in the HeyQ repo). This is the ONLY function in Corporate that is allowed to
 * fetch a QuadX Bridge URL — every /api/support/* route goes through it, and no
 * browser code path may call it directly (it lives under /api, server-only).
 */
export async function bridgeFetch(path: string, init: BridgeFetchInit): Promise<Response> {
  const { apiKey, baseUrl } = getBridgeConfig();
  return fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Corporate-Internal-Key': apiKey,
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/**
 * Derive the caller's Bridge identity from their VERIFIED session cookie
 * (`session.ts`), or write a fail-closed `401` and return `null`. This is the
 * ONLY identity path a route may use — never read `externalUserId`/
 * `externalOrgId`/`demoAccountId` directly off the request, even if present
 * (a caller sending those fields must have no effect: they are ignored, not
 * merged or used as a fallback).
 *
 * Callers MUST `return` immediately when this returns `null` — the 401 is
 * already written to `res`. Lets `SessionConfigError` (missing
 * `SESSION_SECRET`) propagate to the caller's try/catch, which turns it into
 * a 500 the same way `BridgeConfigError` is handled.
 */
export function requireSessionIdentity(req: ProxyRequest, res: ProxyResponse): BridgeIdentity | null {
  const session = readVerifiedSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in. Sign in and try again.' });
    return null;
  }
  const identity = resolveBridgeIdentity(session.sub);
  if (!identity) {
    res.status(401).json({ error: 'Session account is no longer valid. Sign in again.' });
    return null;
  }
  return identity;
}

/**
 * Same as `requireSessionIdentity`, plus the caller's server-verified
 * display name and account/subaccount name
 * (`demoUsers.ts#resolveDisplayName`/`resolveAccountName`) — for Ops
 * Requests, which carries human-readable "requested by"/"subaccount" labels
 * into Bridge's opaque `requestData`: a client-supplied value for either
 * must never be trusted (Codex review finding — a manager could otherwise
 * attribute a request to someone else, or to a subaccount they don't own).
 */
export function requireSessionIdentityWithName(
  req: ProxyRequest,
  res: ProxyResponse,
): { identity: BridgeIdentity; displayName: string; accountName: string } | null {
  const session = readVerifiedSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in. Sign in and try again.' });
    return null;
  }
  const identity = resolveBridgeIdentity(session.sub);
  const displayName = resolveDisplayName(session.sub);
  const accountName = resolveAccountName(session.sub);
  if (!identity || !displayName || !accountName) {
    res.status(401).json({ error: 'Session account is no longer valid. Sign in again.' });
    return null;
  }
  return { identity, displayName, accountName };
}

/**
 * `true` when `accountId` (== a verified `BridgeIdentity.externalOrgId`) is
 * the "sees everything" sentinel already established by this codebase's own
 * pre-existing client-side scoping convention (`opsRequestsService.ts`'s
 * previous mock-era filter, `subaccountId !== 'all' && subaccountId !== 'main'`)
 * — the Main Account admin, never a specific subaccount. A subaccount
 * manager's `accountId` is their own subaccount id (e.g. `'acme-luzon'`) and
 * is never this sentinel.
 */
export function isConsolidatedAccountId(accountId: string): boolean {
  return accountId === 'main';
}

/**
 * True when the body/query carries any attachment payload. The approved
 * Bridge contract is text-only (uploads return 400); the proxy rejects them
 * itself with a clear message instead of round-tripping to Bridge first, and
 * never parses or stores file bytes (no attachment infrastructure is built
 * here — see the handoff doc's "Attachment limitation" section).
 */
export function hasAttachmentPayload(body: Record<string, unknown> | undefined | null): boolean {
  const attachments = body?.attachments;
  return Array.isArray(attachments) && attachments.length > 0;
}

// ── Minimal request/response shapes ─────────────────────────────────────────
// Structurally compatible with Vercel's Node.js function runtime (which adds
// parsed `query`/`body` and `status()/json()/send()` to plain Node
// IncomingMessage/ServerResponse) without depending on the `@vercel/node`
// package purely for types.

export interface ProxyRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ProxyResponse {
  status(code: number): ProxyResponse;
  json(body: unknown): void;
  send(body: string): void;
  setHeader(name: string, value: string): void;
}

/** First value of a possibly-repeated header/query param, or undefined. */
export function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Safely extract a query parameter from req.query or req.url. */
export function getQueryParam(req: ProxyRequest, key: string): string | undefined {
  if (req?.query && typeof req.query === 'object') {
    const val = req.query[key];
    if (Array.isArray(val)) return val[0];
    if (typeof val === 'string') return val;
  }
  if (req?.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      return url.searchParams.get(key) ?? undefined;
    } catch {
      // ignore
    }
  }
  return undefined;
}

/** Safely extract a header from req.headers. */
export function getHeader(req: ProxyRequest, key: string): string | undefined {
  if (!req?.headers) return undefined;
  const lowerKey = key.toLowerCase();
  const val = req.headers[lowerKey] ?? req.headers[key];
  if (Array.isArray(val)) return val[0];
  if (typeof val === 'string') return val;
  return undefined;
}

/** Safely extract request body as an object. */
export async function getRequestBody(req: ProxyRequest): Promise<Record<string, unknown>> {
  if (req?.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req?.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (req && typeof (req as any).on === 'function') {
    try {
      const buffers: Uint8Array[] = [];
      for await (const chunk of req as any) {
        buffers.push(chunk);
      }
      const text = Buffer.concat(buffers).toString('utf-8');
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Relay a Bridge response to the Corporate browser client unchanged (status +
 * body) — the client keeps the single place that interprets outcomes
 * (403 → forbidden, 404 → not_found, other non-2xx → unavailable). */
export async function relay(res: ProxyResponse, bridgeRes: Response): Promise<void> {
  const text = await bridgeRes.text();
  res.status(bridgeRes.status);
  res.setHeader('Content-Type', bridgeRes.headers.get('content-type') ?? 'application/json');
  res.send(text);
}

/**
 * Like `relay`, but for routes that must inspect/filter Bridge's JSON body
 * server-side (e.g. subaccount ownership) before it ever reaches the
 * browser — never usable for a route that just forwards bytes unchanged.
 * Returns `null` on a non-2xx response (already relayed to `res` unchanged,
 * same status/body Bridge sent) so the caller can bail out immediately.
 */
export async function relayJson(res: ProxyResponse, bridgeRes: Response): Promise<unknown | null> {
  if (!bridgeRes.ok) {
    await relay(res, bridgeRes);
    return null;
  }
  const text = await bridgeRes.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    res.status(502).json({ error: 'QuadX Bridge returned an unexpected response.' });
    return null;
  }
}

/** Missing/invalid server config → 500 with a clear, actionable message. Never
 * exposes the key; only whether it/the base URL is configured. */
export function failConfig(res: ProxyResponse, err: unknown): void {
  const message = (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message) : 'Support proxy misconfigured.';
  console.error('[support proxy]', message);
  res.status(500).json({ error: message });
}

/** Network/unexpected failure reaching Bridge → 502, mirroring the client's
 * existing "unavailable" outcome for a 5xx/network failure. */
export function failUpstream(res: ProxyResponse, route: string, err: unknown): void {
  console.error(`[support proxy] ${route}`, err);
  res.status(502).json({ error: 'QuadX Bridge is temporarily unreachable.' });
}

// GGX's free-text CLAIM_REASONS (src/app/data/claims.ts) → Bridge's 5-value
// claims.reason check constraint (public.claims, 20260917091000). One-way,
// display-string → canonical-code, same pattern as CATEGORY_ID_TO_CONCERN_TYPE
// already uses for support tickets — GGX's own reason text never changes.
const CLAIM_REASON_TO_BRIDGE: Record<string, string> = {
  'Undelivered — returned to sender': 'mishandled_shipment',
  'Delivery failed': 'delivery_failure',
  'Lost in transit': 'lost_parcel',
  'Damaged item': 'damaged_parcel',
  'Significant delay': 'delivery_failure',
  'Other': 'other',
};

/** Map a GGX claim reason string to Bridge's canonical reason code, falling
 * back to 'other' for anything unrecognized (never blocks filing on a
 * cosmetic label mismatch). */
export function mapClaimReasonToBridge(reason: string): string {
  return CLAIM_REASON_TO_BRIDGE[reason] ?? 'other';
}

// GGX's existing Ops Request category/subtype keys (src/app/data/operationsRequests.ts,
// preserved unchanged per the task's own instruction) vs. Bridge's
// `OPS_REQUEST_CATALOG` keys (supabase/functions/quadx-bridge/index.ts in the
// HeyQ repo) — a handful differ cosmetically. One-way, display-key ->
// canonical-Bridge-key, same pattern as CLAIM_REASON_TO_BRIDGE above. GGX's
// own type unions/labels never change; only this boundary translates.
const OPS_CATEGORY_TO_BRIDGE: Record<string, string> = {
  supply: 'supply_request',
  pickup_support: 'pickup_support',
  operational_assistance: 'operational_assistance',
};

const OPS_CATEGORY_FROM_BRIDGE: Record<string, string> = {
  supply_request: 'supply',
  pickup_support: 'pickup_support',
  operational_assistance: 'operational_assistance',
};

const OPS_SUBTYPE_TO_BRIDGE: Record<string, string> = {
  // supply
  pouches: 'pouches',
  boxes: 'boxes',
  other_packaging: 'other_packaging_supplies',
  // pickup support (all identical to Bridge already)
  immediate_pickup: 'immediate_pickup',
  bulk_pickup_assistance: 'bulk_pickup_assistance',
  four_wheel_pickup: 'four_wheel_pickup',
  reschedule_pickup: 'reschedule_pickup',
  escalate_missed_pickup: 'escalate_missed_pickup',
  // operational assistance
  special_handling: 'special_handling',
  high_volume_dispatch: 'high_volume_dispatch_coordination',
  warehouse_coordination: 'warehouse_branch_coordination',
};

export function mapOpsCategoryToBridge(category: string): string {
  return OPS_CATEGORY_TO_BRIDGE[category] ?? category;
}

export function mapOpsCategoryFromBridge(category: string): string {
  return OPS_CATEGORY_FROM_BRIDGE[category] ?? category;
}

export function mapOpsSubtypeToBridge(subtype: string): string {
  return OPS_SUBTYPE_TO_BRIDGE[subtype] ?? subtype;
}

/**
 * Bridge's Ops Request POC has no subaccount entity — `externalOrgId` IS the
 * account key throughout (one demo corporate account per product; see the
 * HeyQ repo's `docs/handoffs/phase2-ops-request-poc.md`). GGX Corporate's own
 * demo identities carry TWO different `externalOrgId` values instead
 * ('main' for the admin, 'acme-luzon' for the manager —
 * `api/_lib/demoUsers.ts`), because that field doubles as the ticket/claims
 * requester-org key for those older, unrelated features.
 *
 * Using `identity.externalOrgId` unchanged for Ops Requests would silently
 * split the ONE demo corporate account's requests into two disjoint Bridge
 * accounts — breaking the product rule that Main Account sees consolidated
 * data across every subaccount (Codex review finding, fixed here). Every
 * Ops Request Bridge call therefore pins `externalOrgId` to this single
 * constant regardless of which GGX identity is calling; `externalUserId`
 * still reflects the real signed-in person unchanged. GGX's own
 * subaccount/manager scoping (which subaccount a request belongs to) is
 * carried inside Bridge's opaque `requestData` JSON and applied entirely
 * client-side, same as before this integration.
 */
export const OPS_REQUESTS_ACCOUNT_EXTERNAL_ID = 'ggx-corporate';

/**
 * Re-verify a category id against Bridge's LIVE `GET /customer/categories`
 * response, fresh, right before a ticket is created — never against anything
 * cached in this process. Ticket creation is the one write that carries a
 * category id, and Bridge's own `create_customer_ticket_bridge` RPC does not
 * itself reject an unrecognized id (it silently substitutes a mapped default —
 * see docs/migration/ggx-corporate-live-concern-categories.md's "Known
 * Bridge-side limitations"). This closes that gap from the Corporate side:
 * an id that is missing, malformed, or no longer live is rejected here,
 * before Bridge is ever asked to create anything.
 */
export async function verifyLiveCategoryId(
  categoryId: string,
): Promise<'ok' | 'invalid' | 'unavailable'> {
  let bridgeRes: Response;
  try {
    bridgeRes = await bridgeFetch('/customer/categories', { method: 'GET' });
  } catch {
    return 'unavailable';
  }
  if (!bridgeRes.ok) return 'unavailable';
  let categories: unknown;
  try {
    categories = await bridgeRes.json();
  } catch {
    return 'unavailable';
  }
  if (!Array.isArray(categories)) return 'unavailable';
  const isLive = categories.some(
    (c) =>
      c &&
      typeof c === 'object' &&
      ((c as { id?: unknown }).id === categoryId ||
        (Array.isArray((c as { subcategories?: unknown }).subcategories) &&
          (c as { subcategories: Array<{ id?: unknown }> }).subcategories.some(
            (s) => s && typeof s === 'object' && s.id === categoryId,
          ))),
  );
  return isLive ? 'ok' : 'invalid';
}
