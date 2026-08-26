/**
 * /api/support/tickets/:id/reopen — GGX Corporate support proxy: reopen.
 *
 * POST → reopen a resolved/closed ticket (Bridge `POST /tickets/:id/reopen`).
 *
 * KNOWN LIMITATION (documented, not a Corporate defect — see the handoff
 * doc's "Known limitations" section): this Bridge route still runs against
 * HeyQ's legacy in-memory ticket store rather than the Supabase-backed atomic
 * RPC path the rest of the customer contract uses, so it does not find a
 * Bridge/Supabase-created ticket. It is still proxied here because it remains
 * part of the documented customer contract and the existing UI still calls
 * it; a customer reply already reopens a resolved/on_hold ticket automatically
 * through the working RPC path (see `messages.ts`), which is the reliable way
 * to reopen a ticket today.
 */
import {
  bridgeFetch, readIdentity, relay, failConfig, failUpstream, single,
  BridgeConfigError, type ProxyRequest, type ProxyResponse,
} from '../../../_lib/bridge.ts';

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const id = single(req.query.id);
    if (!id) {
      res.status(400).json({ error: 'Ticket id is required.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const identity = readIdentity(body);
    if (!identity) {
      res.status(400).json({ error: 'externalUserId and externalOrgId are required.' });
      return;
    }
    const bridgeRes = await bridgeFetch(`/tickets/${encodeURIComponent(id)}/reopen`, {
      method: 'POST',
      body,
    });
    await relay(res, bridgeRes);
  } catch (err) {
    if (err instanceof BridgeConfigError) failConfig(res, err);
    else failUpstream(res, 'POST /tickets/:id/reopen', err);
  }
}
