/**
 * /api/claims/:claimId/sync — GGX Corporate claims proxy: file-or-link.
 *
 * POST → idempotently create (or re-link) the QuadX Bridge claim + its
 * operational ticket for a GGX claim (Bridge `POST /customer/claims`).
 * `claimId` is GGX's own customer-facing reference (e.g. CLM-1008) — it is
 * ALWAYS what Bridge is asked to key its idempotency on
 * (`externalReference`), so calling this repeatedly for the same claim
 * (right after filing, or lazily whenever an existing/legacy claim's
 * details page is opened with no cached linkage yet) never creates a
 * duplicate Bridge claim or ticket. See
 * docs/migration/ggx-corporate-quadx-bridge-claims-integration.md.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream,
  getQueryParam, getRequestBody, mapClaimReasonToBridge,
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
    const {
      demoAccountId: _ignoredDemoAccountId,
      externalUserId: _ignoredUserId,
      externalOrgId: _ignoredOrgId,
      externalReference: _ignoredRef, // always derived from the URL claimId, never trusted from the body
      ...rest
    } = body;
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    const reason = typeof rest.reason === 'string' ? rest.reason : '';
    const bridgeRes = await bridgeFetch('/customer/claims', {
      method: 'POST',
      body: {
        ...rest,
        externalReference: claimId,
        reason: mapClaimReasonToBridge(reason),
        ...identity, // server-resolved identity always wins
      },
    });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'POST /claims/:claimId/sync', err);
  }
}
