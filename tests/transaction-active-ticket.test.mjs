/**
 * Regression coverage for the Transaction Details active-ticket indicator:
 * the "Report an issue" / "Contact support" CTAs on a transaction now check
 * for an existing active support ticket linked to that tracking number and,
 * when one exists, swap to a "View Ticket(s)" + "Create New Ticket" pair
 * instead of silently letting the user re-report the same thing blind.
 *
 * Active-ticket detection is batched: ONE `listMyTickets()` fetch
 * (`getActiveTicketsByTrackingNumber` in ticketsService.ts) serves both CTAs
 * on the page (the On-Demand card's "Contact support" button and the general
 * "Need Help?" card) — never a per-CTA or per-transaction request.
 *
 * `GGX-2026-90021` is an On-Demand ('instant' service) transaction in the
 * sample OMS data (src/app/data/omsOrders.ts) — chosen specifically because
 * its detail page renders BOTH support CTAs at once, the real N+1 risk point.
 * `GGX-2026-90018` is a plain Same-Day transaction (general card only), used
 * for the simpler single/multiple/closed-only scenarios.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn, CONCERN_CATEGORIES_FIXTURE } from './helpers.mjs';

const PORT = 5199;

let server;
before(async () => { server = await startDevServer(PORT); });
after(() => { stopDevServer(server); });

/** Stub the Corporate support proxy (list + detail reads, ticket create) and
 * record every GET to the list endpoint (no :id) on `window.__ticketListCalls`
 * so tests can assert exactly one batched fetch, not one per CTA/transaction. */
async function stubTickets(page, tickets) {
  await page.addInitScript((ticketsArg) => {
    window.__ticketListCalls = [];
    const orig = window.fetch.bind(window);
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (url, init) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(u, 'http://x').pathname;

      if (method === 'GET' && path.endsWith('/api/support/tickets')) {
        window.__ticketListCalls.push(u);
        return json(ticketsArg);
      }
      if (u.includes('/api/support/tickets')) {
        const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
        if (m) {
          const id = decodeURIComponent(m[1]);
          const t = ticketsArg.find((x) => x.id === id || x.reference === id);
          return json(t ?? { error: 'Ticket not found' }, t ? 200 : 404);
        }
      }
      return orig(url, init);
    };
  }, tickets);
}

/** Same as `stubTickets`, plus a working POST /api/support/tickets create that
 * PERSISTS the new ticket into subsequent list/detail reads (unlike the shared
 * `addHeyQApiStubScript` helper, which returns a one-off create response but
 * never appends it to its own fixture array) — needed to test that a freshly
 * created ticket reads back as active without a page reload. */
async function stubTicketsWithPersistedCreate(page, initialTickets, categories = CONCERN_CATEGORIES_FIXTURE) {
  await page.addInitScript(({ initialTickets, categories }) => {
    window.__ticketListCalls = [];
    window.__ticketsState = initialTickets.slice();
    const orig = window.fetch.bind(window);
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (url, init) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(u, 'http://x').pathname;

      if (method === 'GET' && path.endsWith('/api/support/categories')) {
        return json(categories);
      }
      if (method === 'POST' && path.endsWith('/api/support/tickets')) {
        let body = {};
        try { body = init?.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
        const now = new Date().toISOString();
        const created = {
          id: `tkt-created-${window.__ticketsState.length + 1}`, reference: `HQ-CREATED-${window.__ticketsState.length + 1}`,
          subject: body.subject, concernType: 'general_inquiry', issueType: 'Reported issue', status: 'open',
          priority: 'normal', supportTeam: 'Customer Support', createdAt: now, updatedAt: now, canReopen: false,
          linkedOrder: body.linkedTransactions?.[0], linkedTransactions: body.linkedTransactions,
          messages: [{ id: 'm1', from: 'you', authorLabel: 'You', body: body.description, createdAt: now }],
        };
        window.__ticketsState.push(created);
        return json(created);
      }
      if (method === 'GET' && path.endsWith('/api/support/tickets')) {
        window.__ticketListCalls.push(u);
        return json(window.__ticketsState);
      }
      if (u.includes('/api/support/tickets')) {
        const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
        if (m) {
          const id = decodeURIComponent(m[1]);
          const t = window.__ticketsState.find((x) => x.id === id || x.reference === id);
          return json(t ?? { error: 'Ticket not found' }, t ? 200 : 404);
        }
      }
      return orig(url, init);
    };
  }, { initialTickets, categories });
}

const HOUR_MS = 60 * 60 * 1000;

function ticket(overrides) {
  return {
    id: 'tkt-1', reference: 'HQ-1001', subject: 'Delivery delayed',
    concernType: 'delivery_delay', issueType: 'Delivery delay', status: 'in_progress',
    priority: 'normal', supportTeam: 'Customer Support',
    createdAt: '2026-08-20T09:00:00Z', updatedAt: '2026-08-21T09:00:00Z',
    canReopen: false,
    messages: [{ id: 'm1', from: 'you', authorLabel: 'You', body: 'Where is my parcel?', createdAt: '2026-08-20T09:00:00Z' }],
    ...overrides,
  };
}

describe('Transaction Details — active support ticket indicator', () => {
  it('no linked ticket: normal Report an issue / Contact support CTAs, unchanged', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTickets(page, []);
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90018`, { waitUntil: 'networkidle' });

      await page.getByText('Need Help?').waitFor({ timeout: 10_000 });
      assert.equal(await page.getByRole('button', { name: /^report an issue$/i }).count(), 1);
      assert.equal(await page.getByText(/active support ticket/i).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^view ticket/i }).count(), 0);
    } finally {
      await browser.close();
    }
  });

  it('only permanently closed tickets: treated as no active ticket', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTickets(page, [
        ticket({
          id: 'tkt-closed', reference: 'HQ-1002', status: 'closed',
          linkedOrder: { externalOrderId: 'GGX-2026-90018', trackingNumber: 'GGX-2026-90018', capturedAt: '2026-08-20T09:00:00Z' },
        }),
        ticket({
          id: 'tkt-expired', reference: 'HQ-1003', status: 'resolved', canReopen: false,
          resolvedAt: new Date(Date.now() - 25 * HOUR_MS).toISOString(),
          linkedOrder: { externalOrderId: 'GGX-2026-90018', trackingNumber: 'GGX-2026-90018', capturedAt: '2026-08-20T09:00:00Z' },
        }),
      ]);
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90018`, { waitUntil: 'networkidle' });

      await page.getByText('Need Help?').waitFor({ timeout: 10_000 });
      assert.equal(await page.getByRole('button', { name: /^report an issue$/i }).count(), 1);
      assert.equal(await page.getByText(/active/i).count(), 0, 'permanently closed tickets must not read as active');
    } finally {
      await browser.close();
    }
  });

  it('one active ticket: shows reference + status and swaps to View Ticket / Create New Ticket', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTickets(page, [
        ticket({
          id: 'tkt-active-1', reference: 'GGX-12345', status: 'in_progress',
          linkedOrder: { externalOrderId: 'GGX-2026-90018', trackingNumber: 'GGX-2026-90018', capturedAt: '2026-08-20T09:00:00Z' },
        }),
      ]);
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90018`, { waitUntil: 'networkidle' });

      await page.getByText('Active support ticket').waitFor({ timeout: 10_000 });
      await page.getByText('GGX-12345').waitFor();
      await page.getByText('In Progress').first().waitFor();
      assert.equal(await page.getByRole('button', { name: /^report an issue$/i }).count(), 0, 'the single CTA must be replaced, not duplicated');
      assert.equal(await page.getByRole('button', { name: /^view ticket$/i }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /^create new ticket$/i }).count(), 1);

      await page.getByRole('button', { name: /^view ticket$/i }).click();
      await page.waitForURL('**/dashboard/support-tickets/tkt-active-1', { timeout: 10_000 });
    } finally {
      await browser.close();
    }
  });

  it('multiple active tickets: shows a count and View Tickets deep-links into the filtered list', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTickets(page, [
        ticket({ id: 'tkt-multi-1', reference: 'HQ-2001', status: 'open', linkedOrder: { externalOrderId: 'GGX-2026-90018', trackingNumber: 'GGX-2026-90018', capturedAt: '2026-08-20T09:00:00Z' } }),
        ticket({ id: 'tkt-multi-2', reference: 'HQ-2002', status: 'on_hold', linkedOrder: { externalOrderId: 'GGX-2026-90018', trackingNumber: 'GGX-2026-90018', capturedAt: '2026-08-20T09:00:00Z' } }),
      ]);
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90018`, { waitUntil: 'networkidle' });

      await page.getByText('2 active tickets for this transaction').waitFor({ timeout: 10_000 });
      assert.equal(await page.getByRole('button', { name: /^view tickets$/i }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /^view ticket$/i, exact: true }).count(), 0);

      await page.getByRole('button', { name: /^view tickets$/i }).click();
      await page.waitForURL('**/dashboard/support-tickets?search=**', { timeout: 10_000 });
      await page.locator('input[placeholder*="Search by ticket"]').first().waitFor();
      assert.equal(await page.locator('input[placeholder*="Search by ticket"]').first().inputValue(), 'GGX-2026-90018');
    } finally {
      await browser.close();
    }
  });

  it('Create New Ticket still opens the report drawer, preselected with this transaction', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTickets(page, [
        ticket({
          id: 'tkt-active-2', reference: 'GGX-55555', status: 'new',
          linkedOrder: { externalOrderId: 'GGX-2026-90018', trackingNumber: 'GGX-2026-90018', capturedAt: '2026-08-20T09:00:00Z' },
        }),
      ]);
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90018`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /^create new ticket$/i }).waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: /^create new ticket$/i }).click();

      await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ timeout: 10_000 });
      // Preselected with the current transaction (same drawer contract TransactionDetails always used).
      await page.getByText('GGX-2026-90018').first().waitFor();
    } finally {
      await browser.close();
    }
  });

  it('after creating a ticket without leaving the page, the active-ticket state appears immediately (no stale pre-submit state)', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTicketsWithPersistedCreate(page, []); // no tickets yet
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90018`, { waitUntil: 'networkidle' });

      await page.getByRole('button', { name: /^report an issue$/i }).click();
      await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#report-category').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#report-description').fill('Need help with this delivery.');
      await page.getByRole('button', { name: /submit report/i }).click();
      await page.getByText(/report submitted/i).waitFor({ state: 'visible', timeout: 10_000 });
      // Stay on this page (Done, not Open ticket).
      await page.getByRole('button', { name: /^done$/i }).click();

      await page.getByText('Active support ticket').waitFor({ timeout: 10_000 });
      assert.equal(await page.getByRole('button', { name: /^view ticket$/i }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /^report an issue$/i }).count(), 0, 'the stale pre-submit CTA must not remain');
    } finally {
      await browser.close();
    }
  });

  it('does not introduce an N+1 request pattern: one batched ticket-list fetch serves both support CTAs on an On-Demand transaction page', async () => {
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await stubTickets(page, [
        ticket({
          id: 'tkt-od-1', reference: 'HQ-3001', status: 'in_progress',
          linkedOrder: { externalOrderId: 'GGX-2026-90021', trackingNumber: 'GGX-2026-90021', capturedAt: '2026-08-20T09:00:00Z' },
        }),
      ]);
      // GGX-2026-90021 is On-Demand — renders both the On-Demand card's
      // support button AND the general "Need Help?" card on one page load.
      await page.goto(`${server.base}/dashboard/transactions/GGX-2026-90021`, { waitUntil: 'networkidle' });

      await page.getByText('Active support ticket').waitFor({ timeout: 10_000 });
      // Both CTAs reflect the active-ticket state...
      assert.equal(await page.getByRole('button', { name: /^view ticket$/i }).count(), 2, 'both the On-Demand button and the Need Help card switch to View Ticket');
      // ...from exactly ONE list fetch, not one per CTA.
      const calls = await page.evaluate(() => window.__ticketListCalls ?? []);
      assert.equal(calls.length, 1, `expected exactly one GET /api/support/tickets call, got ${calls.length}`);
    } finally {
      await browser.close();
    }
  });
});
