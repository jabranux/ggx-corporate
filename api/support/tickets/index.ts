/**
 * /api/support/tickets — GGX Corporate support proxy: list + create.
 *
 *   GET  → the signed-in requester's tickets (Bridge `GET /customer/tickets`).
 *   POST → create a ticket (Bridge `POST /customer/tickets`).
 *
 * See `api/_lib/bridge.ts` for the security boundary and `api/_lib/session.ts`
 * / `api/_lib/demoUsers.ts` for the server-verified identity this proxy
 * relies on. Both routes resolve identity from the signed session cookie
 * ONLY — any `demoAccountId`/`externalUserId`/`externalOrgId` the caller also
 * sends is discarded, never forwarded to Bridge.
 */
import {
  bridgeFetch, requireSessionIdentity, hasAttachmentPayload, relay, failConfig, failUpstream,
  getHeader, getRequestBody, verifyLiveCategoryId,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      const identity = requireSessionIdentity(req, res);
      if (!identity) return; // 401 already written

      const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
      const bridgeRes = await bridgeFetch(`/customer/tickets?${qs}`, { method: 'GET' });
      await relay(res, bridgeRes);
      return;
    }

    if (req.method === 'POST') {
      const body = await getRequestBody(req);
      const { demoAccountId: _ignoredDemoAccountId, externalUserId: _ignoredUserId, externalOrgId: _ignoredOrgId, ...rest } = body;
      const identity = requireSessionIdentity(req, res);
      if (!identity) return; // 401 already written

      // Text-only Bridge: refuse attachment payloads here rather than round-
      // tripping to Bridge — no upload/storage handling is built in this proxy.
      if (hasAttachmentPayload(rest)) {
        res.status(400).json({ error: 'Attachments are not supported in this integration.' });
        return;
      }

      // A canonical, currently-live category id is required on every create —
      // never an arbitrary browser-supplied label, and never silently defaulted.
      // See `verifyLiveCategoryId`'s docblock for why this re-checks Bridge fresh
      // rather than trusting whatever the browser last fetched.
      const categoryId = typeof rest.categoryId === 'string' ? rest.categoryId.trim() : '';
      if (!categoryId) {
        res.status(400).json({ error: 'A support category is required.' });
        return;
      }
      const categoryCheck = await verifyLiveCategoryId(categoryId);
      if (categoryCheck === 'unavailable') {
        res.status(502).json({ error: 'Could not verify the selected category. QuadX Bridge is temporarily unreachable.' });
        return;
      }
      if (categoryCheck === 'invalid') {
        res.status(400).json({ error: 'The selected category is no longer available. Reload categories and choose again.' });
        return;
      }

      const idempotencyKey = getHeader(req, 'idempotency-key');
      const bridgeRes = await bridgeFetch('/customer/tickets', {
        method: 'POST',
        body: { ...rest, categoryId, ...identity }, // server-resolved identity always wins
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      });
      await relay(res, bridgeRes);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError || err?.name === 'BridgeConfigError' || err?.name === 'SessionConfigError' || String(err?.message || '').includes('QUADX_BRIDGE') || String(err?.message || '').includes('SESSION_SECRET')) failConfig(res, err);
    else failUpstream(res, 'GET/POST /tickets', err);
  }
}
