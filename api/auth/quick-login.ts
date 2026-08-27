/**
 * POST /api/auth/quick-login — issue a server-verified Corporate session
 * cookie for the Login page's Quick Login cards ("Main Account" /
 * "Subaccount"), without the browser ever holding a seeded email/password.
 *
 * The client sends only an opaque `scope` (`'main'` | `'subaccount'`);
 * `resolveQuickLoginUser` (`api/_lib/demoUsers.ts`) is the ONLY place that
 * scope is mapped to a demo user. Session issuance mirrors
 * `api/auth/login.ts` exactly (same `createSessionToken`/`buildSessionCookie`,
 * same response shape) — this is not a separate auth path, just a second,
 * more restrictive way to reach the same signed `ggx_session` flow. See
 * docs/migration/ggx-corporate-heyq-live-ticketing.md §21.
 *
 * Gated to local dev only (§21's Codex audit, P1 + two follow-ups): resolving
 * straight from an opaque scope means the caller proves nothing — no
 * password, not even the (already-public) demo one. Fine as a local dev
 * convenience; not fine as a standing, zero-secret way to mint a real
 * session anywhere it's internet-reachable — that includes Preview, not just
 * Production: Preview deployments share the same live QuadX Bridge
 * credentials as Production (§15.3), so there is no "safe" deployed tier
 * here to leave this open on. `api/auth/login.ts` (password) is unaffected
 * and still works in every environment, including every deployed one.
 *
 * Deliberately NOT `session.ts`'s `isDeployedEnv()` — that helper also
 * counts `vercel dev` (`VERCEL_ENV=development`) as "deployed", which is
 * correct for its own job (gating the cookie's `Secure` attribute) but wrong
 * here: `vercel dev` is a real local Functions runtime a developer needs
 * Quick Login to work under, not a publicly-reachable deployment. Only
 * `'production'` and `'preview'` are actually reachable by anyone other than
 * whoever is running the process.
 */
import { resolveQuickLoginUser } from '../_lib/demoUsers.js';
import { createSessionToken, buildSessionCookie, SessionConfigError } from '../_lib/session.js';
import { getRequestBody, type ProxyRequest, type ProxyResponse } from '../_lib/bridge.js';

const PUBLICLY_REACHABLE_VERCEL_ENVS = new Set(['production', 'preview']);

/** True on Vercel Preview/Production, or a non-Vercel host running in
 * production mode. False for `vercel dev` (`VERCEL_ENV=development`) and
 * plain local dev (`VERCEL_ENV` unset, `NODE_ENV` not `production`). */
function isPubliclyReachable(): boolean {
  if (process.env.VERCEL_ENV !== undefined) return PUBLICLY_REACHABLE_VERCEL_ENVS.has(process.env.VERCEL_ENV);
  return process.env.NODE_ENV === 'production';
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (isPubliclyReachable()) {
    res.status(404).json({ error: 'Not found' });
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
