/**
 * Live typing indicator — the GGX Corporate half (see `useTicketConversation.ts`'s
 * module docblock and `src/app/lib/typingPresence.ts`).
 *
 * Two layers, matching the rest of this suite's style:
 *
 *   • pure logic  — `lib/typingPresence.ts`'s two state machines, exercised
 *                   directly (via a dynamic import of the Vite-served module)
 *                   with an injected fake clock so throttle/debounce/stale-
 *                   expiry timing is asserted deterministically, with no real
 *                   waits.
 *   • detail UI   — the ACTUAL wired-up behavior against a fetch-stubbed
 *                   `/api/support/tickets/:id/typing` route: the dedicated
 *                   typing poll drives the "Customer Support is typing…"
 *                   bubble, a reply always clears the customer's own typing
 *                   signal, a failing typing transport never blocks a real
 *                   reply, and leaving the ticket stops the poll. Real (short)
 *                   timers here, same as the rest of the suite's DOM checks.
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

// ── Detail UI: the ACTUAL wired-up behavior against a stubbed typing route ───

describe('the ticket detail page (typing wired end-to-end)', () => {
  const TICKET_ID = 'tkt-typing-1';

  /** Installs a Corporate-support-proxy stub covering ticket reads, replies,
   * AND the typing route, then opens the ticket. `opts.typingGetSequence` is
   * consumed one response per GET poll (repeats the last entry once
   * exhausted); `opts.typingPostFails` makes every typing POST fail (500),
   * to exercise "a failing typing transport must never block a real reply". */
  async function openLiveTicket(opts = {}) {
    await page.addInitScript(({ ticketId, typingGetSequence, typingPostFails, initialStatus, reopensOnReply }) => {
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
      window.__typingGetCalls = [];
      window.__typingPostCalls = [];
      let typingGetIndex = 0;

      const origFetch = window.fetch.bind(window);
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (url, init) => {
        const u = String(url);
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = new URL(u, 'http://x').pathname;

        if (/\/api\/support\/tickets\/[^/]+\/typing$/.test(path)) {
          if (method === 'POST') {
            const body = init?.body ? JSON.parse(init.body) : {};
            window.__typingPostCalls.push(body.state);
            if (typingPostFails) return json({ error: 'Bridge unreachable' }, 502);
            return json({ ok: true });
          }
          // GET — the dedicated typing-presence poll.
          window.__typingGetCalls.push(Date.now());
          const seq = typingGetSequence && typingGetSequence.length ? typingGetSequence : [false];
          const value = seq[Math.min(typingGetIndex, seq.length - 1)];
          typingGetIndex += 1;
          return json({ typing: value });
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
          if (m) return json(window.__ticket);
          return json([window.__ticket]);
        }
        return origFetch(url, init);
      };
    }, {
      ticketId: TICKET_ID, typingGetSequence: opts.typingGetSequence, typingPostFails: !!opts.typingPostFails,
      initialStatus: opts.initialStatus, reopensOnReply: !!opts.reopensOnReply,
    });

    await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
    await page.getByText('Where is my parcel?').first().waitFor({ timeout: 15000 });
  }

  it('shows the agent typing indicator from the dedicated poll, and clears it when Bridge reports stopped', async () => {
    // First poll tick: typing. Second and after: stopped.
    await openLiveTicket({ typingGetSequence: [true, false] });

    await page.getByText('Customer Support is typing…').first().waitFor({ timeout: 8_000 });
    await page.getByText('Customer Support is typing…').first().waitFor({ state: 'hidden', timeout: 8_000 });
  });

  it('a failing typing transport never blocks a real reply, and sending always clears the customer\'s own typing signal', async () => {
    await openLiveTicket({ typingPostFails: true });

    await page.fill('#ticket-reply', 'Thanks, standing by.');
    // Give the throttled emitter a moment to fire its (failing) 'start' POST.
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await page.getByRole('button', { name: /Send Reply/i }).click();
    // The reply must still succeed even though every typing POST 502s.
    await page.getByText('Thanks, standing by.').first().waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('Not sent.').count(), 0, 'a typing-transport failure must not surface as a send failure');

    const calls = await page.evaluate(() => window.__typingPostCalls ?? []);
    assert.ok(calls.includes('stop'), 'sending a reply must emit a typing stop, even though it will also fail');
  });

  it('leaving the ticket stops the dedicated typing poll (no lingering requests after unmount)', async () => {
    await openLiveTicket({ typingGetSequence: [false] });

    await page.waitForFunction(() => (window.__typingGetCalls ?? []).length >= 1, { timeout: 5_000 });
    await page.getByRole('button', { name: /Back to Support Tickets/i }).click();
    await page.waitForURL('**/dashboard/support-tickets', { timeout: 10_000 });

    const countAtNavigation = await page.evaluate(() => (window.__typingGetCalls ?? []).length);
    await page.waitForTimeout(4_000); // longer than the 3s typing-poll interval
    const countAfterWaiting = await page.evaluate(() => (window.__typingGetCalls ?? []).length);
    assert.equal(countAfterWaiting, countAtNavigation, 'the typing poll must not keep firing after the conversation unmounts');
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
    // Well short of the 10s inactivity debounce — this must be immediate.
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });
  });

  it('the tab going hidden stops the customer\'s typing signal immediately', async () => {
    await openLiveTicket({});

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await setHidden(true);
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });
  });

  it('the window losing focus stops the customer\'s typing signal immediately', async () => {
    await openLiveTicket({});

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });
  });

  it('returning to a visible tab never resends start on its own — only an actual keystroke does', async () => {
    await openLiveTicket({});

    await page.fill('#ticket-reply', 'Still there?');
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('start'), { timeout: 5_000 });

    await setHidden(true); // forces an immediate stop
    await page.waitForFunction(() => (window.__typingPostCalls ?? []).includes('stop'), { timeout: 2_000 });

    await setHidden(false);
    await page.waitForTimeout(500); // give any (unwanted) auto-resend a chance to fire

    const starts = await page.evaluate(() => (window.__typingPostCalls ?? []).filter((s) => s === 'start').length);
    assert.equal(starts, 1, 'becoming visible again must not re-send start without a new keystroke');
  });

  it('pauses the agent-typing poll while the ticket is resolved (an inactive conversation), and resumes it once a reply reopens it', async () => {
    await openLiveTicket({ initialStatus: 'resolved', reopensOnReply: true, typingGetSequence: [false] });
    await page.getByText('This ticket has been resolved').first().waitFor({ timeout: 8_000 });

    await page.waitForTimeout(4_000); // longer than the 3s typing-poll interval
    assert.equal(
      await page.evaluate(() => (window.__typingGetCalls ?? []).length),
      0,
      'must not poll agent typing while the ticket is resolved',
    );

    await page.fill('#ticket-reply', 'Actually, still an issue.');
    await page.getByRole('button', { name: /Send Reply/i }).click();
    await page.getByText('Actually, still an issue.').first().waitFor({ timeout: 5_000 });

    // The reply just reopened the ticket — the typing poll must resume without a remount.
    await page.waitForFunction(() => (window.__typingGetCalls ?? []).length >= 1, { timeout: 5_000 });
  });
});
