/**
 * authService — mock authentication service.
 *
 * `loginMockUser`/`logoutMockUser` call the real `/api/auth/login` /
 * `/api/auth/logout` endpoints (`api/auth/*.ts`), which validate credentials
 * server-side and set/clear a signed, httpOnly session cookie — that cookie,
 * not anything read from here, is what `/api/support/**` derives its caller
 * identity from (see `api/_lib/session.ts`). What this module persists in
 * `localStorage` is UI-display state only (id/name/role/account for
 * rendering and client-side route gating) — forgeable like any client state,
 * but no longer a security boundary for the support proxy.
 *
 * The display `MockAuthUser` is built entirely from the server's verified
 * login response, with `permissions` derived from the returned `role` via
 * `permissionsForRole` (role-based, not identity-based — see
 * `auth.mock.ts`'s docblock for why no email→role directory ships in the
 * bundle). `getCurrentUser`/`getSessionContext`/`hasPermission` read that
 * same persisted state; nothing security-critical reads them.
 */

import { loadState, saveState, clearState } from '../lib/storage';
import {
  type MockAuthUser,
  permissionsForRole,
} from '../data/mock/auth.mock';

/** Shape persisted to localStorage after a verified login. */
interface PersistedSession {
  id: string;
  name: string;
  email: string;
  role: MockAuthUser['role'];
  accountId: string;
  accountName: string;
}

function toMockAuthUser(p: PersistedSession): MockAuthUser {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    accountId: p.accountId,
    accountName: p.accountName,
    assignedSubaccountIds: p.role === 'manager' ? [p.accountId] : [],
    permissions: permissionsForRole(p.role),
  };
}

export type { MockAuthUser };

export interface LoginResult {
  success: boolean;
  user: MockAuthUser | null;
  error?: string;
}

export interface SessionContext {
  isAuthenticated: boolean;
  user: MockAuthUser | null;
  role: 'admin' | 'manager' | null;
  accountId: string | null;
  accountName: string | null;
  assignedSubaccountIds: string[];
}

const AUTH_STORAGE_KEY = 'auth';

/** Shared response handling for both session-issuing endpoints below —
 * validates the server's user payload and persists the UI-display session on
 * success. Neither caller does anything with the response except pass it
 * here, so a shape change to one endpoint's contract can't silently diverge
 * from the other's handling. */
async function handleLoginResponse(res: Response, networkErrorFallback: string): Promise<LoginResult> {
  if (!res.ok) {
    return { success: false, user: null, error: networkErrorFallback };
  }
  const data = await res.json().catch(() => null);
  const u = data?.user;
  if (
    !u ||
    typeof u.id !== 'string' ||
    typeof u.name !== 'string' ||
    typeof u.email !== 'string' ||
    (u.role !== 'admin' && u.role !== 'manager') ||
    typeof u.accountId !== 'string' ||
    typeof u.accountName !== 'string'
  ) {
    return { success: false, user: null, error: 'Unexpected response from the server.' };
  }
  const session: PersistedSession = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    accountId: u.accountId,
    accountName: u.accountName,
  };
  // Persist a lightweight UI-display session (matching AuthContext.tsx shape).
  saveState(AUTH_STORAGE_KEY, session);
  return { success: true, user: toMockAuthUser(session) };
}

/**
 * Attempt login with email + password. Credentials are verified server-side
 * by `POST /api/auth/login` (the security-critical check — see the module
 * docblock); on success it also sets the httpOnly session cookie
 * `/api/support/**` relies on. The returned display `MockAuthUser` is built
 * entirely from that response — no local email→identity table is consulted.
 */
export async function loginMockUser(
  email: string,
  password: string
): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { success: false, user: null, error: 'Unable to reach the server. Try again.' };
  }
  return handleLoginResponse(res, 'Invalid email or password.');
}

/**
 * Quick Login: the Login page's "Main Account" / "Subaccount" cards call
 * this with an opaque scope instead of an email/password — no seeded
 * credential is ever sent by or held in the browser. `POST
 * /api/auth/quick-login` resolves the scope to a demo user server-side
 * (`resolveQuickLoginUser`, `api/_lib/demoUsers.ts`) and mints the same
 * signed `ggx_session` cookie `loginMockUser` does.
 */
export async function quickLoginMockUser(scope: 'main' | 'subaccount'): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch('/api/auth/quick-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
    });
  } catch {
    return { success: false, user: null, error: 'Unable to reach the server. Try again.' };
  }
  return handleLoginResponse(res, 'Quick Login failed. Please try again or sign in manually.');
}

/** Clear the current session, both the server-verified cookie and the local
 * UI-display state. Clears local state even if the network call fails, so
 * the UI always reflects signed-out. */
export async function logoutMockUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* best-effort — local state below still clears */
  }
  clearState(AUTH_STORAGE_KEY);
}

/**
 * Clear ONLY the local UI-display session (no network call) — for when the
 * server has already told us the session cookie is gone/invalid (a 401 from
 * `/api/support/**`, see `heyqCustomerApi.ts`'s `SESSION_EXPIRED_EVENT`), so
 * there is nothing left to ask the server to clear. Calling `logoutMockUser`
 * in that situation would fire a redundant `/api/auth/logout` request.
 */
export function clearLocalSession(): void {
  clearState(AUTH_STORAGE_KEY);
}

/**
 * Return the current authenticated user from the session, or null.
 * Reads the persisted AuthContext shape and enriches it with derived
 * permissions/subaccount scoping (see `toMockAuthUser`).
 */
export async function getCurrentUser(): Promise<MockAuthUser | null> {
  const persisted = loadState<PersistedSession | null>(AUTH_STORAGE_KEY, null);
  if (!persisted?.email) return null;
  return toMockAuthUser(persisted);
}

/** Return a structured session context for permission checks. */
export async function getSessionContext(): Promise<SessionContext> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      isAuthenticated: false,
      user: null,
      role: null,
      accountId: null,
      accountName: null,
      assignedSubaccountIds: [],
    };
  }
  return {
    isAuthenticated: true,
    user,
    role: user.role,
    accountId: user.accountId,
    accountName: user.accountName,
    assignedSubaccountIds: user.assignedSubaccountIds,
  };
}

/** Check if the current session has a specific permission. */
export async function hasPermission(
  permission: keyof MockAuthUser['permissions']
): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.permissions[permission] ?? false;
}
