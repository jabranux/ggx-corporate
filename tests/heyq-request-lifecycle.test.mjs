/**
 * Regression coverage for the support-ticket request lifecycle fix:
 *   • RootLayout's topbar search no longer eagerly fetches /api/support/tickets
 *     on every route change — it lazy-loads once, on the first qualifying
 *     search query, and reuses that result for the rest of the session.
 *   • Support Tickets' ~15s list poll gets single-flight protection, pauses
 *     while the tab is hidden, refreshes once when it becomes visible again,
 *     and cleans up on unmount.
 *   • useTicketConversation's ADAPTIVE 15s detail poll (previously a fixed 5s
 *     interval — see the "ticket-detail adaptive polling" task) seeds from the
 *     page's own initial getTicketById read (no immediate duplicate GET on
 *     mount), polls starting at the first 15s tick on a request-completes →
 *     wait-15s → next-poll schedule (never a fixed interval, so a slow
 *     request can't stack a second one behind it), pauses while hidden or
 *     while the ticket's status is terminal (resolved/closed), refreshes once
 *     on visibility restore, and still performs the post-reply confirmation
 *     GET — which also re-arms the 15s cadence from that moment.
 *
 * None of this changes QuadX Bridge/BFF contracts or UUID routing/API
 * semantics — only when a request is (or isn't) allowed to fire, and (for the
 * detail poll specifically) the cadence itself: 5s → 15s, now adaptive.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn, addHeyQApiStubScript } from './helpers.mjs';

const PORT = 5196;

const TICKET_UUID = 'b2c3d4e5-f607-4a89-9abc-def012345678';
const TICKET_REFERENCE = 'HQS-2026-0002-4200';

const RESOLVED_TICKET_UUID = 'c3d4e5f6-0718-4a89-9abc-def012345679';
const RESOLVED_TICKET_REFERENCE = 'HQS-2026-0003-4300';

const TICKETS = [
  {
    id: TICKET_UUID,
    reference: TICKET_REFERENCE,
    subject: 'Delivery delayed past the promised window',
    concernType: 'delivery_delay',
    issueType: 'Delivery delay',
    status: 'open',
    priority: 'normal',
    supportTeam: 'Customer Support',
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-21T09:00:00Z',
    openedBySupport: false,
    canReopen: false,
    messages: [
      { id: 'm1', from: 'you', authorLabel: 'You', body: 'Still no update on this.', createdAt: '2026-08-20T09:00:00Z' },
    ],
  },
  {
    id: RESOLVED_TICKET_UUID,
    reference: RESOLVED_TICKET_REFERENCE,
    subject: 'Missing parcel — since resolved',
    concernType: 'missing_parcel',
    issueType: 'Missing parcel',
    status: 'resolved',
    priority: 'normal',
    supportTeam: 'Customer Support',
    createdAt: '2026-08-18T09:00:00Z',
    updatedAt: '2026-08-19T09:00:00Z',
    openedBySupport: false,
    canReopen: true,
    messages: [
      { id: 'm2', from: 'support', authorLabel: 'Customer Support', body: 'Found and delivered — closing this out.', createdAt: '2026-08-19T09:00:00Z' },
    ],
  },
];

let server;

/**
 * A fresh signed-in session with the ticket stub installed AND a request
 * recorder layered on top: `window.__calls` logs every GET to the ticket
 * list/detail endpoints (method, path, timestamp), and `window.__listDelayMs`
 * lets a test artificially delay the list endpoint's response to exercise
 * single-flight protection.
 */
async function newSession() {
  const session = await signIn(server.base, 'admin');
  await addHeyQApiStubScript(session.page, TICKETS);
  await session.page.addInitScript(() => {
    window.__calls = [];
    window.__listDelayMs = 0;
    window.__detailDelayMs = 0;
    const stubbed = window.fetch;
    window.fetch = async (url, init) => {
      const u = String(url);
      const path = new URL(u, 'http://x').pathname;
      const method = (init?.method ?? 'GET').toUpperCase();
      const isList = method === 'GET' && path.endsWith('/api/support/tickets');
      const isDetail = method === 'GET' && /\/api\/support\/tickets\/[^/]+$/.test(path);
      if (isList || isDetail) {
        window.__calls.push({ path, method, t: Date.now() });
        if (isList && window.__listDelayMs > 0) {
          await new Promise((r) => setTimeout(r, window.__listDelayMs));
        }
        if (isDetail && window.__detailDelayMs > 0) {
          await new Promise((r) => setTimeout(r, window.__detailDelayMs));
        }
      }
      return stubbed(url, init);
    };
  });
  await session.page.reload({ waitUntil: 'networkidle' });
  return session;
}

const calls = (page) => page.evaluate(() => window.__calls ?? []);
const listCalls = (all) => all.filter((c) => c.method === 'GET' && c.path.endsWith('/api/support/tickets'));
const detailCallsFor = (all, id) => all.filter((c) => c.method === 'GET' && c.path.endsWith(`/api/support/tickets/${id}`));

/** Simulate the Page Visibility API without actually backgrounding the OS window. */
async function setHidden(page, hidden) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  server = await startDevServer(PORT);
});

after(() => {
  stopDevServer(server);
});

describe('Topbar ticket search — lazy load, no eager per-navigation fetch', () => {
  it('an unrelated dashboard page makes zero /api/support/tickets calls', async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/transactions`, { waitUntil: 'networkidle' });
      await page.getByText('Transactions', { exact: true }).first().waitFor({ timeout: 10_000 });
      assert.equal(listCalls(await calls(page)).length, 0, 'an unrelated page must not call the ticket list endpoint');
    } finally {
      await browser.close();
    }
  });

  it('loads tickets lazily on the first qualifying search query, and does not refetch on route change', async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/transactions`, { waitUntil: 'networkidle' });
      assert.equal(listCalls(await calls(page)).length, 0, 'no ticket call before the user searches');

      const search = page.getByPlaceholder(/search tracking numbers, orders/i);
      await search.fill('4200'); // qualifying (>=2 char) query, matches the fixture's reference
      await page.getByRole('button', { name: new RegExp(TICKET_REFERENCE) }).waitFor({ state: 'visible', timeout: 10_000 });
      assert.equal(listCalls(await calls(page)).length, 1, 'exactly one lazy list request on first qualifying query');

      // Client-side navigation (react-router Link, not a full reload) to another page.
      await page.getByRole('link', { name: 'Transactions', exact: true }).first().click();
      await page.waitForURL('**/dashboard/transactions', { timeout: 10_000 });
      await page.waitForTimeout(300);
      assert.equal(listCalls(await calls(page)).length, 1, 'navigating around must reuse the already-loaded ticket list, not refetch it');
    } finally {
      await browser.close();
    }
  });

  it('clearing the query and navigating away mid-request does not strand the lazy load in "loading" forever', async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/transactions`, { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.__listDelayMs = 3000; });

      const search = page.getByPlaceholder(/search tracking numbers, orders/i);
      await search.fill('42'); // qualifying query starts the lazy load (delayed response)
      await page.waitForTimeout(200);
      assert.equal(listCalls(await calls(page)).length, 1, 'the lazy load started');

      // Clear the query, then navigate — both clear topbarQuery/topbarOpen
      // while the delayed request is still in flight.
      await search.fill('');
      await page.getByRole('link', { name: 'Transactions', exact: true }).first().click();
      await page.waitForURL('**/dashboard/transactions', { timeout: 10_000 });

      await page.waitForTimeout(3500); // let the delayed response resolve

      // Re-query: if the loader had gotten stuck in 'loading' (the bug), this
      // would never surface a result and would never issue a second request
      // either (blocked by the stuck state) — the dropdown would show "No
      // results" forever.
      const search2 = page.getByPlaceholder(/search tracking numbers, orders/i);
      await search2.fill('4200');
      await page.getByRole('button', { name: new RegExp(TICKET_REFERENCE) }).waitFor({ state: 'visible', timeout: 10_000 });
      assert.equal(listCalls(await calls(page)).length, 1, 'the original delayed request completed and populated the cache — no second fetch was needed');
    } finally {
      await browser.close();
    }
  });
});

describe('Support Tickets — list refresh lifecycle', () => {
  it('the initial page load makes exactly one list request', async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
      await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
      assert.equal(listCalls(await calls(page)).length, 1);
    } finally {
      await browser.close();
    }
  });

  it('concurrent refresh triggers do not overlap (single-flight)', async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
      await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
      assert.equal(listCalls(await calls(page)).length, 1, 'baseline: one call from the initial load');

      // Slow the list endpoint down, then fire two refresh triggers back-to-back.
      await page.evaluate(() => { window.__listDelayMs = 4000; });
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
      await page.waitForTimeout(200);
      assert.equal(listCalls(await calls(page)).length, 2, 'the second, overlapping trigger must be skipped by single-flight protection');

      await page.waitForTimeout(4500); // let the delayed response resolve
      assert.equal(listCalls(await calls(page)).length, 2, 'still just the one deduped refresh — no request queued up behind it');
    } finally {
      await browser.close();
    }
  });

  it('does not poll while the tab is hidden, and refreshes exactly once when it becomes visible again', { timeout: 30_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
      await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
      assert.equal(listCalls(await calls(page)).length, 1);

      await setHidden(page, true);
      await wait(16_000); // longer than the 15s poll interval
      assert.equal(listCalls(await calls(page)).length, 1, 'a hidden tab must not poll, even past a full interval');

      await setHidden(page, false);
      await page.waitForTimeout(400);
      assert.equal(listCalls(await calls(page)).length, 2, 'becoming visible again triggers exactly one refresh');

      await page.waitForTimeout(600);
      assert.equal(listCalls(await calls(page)).length, 2, 'no duplicate refresh follows the visibility-restore one');
    } finally {
      await browser.close();
    }
  });

  it('unmounting the page (client-side navigation away) stops further polling', { timeout: 30_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
      await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
      assert.equal(listCalls(await calls(page)).length, 1);

      await page.getByRole('link', { name: 'Transactions', exact: true }).first().click();
      await page.waitForURL('**/dashboard/transactions', { timeout: 10_000 });

      await wait(16_000); // past what would have been the next 15s poll tick
      assert.equal(listCalls(await calls(page)).length, 1, 'no further list requests after the list page unmounted');
    } finally {
      await browser.close();
    }
  });
});

describe('Ticket detail — adaptive polling lifecycle', () => {
  it('seeds from the page’s initial GET with no immediate duplicate, then polls starting at the first 15s tick', { timeout: 60_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_UUID}`, { waitUntil: 'networkidle' });
      await page.getByText(`Ticket ${TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500); // let any in-flight duplicate mount-effect load settle before baselining

      const detailNow = async () => detailCallsFor(await calls(page), TICKET_UUID);

      // Baseline = however many GETs the PAGE's own initial getTicketById load
      // produced (in this dev-server/StrictMode test environment, React
      // intentionally double-invokes the page's mount effect, so this is a
      // pre-existing, unrelated artifact — not something this task touches).
      // What this task changed is asserted relative to that baseline below:
      // the HOOK must add no immediate GET of its own, then exactly one per tick.
      const baseline = (await detailNow()).length;
      assert.ok(baseline >= 1, 'the page performs its own initial getTicketById read');

      await page.waitForTimeout(5_000); // comfortably inside the first 15s window
      assert.equal((await detailNow()).length, baseline, 'the hook must add no immediate duplicate GET on mount');

      await page.waitForTimeout(11_000); // total ~16s from baseline — past the first 15s tick, well short of the second
      assert.equal((await detailNow()).length, baseline + 1, 'exactly one poll fired at the first 15s tick');

      await page.waitForTimeout(16_000); // total ~32s from baseline — past the second tick, well short of the third
      assert.equal((await detailNow()).length, baseline + 2, 'exactly one poller — a second consecutive tick adds exactly one more request, not two');

      // UUID routing/API semantics unchanged: every detail request used the id, never the reference.
      const all = await calls(page);
      assert.ok(all.every((c) => !c.path.includes(TICKET_REFERENCE)), 'no request may be keyed by the human-readable reference');
    } finally {
      await browser.close();
    }
  });

  it('is single-flight: a slow request suppresses the next tick instead of stacking behind it', { timeout: 90_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_UUID}`, { waitUntil: 'networkidle' });
      await page.getByText(`Ticket ${TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500);
      const detailNow = async () => (await calls(page)).filter((c) => c.method === 'GET' && c.path.endsWith(`/api/support/tickets/${TICKET_UUID}`));
      const baseline = (await detailNow()).length;

      // Make every subsequent detail GET take 20s to resolve — longer than the 15s cadence.
      await page.evaluate(() => { window.__detailDelayMs = 20_000; });

      await page.waitForTimeout(16_000); // past the first 15s tick — the slow request has now started
      assert.equal((await detailNow()).length, baseline + 1, 'the first tick fired and is now in flight (delayed)');

      await page.waitForTimeout(15_000); // total ~31s — a naive fixed interval would have fired again by now
      assert.equal((await detailNow()).length, baseline + 1, 'no second request may start while the first is still in flight, even past a full interval');

      await page.waitForTimeout(6_000); // total ~37s — the delayed 20s response has now resolved (~36s)
      assert.equal((await detailNow()).length, baseline + 1, 'the response just resolved; the next tick is scheduled 15s from now, not immediately');

      await page.waitForTimeout(16_000); // total ~53s — past the post-completion 15s wait
      assert.equal((await detailNow()).length, baseline + 2, 'the next poll fires 15s after the slow one completed');
    } finally {
      await browser.close();
    }
  });

  it('pauses while hidden and refreshes exactly once when visibility returns', { timeout: 60_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_UUID}`, { waitUntil: 'networkidle' });
      await page.getByText(`Ticket ${TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500); // let any in-flight duplicate mount-effect load settle before baselining
      const baseline = detailCallsFor(await calls(page), TICKET_UUID).length;

      await setHidden(page, true);
      await wait(16_000); // past the first 15s tick
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, baseline, 'a hidden tab must not poll the detail endpoint either');

      await setHidden(page, false);
      await page.waitForTimeout(400);
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, baseline + 1, 'becoming visible again triggers exactly one refresh');

      // The cadence resumes 15s from the visibility-restore refresh, not from
      // whatever was left of the original (paused) interval.
      await page.waitForTimeout(11_000); // total ~11.4s since the refresh — still short of 15s
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, baseline + 1, 'no further poll before 15s have passed since the visibility refresh');

      await page.waitForTimeout(5_000); // total ~16.4s since the refresh — past 15s
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, baseline + 2, 'normal 15s cadence resumed from the visibility refresh');
    } finally {
      await browser.close();
    }
  });

  it('navigating away from the ticket stops future polling', { timeout: 45_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_UUID}`, { waitUntil: 'networkidle' });
      await page.getByText(`Ticket ${TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500); // let any in-flight duplicate mount-effect load settle before baselining
      const baseline = detailCallsFor(await calls(page), TICKET_UUID).length;

      await page.getByRole('button', { name: /back to support tickets/i }).click();
      await page.waitForURL('**/dashboard/support-tickets', { timeout: 10_000 });

      await wait(16_000); // past what would have been the next 15s tick
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, baseline, 'no further detail requests after navigating away');
    } finally {
      await browser.close();
    }
  });

  it('the post-reply confirmation GET still fires, and re-arms the 15s cadence from that moment', { timeout: 45_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_UUID}`, { waitUntil: 'networkidle' });
      await page.getByText(`Ticket ${TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500); // let any in-flight duplicate mount-effect load settle before baselining
      const before = detailCallsFor(await calls(page), TICKET_UUID).length;

      await page.locator('#ticket-reply').fill('Any update on this?');
      await page.getByRole('button', { name: /send reply/i }).click();
      await page.getByText('Any update on this?').waitFor({ timeout: 10_000 });

      const after = detailCallsFor(await calls(page), TICKET_UUID).length;
      assert.equal(after, before + 1, 'the reply flow’s intentional re-read GET must still happen');

      await page.waitForTimeout(11_000); // total ~11s since the reply — still short of 15s
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, after, 'no poll before 15s have passed since the reply’s confirmation GET');

      await page.waitForTimeout(5_500); // total ~16.5s since the reply — past 15s
      assert.equal(detailCallsFor(await calls(page), TICKET_UUID).length, after + 1, 'normal 15s cadence resumed from the reply’s confirmation GET');
    } finally {
      await browser.close();
    }
  });

  it('a resolved ticket does not continuously poll', { timeout: 60_000 }, async () => {
    const { browser, page } = await newSession();
    try {
      await page.goto(`${server.base}/dashboard/support-tickets/${RESOLVED_TICKET_UUID}`, { waitUntil: 'networkidle' });
      await page.getByText(`Ticket ${RESOLVED_TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });
      await page.getByText('This ticket has been resolved').waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500);
      const baseline = detailCallsFor(await calls(page), RESOLVED_TICKET_UUID).length;

      await wait(32_000); // past what would have been two 15s ticks on an active ticket
      assert.equal(detailCallsFor(await calls(page), RESOLVED_TICKET_UUID).length, baseline, 'a resolved ticket must not keep polling');
    } finally {
      await browser.close();
    }
  });
});
