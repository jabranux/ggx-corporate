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
import { resolveBridgeIdentity, type BridgeIdentity } from './demoUsers.js';

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
