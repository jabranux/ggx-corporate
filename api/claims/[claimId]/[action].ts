/**
 * /api/claims/:claimId/:action — GGX Corporate claims proxy: sync / state / messages.
 *
 * Consolidated into one Serverless Function (dispatching on the `action`
 * route segment) to stay under Vercel's per-deployment function-count limit
 * on the Hobby plan — this is a routing-shell change only; each branch below
 * is the original, unmodified route handler. Public URLs are unchanged
 * (`/api/claims/:claimId/sync`, `/state`, `/messages`).
 */
import {
  bridgeFetch, requireSessionIdentity, hasAttachmentPayload, relay, failConfig, failUpstream,
  getQueryParam, getHeader, getRequestBody, mapClaimReasonToBridge,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../_lib/bridge.js';

/**
 * POST /api/claims/:claimId/sync — GGX Corporate claims proxy: file-or-link.
 *
 * Idempotently create (or re-link) the QuadX Bridge claim + its operational
 * ticket for a GGX claim (Bridge `POST /customer/claims`). `claimId` is
 * GGX's own customer-facing reference (e.g. CLM-1008) — it is ALWAYS what
 * Bridge is asked to key its idempotency on (`externalReference`), so
 * calling this repeatedly for the same claim (right after filing, or lazily
 * whenever an existing/legacy claim's details page is opened with no cached
 * linkage yet) never creates a duplicate Bridge claim or ticket. See
 * docs/migration/ggx-corporate-quadx-bridge-claims-integration.md.
 */
async function handleSync(req: ProxyRequest, res: ProxyResponse, claimId: string): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
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
}

/**
 * GET /api/claims/:claimId/state — GGX Corporate claims proxy: read.
 *
 * The linked QuadX Bridge claim's public state (Bridge `GET
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
async function handleState(req: ProxyRequest, res: ProxyResponse, claimId: string): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written

  const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
  const bridgeRes = await bridgeFetch(`/customer/claims/${encodeURIComponent(claimId)}?${qs}`, { method: 'GET' });
  await relay(res, bridgeRes);
}

/**
 * POST /api/claims/:claimId/messages — GGX Corporate claims proxy: customer reply.
 *
 * Append a customer reply to the claim's linked ticket. Never trusts a
 * client-supplied ticket id: this route re-resolves it server-side via
 * Bridge's own `GET /customer/claims/:reference` first, then posts through
 * the EXISTING `POST /customer/tickets/:id/messages` route — no new Bridge
 * write surface for messaging, matching
 * docs/migration/quadx-bridge-claims-customer-api.md.
 */
async function handleMessages(req: ProxyRequest, res: ProxyResponse, claimId: string): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = await getRequestBody(req);
  const { demoAccountId: _ignoredDemoAccountId, externalUserId: _ignoredUserId, externalOrgId: _ignoredOrgId, ...rest } = body;
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written

  if (hasAttachmentPayload(rest)) {
    res.status(400).json({ error: 'Attachments are not supported in this integration.' });
    return;
  }

  const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
  const claimRes = await bridgeFetch(`/customer/claims/${encodeURIComponent(claimId)}?${qs}`, { method: 'GET' });
  if (!claimRes.ok) {
    await relay(res, claimRes);
    return;
  }
  const claimData = await claimRes.json() as { ticket?: { id?: string } };
  const ticketId = claimData?.ticket?.id;
  if (!ticketId) {
    res.status(404).json({ error: 'This claim is not linked to a ticket yet.' });
    return;
  }

  const messageId = getHeader(req, 'x-bridge-message-id');
  const messageText = String(rest.body ?? rest.message ?? '');
  const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    body: { ...rest, body: messageText, ...identity }, // server-resolved identity always wins
    headers: messageId ? { 'X-Bridge-Message-Id': messageId } : undefined,
  });
  await relay(res, bridgeRes);
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    const claimId = getQueryParam(req, 'claimId');
    if (!claimId) {
      res.status(400).json({ error: 'Claim id is required.' });
      return;
    }
    const action = getQueryParam(req, 'action');
    switch (action) {
      case 'sync': return await handleSync(req, res, claimId);
      case 'state': return await handleState(req, res, claimId);
      case 'messages': return await handleMessages(req, res, claimId);
      default:
        res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'claims/:claimId/:action', err);
  }
}
