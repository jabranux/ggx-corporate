/**
 * POST /api/auth/quick-login — issue a server-verified Corporate session
 * cookie for the Login page's Quick Login cards ("Main Account" /
 * "Subaccount"), without the browser ever holding a seeded email/password.
 *
 * The client sends only an opaque `scope` (`'main'` | `'subaccount'`);
 * `resolveQuickLoginUser` (`api/_lib/demoUsers.ts`) is the ONLY place that
 * scope is mapped to a demo user — always one of the two fixed seeded
 * accounts, never a client-supplied user/account id. Session issuance
 * mirrors `api/auth/login.ts` exactly (same `createSessionToken`/
 * `buildSessionCookie`, same response shape) — this is not a separate auth
 * path, just a second, more restrictive way to reach the same signed
 * `ggx_session` flow. See docs/migration/ggx-corporate-heyq-live-ticketing.md
 * §21.
 *
 * Available on every environment, including hosted Vercel Preview/Production
 * (§21.7 reverted this endpoint's earlier deploy-tier gate so the hosted test
 * app can demo both scopes): the fixed scope→user mapping is the security
 * boundary here, not environment. `api/auth/login.ts` (password) is
 * unaffected and still works everywhere.
 */
import { resolveQuickLoginUser } from '../_lib/demoUsers.js';
import { createSessionToken, buildSessionCookie, SessionConfigError } from '../_lib/session.js';
import { getRequestBody, type ProxyRequest, type ProxyResponse } from '../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
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
