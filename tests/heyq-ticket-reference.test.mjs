/**
 * Regression coverage for the customer-facing ticket identifier correction:
 * the UI must show HeyQ's human-readable `reference` (e.g. "HQS-2026-0001-3116")
 * everywhere a ticket number is displayed to a customer, while ALL routing,
 * detail/reply API calls, and React keys keep using the immutable `id`
 * (a UUID) unchanged. See docs task "support-ticket identifier correction".
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn, addHeyQApiStubScript } from './helpers.mjs';

const PORT = 5195;

const TICKET_UUID = 'd1f847ee-d472-483c-9774-971070242891';
const TICKET_REFERENCE = 'HQS-2026-0001-3116';
const BLANK_REF_UUID = 'a13f9c2e-1111-4c2d-9a55-000000000002';
const UNKNOWN_UUID = 'ffffffff-0000-4000-8000-000000000000';

const TICKETS = [
  {
    id: TICKET_UUID,
    reference: TICKET_REFERENCE,
    subject: 'Package damaged on arrival',
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
      { id: 'm1', from: 'you', authorLabel: 'You', body: 'Item arrived damaged.', createdAt: '2026-08-20T09:00:00Z' },
    ],
  },
  {
    // Upstream reference unexpectedly blank — display must fall back to the id.
    id: BLANK_REF_UUID,
    reference: '',
    subject: 'General billing question',
    concernType: 'billing',
    issueType: 'Billing',
    status: 'resolved',
    priority: 'low',
    supportTeam: 'Billing',
    createdAt: '2026-08-15T09:00:00Z',
    updatedAt: '2026-08-16T09:00:00Z',
    openedBySupport: false,
    canReopen: true,
    messages: [
      { id: 'm1', from: 'you', authorLabel: 'You', body: 'Question about an invoice.', createdAt: '2026-08-15T09:00:00Z' },
    ],
  },
];

let server;
let browser;
let page;

/** GET requests the app made to /api/support/tickets/:something, in order. */
const ticketDetailRequests = () => page.evaluate(() => window.__ticketDetailRequests ?? []);

before(async () => {
  server = await startDevServer(PORT);
  const session = await signIn(server.base, 'admin');
  browser = session.browser;
  page = session.page;

  await addHeyQApiStubScript(page, TICKETS);
  // Layered on top of the ticket stub (added after, so it wraps the already-
  // stubbed fetch) purely to record which id/reference each detail GET used.
  await page.addInitScript(() => {
    window.__ticketDetailRequests = [];
    const stubbed = window.fetch;
    window.fetch = async (url, init) => {
      const u = String(url);
      if (/\/api\/support\/tickets\/[^/]+$/.test(new URL(u, 'http://x').pathname) && (init?.method ?? 'GET') === 'GET') {
        window.__ticketDetailRequests.push(u);
      }
      return stubbed(url, init);
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
});

after(async () => {
  await browser?.close();
  stopDevServer(server);
});

describe('Support Tickets table — customer-facing identifier', () => {
  it('shows the human-readable reference, not the raw UUID', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    const row = page.locator('tr', { hasText: TICKET_REFERENCE });
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal(await page.getByText(TICKET_UUID, { exact: false }).count(), 0, 'the raw UUID must never render in the table');
  });

  it('column header reads "Ticket #", not "Ticket ID"', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
    await page.getByRole('columnheader', { name: 'Ticket #' }).waitFor({ timeout: 5_000 });
    assert.equal(await page.getByRole('columnheader', { name: 'Ticket ID' }).count(), 0);
  });

  it('falls back to the UUID when the upstream reference is blank', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    const row = page.locator('tr', { hasText: BLANK_REF_UUID });
    await row.waitFor({ state: 'visible', timeout: 10_000 });
  });

  it('search matches the full reference', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/search by ticket #/i).fill(TICKET_REFERENCE);
    await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
    assert.equal(await page.locator('tr', { hasText: BLANK_REF_UUID }).count(), 0, 'the non-matching ticket must be filtered out');
  });

  it('search matches a partial reference substring', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/search by ticket #/i).fill('0001-3116');
    await page.locator('tr', { hasText: TICKET_REFERENCE }).waitFor({ timeout: 10_000 });
  });

  it('still matches the raw UUID for the fallback-display ticket (existing UUID search retained)', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/search by ticket #/i).fill(BLANK_REF_UUID);
    await page.locator('tr', { hasText: BLANK_REF_UUID }).waitFor({ timeout: 10_000 });
  });
});

describe('Support Tickets — navigation and API keep using the UUID', () => {
  it('clicking a ticket navigates to the UUID route, not the reference, and the detail fetch uses the UUID', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    const row = page.locator('tr', { hasText: TICKET_REFERENCE });
    await row.waitFor({ timeout: 10_000 });
    await row.getByRole('button', { name: /view/i }).click();

    await page.waitForURL(`**/dashboard/support-tickets/${TICKET_UUID}`, { timeout: 10_000 });
    // The customer-visible header shows the reference again, proving the UUID-keyed fetch succeeded.
    await page.getByText(`Ticket ${TICKET_REFERENCE}`, { exact: false }).waitFor({ timeout: 10_000 });

    const requests = await ticketDetailRequests();
    assert.ok(
      requests.some((u) => u.includes(`/api/support/tickets/${TICKET_UUID}`)),
      `expected a detail request keyed by the UUID, got: ${JSON.stringify(requests)}`,
    );
    assert.ok(
      requests.every((u) => !u.includes(TICKET_REFERENCE)),
      'no detail request may be keyed by the human-readable reference',
    );
  });

  it('shows a generic "Ticket not found" message that does not leak the raw route UUID', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets/${UNKNOWN_UUID}`, { waitUntil: 'networkidle' });
    await page.getByText('Ticket not found').waitFor({ timeout: 10_000 });
    assert.equal(await page.getByText(UNKNOWN_UUID, { exact: false }).count(), 0, 'the raw route UUID must not be printed to the customer');
  });
});

describe('Topbar global ticket search — customer-facing identifier', () => {
  it('displays the reference in results, matches by reference, and navigates via the UUID', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    const search = page.getByPlaceholder(/search tracking numbers, orders/i);
    await search.fill('0001-3116');

    const result = page.getByRole('button', { name: new RegExp(TICKET_REFERENCE) });
    await result.waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal(await page.getByText(TICKET_UUID, { exact: false }).count(), 0, 'the raw UUID must never render in topbar results');

    await result.click();
    await page.waitForURL(`**/dashboard/support-tickets/${TICKET_UUID}`, { timeout: 10_000 });
  });
});
