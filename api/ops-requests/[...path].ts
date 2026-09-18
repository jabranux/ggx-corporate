/**
 * /api/ops-requests/... — GGX Corporate proxy: catalog / one Ops Request / its update history.
 *
 * Consolidated into one Serverless Function (dispatching on the catch-all
 * `path` segments) to stay under Vercel's per-deployment function-count
 * limit on the Hobby plan — this is a routing-shell change only; each branch
 * below is the original, unmodified route handler. Public URLs are unchanged
 * (`/api/ops-requests/catalog`, `/api/ops-requests/:id`,
 * `/api/ops-requests/:id/updates`). The bare `/api/ops-requests` list/create
 * route stays its own file (`index.ts`) since a required catch-all can't
 * match zero path segments.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, relayJson, failConfig, failUpstream,
  OPS_REQUESTS_ACCOUNT_EXTERNAL_ID, isConsolidatedAccountId,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../_lib/bridge.js';

interface RawOpsRequestRow {
  requestData?: { subaccountId?: unknown };
}

/**
 * GET /api/ops-requests/catalog — Bridge's fixed request catalog
 * (`GET /customer/ops-requests/catalog`). Currently unused by the UI (the
 * existing category-specific submission forms are preserved verbatim per the
 * task's own instruction, with GGX's own keys translated to Bridge's at the
 * write boundary — see `api/_lib/bridge.ts`), but exposed 1:1 for parity with
 * the real Bridge contract and future use. Session-gated like every other
 * /api/* route on this proxy, consistent with `api/support/[...path].ts`.
 */
async function handleCatalog(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written

  const bridgeRes = await bridgeFetch('/customer/ops-requests/catalog', { method: 'GET' });
  await relay(res, bridgeRes);
}

/**
 * GET /api/ops-requests/:id — the customer view of one Ops Request (Bridge
 * `GET /customer/ops-requests/:id`). `:id` accepts either Bridge's internal
 * uuid or its human-readable `requestNumber` (e.g. OPR-2026-0001) — Bridge
 * resolves either the same way it already does for tickets/claims.
 *
 * Ownership check: Bridge has no subaccount entity (see `index.ts`'s
 * docblock), so a subaccount manager's scope is enforced HERE against the
 * request's own `requestData.subaccountId` — a mismatch 404s (never 403,
 * same "don't reveal existence" convention every other proxy route uses),
 * not merely hidden by the browser's own list filter (Codex review finding).
 */
async function handleOne(req: ProxyRequest, res: ProxyResponse, id: string): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
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
}

/**
 * GET /api/ops-requests/:id/updates — the customer-visible update history for
 * one Ops Request (Bridge `GET /customer/ops-requests/:id/updates`). Bridge's
 * own projection already excludes internal-only activity (Ops/Sales
 * coordination, assignment, internal notes).
 *
 * Ownership check: same fail-closed rule as `handleOne` — the underlying
 * request is loaded first (Bridge has no subaccount entity of its own) so a
 * subaccount manager can never read another subaccount's update history by
 * id even though every request lives in one Bridge account.
 */
async function handleUpdates(req: ProxyRequest, res: ProxyResponse, id: string): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
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
  const updates = await relayJson(res, bridgeRes);
  if (updates !== null) res.status(200).json(updates);
}

/** Normalize the catch-all `path` query param into a segment array. */
function pathSegments(req: ProxyRequest): string[] {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  return [];
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    const segments = pathSegments(req);
    if (segments.length === 1 && segments[0] === 'catalog') {
      await handleCatalog(req, res);
      return;
    }
    if (segments.length === 1) {
      await handleOne(req, res, segments[0]);
      return;
    }
    if (segments.length === 2 && segments[1] === 'updates') {
      await handleUpdates(req, res, segments[0]);
      return;
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'ops-requests/...', err);
  }
}
