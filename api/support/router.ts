/**
 * /api/support/... — GGX Corporate support proxy: categories, tickets
 * (list/create/detail/reply), and typing presence (send / subscribe).
 *
 * Consolidated into one Serverless Function (dispatching on the `path`
 * segments) to stay under Vercel's per-deployment function-count limit on
 * the Hobby plan — this is a routing-shell change only; each branch below is
 * the original, unmodified route handler. Public URLs are unchanged
 * (`/api/support/categories`, `/api/support/tickets`,
 * `/api/support/tickets/:id`, `/api/support/tickets/:id/messages`,
 * `/api/support/tickets/:id/typing`, `/api/support/tickets/:id/typing/subscribe`).
 *
 * Routed via an explicit `vercel.json` rewrite (`/api/support/:path*` →
 * `/api/support/router?path=:path*`) rather than the filesystem's own
 * `[...path].ts` catch-all convention: on this project's build (framework
 * "vite", not Next.js), that convention matched at most one path segment and
 * left `req.query.path` empty even then, 404ing every real route — a fresh,
 * confirmed production defect on 2026-09-18, not a hypothetical. The
 * rewrite's wildcard capture arrives as a single `/`-joined string, not an
 * array, so `pathSegments` below splits it.
 *
 * See `api/_lib/bridge.ts` for the security boundary and `api/_lib/session.ts`
 * / `api/_lib/demoUsers.ts` for the server-verified identity this proxy
 * relies on. Every route resolves identity from the signed session cookie
 * ONLY — any `demoAccountId`/`externalUserId`/`externalOrgId`/`merchantId`
 * the caller also sends is discarded, never forwarded to Bridge.
 */
import {
  bridgeFetch, requireSessionIdentity, requireSessionIdentityWithMerchantId, hasAttachmentPayload,
  relay, failConfig, failUpstream, getHeader, getRequestBody, verifyLiveCategoryId,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../_lib/bridge.js';

/**
 * GET /api/support/categories — the active Concern Category taxonomy for the
 * support/ticket-creation UI (Bridge `GET /customer/categories`). No caching
 * anywhere in this path — every request re-queries Bridge, matching Bridge's
 * own "no caching" contract (see
 * docs/migration/quadx-bridge-concern-categories-api.md in the HeyQ repo,
 * §5).
 *
 * Unlike the ticket routes, Bridge's categories endpoint has no per-requester
 * identity check (categories are product-level data, not account-scoped) —
 * but this route still requires a verified Corporate session, consistent
 * with every other /api/support/* route: an unauthenticated caller gets no
 * data from this app's API surface at all. The resolved identity is
 * otherwise unused here.
 *
 * `Cache-Control: no-store` on every response (set unconditionally, before
 * any early return) so no browser/intermediate HTTP cache can serve a stale
 * category list — the module-level "no caching" contract otherwise only
 * covered this app's own code, not the HTTP layer underneath it.
 */
async function handleCategories(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written

  const bridgeRes = await bridgeFetch('/customer/categories', { method: 'GET' });
  await relay(res, bridgeRes);
}

/**
 * /api/support/tickets — list + create.
 *
 *   GET  → the signed-in requester's tickets (Bridge `GET /customer/tickets`).
 *   POST → create a ticket (Bridge `POST /customer/tickets`).
 */
async function handleTicketsList(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method === 'GET') {
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
    const bridgeRes = await bridgeFetch(`/customer/tickets?${qs}`, { method: 'GET' });
    await relay(res, bridgeRes);
    return;
  }

  if (req.method === 'POST') {
    const body = await getRequestBody(req);
    const { demoAccountId: _ignoredDemoAccountId, externalUserId: _ignoredUserId, externalOrgId: _ignoredOrgId, merchantId: _ignoredMerchantId, ...rest } = body;
    const resolved = requireSessionIdentityWithMerchantId(req, res);
    if (!resolved) return; // 401 already written
    const { identity, merchantId } = resolved;

    // Text-only Bridge: refuse attachment payloads here rather than round-
    // tripping to Bridge — no upload/storage handling is built in this proxy.
    if (hasAttachmentPayload(rest)) {
      res.status(400).json({ error: 'Attachments are not supported in this integration.' });
      return;
    }

    // A canonical, currently-live category id is required on every create —
    // never an arbitrary browser-supplied label, and never silently defaulted.
    // See `verifyLiveCategoryId`'s docblock for why this re-checks Bridge fresh
    // rather than trusting whatever the browser last fetched.
    const categoryId = typeof rest.categoryId === 'string' ? rest.categoryId.trim() : '';
    if (!categoryId) {
      res.status(400).json({ error: 'A support category is required.' });
      return;
    }
    const categoryCheck = await verifyLiveCategoryId(categoryId);
    if (categoryCheck === 'unavailable') {
      res.status(502).json({ error: 'Could not verify the selected category. QuadX Bridge is temporarily unreachable.' });
      return;
    }
    if (categoryCheck === 'invalid') {
      res.status(400).json({ error: 'The selected category is no longer available. Reload categories and choose again.' });
      return;
    }

    const idempotencyKey = getHeader(req, 'idempotency-key');
    const bridgeRes = await bridgeFetch('/customer/tickets', {
      method: 'POST',
      // server-resolved identity always wins; merchantId (Customer 360
      // enhancement) only when this account actually has one — never a
      // client-supplied value (destructured out of `rest` above).
      body: { ...rest, categoryId, ...identity, ...(merchantId ? { merchantId } : {}) },
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    await relay(res, bridgeRes);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}

/**
 * GET /api/support/tickets/:id — the customer view of one ticket (Bridge
 * `GET /customer/tickets/:id`). Used both for the ticket detail page's
 * initial load and its 5-second conversation poll (`useTicketConversation`).
 */
async function handleTicketDetail(req: ProxyRequest, res: ProxyResponse, id: string): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written
  const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
  const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}?${qs}`, { method: 'GET' });
  await relay(res, bridgeRes);
}

/**
 * POST /api/support/tickets/:id/messages — append a customer reply (Bridge
 * `POST /customer/tickets/:id/messages`). Forwards `X-Bridge-Message-Id` so a
 * retried reply (the client reuses the same optimistic message id) is
 * deduplicated by Bridge's atomic RPC instead of creating a second message.
 */
async function handleTicketMessages(req: ProxyRequest, res: ProxyResponse, id: string): Promise<void> {
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
  const messageId = getHeader(req, 'x-bridge-message-id');
  const messageText = String(rest.body ?? rest.message ?? '');
  const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: { ...rest, body: messageText, ...identity }, // server-resolved identity always wins
    headers: messageId ? { 'X-Bridge-Message-Id': messageId } : undefined,
  });
  await relay(res, bridgeRes);
}

/**
 * /api/support/tickets/:id/typing — outbound (customer → HEYQ) typing signal.
 *
 * Ephemeral only — never persisted as a message, ticket record, or part of
 * the ticket-detail payload `handleTicketDetail` returns. This is its own
 * lightweight presence path, separate from ticket-detail polling.
 *
 * POST-only. The former `GET` handler (a snapshot read, polled every 3s by
 * `useTicketConversation.ts`) is REMOVED: the receive side is event-driven
 * over Supabase Realtime Broadcast — see `handleTypingSubscribe` and
 * `src/app/services/heyqTypingRealtime.ts`. HEYQ/Bridge's own
 * `GET /customer/tickets/:id/typing` route is untouched server-side (see
 * HeyQ's docs/migration/typing-realtime-broadcast-authorization.md — it
 * stays live for other callers/compatibility), GGX simply no longer calls
 * it.
 *
 * Deployed QuadX Bridge contract this proxies to 1:1 (HEYQ's canonical
 * Supabase-backed `ticket_typing_state`, 15s server-side TTL — see
 * `useTicketConversation.ts`'s module docblock for the client-side cadence
 * that keeps a session inside that TTL):
 *
 *   POST /customer/tickets/:id/typing
 *     Body:     { externalUserId, externalOrgId, state: 'start' | 'stop' }
 *     Response: { typing: boolean }   (echoes the state just set)
 *
 * `:id` MUST be the ticket's Bridge UUID (`ticket.id`, never the
 * human-readable `reference`) — same requirement `handleTicketDetail`'s GET
 * already relies on; Bridge 404s a non-UUID id, never 403, so a caller can't
 * distinguish "wrong owner" from "doesn't exist" by probing.
 * `externalUserId`/`externalOrgId` come ONLY from `requireSessionIdentity`
 * (the verified session cookie), never trusted from the request body —
 * identical to every other route in this proxy.
 */
async function handleTicketTyping(req: ProxyRequest, res: ProxyResponse, id: string): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written

  const body = await getRequestBody(req);
  const state = body.state === 'start' || body.state === 'stop' ? body.state : null;
  if (!state) {
    res.status(400).json({ error: "state must be 'start' or 'stop'." });
    return;
  }
  const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}/typing`, {
    method: 'POST',
    body: { state, ...identity },
  });
  await relay(res, bridgeRes);
}

/**
 * /api/support/tickets/:id/typing/subscribe — mints a short-lived,
 * ticket-scoped Supabase Realtime Broadcast credential so the browser can
 * RECEIVE HEYQ agent-typing pushes instead of polling `GET /typing` every 3s
 * (that GET route is removed — see `handleTicketTyping`'s docblock).
 * Consumed by `src/app/services/heyqTypingRealtime.ts` via
 * `heyqService.subscribeToAgentTyping`.
 *
 * Deployed QuadX Bridge contract this proxies to 1:1 (HeyQ/QuadX Bridge
 * commit `ac5b685` —
 * docs/migration/typing-realtime-broadcast-authorization.md in the HeyQ
 * repo):
 *
 *   POST /customer/tickets/:id/typing/subscribe
 *     Body:     { externalUserId, externalOrgId }
 *     Response: { token, channel, expiresIn, expiresAt, supabaseUrl, supabaseAnonKey }
 *
 * Same identity/ownership/error-shape rules as every other route in this
 * proxy. Called once per connection attempt, including every reconnect and
 * every scheduled token refresh — always a fresh credential, never cached
 * here.
 */
async function handleTypingSubscribe(req: ProxyRequest, res: ProxyResponse, id: string): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const identity = requireSessionIdentity(req, res);
  if (!identity) return; // 401 already written

  const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}/typing/subscribe`, {
    method: 'POST',
    body: { ...identity },
  });
  await relay(res, bridgeRes);
}

/**
 * Normalize the `path` query param into a segment array. The rewrite's
 * wildcard capture arrives as one `/`-joined string (e.g. `'tickets/abc123'`);
 * `filter(Boolean)` also drops empty segments from a stray leading/trailing
 * slash. An array is accepted too, for direct-call test harnesses.
 */
function pathSegments(req: ProxyRequest): string[] {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  return [];
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    const segments = pathSegments(req);

    if (segments.length === 1 && segments[0] === 'categories') {
      await handleCategories(req, res);
      return;
    }
    if (segments.length >= 1 && segments[0] === 'tickets') {
      const rest = segments.slice(1);
      if (rest.length === 0) { await handleTicketsList(req, res); return; }
      const [id, ...tail] = rest;
      if (tail.length === 0) { await handleTicketDetail(req, res, id); return; }
      if (tail.length === 1 && tail[0] === 'messages') { await handleTicketMessages(req, res, id); return; }
      if (tail.length === 1 && tail[0] === 'typing') { await handleTicketTyping(req, res, id); return; }
      if (tail.length === 2 && tail[0] === 'typing' && tail[1] === 'subscribe') { await handleTypingSubscribe(req, res, id); return; }
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err: any) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError || err?.name === 'BridgeConfigError' || err?.name === 'SessionConfigError' || String(err?.message || '').includes('QUADX_BRIDGE') || String(err?.message || '').includes('SESSION_SECRET')) failConfig(res, err);
    else failUpstream(res, 'support/...', err);
  }
}
