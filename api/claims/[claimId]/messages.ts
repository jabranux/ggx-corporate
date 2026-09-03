/**
 * /api/claims/:claimId/messages — GGX Corporate claims proxy: customer reply.
 *
 * POST → append a customer reply to the claim's linked ticket. Never trusts
 * a client-supplied ticket id: this route re-resolves it server-side via
 * Bridge's own `GET /customer/claims/:reference` first, then posts through
 * the EXISTING `POST /customer/tickets/:id/messages` route — no new Bridge
 * write surface for messaging, matching
 * docs/migration/quadx-bridge-claims-customer-api.md.
 */
import {
  bridgeFetch, requireSessionIdentity, hasAttachmentPayload, relay, failConfig, failUpstream,
  getQueryParam, getHeader, getRequestBody,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const claimId = getQueryParam(req, 'claimId');
    if (!claimId) {
      res.status(400).json({ error: 'Claim id is required.' });
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

    const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
    const claimRes = await bridgeFetch(`/customer/claims/${encodeURIComponent(claimId)}?${qs}`, { method: 'GET' });
    if (!claimRes.ok) {
      await relay(res, claimRes);
      return;
    }
    const claimData = await claimRes.json() as { ticket?: { id?: string } };
    const ticketId = claimData?.ticket?.id;
    if (!ticketId) {
      res.status(404).json({ error: 'This claim is not linked to a ticket yet.' });
      return;
    }

    const messageId = getHeader(req, 'x-bridge-message-id');
    const messageText = String(rest.body ?? rest.message ?? '');
    const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(ticketId)}/messages`, {
      method: 'POST',
      body: { ...rest, body: messageText, ...identity }, // server-resolved identity always wins
      headers: messageId ? { 'X-Bridge-Message-Id': messageId } : undefined,
    });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'POST /claims/:claimId/messages', err);
  }
}
