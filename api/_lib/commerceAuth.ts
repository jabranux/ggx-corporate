/**
 * commerceAuth — server-verified identity + account/subaccount scope
 * resolution for the Commerce BFF (`api/commerce/**`).
 *
 * Reuses the same signed session cookie every other Corporate proxy trusts
 * (`api/_lib/session.ts`) — there is no separate Commerce login. A caller's
 * `accountId` is read from the VERIFIED session only; a client-supplied
 * account/subaccount id is honored ONLY for the Main Account admin choosing
 * which subaccount to act on (mirrors the existing Ops Requests rule — see
 * docs/session_state.md's "server-side subaccount authorization" entry) —
 * never for a manager, who always gets their own session account forced,
 * regardless of what the request body/query claims.
 */
import { readVerifiedSession, SessionConfigError, type SessionPayload } from './session.js';
import type { ProxyRequest, ProxyResponse } from './bridge.js';

export { SessionConfigError };

export interface CommerceIdentity {
  userId: string;
  role: SessionPayload['role'];
  /** The verified session's own account/subaccount id — never client-supplied. */
  sessionAccountId: string;
  accountName: string;
}

/** `true` for the Main Account admin sentinel — mirrors `bridge.ts#isConsolidatedAccountId`. */
export function isConsolidatedAccountId(accountId: string): boolean {
  return accountId === 'main';
}

/** Verify the session cookie, or write a fail-closed 401 and return `null`.
 * Callers MUST `return` immediately when this returns `null`. */
export function requireCommerceIdentity(req: ProxyRequest, res: ProxyResponse): CommerceIdentity | null {
  const session = readVerifiedSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in. Sign in and try again.' });
    return null;
  }
  return {
    userId: session.sub,
    role: session.role,
    sessionAccountId: session.accountId,
    accountName: session.accountName,
  };
}

export type ScopeSelection =
  | { mode: 'single'; accountId: string }
  | { mode: 'consolidated' };

/**
 * Resolve which account(s) a request may act on.
 *
 * - A manager (or a non-'main' session) always gets their own session
 *   account — `requestedAccountId` is silently ignored, never trusted.
 * - The Main Account admin may pass an explicit `requestedAccountId` to act
 *   on one specific subaccount (trusted only because the caller is verified
 *   'main'); passing none (or `'all'`) means "consolidated" — every
 *   account's rows, for read endpoints that support it.
 */
export function resolveScope(identity: CommerceIdentity, requestedAccountId: string | undefined): ScopeSelection {
  const isAdmin = identity.role === 'admin' && isConsolidatedAccountId(identity.sessionAccountId);
  if (!isAdmin) return { mode: 'single', accountId: identity.sessionAccountId };
  if (!requestedAccountId || requestedAccountId === 'all') return { mode: 'consolidated' };
  return { mode: 'single', accountId: requestedAccountId };
}

/**
 * Resolve the SINGLE account a write must target — writes are never
 * "consolidated" (every mutation belongs to exactly one account). Same
 * admin-may-choose / manager-is-forced rule as `resolveScope`.
 */
export function resolveWriteAccountId(identity: CommerceIdentity, requestedAccountId: string | undefined): string {
  const isAdmin = identity.role === 'admin' && isConsolidatedAccountId(identity.sessionAccountId);
  if (isAdmin && requestedAccountId) return requestedAccountId;
  return identity.sessionAccountId;
}
