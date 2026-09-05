/**
 * /api/ops-requests/:id/updates — GGX Corporate proxy: client-visible history.
 *
 * GET → the customer-visible update history for one Ops Request (Bridge
 * `GET /customer/ops-requests/:id/updates`). Bridge's own projection already
 * excludes internal-only activity (Ops/Sales coordination, assignment,
 * internal notes).
 *
 * Ownership check: same fail-closed rule as `api/ops-requests/[id].ts` — the
 * underlying request is loaded first (Bridge has no subaccount entity of its
 * own) so a subaccount manager can never read another subaccount's update
 * history by id even though every request lives in one Bridge account.
 */
import {
  bridgeFetch, requireSessionIdentity, relayJson, failConfig, failUpstream, getQueryParam,
  OPS_REQUESTS_ACCOUNT_EXTERNAL_ID, isConsolidatedAccountId,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

interface RawOpsRequestRow {
  requestData?: { subaccountId?: unknown };
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const id = getQueryParam(req, 'id');
    if (!id) {
      res.status(400).json({ error: 'Ops Request id is required.' });
      return;
    }
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written
    const callerAccountId = identity.externalOrgId;
    const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', OPS_REQUESTS_ACCOUNT_EXTERNAL_ID]]).toString();

    const ownerRes = await bridgeFetch(`/customer/ops-requests/${encodeURIComponent(id)}?${qs}`, { method: 'GET' });
    const ownerData = await relayJson(res, ownerRes);
    if (ownerData === null) return; // non-2xx or malformed already handled
    const row = ownerData as RawOpsRequestRow;
    if (!isConsolidatedAccountId(callerAccountId) && row?.requestData?.subaccountId !== callerAccountId) {
      res.status(404).json({ error: 'Ops Request not found' });
      return;
    }

    const bridgeRes = await bridgeFetch(`/customer/ops-requests/${encodeURIComponent(id)}/updates?${qs}`, { method: 'GET' });
    await relayJson(res, bridgeRes).then((updates) => {
      if (updates !== null) res.status(200).json(updates);
    });
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /ops-requests/:id/updates', err);
  }
}
