/**
 * /api/support/tickets/:id/typing/subscribe — GGX Corporate support proxy:
 * mints a short-lived, ticket-scoped Supabase Realtime Broadcast credential
 * so the browser can RECEIVE HEYQ agent-typing pushes instead of polling
 * `GET /typing` every 3s (that GET route is now removed — see the sibling
 * `../typing.ts`'s docblock). Consumed by
 * `src/app/services/heyqTypingRealtime.ts` via
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
 *       - token: a short-lived (~300s), RECEIVE-ONLY, ticket-scoped Realtime
 *         Authorization JWT. Bridge mints it with a `ticket_id` claim an RLS
 *         policy on `realtime.messages` checks exactly against the channel
 *         topic — a token minted for THIS ticket can never subscribe to a
 *         different ticket's topic. Never a `service_role` credential, and
 *         this proxy never sees or forwards one either (it only ever holds
 *         `QUADX_BRIDGE_API_KEY`, the same shared Bridge secret every other
 *         route here already uses).
 *       - channel: the exact private broadcast topic to subscribe to
 *         (`ticket:<uuid>:agent_typing`).
 *       - supabaseUrl/supabaseAnonKey: the PUBLIC Supabase project URL and
 *         anon/publishable key — safe for the browser (access is gated
 *         entirely by the RLS policy above, never by this key's secrecy),
 *         returned dynamically so GGX never has to separately provision or
 *         rotate them.
 *
 * Same identity/ownership/error-shape rules as every other route in this
 * proxy: `externalUserId`/`externalOrgId` come ONLY from
 * `requireSessionIdentity` (the verified session cookie), never trusted
 * from the request; `:id` MUST be the ticket's Bridge UUID; Bridge 404s an
 * unowned/nonexistent/non-UUID ticket, never 403 (so a caller can't
 * distinguish "wrong owner" from "doesn't exist" by probing). An
 * unauthenticated caller never reaches Bridge at all (401 from
 * `requireSessionIdentity` below).
 *
 * Called once per connection attempt, including every reconnect and every
 * scheduled token refresh (see `heyqTypingRealtime.ts`) — always a fresh
 * credential, never cached here.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream, getQueryParam,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const id = getQueryParam(req, 'id');
    if (!id) {
      res.status(400).json({ error: 'Ticket id is required.' });
      return;
    }
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}/typing/subscribe`, {
      method: 'POST',
      body: { ...identity },
    });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'POST /tickets/:id/typing/subscribe', err);
  }
}
