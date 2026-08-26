/**
 * /api/support/tickets — GGX Corporate support proxy: list + create.
 *
 *   GET  → the signed-in requester's tickets (Bridge `GET /customer/tickets`).
 *   POST → create a ticket (Bridge `POST /customer/tickets`).
 *
 * See `api/_lib/bridge.ts` for the security boundary and the POC identity
 * assumption this proxy relies on.
 */
import {
  bridgeFetch, readIdentity, hasAttachmentPayload, relay, failConfig, failUpstream, single,
  BridgeConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.ts';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      const identity = readIdentity({
        externalUserId: single(req.query.externalUserId),
        externalOrgId: single(req.query.externalOrgId),
      });
      if (!identity) {
        res.status(400).json({ error: 'externalUserId and externalOrgId are required.' });
        return;
      }
      const qs = new URLSearchParams(identity).toString();
      const bridgeRes = await bridgeFetch(`/customer/tickets?${qs}`, { method: 'GET' });
      await relay(res, bridgeRes);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const identity = readIdentity(body);
      if (!identity) {
        res.status(400).json({ error: 'externalUserId and externalOrgId are required.' });
        return;
      }
      // Text-only Bridge: refuse attachment payloads here rather than round-
      // tripping to Bridge — no upload/storage handling is built in this proxy.
      if (hasAttachmentPayload(body)) {
        res.status(400).json({ error: 'Attachments are not supported in this integration.' });
        return;
      }
      const idempotencyKey = single(req.headers['idempotency-key']);
      const bridgeRes = await bridgeFetch('/customer/tickets', {
        method: 'POST',
        body,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      });
      await relay(res, bridgeRes);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof BridgeConfigError) failConfig(res, err);
    else failUpstream(res, 'GET/POST /tickets', err);
  }
}
