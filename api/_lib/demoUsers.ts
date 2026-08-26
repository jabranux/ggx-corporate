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
 * `POST /api/auth/login` (`api/auth/login.ts`), which is the only place a
 * session token is minted (see `session.ts`). `resolveBridgeIdentity` is the
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
