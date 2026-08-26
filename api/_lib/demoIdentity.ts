/**
 * demoIdentity — server-side POC/demo identity mapping for the support proxy.
 *
 * Fixes the P1 finding in docs/migration/ggx-corporate-heyq-live-ticketing.md
 * §12.2: every proxy route used to read `externalUserId`/`externalOrgId`
 * straight off browser-controlled query/body fields and forward them to
 * QuadX Bridge as-is — a caller could invoke a same-origin route with a
 * different identity and the proxy would authenticate it to Bridge with the
 * Corporate secret regardless.
 *
 * Fix (POC-appropriate, NOT production auth): the browser sends only an
 * opaque `demoAccountId` — the stable `id` field already on the app's mock
 * session user (`MockAuthUser.id`, e.g. `user-admin-001`), the same value
 * `authService.getSessionContext()` already exposes. This module is the
 * ONLY place that turns that id into Bridge's `externalUserId`/`externalOrgId`,
 * by looking it up in `MOCK_AUTH_USERS` — the SAME dataset `authService`
 * itself is backed by, reused rather than duplicated so a demo account added
 * there is automatically valid here too, with no second table to keep in sync.
 *
 * `resolveDemoIdentity` is deliberately narrow: it returns `null` for anything
 * not in that fixed dataset (missing, empty, unknown, or — because it's a
 * lookup key into a server-side object, not a query the browser controls the
 * shape of — un-spoofable by supplying a differently-shaped value). Callers
 * MUST treat `null` as fail-closed (400) and MUST NOT fall back to reading
 * `externalUserId`/`externalOrgId` from the request for authorization.
 *
 * ── Explicitly NOT production authentication ────────────────────────────────
 * There is no session token, no signature, no expiry, no per-request identity
 * proof — `demoAccountId` is exactly as forgeable as `externalUserId` was
 * (a caller can still send any OTHER user's `demoAccountId` and act as them).
 * What this fixes is narrower and specific to this POC: the browser can no
 * longer invent a Bridge identity that isn't one of the fixed demo accounts
 * this Corporate deployment actually ships, and the mapping from "the app's
 * notion of a signed-in demo user" to "the Bridge's notion of a requester" now
 * happens server-side against a server-owned table instead of being echoed
 * back verbatim from the request. This is sufficient ONLY for a controlled
 * demo environment with a small, fixed, non-sensitive set of accounts. A real
 * deployment needs a verified server-side session (see the handoff doc's
 * "Production auth — still deferred" section) — building that is explicitly
 * out of scope for this pass.
 */
export interface BridgeIdentity {
  externalUserId: string;
  externalOrgId: string;
}

/** id → Bridge identity, self-contained for serverless execution. */
const ALLOWLIST: ReadonlyMap<string, BridgeIdentity> = new Map([
  ['user-admin-001', { externalUserId: 'max@email.com', externalOrgId: 'main' }],
  ['user-mgr-001', { externalUserId: 'manager@email.com', externalOrgId: 'acme-luzon' }],
]);

/**
 * Resolve a browser-supplied `demoAccountId` to the Bridge identity it maps
 * to, or `null` if it is missing, not a string, or not one of the app's known
 * demo accounts. Fail-closed: `null` must never be treated as "use defaults"
 * or "trust something else from the request" by the caller.
 */
export function resolveDemoIdentity(demoAccountId: unknown): BridgeIdentity | null {
  if (typeof demoAccountId !== 'string') return null;
  const trimmed = demoAccountId.trim();
  if (!trimmed) return null;
  return ALLOWLIST.get(trimmed) ?? null;
}
