/**
 * /api/claims/:claimId/state — GGX Corporate claims proxy: read.
 *
 * GET → the linked QuadX Bridge claim's public state (Bridge `GET
 * /customer/claims/:reference`) — status, reason, tracking number, the
 * linked ticket's own id/status, a customer-visible timeline, and the
 * ticket's public message thread. `claimId` is GGX's own reference; Bridge
 * never exposes its own internal claim_number/id anywhere GGX renders.
 *
 * A claim that has never been linked (legacy/pre-Bridge claim, or a sync
 * call that hasn't run yet) 404s here — the caller (`claimBridgeService.ts`)
 * calls `/sync` first, which both links AND returns this same state in one
 * round trip, so a normal page load never needs two requests.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream,
  getQueryParam,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const claimId = getQueryParam(req, 'claimId');
    if (!claimId) {
      res.status(400).json({ error: 'Claim id is required.' });
      return;
    }
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
    const bridgeRes = await bridgeFetch(`/customer/claims/${encodeURIComponent(claimId)}?${qs}`, { method: 'GET' });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /claims/:claimId/state', err);
  }
}
