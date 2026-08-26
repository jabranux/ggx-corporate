/**
 * /api/support/tickets/:id — GGX Corporate support proxy: one ticket.
 *
 * GET → the customer view of one ticket (Bridge `GET /customer/tickets/:id`).
 * Used both for the ticket detail page's initial load and its 5-second
 * conversation poll (`useTicketConversation`).
 */
import {
  bridgeFetch, requireDemoIdentity, relay, failConfig, failUpstream, getQueryParam,
  BridgeConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const id = getQueryParam(req, 'id');
    if (!id) {
      res.status(400).json({ error: 'Ticket id is required.' });
      return;
    }
    const demoAccountId = getQueryParam(req, 'demoAccountId');
    const identity = requireDemoIdentity(res, demoAccountId);
    if (!identity) return; // 400 already written
    const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
    const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}?${qs}`, { method: 'GET' });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /tickets/:id', err);
  }
}
