/**
 * /api/auth/:action — GGX Corporate auth proxy: login / logout / quick-login.
 *
 * Consolidated into one Serverless Function (dispatching on the `action`
 * route segment) to stay under Vercel's per-deployment function-count limit
 * on the Hobby plan — this is a routing-shell change only; each branch below
 * is the original, unmodified route handler. Public URLs are unchanged
 * (`/api/auth/login`, `/api/auth/logout`, `/api/auth/quick-login`).
 */
import { verifyDemoCredentials, resolveQuickLoginUser } from '../_lib/demoUsers.js';
import { createSessionToken, buildSessionCookie, buildClearedSessionCookie, SessionConfigError } from '../_lib/session.js';
import { getRequestBody, getQueryParam, type ProxyRequest, type ProxyResponse } from '../_lib/bridge.js';

/**
 * POST /api/auth/login — issue a server-verified Corporate session cookie.
 *
 * The ONLY place a session token is minted. Validates credentials
 * server-side against the POC demo user directory (`api/_lib/demoUsers.ts`)
 * and, on success, sets an httpOnly signed cookie the browser can send but
 * never read or forge (`api/_lib/session.ts`). `/api/support/**` derives its
 * caller identity from that cookie — never from anything the client states
 * directly — closing the P1 finding that a browser-supplied `demoAccountId`
 * was forgeable. See docs/migration/ggx-corporate-heyq-live-ticketing.md,
 * "Server-verified support identity".
 *
 * Returns only the display-safe subset of the demo user (no password).
 */
async function handleLogin(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = await getRequestBody(req);
    const user = verifyDemoCredentials(body?.email, body?.password);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      accountId: user.accountId,
      accountName: user.accountName,
    });
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountId: user.accountId,
        accountName: user.accountName,
      },
    });
  } catch (err) {
    if (err instanceof SessionConfigError) {
      console.error('[auth login]', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    console.error('[auth login]', err);
    res.status(500).json({ error: 'Login failed.' });
  }
}

/**
 * POST /api/auth/logout — clear the server-verified Corporate session cookie.
 *
 * Idempotent and unauthenticated by design (logging out never needs to prove
 * who you are); it simply overwrites the cookie with an already-expired one.
 */
async function handleLogout(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Set-Cookie', buildClearedSessionCookie());
  res.status(200).json({ ok: true });
}

/**
 * POST /api/auth/quick-login — issue a server-verified Corporate session
 * cookie for the Login page's Quick Login cards ("Main Account" /
 * "Subaccount"), without the browser ever holding a seeded email/password.
 *
 * The client sends only an opaque `scope` (`'main'` | `'subaccount'`);
 * `resolveQuickLoginUser` (`api/_lib/demoUsers.ts`) is the ONLY place that
 * scope is mapped to a demo user — always one of the two fixed seeded
 * accounts, never a client-supplied user/account id. Session issuance
 * mirrors `handleLogin` exactly (same `createSessionToken`/
 * `buildSessionCookie`, same response shape) — this is not a separate auth
 * path, just a second, more restrictive way to reach the same signed
 * `ggx_session` flow. See docs/migration/ggx-corporate-heyq-live-ticketing.md
 * §21.
 *
 * Available on every environment, including hosted Vercel Preview/Production
 * (§21.7 reverted this endpoint's earlier deploy-tier gate so the hosted test
 * app can demo both scopes): the fixed scope→user mapping is the security
 * boundary here, not environment. `handleLogin` (password) is unaffected and
 * still works everywhere.
 */
async function handleQuickLogin(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = await getRequestBody(req);
    const user = resolveQuickLoginUser(body?.scope);
    if (!user) {
      res.status(400).json({ error: 'Invalid Quick Login scope.' });
      return;
    }

    const token = createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      accountId: user.accountId,
      accountName: user.accountName,
    });
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountId: user.accountId,
        accountName: user.accountName,
      },
    });
  } catch (err) {
    if (err instanceof SessionConfigError) {
      console.error('[auth quick-login]', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    console.error('[auth quick-login]', err);
    res.status(500).json({ error: 'Quick Login failed.' });
  }
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  const action = getQueryParam(req, 'action');
  switch (action) {
    case 'login': return handleLogin(req, res);
    case 'logout': return handleLogout(req, res);
    case 'quick-login': return handleQuickLogin(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}
