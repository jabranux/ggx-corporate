/**
 * /api/support/tickets/:id/typing — GGX Corporate support proxy: typing presence.
 *
 * Ephemeral only — never persisted as a message, ticket record, or part of the
 * ticket-detail payload `[id].ts` returns. This is its own lightweight
 * presence path, separate from ticket-detail polling.
 *
 * Deployed QuadX Bridge contract this proxies to 1:1 (HEYQ's canonical
 * Supabase-backed `ticket_typing_state`, 6s server-side TTL — see
 * `useTicketConversation.ts`'s module docblock for the client-side cadence
 * that keeps a session inside that TTL):
 *
 *   POST /customer/tickets/:id/typing
 *     Body:     { externalUserId, externalOrgId, state: 'start' | 'stop' }
 *     Response: { typing: boolean }   (echoes the state just set)
 *   GET  /customer/tickets/:id/typing?externalUserId=&externalOrgId=
 *     Response: { typing: boolean }   (true only while HEYQ's agent side is
 *                                      actively typing)
 *
 * `:id` MUST be the ticket's Bridge UUID (`ticket.id`, never the
 * human-readable `reference`) — same requirement `[id].ts`'s GET already
 * relies on; Bridge 404s a non-UUID id, never 403, so a caller can't
 * distinguish "wrong owner" from "doesn't exist" by probing.
 * `externalUserId`/`externalOrgId` come ONLY from `requireSessionIdentity`
 * (the verified session cookie), never trusted from the request body/query —
 * identical to every other route in this proxy.
 *
 * A malformed `state` is a Bridge-side 400; an unauthenticated caller never
 * reaches Bridge at all (401 from `requireSessionIdentity` below, the same
 * status every other `/api/support/*` route uses for "no/invalid session" —
 * see `api/_lib/bridge.ts`'s docblock). Both handlers relay Bridge's response
 * unchanged; the client-side adapter (`heyqService.sendTypingSignal` /
 * `getTypingStatus`) treats ANY failure as a silent no-op regardless — sending
 * never throws and reading never shows a stuck indicator.
 */
import {
  bridgeFetch, requireSessionIdentity, relay, failConfig, failUpstream, getQueryParam, getRequestBody,
  BridgeConfigError, SessionConfigError, type ProxyRequest, type ProxyResponse,
} from '../../../_lib/bridge.js';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    const id = getQueryParam(req, 'id');
    if (!id) {
      res.status(400).json({ error: 'Ticket id is required.' });
      return;
    }
    const identity = requireSessionIdentity(req, res);
    if (!identity) return; // 401 already written

    if (req.method === 'POST') {
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
      return;
    }

    if (req.method === 'GET') {
      const qs = new URLSearchParams([['externalUserId', identity.externalUserId], ['externalOrgId', identity.externalOrgId]]).toString();
      const bridgeRes = await bridgeFetch(`/customer/tickets/${encodeURIComponent(id)}/typing?${qs}`, { method: 'GET' });
      await relay(res, bridgeRes);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof BridgeConfigError || err instanceof SessionConfigError) failConfig(res, err);
    else failUpstream(res, 'GET|POST /tickets/:id/typing', err);
  }
}
