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
import { verifyDemoCredentials } from '../_lib/demoUsers.js';
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
