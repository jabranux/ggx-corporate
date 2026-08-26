/**
 * /api/support/tickets — GGX Corporate support proxy: list + create.
 *
 *   GET  → the signed-in requester's tickets (Bridge `GET /customer/tickets`).
 *   POST → create a ticket (Bridge `POST /customer/tickets`).
 *
 * See `api/_lib/bridge.ts` for the security boundary and `demoIdentity.ts`
 * for the POC identity mapping this proxy relies on. Both routes resolve
 * identity from `demoAccountId` ONLY — any `externalUserId`/`externalOrgId`
 * the caller also sends is discarded, never forwarded to Bridge.
 */
import {
  bridgeFetch, requireDemoIdentity, hasAttachmentPayload, relay, failConfig, failUpstream, single,
  BridgeConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      const identity = requireDemoIdentity(res, single(req.query.demoAccountId));
      if (!identity) return; // 400 already written

      const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
      const bridgeRes = await bridgeFetch(`/customer/tickets?${qs}`, { method: 'GET' });
      await relay(res, bridgeRes);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { demoAccountId, externalUserId: _ignoredUserId, externalOrgId: _ignoredOrgId, ...rest } = body;
      const identity = requireDemoIdentity(res, demoAccountId);
      if (!identity) return; // 400 already written

      // Text-only Bridge: refuse attachment payloads here rather than round-
      // tripping to Bridge — no upload/storage handling is built in this proxy.
      if (hasAttachmentPayload(rest)) {
        res.status(400).json({ error: 'Attachments are not supported in this integration.' });
        return;
      }
      const idempotencyKey = single(req.headers['idempotency-key']);
      const bridgeRes = await bridgeFetch('/customer/tickets', {
        method: 'POST',
        body: { ...rest, ...identity }, // server-resolved identity always wins
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      });
      await relay(res, bridgeRes);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    if (err instanceof BridgeConfigError || err?.name === 'BridgeConfigError' || String(err?.message || '').includes('QUADX_BRIDGE')) failConfig(res, err);
    else failUpstream(res, 'GET/POST /tickets', err);
  }
}
