/**
 * /api/ops-requests/catalog — GGX Corporate proxy: the Ops Request catalog.
 *
 * GET → Bridge's fixed request catalog (`GET /customer/ops-requests/catalog`).
 * Currently unused by the UI (the existing category-specific submission forms
 * are preserved verbatim per the task's own instruction, with GGX's own keys
 * translated to Bridge's at the write boundary — see `api/_lib/bridge.ts`),
 * but exposed 1:1 for parity with the real Bridge contract and future use.
 * Session-gated like every other /api/* route on this proxy, consistent with
 * `api/support/categories.ts`.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    const bridgeRes = await bridgeFetch('/customer/ops-requests/catalog', { method: 'GET' });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /ops-requests/catalog', err);
  }
}
