/**
 * /api/ops-requests — GGX Corporate proxy: list + create.
 *
 *   GET  → the signed-in account's Ops Requests (Bridge `GET /customer/ops-requests`),
 *          server-side filtered to the caller's own subaccount unless they
 *          are the Main Account admin (consolidated view).
 *   POST → create an Ops Request (Bridge `POST /customer/ops-requests`),
 *          idempotent via the `Idempotency-Key` header (GGX has no backend
 *          DB of its own — the caller mints a UUID once per submission
 *          attempt and reuses it across retries, same convention as
 *          ticket/message creation's idempotency keys).
 *
 * Both routes resolve identity from the signed session cookie ONLY (see
 * `api/_lib/bridge.ts`); any client-supplied identity field is discarded.
 * GGX's own category/subtype keys (preserved unchanged in the UI) are
 * translated to Bridge's canonical keys here, not in browser code.
 *
 * Bridge's Ops Request POC has no subaccount entity of its own — every
 * request for this product lives in ONE pinned Bridge account
 * (`OPS_REQUESTS_ACCOUNT_EXTERNAL_ID`). GGX's subaccount/manager scoping is
 * therefore enforced entirely HERE, server-side, against the opaque
 * `requestData.subaccountId` every request carries — never left to the
 * browser's own filter, which a caller could simply not apply by calling
 * this API directly (Codex review finding).
 */
import {
  bridgeFetch, requireSessionIdentity, requireSessionIdentityWithName, relay, relayJson, failConfig, failUpstream,
  getHeader, getRequestBody, mapOpsCategoryToBridge, mapOpsSubtypeToBridge,
  OPS_REQUESTS_ACCOUNT_EXTERNAL_ID, isConsolidatedAccountId,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../_lib/bridge.js';

interface RawOpsRequestRow {
  requestData?: { subaccountId?: unknown };
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      const identity = requireSessionIdentity(req, res);
      if (!identity) return; // 401 already written
      const callerAccountId = identity.externalOrgId; // the caller's OWN GGX accountId — never sent to Bridge as-is (see below)

      const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', OPS_REQUESTS_ACCOUNT_EXTERNAL_ID]]).toString();
      const bridgeRes = await bridgeFetch(`/customer/ops-requests?${qs}`, { method: 'GET' });
      const data = await relayJson(res, bridgeRes);
      if (data === null) return; // non-2xx or malformed already handled
      if (!Array.isArray(data)) {
        res.status(502).json({ error: 'QuadX Bridge returned an unexpected response.' });
        return;
      }

      const scoped = isConsolidatedAccountId(callerAccountId)
        ? data
        : data.filter((row) => (row as RawOpsRequestRow)?.requestData?.subaccountId === callerAccountId);
      res.status(200).json(scoped);
      return;
    }

    if (req.method === 'POST') {
      const body = await getRequestBody(req);
      const {
        demoAccountId: _ignoredDemoAccountId, externalUserId: _ignoredUserId, externalOrgId: _ignoredOrgId,
        requestedByName: _ignoredRequestedByName, accountName: _ignoredAccountName, // server-verified values always win — see below
        requestData: bodyRequestData,
        ...rest
      } = body;
      const resolved = requireSessionIdentityWithName(req, res);
      if (!resolved) return; // 401 already written
      const { identity, displayName, accountName } = resolved;
      const callerAccountId = identity.externalOrgId;

      const category = typeof rest.category === 'string' ? rest.category : '';
      const subtype = typeof rest.subtype === 'string' ? rest.subtype : '';
      if (!category || !subtype) {
        res.status(400).json({ error: 'A request category and subtype are required.' });
        return;
      }

      const idempotencyKey = getHeader(req, 'idempotency-key');
      if (!idempotencyKey) {
        res.status(400).json({ error: 'An Idempotency-Key header is required to create an Ops Request.' });
        return;
      }

      // requestData's subaccountId/subaccountName/createdBy are opaque,
      // Bridge-passthrough JSON — but GGX's UI reconstructs its own display
      // fields from exactly these keys, so a client value here is just as
      // spoofable as a top-level one. A subaccount manager may only ever
      // file under their OWN subaccount (never chosen from a client value);
      // the Main Account admin's UI offers an explicit subaccount selector,
      // so their submitted choice is trusted (they already have unrestricted
      // access to every subaccount's data in this app's permission model).
      const clientRequestData = (bodyRequestData && typeof bodyRequestData === 'object') ? (bodyRequestData as Record<string, unknown>) : {};
      const isAdmin = isConsolidatedAccountId(callerAccountId);
      const clientSubaccountName = typeof clientRequestData.subaccountName === 'string' ? clientRequestData.subaccountName : undefined;
      const bridgeAccountName = isAdmin ? (clientSubaccountName ?? accountName) : accountName;
      const requestData = isAdmin
        ? { ...clientRequestData, createdBy: displayName }
        : { ...clientRequestData, subaccountId: callerAccountId, subaccountName: accountName, createdBy: displayName };

      const bridgeRes = await bridgeFetch('/customer/ops-requests', {
        method: 'POST',
        body: {
          ...rest,
          category: mapOpsCategoryToBridge(category),
          subtype: mapOpsSubtypeToBridge(subtype),
          requestData,
          accountName: bridgeAccountName,
          requestedByName: displayName, // server-verified — never the client-supplied value
          externalUserId: identity.externalUserId,
          externalOrgId: OPS_REQUESTS_ACCOUNT_EXTERNAL_ID,
        },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      await relay(res, bridgeRes);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET/POST /ops-requests', err);
  }
}
