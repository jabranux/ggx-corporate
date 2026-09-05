/**
 * /api/ops-requests/:id — GGX Corporate proxy: one Ops Request.
 *
 * GET → the customer view of one Ops Request (Bridge
 * `GET /customer/ops-requests/:id`). `:id` accepts either Bridge's internal
 * uuid or its human-readable `requestNumber` (e.g. OPR-2026-0001) — Bridge
 * resolves either the same way it already does for tickets/claims.
 *
 * Ownership check: Bridge has no subaccount entity (see `api/ops-requests/index.ts`'s
 * docblock), so a subaccount manager's scope is enforced HERE against the
 * request's own `requestData.subaccountId` — a mismatch 404s (never 403,
 * same "don't reveal existence" convention every other proxy route uses),
 * not merely hidden by the browser's own list filter (Codex review finding).
 */
import {
  bridgeFetch, requireSessionIdentity, relayJson, failConfig, failUpstream, getQueryParam,
  OPS_REQUESTS_ACCOUNT_EXTERNAL_ID, isConsolidatedAccountId,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../_lib/bridge.js';

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
    const bridgeRes = await bridgeFetch(`/customer/ops-requests/${encodeURIComponent(id)}?${qs}`, { method: 'GET' });
    const data = await relayJson(res, bridgeRes);
    if (data === null) return; // non-2xx or malformed already handled

    const row = data as RawOpsRequestRow;
    if (!isConsolidatedAccountId(callerAccountId) && row?.requestData?.subaccountId !== callerAccountId) {
      res.status(404).json({ error: 'Ops Request not found' });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET /ops-requests/:id', err);
  }
}
