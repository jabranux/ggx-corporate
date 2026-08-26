/**
 * /api/support/tickets/:id/messages — GGX Corporate support proxy: reply.
 *
 * POST → append a customer reply (Bridge `POST /customer/tickets/:id/messages`).
 * Forwards `X-Bridge-Message-Id` so a retried reply (the client reuses the
 * same optimistic message id) is deduplicated by Bridge's atomic RPC instead
 * of creating a second message.
 */
import {
  bridgeFetch, requireSessionIdentity, hasAttachmentPayload, relay, failConfig, failUpstream,
  getQueryParam, getHeader, getRequestBody,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const id = getQueryParam(req, 'id');
    if (!id) {
      res.status(400).json({ error: 'Ticket id is required.' });
      return;
    }
    const body = await getRequestBody(req);
    const { demoAccountId: _ignoredDemoAccountId, externalUserId: _ignoredUserId, externalOrgId: _ignoredOrgId, ...rest } = body;
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    if (hasAttachmentPayload(rest)) {
      res.status(400).json({ error: 'Attachments are not supported in this integration.' });
      return;
    }
    const messageId = getHeader(req, 'x-bridge-message-id');
    const messageText = String(rest.body ?? rest.message ?? '');
    const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: { ...rest, body: messageText, ...identity }, // server-resolved identity always wins
      headers: messageId ? { 'X-Bridge-Message-Id': messageId } : undefined,
    });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'POST /tickets/:id/messages', err);
  }
}
