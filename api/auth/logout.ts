/**
 * POST /api/auth/logout — clear the server-verified Corporate session cookie.
 *
 * Idempotent and unauthenticated by design (logging out never needs to prove
 * who you are); it simply overwrites the cookie with an already-expired one.
 * See `api/auth/login.ts` and `api/_lib/session.ts`.
 */
import { buildClearedSessionCookie } from '../_lib/session.js';
import type { ProxyRequest, ProxyResponse } from '../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Set-Cookie', buildClearedSessionCookie());
  res.status(200).json({ ok: true });
}
