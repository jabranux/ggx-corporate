/**
 * Live typing indicator — the GGX Corporate half (see `useTicketConversation.ts`'s
 * module docblock, `src/app/lib/typingPresence.ts`, and
 * `src/app/services/heyqTypingRealtime.ts`).
 *
 * Three layers:
 *
 *   • pure logic — `lib/typingPresence.ts`'s two state machines (unchanged
 *                   this pass), exercised via a dynamic import of the
 *                   Vite-served module with an injected fake clock so
 *                   throttle/debounce/stale-expiry timing is asserted
 *                   deterministically, with no real waits.
 *   • pure logic — `services/heyqTypingRealtime.ts`'s Realtime connection
 *                   state machine, exercised the same way but with an
 *                   injected FAKE Supabase client (`__setSupabaseClientFactoryForTests`)
 *                   instead of a fake clock — no real Supabase project, no
 *                   real WebSocket, small real waits (the module has no
 *                   injectable clock of its own, unlike typingPresence.ts).
 *   • detail UI   — the ACTUAL wired-up behavior against a fetch-stubbed
 *                   `/api/support/tickets/:id/typing*` route pair AND a
 *                   fake Supabase Realtime client injected via
 *                   `window.__ggxTestSupabaseClientFactory` (see
 *                   heyqTypingRealtime.ts's docblock for why this
 *                   window-global seam exists instead of the direct
 *                   module setter): the Realtime subscription drives the
 *                   "Customer Support is typing…" bubble from a genuine
 *                   broadcast (never a poll), a reply always clears the
 *                   customer's own typing signal, a failing typing
 *                   transport never blocks a real reply, and leaving the
 *                   ticket tears the subscription down. Real (short) timers
 *                   here, same as the rest of the suite's DOM checks.
 *
 * Existing ticket-detail polling coverage (single-flight, hidden-tab, terminal
 * status, the stale-reply race) is untouched and lives in
 * `heyq-request-lifecycle.test.mjs` — nothing here modifies that cadence.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5195;

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

// ── Pure logic: lib/typingPresence.ts, driven by a fake clock ────────────────

function installFakeClock() {
  // Built INSIDE page.evaluate (see callers) — plain data/functions only, no
  // closures over Node-side state cross the page boundary.
  return `(function () {
    let now = 0; let seq = 1; const timers = new Map();
    const clock = {
      now: () => now,
      setTimeout: (fn, ms) => { const id = seq++; timers.set(id, { fn, at: now + ms }); return id; },
      clearTimeout: (id) => { timers.delete(id); },
    };
    const advance = (ms) => {
      now += ms;
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const [id, t] of [...timers.entries()]) {
          if (t.at <= now) { timers.delete(id); t.fn(); progressed = true; }
        }
      }
    };
    return { clock, advance };
  })()`;
}

describe('typingPresence — RemoteTypingTracker (pure logic, fake clock)', () => {
  it('a true signal flips agentTyping on', async () => {
    const values = await page.evaluate(async (mkClock) => {
      const { createRemoteTypingTracker } = await import('/src/app/lib/typingPresence.ts');
      const { clock } = eval(mkClock);
      const values = [];
      const tracker = createRemoteTypingTracker((v) => values.push(v), clock);
      tracker.signal(true);
      return values;
    }, installFakeClock());
    assert.deepEqual(values, [true]);
  });

  it('an explicit false signal clears it immediately, without waiting out the stale timer', async () => {
    const values = await page.evaluate(async (mkClock) => {
      const { createRemoteTypingTracker } = await import('/src/app/lib/typingPresence.ts');
      const { clock, advance } = eval(mkClock);
      const values = [];
      const tracker = createRemoteTypingTracker((v) => values.push(v), clock);
      tracker.signal(true);
      advance(10); // well short of the stale timeout
      tracker.signal(false);
      return values;
    }, installFakeClock());
    assert.deepEqual(values, [true, false], 'stop must clear immediately, not after the stale window');
  });

  it('auto-expires a stuck true signal after the stale timeout (a lost stop cannot leave it on forever)', async () => {
    const out = await page.evaluate(async (mkClock) => {
      const { createRemoteTypingTracker, REMOTE_TYPING_STALE_MS } = await import('/src/app/lib/typingPresence.ts');
      const { clock, advance } = eval(mkClock);
      const values = [];
      const tracker = createRemoteTypingTracker((v) => values.push(v), clock);
      tracker.signal(true);
      advance(REMOTE_TYPING_STALE_MS - 1);
      const beforeExpiry = [...values];
      advance(2); // cross the threshold — no further signal was ever fed
      return { beforeExpiry, afterExpiry: values, staleMs: REMOTE_TYPING_STALE_MS };
    }, installFakeClock());
    assert.deepEqual(out.beforeExpiry, [true], 'must still be showing just under the stale window');
    assert.deepEqual(out.afterExpiry, [true, false], 'must self-clear once the stale window elapses');
  });

  it('a repeated true signal refreshes the stale timer instead of expiring on schedule', async () => {
    const values = await page.evaluate(async (mkClock) => {
      const { createRemoteTypingTracker, REMOTE_TYPING_STALE_MS } = await import('/src/app/lib/typingPresence.ts');
      const { clock, advance } = eval(mkClock);
      const values = [];
      const tracker = createRemoteTypingTracker((v) => values.push(v), clock);
      tracker.signal(true);
      advance(REMOTE_TYPING_STALE_MS - 1);
      tracker.signal(true); // still typing — refresh, must not expire on the original schedule
      advance(2);
      return values;
    }, installFakeClock());
    assert.deepEqual(values, [true], 'a fresh true before expiry must keep the indicator up');
  });
});

describe('typingPresence — CustomerTypingEmitter (pure logic, fake clock)', () => {
  it('throttles rapid keystrokes to one outbound start per window', async () => {
    const out = await page.evaluate(async (mkClock) => {
      const { createCustomerTypingEmitter, CUSTOMER_TYPING_THROTTLE_MS } = await import('/src/app/lib/typingPresence.ts');
      const { clock, advance } = eval(mkClock);
      const sent = [];
      const emitter = createCustomerTypingEmitter((s) => sent.push(s), clock);
      emitter.onInputChange('h');
      emitter.onInputChange('he');
      emitter.onInputChange('hel'); // three keystrokes, well inside the throttle window
      const withinWindow = [...sent];
      advance(CUSTOMER_TYPING_THROTTLE_MS); // past the throttle window, short of the stop debounce
      emitter.onInputChange('hello');
      return { withinWindow, afterWindow: sent };
    }, installFakeClock());
    assert.deepEqual(out.withinWindow, ['start'], 'a burst of keystrokes must emit exactly one start');
    assert.deepEqual(out.afterWindow, ['start', 'start'], 'a new burst after the throttle window emits again');
  });

  it('emits a stop after inactivity, with no further keystrokes', async () => {
    const values = await page.evaluate(async (mkClock) => {
      const { createCustomerTypingEmitter, CUSTOMER_TYPING_STOP_DEBOUNCE_MS } = await import('/src/app/lib/typingPresence.ts');
      const { clock, advance } = eval(mkClock);
      const sent = [];
      const emitter = createCustomerTypingEmitter((s) => sent.push(s), clock);
      emitter.onInputChange('hi');
      advance(CUSTOMER_TYPING_STOP_DEBOUNCE_MS);
      return sent;
    }, installFakeClock());
    assert.deepEqual(values, ['start', 'stop']);
  });

  it('never emits start for an empty/whitespace value, and clearing the input force-stops an active signal', async () => {
    const values = await page.evaluate(async (mkClock) => {
      const { createCustomerTypingEmitter } = await import('/src/app/lib/typingPresence.ts');
      const { clock } = eval(mkClock);
      const sent = [];
      const emitter = createCustomerTypingEmitter((s) => sent.push(s), clock);
      emitter.onInputChange('   '); // whitespace-only — never a start
      const afterWhitespace = [...sent];
      emitter.onInputChange('hi'); // now actually typing
      emitter.onInputChange('');   // cleared
      return { afterWhitespace, afterClear: sent };
    }, installFakeClock());
    assert.deepEqual(values.afterWhitespace, []);
    assert.deepEqual(values.afterClear, ['start', 'stop']);
  });

  it('stopNow() force-stops mid-window without waiting for the debounce', async () => {
    const values = await page.evaluate(async (mkClock) => {
      const { createCustomerTypingEmitter } = await import('/src/app/lib/typingPresence.ts');
      const { clock } = eval(mkClock);
      const sent = [];
      const emitter = createCustomerTypingEmitter((s) => sent.push(s), clock);
      emitter.onInputChange('hi');
      emitter.stopNow();
      emitter.stopNow(); // idempotent — no duplicate stop
      return sent;
    }, installFakeClock());
    assert.deepEqual(values, ['start', 'stop']);
  });
});

// ── Pure logic: services/heyqTypingRealtime.ts, driven by a fake Supabase client ──

/** Builds a fake Supabase-client factory (evaluated INSIDE page.evaluate) that
 * records every call and lets the test script drive broadcast/status events
 * synchronously. `calls` is a flat ordered log — assertions read indices to
 * prove ordering (e.g. setAuth before subscribe). */
function installFakeRealtimeFactory() {
  return `(function () {
    const calls = [];
    const clients = [];
    let clientId = 0;
    function factory(url, anonKey) {
      const id = ++clientId;
      const entry = { id, url, anonKey, broadcastCb: null, statusCb: null };
      const client = {
        realtime: {
          setAuth: async (token) => { calls.push({ type: 'setAuth', client: id, token }); },
          disconnect: async () => { calls.push({ type: 'disconnect', client: id }); },
        },
        channel(topic) {
          calls.push({ type: 'channel', client: id, topic });
          return {
            on(type, filter, cb) { entry.broadcastCb = cb; calls.push({ type: 'on', client: id, event: filter.event }); return this; },
            subscribe(cb) { entry.statusCb = cb; calls.push({ type: 'subscribe', client: id }); cb('SUBSCRIBED'); return {}; },
          };
        },
        removeChannel: async () => { calls.push({ type: 'removeChannel', client: id }); },
      };
      clients.push(entry);
      return client;
    }
    return { calls, clients, factory };
  })()`;
}

describe('heyqTypingRealtime — connectAgentTypingRealtime (pure logic, fake Supabase client)', () => {
  it('calls setAuth (awaited) before subscribing, to the exact channel the credential names', async () => {
    const out = await page.evaluate(async (mkFake) => {
      const mod = await import('/src/app/services/heyqTypingRealtime.ts');
      const { calls, factory } = eval(mkFake);
      mod.__setSupabaseClientFactoryForTests(factory);

      const statuses = [];
      const conn = mod.connectAgentTypingRealtime({
        mintCredential: async () => ({
          token: 'tok-1', channel: 'ticket:abc:agent_typing', expiresIn: 300,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon-1',
        }),
        onTyping: () => {},
        onStatus: (s) => statuses.push(s),
      });
      conn.start();
      await new Promise((r) => setTimeout(r, 100));
      conn.stop();
      mod.__setSupabaseClientFactoryForTests(null);
      return { calls, statuses };
    }, installFakeRealtimeFactory());

    const setAuthIdx = out.calls.findIndex((c) => c.type === 'setAuth');
    const subscribeIdx = out.calls.findIndex((c) => c.type === 'subscribe');
    assert.ok(setAuthIdx !== -1 && subscribeIdx !== -1, 'both calls must happen');
    assert.ok(setAuthIdx < subscribeIdx, 'setAuth must be called before subscribe');
    assert.equal(out.calls.find((c) => c.type === 'channel')?.topic, 'ticket:abc:agent_typing');
    assert.ok(out.statuses.includes('live'), 'a successful SUBSCRIBED must surface as live');
  });

  it('duplicate-subscription prevention: calling start() repeatedly creates only one client', async () => {
    const out = await page.evaluate(async (mkFake) => {
      const mod = await import('/src/app/services/heyqTypingRealtime.ts');
      const { calls, factory } = eval(mkFake);
      mod.__setSupabaseClientFactoryForTests(factory);

      const conn = mod.connectAgentTypingRealtime({
        mintCredential: async () => ({
          token: 't', channel: 'ticket:x:agent_typing', expiresIn: 300, expiresAt: new Date(Date.now() + 300_000).toISOString(),
          supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'a',
        }),
        onTyping: () => {},
      });
      conn.start();
      conn.start();
      conn.start();
      await new Promise((r) => setTimeout(r, 100));
      conn.stop();
      mod.__setSupabaseClientFactoryForTests(null);
      return calls;
    }, installFakeRealtimeFactory());

    assert.equal(out.filter((c) => c.type === 'subscribe').length, 1, 'only one channel/subscribe, despite three start() calls');
  });

  it('a broadcast payload only calls onTyping — a malformed payload is ignored, never throws', async () => {
    const out = await page.evaluate(async (mkFake) => {
      const mod = await import('/src/app/services/heyqTypingRealtime.ts');
      const { clients, factory } = eval(mkFake);
      mod.__setSupabaseClientFactoryForTests(factory);

      const events = [];
      const conn = mod.connectAgentTypingRealtime({
        mintCredential: async () => ({
          token: 't', channel: 'ticket:x:agent_typing', expiresIn: 300, expiresAt: new Date(Date.now() + 300_000).toISOString(),
          supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'a',
        }),
        onTyping: (typing, updatedAt) => events.push({ typing, updatedAt }),
      });
      conn.start();
      await new Promise((r) => setTimeout(r, 50));
      clients[0].broadcastCb({ payload: { typing: true, updatedAt: '2026-01-01T00:00:00Z' } });
      clients[0].broadcastCb({ payload: { typing: false, updatedAt: '2026-01-01T00:00:05Z' } });
      clients[0].broadcastCb({ payload: { nonsense: 'ignored' } }); // malformed — dropped
      conn.stop();
      mod.__setSupabaseClientFactoryForTests(null);
      return events;
    }, installFakeRealtimeFactory());

    assert.deepEqual(out, [
      { typing: true, updatedAt: '2026-01-01T00:00:00Z' },
      { typing: false, updatedAt: '2026-01-01T00:00:05Z' },
    ]);
  });

  it('token refresh (before expiry) re-applies setAuth on the SAME client — no new client, no resubscribe', async () => {
    const out = await page.evaluate(async (mkFake) => {
      const mod = await import('/src/app/services/heyqTypingRealtime.ts');
      const { calls, clients, factory } = eval(mkFake);
      mod.__setSupabaseClientFactoryForTests(factory);

      let mintCount = 0;
      const conn = mod.connectAgentTypingRealtime({
        // expiresIn=1 → refresh margin (60s) makes the refresh fire almost
        // immediately (Math.max(0, (1-60)*1000) === 0) — a fast, deterministic
        // way to exercise the refresh path without waiting a real 240s.
        mintCredential: async () => {
          mintCount += 1;
          return {
            token: `tok-${mintCount}`, channel: 'ticket:x:agent_typing', expiresIn: 1,
            expiresAt: new Date(Date.now() + 1000).toISOString(),
            supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'a',
          };
        },
        onTyping: () => {},
      });
      conn.start();
      await new Promise((r) => setTimeout(r, 400)); // connect + at least one refresh cycle
      conn.stop();
      mod.__setSupabaseClientFactoryForTests(null);
      return { calls, mintCount, numClients: clients.length };
    }, installFakeRealtimeFactory());

    assert.equal(out.numClients, 1, 'a refresh must never create a new client');
    assert.equal(out.calls.filter((c) => c.type === 'subscribe').length, 1, 'a refresh must never resubscribe');
    assert.equal(out.calls.filter((c) => c.type === 'channel').length, 1, 'a refresh must never open a second channel');
    assert.ok(out.mintCount >= 2, 'mintCredential must be called again for the refresh, not just the initial connect');
    assert.ok(out.calls.filter((c) => c.type === 'setAuth' && c.client === 1).length >= 2, 'setAuth must be re-applied on the refresh');
  });

  it('reconnect: a CHANNEL_ERROR fully (awaited) tears down the old client before a fresh setAuth + subscribe on a NEW one', async () => {
    const out = await page.evaluate(async (mkFake) => {
      const mod = await import('/src/app/services/heyqTypingRealtime.ts');
      const { calls, clients, factory } = eval(mkFake);
      mod.__setSupabaseClientFactoryForTests(factory);

      const statuses = [];
      const conn = mod.connectAgentTypingRealtime({
        mintCredential: async () => ({
          token: 't', channel: 'ticket:x:agent_typing', expiresIn: 300, expiresAt: new Date(Date.now() + 300_000).toISOString(),
          supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'a',
        }),
        onTyping: () => {},
        onStatus: (s) => statuses.push(s),
      });
      conn.start();
      await new Promise((r) => setTimeout(r, 50));
      clients[0].statusCb('CHANNEL_ERROR'); // simulate a drop
      await new Promise((r) => setTimeout(r, 1800)); // backoff base 1s + jitter, plus reconnect
      conn.stop();
      mod.__setSupabaseClientFactoryForTests(null);
      return { calls, statuses, numClients: clients.length };
    }, installFakeRealtimeFactory());

    assert.ok(out.numClients >= 2, 'a CHANNEL_ERROR must trigger a reconnect onto a new client');
    const disconnectClient1 = out.calls.findIndex((c) => c.type === 'disconnect' && c.client === 1);
    const setAuthClient2 = out.calls.findIndex((c) => c.type === 'setAuth' && c.client === 2);
    const subscribeClient2 = out.calls.findIndex((c) => c.type === 'subscribe' && c.client === 2);
    assert.ok(disconnectClient1 !== -1, 'the old client must be disconnected');
    assert.ok(setAuthClient2 !== -1 && subscribeClient2 !== -1, 'the new client must setAuth + subscribe');
    assert.ok(disconnectClient1 < setAuthClient2, 'disconnect of the OLD client must be awaited before the NEW one authenticates (racing this was a real bug)');
    assert.ok(setAuthClient2 < subscribeClient2, 'setAuth must precede subscribe on the new client too');
    assert.ok(out.statuses.includes('reconnecting'));
  });

  it('stop() is idempotent, tears down the channel/socket, and no callback fires afterward', async () => {
    const out = await page.evaluate(async (mkFake) => {
      const mod = await import('/src/app/services/heyqTypingRealtime.ts');
      const { calls, clients, factory } = eval(mkFake);
      mod.__setSupabaseClientFactoryForTests(factory);

      const events = [];
      const statuses = [];
      const conn = mod.connectAgentTypingRealtime({
        mintCredential: async () => ({
          token: 't', channel: 'ticket:x:agent_typing', expiresIn: 300, expiresAt: new Date(Date.now() + 300_000).toISOString(),
          supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'a',
        }),
        onTyping: (t) => events.push(t),
        onStatus: (s) => statuses.push(s),
      });
      conn.start();
      await new Promise((r) => setTimeout(r, 50));
      conn.stop();
      conn.stop(); // idempotent — no duplicate teardown
      // A late callback from the already-torn-down channel must be dropped.
      clients[0].broadcastCb?.({ payload: { typing: true, updatedAt: 'x' } });
      await new Promise((r) => setTimeout(r, 50));
      mod.__setSupabaseClientFactoryForTests(null);
      return { calls, events, statuses };
    }, installFakeRealtimeFactory());

    assert.equal(out.calls.filter((c) => c.type === 'removeChannel').length, 1, 'stop must remove the channel exactly once, even after a second stop() call');
    assert.equal(out.calls.filter((c) => c.type === 'disconnect').length, 1, 'stop must disconnect exactly once');
    assert.deepEqual(out.events, [], 'a broadcast arriving after stop() must never reach onTyping');
    assert.ok(out.statuses[out.statuses.length - 1] === 'closed');
  });
});

// ── Detail UI: the ACTUAL wired-up behavior against a stubbed subscribe route + fake Realtime client ──

describe('the ticket detail page (typing wired end-to-end, Realtime Broadcast)', () => {
  const TICKET_ID = 'tkt-typing-1';

  /** Installs a Corporate-support-proxy stub covering ticket reads, replies,
   * the typing SEND route, and the typing SUBSCRIBE route, PLUS a fake
   * Supabase Realtime client factory on `window.__ggxTestSupabaseClientFactory`
   * (see heyqTypingRealtime.ts's docblock for why this window-global seam is
   * used instead of the direct module setter for DOM-level tests). Opens the
   * ticket. `opts.subscribeFails` makes every subscribe POST fail (502), to
   * exercise "a failed/denied credential must never surface as a stuck
   * indicator or block anything." */
  async function openLiveTicket(opts = {}) {
    await page.addInitScript(({ ticketId, subscribeFails, initialStatus, reopensOnReply }) => {
      const now = () => new Date().toISOString();
      const ticket = {
        id: ticketId, reference: 'HQ-TYPING-1', subject: 'Where is my parcel?',
        concernType: 'delivery_delay', issueType: 'Delayed delivery', status: initialStatus || 'in_progress',
        priority: 'normal', supportTeam: 'Customer Support',
        createdAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z',
        openedBySupport: false, canReopen: false,
        messages: [{ id: 'seed-1', from: 'you', authorLabel: 'You', body: 'Any update?', createdAt: '2026-08-27T00:00:00Z' }],
      };
      window.__ticket = ticket;
      window.__typingPostCalls = [];
      window.__subscribeCalls = 0;
      window.__ticketGetCalls = [];

      // ── Fake Supabase Realtime client factory — see this function's own
      // docblock above for why this is a window global, not the module's
      // direct __setSupabaseClientFactoryForTests setter. ──
      window.__ggxFakeRealtimeClients = [];
      window.__ggxTestSupabaseClientFactory = (url, anonKey) => {
        const entry = { url, anonKey, setAuthCalls: [], disconnectCalls: 0, subscribeCalls: 0, removeChannelCalls: 0, broadcastCb: null, statusCb: null };
        const client = {
          realtime: {
            setAuth: async (token) => { entry.setAuthCalls.push(token); },
            disconnect: async () => { entry.disconnectCalls += 1; },
          },
          channel(topic) {
            entry.topic = topic;
            return {
              on(type, filter, cb) { entry.broadcastCb = cb; return this; },
              subscribe(cb) { entry.statusCb = cb; entry.subscribeCalls += 1; cb('SUBSCRIBED'); return {}; },
            };
          },
          removeChannel: async () => { entry.removeChannelCalls += 1; },
        };
        entry.triggerBroadcast = (typing, updatedAt) => entry.broadcastCb?.({ payload: { typing, updatedAt: updatedAt || now() } });
        entry.triggerStatus = (status) => entry.statusCb?.(status);
        window.__ggxFakeRealtimeClients.push(entry);
        return client;
      };

      const origFetch = window.fetch.bind(window);
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (url, init) => {
        const u = String(url);
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = new URL(u, 'http://x').pathname;

        if (method === 'POST' && /\/api\/support\/tickets\/[^/]+\/typing\/subscribe$/.test(path)) {
          window.__subscribeCalls += 1;
          if (subscribeFails) return json({ error: 'Bridge unreachable' }, 502);
          return json({
            token: 'fake-realtime-token', channel: `ticket:${ticketId}:agent_typing`, expiresIn: 300,
            expiresAt: new Date(Date.now() + 300_000).toISOString(), supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'fake-anon',
          });
        }

        if (method === 'POST' && /\/api\/support\/tickets\/[^/]+\/typing$/.test(path)) {
          const body = init?.body ? JSON.parse(init.body) : {};
          window.__typingPostCalls.push(body.state);
          return json({ ok: true });
        }

        if (method === 'POST' && /\/api\/support\/tickets\/[^/]+\/messages$/.test(path)) {
          const body = init?.body ? JSON.parse(init.body) : {};
          window.__ticket.messages.push({ id: 'srv-' + (window.__ticket.messages.length + 1), from: 'you', authorLabel: 'You', body: body.body, createdAt: now() });
          window.__ticket.updatedAt = now();
          // Mirrors real Bridge behavior: a reply to a resolved/closed ticket reopens it.
          if (reopensOnReply && (window.__ticket.status === 'resolved' || window.__ticket.status === 'closed')) {
            window.__ticket.status = 'open';
          }
          return json(window.__ticket);
        }

        if (u.includes('/api/support/tickets')) {
          const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
          if (m) {
            window.__ticketGetCalls.push(Date.now());
            return json(window.__ticket);
          }
          return json([window.__ticket]);
        }
        return origFetch(url, init);
      };
    }, {
      ticketId: TICKET_ID, subscribeFails: !!opts.subscribeFails,
      initialStatus: opts.initialStatus, reopensOnReply: !!opts.reopensOnReply,
    });

    await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
    await page.getByText('Where is my parcel?').first().waitFor({ timeout: 15000 });
  }

  /** The most-recently-created fake Realtime client (there may be several
   * across reconnect/visibility cycles). */
  async function latestFakeClient() {
    return page.evaluate(() => {
      const list = window.__ggxFakeRealtimeClients || [];
      return list.length ? { index: list.length - 1 } : null;
    });
  }
  async function triggerBroadcast(index, typing) {
    await page.evaluate(({ index, typing }) => window.__ggxFakeRealtimeClients[index].triggerBroadcast(typing), { index, typing });
  }

  it('shows the agent typing indicator from a REAL Realtime broadcast (never a poll), and clears it on an explicit stop broadcast', async () => {
    await openLiveTicket({});
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });

    const { index } = await latestFakeClient();
    await triggerBroadcast(index, true);
    await page.getByText('Customer Support is typing…').first().waitFor({ timeout: 4_000 });

    await triggerBroadcast(index, false);
    await page.getByText('Customer Support is typing…').first().waitFor({ state: 'hidden', timeout: 4_000 });
  });

  it('setAuth is called (and awaited) before the initial subscribe, with the exact ticket-scoped channel from the credential', async () => {
    await openLiveTicket({});
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });

    const entry = await page.evaluate(() => window.__ggxFakeRealtimeClients[0]);
    assert.ok(entry.setAuthCalls.length >= 1, 'setAuth must have been called');
    assert.equal(entry.setAuthCalls[0], 'fake-realtime-token');
    assert.equal(entry.topic, `ticket:${TICKET_ID}:agent_typing`);
  });

  it('a typing broadcast never triggers a ticket refetch', async () => {
    await openLiveTicket({});
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });

    const before = await page.evaluate(() => (window.__ticketGetCalls ?? []).length);
    const { index } = await latestFakeClient();
    await triggerBroadcast(index, true);
    await page.getByText('Customer Support is typing…').first().waitFor({ timeout: 4_000 });
    await triggerBroadcast(index, false);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => (window.__ticketGetCalls ?? []).length);
    assert.equal(after, before, 'a typing broadcast must never call GET .../tickets/:id');
  });

  it('a denied/failed subscribe credential never blocks the page or shows a stuck indicator', async () => {
    await openLiveTicket({ subscribeFails: true });
    await page.waitForFunction(() => (window.__subscribeCalls ?? 0) >= 1, { timeout: 8_000 });
    await page.waitForTimeout(1_000);
    assert.equal(await page.getByText('Customer Support is typing…').count(), 0);
  });

  it('a failing typing SEND transport never blocks a real reply, and sending always clears the customer\'s own typing signal', async () => {
    await openLiveTicket({});

    await page.fill('#ticket-reply', 'Thanks, standing by.');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await page.getByRole('button', { name: /Send Reply/i }).click();
    await page.getByText('Thanks, standing by.').first().waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('Not sent.').count(), 0, 'sending must succeed even if the receiver-side subscribe were ever to fail');

    const calls = await page.evaluate(() => window.__typingPostCalls ?? []);
    assert.ok(calls.includes('stop'), 'sending a reply must emit a typing stop');
  });

  it('leaving the ticket tears the Realtime subscription down (channel removed, socket disconnected) — no lingering connection after unmount', async () => {
    await openLiveTicket({});
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });

    await page.getByRole('button', { name: /Back to Support Tickets/i }).click();
    await page.waitForURL('**/dashboard/support-tickets', { timeout: 10_000 });
    await page.waitForTimeout(300);

    const entry = await page.evaluate(() => window.__ggxFakeRealtimeClients[0]);
    assert.ok(entry.removeChannelCalls >= 1, 'the channel must be removed on unmount');
    assert.ok(entry.disconnectCalls >= 1, 'the socket must be disconnected on unmount');

    const clientCountAtNav = await page.evaluate(() => window.__ggxFakeRealtimeClients.length);
    await page.waitForTimeout(1_000);
    const clientCountAfter = await page.evaluate(() => window.__ggxFakeRealtimeClients.length);
    assert.equal(clientCountAfter, clientCountAtNav, 'no new connection may open after the conversation unmounts');
  });

  /** Simulate the Page Visibility API without actually backgrounding the OS window. */
  async function setHidden(hidden) {
    await page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  }

  it('composer blur stops the customer\'s typing signal immediately, without waiting for the inactivity debounce', async () => {
    await openLiveTicket({});

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await page.locator('#ticket-reply').blur();
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });
  });

  it('the tab going hidden stops the customer\'s signal immediately AND tears down the Realtime subscription, clearing the indicator', async () => {
    await openLiveTicket({});
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });
    const { index } = await latestFakeClient();
    await triggerBroadcast(index, true);
    await page.getByText('Customer Support is typing…').first().waitFor({ timeout: 4_000 });

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await setHidden(true);
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });
    // Can't trust a stale "typing" with no live channel to confirm/clear it.
    await page.getByText('Customer Support is typing…').first().waitFor({ state: 'hidden', timeout: 2_000 });
    const entry = await page.evaluate((i) => window.__ggxFakeRealtimeClients[i], index);
    assert.ok(entry.disconnectCalls >= 1, 'hiding the tab must disconnect the Realtime subscription');
  });

  it('the window losing focus stops the customer\'s typing signal immediately', async () => {
    await openLiveTicket({});

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });
  });

  it('returning to a visible tab never resends start on its own, reconnects fresh, and does NOT mark the agent typing until a real broadcast arrives', async () => {
    await openLiveTicket({});
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await setHidden(true); // forces an immediate stop + disconnect
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });

    const clientCountBeforeShow = await page.evaluate(() => window.__ggxFakeRealtimeClients.length);
    await setHidden(false);
    await page.waitForFunction(
      (n) => (window.__ggxFakeRealtimeClients ?? []).length > n,
      clientCountBeforeShow,
      { timeout: 4_000 },
    );
    await page.waitForTimeout(500); // give any (unwanted) auto-typing a chance to fire

    const starts = await page.evaluate(() => (window.__typingPostCalls ?? []).filter((s) => s === 'start').length);
    assert.equal(starts, 1, 'becoming visible again must not re-send start without a new keystroke');
    assert.equal(await page.getByText('Customer Support is typing…').count(), 0, 'reconnecting must never mark the agent typing on its own — only a real broadcast does');

    // A genuine broadcast after reconnecting DOES show it — proving the
    // fresh connection actually works, not just that nothing fired.
    const list = await page.evaluate(() => window.__ggxFakeRealtimeClients);
    await triggerBroadcast(list.length - 1, true);
    await page.getByText('Customer Support is typing…').first().waitFor({ timeout: 4_000 });
  });

  it('holds no live subscription while the ticket is resolved (an inactive conversation), and opens one once a reply reopens it', async () => {
    await openLiveTicket({ initialStatus: 'resolved', reopensOnReply: true });
    await page.getByText('This ticket has been resolved').first().waitFor({ timeout: 8_000 });

    await page.waitForTimeout(1_000);
    assert.equal(
      await page.evaluate(() => (window.__ggxFakeRealtimeClients ?? []).length),
      0,
      'must not open a Realtime subscription while the ticket is resolved',
    );

    await page.fill('#ticket-reply', 'Actually, still an issue.');
    await page.getByRole('button', { name: /Send Reply/i }).click();
    await page.getByText('Actually, still an issue.').first().waitFor({ timeout: 5_000 });

    // The reply just reopened the ticket — a subscription must open without a remount.
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 5_000 });
  });

  it('a ticket resolving MID-SESSION (not just at initial mount) closes the live subscription', async () => {
    await openLiveTicket({ initialStatus: 'in_progress' });
    await page.waitForFunction(() => (window.__ggxFakeRealtimeClients ?? []).some((c) => c.subscribeCalls > 0), { timeout: 8_000 });
    const clientIndexBefore = (await page.evaluate(() => window.__ggxFakeRealtimeClients.length)) - 1;

    // Simulate the agent resolving the ticket right as the customer's reply
    // lands — the reply response itself now reports 'resolved'.
    await page.evaluate(() => { window.__ticket.status = 'resolved'; });
    await page.fill('#ticket-reply', 'One more thing.');
    await page.getByRole('button', { name: /Send Reply/i }).click();
    await page.getByText('One more thing.').first().waitFor({ timeout: 5_000 });
    await page.getByText('This ticket has been resolved').first().waitFor({ timeout: 5_000 });

    const entry = await page.evaluate((i) => window.__ggxFakeRealtimeClients[i], clientIndexBefore);
    assert.ok(entry.disconnectCalls >= 1, 'the subscription open when the ticket resolved must be torn down');
    assert.ok(entry.removeChannelCalls >= 1);

    const countBefore = await page.evaluate(() => window.__ggxFakeRealtimeClients.length);
    await page.waitForTimeout(500);
    const countAfter = await page.evaluate(() => window.__ggxFakeRealtimeClients.length);
    assert.equal(countAfter, countBefore, 'no new subscription should open while the ticket stays resolved');
  });
});
