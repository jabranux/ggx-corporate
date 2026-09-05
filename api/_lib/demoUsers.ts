/**
 * demoUsers — self-contained POC user directory for the server-side login
 * endpoint and Bridge identity mapping.
 *
 * Deliberately DUPLICATED from `src/app/data/mock/auth.mock.ts` rather than
 * imported: importing anything under `src/` into `api/` previously broke
 * serverless execution in production (transitively pulled in React's
 * AuthContext — see docs/migration/ggx-corporate-heyq-live-ticketing.md
 * §17.1's "Module Dependency" fix, which is why `demoIdentity.ts` — this
 * file's predecessor — inlined its identity map instead of importing one).
 * Keep both lists in sync by hand; adding a demo account means editing both.
 *
 * ── What this is / is not ────────────────────────────────────────────────
 * `verifyDemoCredentials` is the ONLY place a password is checked — it backs
 * `POST /api/auth/login` (`api/auth/login.ts`). `resolveQuickLoginUser` is
 * the ONLY place an opaque Quick Login scope is resolved — it backs
 * `POST /api/auth/quick-login` (`api/auth/quick-login.ts`), the Login page's
 * Quick Login cards, which send a scope string (`'main'` | `'subaccount'`)
 * instead of a password. Both routes are the only places a session token is
 * minted (see `session.ts`). `resolveBridgeIdentity` is the
 * ONLY place a verified session's Bridge identity is derived, and it always
 * re-reads the CURRENT table by id rather than trusting fields embedded in
 * an already-issued token — so removing/reassigning a demo account here
 * invalidates what any outstanding session for it can do, without needing a
 * token-revocation list. Still a fixed, non-sensitive, small POC account
 * set — not general-purpose auth. See the handoff doc's "Server-verified
 * support identity" section for the full boundary.
 */
import { timingSafeEqual } from 'node:crypto';

export interface DemoUser {
  id: string;
  email: string;
  password: string;
  role: 'admin' | 'manager';
  name: string;
  accountId: string;
  accountName: string;
}

export interface BridgeIdentity {
  externalUserId: string;
  externalOrgId: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  { id: 'user-admin-001', email: 'max@email.com', password: '!1234qwer', role: 'admin', name: 'Max Rodriguez', accountId: 'main', accountName: 'Main Account' },
  { id: 'user-mgr-001', email: 'manager@email.com', password: '!1234qwer', role: 'manager', name: 'Rina Lopez', accountId: 'acme-luzon', accountName: 'Acme Luzon' },
];

export type QuickLoginScope = 'main' | 'subaccount';

/**
 * Opaque scope → demo user id, for the Login page's "Main Account" /
 * "Subaccount" Quick Login cards. The frontend sends only the scope string
 * (`api/auth/quick-login.ts`); it never sees or holds the underlying email/
 * password — those stay server-side, same as every other credential in this
 * file. Keep in sync with `QUICK_LOGIN_ACCOUNTS` in `src/app/pages/Login.tsx`
 * (label/description only — no credentials there either).
 */
const QUICK_LOGIN_SCOPES: Readonly<Record<QuickLoginScope, string>> = {
  main: 'user-admin-001',
  subaccount: 'user-mgr-001',
};

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Compare against a same-length buffer even on a length mismatch so the
  // branch itself doesn't leak length via timing; the equality still fails.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Verify an email + password pair against the POC demo directory. Returns
 * the matching `DemoUser` or `null` — never partial info on a near-miss.
 * Never logs the password.
 */
export function verifyDemoCredentials(email: unknown, password: unknown): DemoUser | null {
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return null;
  const user = DEMO_USERS.find((u) => u.email === email);
  if (!user) return null;
  return timingSafeStringEqual(user.password, password) ? user : null;
}

/**
 * Map a VERIFIED session's stable user id to its Bridge identity, by looking
 * it up fresh in the current table. `userId` must already be authenticated
 * (i.e. come from a signature-verified `SessionPayload.sub`) — this function
 * does no verification of its own and must never be called with a
 * client-supplied id directly.
 */
export function resolveBridgeIdentity(userId: string): BridgeIdentity | null {
  const user = DEMO_USERS.find((u) => u.id === userId);
  if (!user) return null;
  return { externalUserId: user.email, externalOrgId: user.accountId };
}

/**
 * Server-verified display name for a VERIFIED session's user id — same
 * "never trust the client, always re-read the current table" rule as
 * `resolveBridgeIdentity`. Used where a Bridge write carries a human-
 * readable "requested by" name (Ops Requests) that must not be spoofable
 * via the request body (Codex review finding).
 */
export function resolveDisplayName(userId: string): string | null {
  const user = DEMO_USERS.find((u) => u.id === userId);
  return user ? user.name : null;
}

/**
 * Server-verified subaccount/account name for a VERIFIED session's user id —
 * same rule as `resolveDisplayName`. Paired with `resolveBridgeIdentity`'s
 * `externalOrgId` (== `accountId`, e.g. `'main'` for the admin, `'acme-luzon'`
 * for the manager) to authoritatively label which account/subaccount a
 * server-enforced write belongs to, never a client-supplied label.
 */
export function resolveAccountName(userId: string): string | null {
  const user = DEMO_USERS.find((u) => u.id === userId);
  return user ? user.accountName : null;
}

/**
 * Resolve a Quick Login scope (`'main'` | `'subaccount'`) to its demo user,
 * for `POST /api/auth/quick-login`. Only the two fixed scopes above resolve
 * to anything; any other value (including a client-supplied user id) returns
 * `null` — this is not a general credential bypass, just a same-fixed-account
 * shortcut around typing the seeded email/password.
 */
export function resolveQuickLoginUser(scope: unknown): DemoUser | null {
  if (typeof scope !== 'string' || !(scope in QUICK_LOGIN_SCOPES)) return null;
  const userId = QUICK_LOGIN_SCOPES[scope as QuickLoginScope];
  return DEMO_USERS.find((u) => u.id === userId) ?? null;
}
