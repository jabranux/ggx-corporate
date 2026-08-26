/**
 * /api/support/categories — GGX Corporate support proxy: live Concern Categories.
 *
 * GET → the active Concern Category taxonomy for the support/ticket-creation UI
 * (Bridge `GET /customer/categories`). No caching anywhere in this path — every
 * request re-queries Bridge, matching Bridge's own "no caching" contract (see
 * docs/migration/quadx-bridge-concern-categories-api.md in the HeyQ repo, §5).
 *
 * Unlike the ticket routes, Bridge's categories endpoint has no per-requester
 * identity check (categories are product-level data, not account-scoped) — but
 * this route still requires a verified Corporate session, consistent with every
 * other /api/support/* route: an unauthenticated caller gets no data from this
 * app's API surface at all. The resolved identity is otherwise unused here.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    const bridgeRes = await bridgeFetch('/customer/categories', { method: 'GET' });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /categories', err);
  }
}
