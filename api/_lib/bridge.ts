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
 * ── POC identity assumption (deliberate, documented) ───────────────────────
 * GGX Corporate has no server-side session yet — it is a mock/demo app whose
 * "signed-in user" lives in browser localStorage (`authService`). The browser
 * therefore cannot be trusted to state its own `externalUserId`/`externalOrgId`
 * (a caller could invoke this proxy with someone else's identity and it would
 * be forwarded to Bridge as-is — this was flagged as a P1 in the handoff doc's
 * §12.2 re-audit). Fix: the browser sends only an opaque `demoAccountId`
 * (`heyqService.getDemoAccountId()`), and `resolveDemoIdentity`
 * (`api/_lib/demoIdentity.ts`) is the ONLY place that maps it to a Bridge
 * identity, by looking it up in the app's existing fixed demo-user dataset.
 * Every route below MUST call `requireDemoIdentity` and use ONLY its result —
 * never read `externalUserId`/`externalOrgId` directly off the request.
 * This narrows what the browser can do — it can only select one of a small,
 * fixed set of demo accounts this deployment ships, and only through a
 * server-owned lookup, never by asserting arbitrary identity fields — but it
 * is still NOT a verified session (see `demoIdentity.ts`'s docblock for the
 * exact boundary). Real session-derived identity is deferred to production
 * (see the handoff doc's "Production auth" section).
 */
import { resolveDemoIdentity, type BridgeIdentity } from './demoIdentity.ts';

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
 * Resolve `demoAccountId` to a Bridge identity via the app's fixed demo-user
 * allowlist (`demoIdentity.ts`), or write a fail-closed `400` and return
 * `null`. This is the ONLY identity path a route may use — never read
 * `externalUserId`/`externalOrgId` directly off the request, even if present
 * (a caller sending those fields must have no effect: they are ignored, not
 * merged or used as a fallback).
 *
 * Callers MUST `return` immediately when this returns `null` — the 400 is
 * already written to `res`.
 */
export function requireDemoIdentity(res: ProxyResponse, demoAccountId: unknown): BridgeIdentity | null {
  const identity = resolveDemoIdentity(demoAccountId);
  if (!identity) {
    res.status(400).json({
      error: 'Unknown or missing demo account. Sign in with one of this app’s demo accounts and try again.',
    });
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
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
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
  const message = err instanceof BridgeConfigError ? err.message : 'Support proxy misconfigured.';
  console.error('[support proxy]', message);
  res.status(500).json({ error: message });
}

/** Network/unexpected failure reaching Bridge → 502, mirroring the client's
 * existing "unavailable" outcome for a 5xx/network failure. */
export function failUpstream(res: ProxyResponse, route: string, err: unknown): void {
  console.error(`[support proxy] ${route}`, err);
  res.status(502).json({ error: 'QuadX Bridge is temporarily unreachable.' });
}
