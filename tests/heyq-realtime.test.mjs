/**
 * Realtime tests for the Business+ → HeyQ integration.
 *
 * DORMANT capability, kept for when a future Bridge contract adds a realtime
 * channel (see docs/migration/ggx-corporate-heyq-live-ticketing.md and
 * `useTicketConversation.ts`'s module docblock). The approved QuadX Bridge
 * contract for this POC is REST + adaptive 15-second polling only —
 * `useTicketConversation` does NOT open a WebSocket, so nothing below is
 * exercised by the running app. These tests still verify the standalone
 * client module is correct in isolation, so it stays usable the day a
 * realtime contract is approved:
 *
 *   • service seam    — the WS URL derivation, the connection-token mint, and
 *                       the customer-safe message projection allowlist.
 *   • realtime client — the protocol lifecycle (auth → subscribe → refetch),
 *                       event filtering, typing, reconnect + token re-mint,
 *                       teardown. Exercises `heyqRealtimeClient.ts` directly.
 *   • detail UI       — the ACTUAL wired-up behavior: an agent reply appears
 *                       via the 15-second adaptive REST poll (not a socket
 *                       push), a repeated poll of the same data does not
 *                       duplicate a message, and an optimistic reply
 *                       reconciles to a single confirmed bubble. Full
 *                       adaptive-cadence coverage (single-flight, hidden-tab,
 *                       visibility restore, terminal status) lives in
 *                       `heyq-request-lifecycle.test.mjs`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5193;
const API_DEFAULT = 'https://heyq-api-production.up.railway.app';

let server;
let browser;
let page;

before(async () => {
  server = await startDevServer(PORT);
  const session = await signIn(server.base, 'admin');
  browser = session.browser;
  page = session.page;
});

after(async () => {
  await browser?.close();
  stopDevServer(server);
});

// ── Service seam ───────────────────────────────────────────────────────────

describe('realtime service seam', () => {
  it('derives the wss endpoint from the API origin (https → wss)', async () => {
    const url = await page.evaluate(async () => {
      const svc = await import('/src/app/services/heyqService.ts');
      return svc.getHeyQRealtimeUrl();
    });
    assert.equal(url, `${API_DEFAULT.replace(/^https/, 'wss')}/api/realtime`);
  });

  it('mints a ticket-scoped connection token with the signed-in identity', async () => {
    const { result, calls } = await page.evaluate(async () => {
      const calls = [];
      const orig = window.fetch;
      window.fetch = async (u, init) => {
        calls.push({ url: String(u), method: init?.method ?? 'GET', body: init?.body ?? null });
        return new Response(JSON.stringify({ token: 'rtok_abc', expiresInMs: 60000 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      };
      try {
        const svc = await import('/src/app/services/heyqService.ts');
        const result = await svc.getRealtimeToken('tkt_live_1');
        return { result, calls };
      } finally {
        window.fetch = orig;
      }
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.token, 'rtok_abc');
    const mint = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/customer/realtime/token'));
    assert.ok(mint, 'a token mint POST must be issued');
    const body = JSON.parse(mint.body);
    assert.equal(body.externalUserId, 'max@email.com');
    assert.equal(body.externalOrgId, 'main');
    assert.equal(body.ticketId, 'tkt_live_1'); // knowing a ticket id alone is never enough
  });

  it('maps a 404 token mint (ticket not visible) to not_found — no token issued', async () => {
    const result = await page.evaluate(async () => {
      const orig = window.fetch;
      window.fetch = async () => new Response(JSON.stringify({ error: 'Ticket not found' }), { status: 404 });
      try {
        const svc = await import('/src/app/services/heyqService.ts');
        return await svc.getRealtimeToken('tkt_not_mine');
      } finally {
        window.fetch = orig;
      }
    });
    assert.equal(result.status, 'not_found');
  });

  it('projects a realtime message through the customer-safe allowlist (drops extras)', async () => {
    const projected = await page.evaluate(async () => {
      const svc = await import('/src/app/services/heyqService.ts');
      return svc.projectRealtimeMessage({
        id: 'm9', from: 'support', authorLabel: 'Claims', body: 'On it.',
        attachments: [{ name: 'photo.jpg', size: 2048, type: 'image/jpeg' }], createdAt: '2026-07-16T00:00:00Z',
        // agent-only fields a buggy server might include:
        authorName: 'Bea Santos', authorId: 'l2_agent', visibility: 'internal', slaPolicyId: 'x',
      });
    });
    assert.deepEqual(
      Object.keys(projected).sort(),
      ['attachments', 'authorLabel', 'body', 'createdAt', 'from', 'id'],
    );
    const blob = JSON.stringify(projected).toLowerCase();
    assert.ok(!blob.includes('bea santos'), 'agent identity must not survive projection');
    assert.ok(!blob.includes('slapolicyid'));
    assert.equal(projected.attachments[0].name, 'photo.jpg');
  });
});

// ── Realtime client ─────────────────────────────────────────────────────────
// Each scenario installs a controllable fake WebSocket, drives the protocol, and
// returns captured frames/events/statuses for assertion. window.WebSocket is
// restored afterwards so it never leaks into other tests.

describe('realtime client lifecycle', () => {
  it('authenticates, subscribes, and fires onResubscribed for the refetch', async () => {
    const out = await page.evaluate(async () => {
      const { createHeyQRealtimeClient } = await import('/src/app/services/heyqRealtimeClient.ts');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const sent = []; const statuses = []; const events = []; let resubscribes = 0; let mints = 0;
      let sock = null;
      const OrigWS = window.WebSocket;
      class FakeWS {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        constructor(url) { this.url = url; this.readyState = 0; sock = this;
          setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
        send(data) { sent.push(JSON.parse(data)); }
        close() { this.readyState = 3; }
        emit(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
      }
      window.WebSocket = FakeWS;
      try {
        const client = createHeyQRealtimeClient({
          url: 'wss://x/api/realtime', ticketId: 'tkt1',
          mintToken: async () => { mints += 1; return 'rtok_' + mints; },
          onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s),
          onResubscribed: () => { resubscribes += 1; },
        });
        client.start();
        await wait(10); // mint + open + auth frame
        sock.emit({ t: 'welcome' });
        sock.emit({ t: 'auth_ok', audience: 'customer' });
        sock.emit({ t: 'subscribed', ticketId: 'tkt1' });
        await wait(5);
        client.stop();
        await wait(5);
        return { sent, statuses, events, resubscribes, mints };
      } finally {
        window.WebSocket = OrigWS;
      }
    });
    assert.equal(out.sent[0].t, 'auth', 'first frame must be auth');
    assert.equal(out.sent[0].token, 'rtok_1');
    assert.ok(out.sent.find((f) => f.t === 'subscribe' && f.ticketId === 'tkt1'), 'must subscribe after auth_ok');
    assert.equal(out.resubscribes, 1, 'onResubscribed must fire once on subscribe');
    assert.ok(out.statuses.includes('open'));
    // Teardown is graceful: unsubscribe + typing stop, then closed.
    assert.ok(out.sent.find((f) => f.t === 'unsubscribe' && f.ticketId === 'tkt1'));
    assert.equal(out.statuses[out.statuses.length - 1], 'closed');
  });

  it('forwards customer-safe events but drops agent-only and foreign-ticket frames', async () => {
    const out = await page.evaluate(async () => {
      const { createHeyQRealtimeClient } = await import('/src/app/services/heyqRealtimeClient.ts');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const events = []; let sock = null;
      const OrigWS = window.WebSocket;
      class FakeWS {
        static OPEN = 1;
        constructor() { this.readyState = 0; sock = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
        send() {} close() { this.readyState = 3; }
        emit(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
      }
      window.WebSocket = FakeWS;
      try {
        const client = createHeyQRealtimeClient({
          url: 'wss://x/api/realtime', ticketId: 'tkt1',
          mintToken: async () => 'rtok', onEvent: (e) => events.push(e), onStatus: () => {}, onResubscribed: () => {},
        });
        client.start();
        await wait(10);
        sock.emit({ t: 'auth_ok', audience: 'customer' });
        sock.emit({ t: 'subscribed', ticketId: 'tkt1' });
        const ev = (id, type, ticketId = 'tkt1', actorType = 'agent') =>
          ({ t: 'event', event: { id, type, ticketId, actorType, serverTimestamp: '2026-07-16T00:00:00Z', data: {} } });
        sock.emit(ev('e1', 'message.created'));
        sock.emit(ev('e2', 'ticket.status_changed'));
        sock.emit(ev('e3', 'typing.started'));
        sock.emit(ev('e4', 'ticket.assignment_changed'));  // agent-only → dropped
        sock.emit(ev('e5', 'message.created', 'OTHER'));    // foreign ticket → dropped
        await wait(5);
        client.stop();
        return events.map((e) => e.type);
      } finally {
        window.WebSocket = OrigWS;
      }
    });
    assert.deepEqual(out, ['message.created', 'ticket.status_changed', 'typing.started']);
  });

  it('reconnects on an unexpected close, re-minting a fresh token each attempt', async () => {
    const out = await page.evaluate(async () => {
      const { createHeyQRealtimeClient } = await import('/src/app/services/heyqRealtimeClient.ts');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const tokensUsed = []; const statuses = []; let sock = null;
      const OrigWS = window.WebSocket;
      class FakeWS {
        static OPEN = 1;
        constructor() { this.readyState = 0; sock = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
        send(d) { const m = JSON.parse(d); if (m.t === 'auth') tokensUsed.push(m.token); }
        close() { this.readyState = 3; }
        serverClose() { this.readyState = 3; this.onclose && this.onclose(); }
        emit(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
      }
      window.WebSocket = FakeWS;
      try {
        let mints = 0;
        const client = createHeyQRealtimeClient({
          url: 'wss://x/api/realtime', ticketId: 'tkt1',
          mintToken: async () => { mints += 1; return 'rtok_' + mints; },
          onEvent: () => {}, onStatus: (s) => statuses.push(s), onResubscribed: () => {},
        });
        client.start();
        await wait(10);
        sock.emit({ t: 'auth_ok', audience: 'customer' });
        sock.emit({ t: 'subscribed', ticketId: 'tkt1' });
        await wait(5);
        // Simulate the socket dropping. Backoff base is ~1s; wait past it.
        sock.serverClose();
        await wait(1600);
        sock.emit({ t: 'auth_ok', audience: 'customer' });
        sock.emit({ t: 'subscribed', ticketId: 'tkt1' });
        await wait(5);
        client.stop();
        return { tokensUsed, statuses };
      } finally {
        window.WebSocket = OrigWS;
      }
    });
    assert.equal(out.tokensUsed.length, 2, 'auth must be sent once per (re)connect');
    assert.notEqual(out.tokensUsed[0], out.tokensUsed[1], 'a fresh token is minted per attempt');
    assert.ok(out.statuses.includes('reconnecting'), 'a drop surfaces a reconnecting status');
  });
});

// ── Detail UI: the ACTUAL wired-up behavior — REST polling, no socket ─────────

describe('the ticket detail page (REST polling only — no WebSocket is opened)', () => {
  const TICKET_ID = 'tkt-live-1';

  /** Install a Corporate-support-proxy fetch stub, then open the ticket. No
   * WebSocket is installed — asserting its absence is the point: if the hook
   * ever opened one again, `window.WebSocket` would no longer be this no-op
   * stub and the constructor guard below would throw, failing the test loudly. */
  async function openLiveTicket() {
    await page.addInitScript((ticketId) => {
      const now = () => new Date().toISOString();
      const ticket = {
        id: ticketId, reference: 'HQ-LIVE-1', subject: 'Where is my parcel?',
        concernType: 'delivery_delay', issueType: 'Delayed delivery', status: 'in_progress',
        priority: 'normal', supportTeam: 'Customer Support',
        createdAt: '2026-07-16T00:00:00Z', updatedAt: '2026-07-16T00:00:00Z',
        openedBySupport: false, canReopen: false,
        messages: [{ id: 'seed-1', from: 'you', authorLabel: 'You', body: 'Any update?', createdAt: '2026-07-16T00:00:00Z' }],
      };
      window.__ticket = ticket;

      // Fetch stub: customer reads (poll + initial) and reply (append + return),
      // all under the same-origin /api/support/* proxy shape.
      const origFetch = window.fetch.bind(window);
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (url, init) => {
        const u = String(url); const method = (init?.method ?? 'GET').toUpperCase();
        const path = new URL(u, 'http://x').pathname;
        if (method === 'POST' && /\/api\/support\/tickets\/[^/]+\/messages$/.test(path)) {
          const body = init?.body ? JSON.parse(init.body) : {};
          window.__ticket.messages.push({ id: 'srv-' + (window.__ticket.messages.length + 1), from: 'you', authorLabel: 'You', body: body.body, createdAt: now() });
          window.__ticket.updatedAt = now();
          return json(window.__ticket);
        }
        if (u.includes('/api/support/tickets')) {
          const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
          if (m) return json(window.__ticket);
          return json([window.__ticket]);
        }
        return origFetch(url, init);
      };

      // No realtime client should ever be constructed on this contract — make
      // that loud instead of silent if the hook regresses.
      class NoSocketExpected {
        constructor() { throw new Error('useTicketConversation must not open a WebSocket on the REST-only Bridge contract'); }
      }
      window.WebSocket = NoSocketExpected;
      // Directly mutate the mock ticket, as if HeyQ/Bridge received an agent
      // reply out-of-band — the next 15-second adaptive poll is what surfaces it.
      window.__addAgentReply = (body) => {
        window.__ticket.messages.push({ id: 'agent-1', from: 'support', authorLabel: 'Customer Support', body, createdAt: now() });
        window.__ticket.updatedAt = now();
      };
    }, TICKET_ID);

    await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
    await page.getByText('Where is my parcel?').first().waitFor({ timeout: 15000 });
    await page.getByText('Live', { exact: true }).first().waitFor({ timeout: 15000 });
  }

  it('shows an agent reply after the next poll, and a repeated poll of the same data does not duplicate it', { timeout: 45_000 }, async () => {
    await openLiveTicket();

    await page.evaluate(() => window.__addAgentReply('Your parcel is out for delivery.'));
    // The adaptive poll's first tick lands at 15s; give it margin past that.
    await page.getByText('Your parcel is out for delivery.').first().waitFor({ timeout: 20_000 });

    // Let at least one more poll run over the SAME (unchanged) ticket data —
    // the message must not be duplicated by re-upserting the same id.
    await page.waitForTimeout(16_000);
    const count = await page.getByText('Your parcel is out for delivery.').count();
    assert.equal(count, 1, 'a repeated poll of unchanged data must not duplicate the message');
  });

  it('renders an optimistic reply and reconciles it to a single confirmed message', async () => {
    await openLiveTicket();
    await page.fill('#ticket-reply', 'Thanks, standing by.');
    await page.getByRole('button', { name: /Send Reply/i }).click();
    // The optimistic bubble appears immediately; after the REST confirm it stays single.
    await page.getByText('Thanks, standing by.').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    const count = await page.getByText('Thanks, standing by.').count();
    assert.equal(count, 1, 'optimistic + confirmed must reconcile to one bubble');
    // No failure UI on a successful send.
    assert.equal(await page.getByText('Not sent.').count(), 0);
  });
});
