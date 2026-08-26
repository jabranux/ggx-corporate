/**
 * /api/support/tickets/:id — GGX Corporate support proxy: one ticket.
 *
 * GET → the customer view of one ticket (Bridge `GET /customer/tickets/:id`).
 * Used both for the ticket detail page's initial load and its 5-second
 * conversation poll (`useTicketConversation`).
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream, getQueryParam,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
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
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written
    const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
    const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}?${qs}`, { method: 'GET' });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /tickets/:id', err);
  }
}
