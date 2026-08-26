/**
 * The cross-system customer journey, driven through the real Business+ UI.
 *
 * The order → HeyQ handoff is driven against the real OMS service (window.open is
 * captured, not launched). The Support Tickets surfaces are driven against a
 * stubbed HeyQ customer API (helpers.installHeyQApiStub) so the UI renders real
 * API-shaped tickets; the agent half of the lifecycle now lives in HeyQ and is
 * covered by HeyQ's own tests. What this asserts on the Business+ side: the list
 * reflects HeyQ's customer projection, and the ticket is viewed IN Business+
 * (the customer surface no longer deep-links a HeyQ portal token).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn, captureHandoffs, installHeyQApiStub, addHeyQApiStubScript } from './helpers.mjs';

const PORT = 5192;
const ORDER = 'GGX-2026-90008'; // failed delivery, Acme Corporation

/** HeyQ customer-API tickets for the signed-in Admin, as HeyQ would project them. */
const TICKETS = [
  {
    id: 'HQ-10241',
    reference: 'HQ-10241',
    subject: 'Delivery failed but recipient was available',
    concernType: 'delivery_delay',
    issueType: 'Delivery delay',
    status: 'in_progress',
    priority: 'high',
    supportTeam: 'Claims',
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-06-02T08:05:00Z',
    openedBySupport: false,
    canReopen: false,
    linkedOrder: {
      externalOrderId: ORDER,
      trackingNumber: ORDER,
      capturedAt: '2026-06-01T09:00:00Z',
      snapshot: {
        shipmentStatus: 'failed_delivery',
        bookingDate: '2026-05-31',
        serviceType: 'On-Demand',
        deliverySummary: 'Standard delivery',
        route: 'Metro Manila → Pasig City',
      },
    },
    messages: [
      { id: 'm1', from: 'you', authorLabel: 'You', body: 'The rider marked this failed but nobody came.', createdAt: '2026-06-01T09:00:00Z' },
      { id: 'm2', from: 'support', authorLabel: 'Claims', body: 'We have opened an investigation with the hub.', createdAt: '2026-06-02T08:05:00Z' },
    ],
  },
  {
    id: 'HQ-10230',
    reference: 'HQ-10230',
    subject: 'COD amount remitted does not match the order',
    concernType: 'cod_concern',
    issueType: 'COD concern',
    status: 'resolved',
    priority: 'high',
    supportTeam: 'Billing',
    createdAt: '2026-05-29T04:00:00Z',
    updatedAt: '2026-05-30T07:22:00Z',
    resolvedAt: '2026-05-30T07:22:00Z',
    openedBySupport: false,
    canReopen: true,
    messages: [
      { id: 'm1', from: 'you', authorLabel: 'You', body: 'COD is short by ₱1,200.', createdAt: '2026-05-29T04:00:00Z' },
    ],
  },
];

let server;
let browser;
let page;
let handoffs;

before(async () => {
  server = await startDevServer(PORT);
  const session = await signIn(server.base, 'admin');
  browser = session.browser;
  page = session.page;
  handoffs = await captureHandoffs(page);
  // Stub the HeyQ customer API before any dashboard navigation — the dashboard
  // shell reads the ticket list on mount, so every page needs it intercepted.
  await installHeyQApiStub(page, TICKETS);
});

after(async () => {
  await browser?.close();
  stopDevServer(server);
});

describe('transaction → in-app report drawer', () => {
  it('submits an order-linked ticket to HeyQ without leaving Business+', async () => {
    await page.goto(`${server.base}/dashboard/transactions/${ORDER}`, { waitUntil: 'networkidle' });
    const before = (await handoffs()).length;

    // Open the drawer from the Need Help banner.
    await page.getByRole('button', { name: /report an issue/i }).first().click();
    await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ state: 'visible', timeout: 10_000 });
    // The drawer carries the order context.
    await page.getByRole('dialog').getByText(ORDER).waitFor();

    // Fill and submit — the create call is served by the stubbed customer API.
    await page.locator('#report-description').fill('The rider marked this failed but nobody came.');
    await page.getByRole('button', { name: /submit report/i }).click();

    // Success state, in place — no external HeyQ tab was opened.
    await page.getByText(/report submitted/i).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: /open ticket/i }).waitFor();
    assert.equal((await handoffs()).length, before, 'must not open an external HeyQ page');
    // Still on the transaction view.
    assert.match(page.url(), /\/dashboard\/transactions\/GGX-2026-90008$/);
  });

  it('refuses to submit for an order the account is not authorized for', async () => {
    const mgr = await signIn(server.base, 'manager');
    try {
      await addHeyQApiStubScript(mgr.page, TICKETS);
      await mgr.page.goto(`${server.base}/dashboard/transactions/${ORDER}`, { waitUntil: 'networkidle' });
      await mgr.page.getByRole('button', { name: /report an issue/i }).first().click();
      await mgr.page.locator('#report-description').fill('Please check this order.');
      await mgr.page.getByRole('button', { name: /submit report/i }).click();
      // OMS authorization is the gate — it fails before any ticket is created.
      await mgr.page.getByText(/isn.t available for support on your account/i)
        .waitFor({ state: 'visible', timeout: 10_000 });
    } finally {
      await mgr.browser.close();
    }
  });
});

describe('Support Tickets page (reads the HeyQ customer API)', () => {
  it('lists tickets from HeyQ with support status, linked order and team', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });

    const row = page.locator('tr', { hasText: 'HQ-10241' });
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.getByText(ORDER).waitFor();          // linked OMS order
    await row.getByText('In Progress').waitFor();  // support status, not delivery status
    await row.getByText('Claims').waitFor();       // team, never the agent's name
  });

  it('summary cards count the HeyQ tickets', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.locator('tr', { hasText: 'HQ-10241' }).waitFor({ timeout: 10_000 });

    const cardValue = (label) =>
      page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
    assert.equal((await cardValue('In Progress').innerText()).trim(), '1');
    assert.equal((await cardValue('Resolved').innerText()).trim(), '1');
  });

  it('Submit a Ticket opens the in-app report drawer (no HeyQ redirect) and submits unlinked', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    const before = (await handoffs()).length;

    await page.getByRole('button', { name: /submit a ticket/i }).click();
    // The Report an Issue drawer opens IN PLACE — no navigation, no /contact handoff.
    await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal((await handoffs()).length, before, 'must not redirect to HeyQ / open /contact');
    assert.match(page.url(), /\/dashboard\/support-tickets$/);

    // A general concern submits with no linked transaction and stays in Business+.
    await page.locator('#report-subject').fill('General billing question');
    await page.locator('#report-description').fill('Not about a specific order.');
    await page.getByRole('button', { name: /submit report/i }).click();
    await page.getByText(/report submitted/i).waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal((await handoffs()).length, before, 'still no external handoff after submit');
  });

  it('the affected-transactions combobox searches, multi-selects, and prevents duplicates', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /submit a ticket/i }).click();
    const dialog = page.getByRole('dialog', { name: /report an issue/i });
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    const search = dialog.getByPlaceholder(/search transactions by tracking number/i);
    // Search by tracking number → pick a real, authorized order (admin sees all).
    await search.click();
    await search.fill('90009');
    const option = dialog.getByRole('button', { name: /GGX-2026-90009/i });
    await option.first().click();
    // It appears as a removable chip in the selected list.
    await dialog.getByLabel('Selected transactions').getByText('GGX-2026-90009').waitFor({ timeout: 10_000 });

    // Duplicate prevention: searching the same order again offers no result to add.
    await search.fill('90009');
    await dialog.getByText(/no matching transactions/i).waitFor({ timeout: 10_000 });

    // Multi-select: a second distinct order can still be added.
    await search.fill('90008');
    await dialog.getByRole('button', { name: /GGX-2026-90008/i }).first().click();
    await dialog.getByLabel('Selected transactions').getByText('GGX-2026-90008').waitFor({ timeout: 10_000 });
  });

  it('View opens the ticket inside Business+ (no external HeyQ portal handoff)', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    const before = (await handoffs()).length;
    const row = page.locator('tr', { hasText: 'HQ-10241' });
    await row.waitFor({ timeout: 10_000 });
    await row.getByRole('button', { name: /view/i }).click();

    await page.waitForURL('**/dashboard/support-tickets/HQ-10241', { timeout: 10_000 });
    await page.getByText('We have opened an investigation with the hub.').waitFor({ timeout: 10_000 });
    // The delivery snapshot renders, clearly as delivery status.
    await page.getByText(/delivery status when reported/i).waitFor();
    // No new external handoff was triggered — the portal token action is gone.
    assert.equal((await handoffs()).length, before, 'View must not open an external HeyQ tab');
  });

  it('does not present an explicit Reopen action on a resolved (canReopen) ticket', async () => {
    // HQ-10230 is resolved with canReopen: true in the fixture — exactly the
    // case the removed explicit Reopen button used to render for.
    await page.goto(`${server.base}/dashboard/support-tickets/HQ-10230`, { waitUntil: 'networkidle' });
    await page.getByText('COD amount remitted does not match the order').first().waitFor({ timeout: 10_000 });
    await page.getByText('This ticket has been resolved').waitFor({ timeout: 10_000 });
    // No standalone Reopen control anywhere on the page — replying is the only
    // supported way to bring a resolved ticket back (see the handoff doc).
    assert.equal(await page.getByRole('button', { name: /reopen/i }).count(), 0, 'no explicit Reopen button may be presented');
    assert.equal(await page.getByText(/or reopening/i).count(), 0, 'the resolved banner must not mention a reopen action that no longer exists');
  });
});

describe('responsive', () => {
  for (const width of [375, 768, 1280]) {
    it(`Support Tickets has no horizontal overflow at ${width}px`, async () => {
      const storageState = await page.context().storageState();
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, storageState });
      const p = await ctx.newPage();
      try {
        await addHeyQApiStubScript(p, TICKETS);
        await p.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
        await p.locator('table').waitFor({ timeout: 15_000 });
        const overflow = await p.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false, `page must not scroll horizontally at ${width}px`);
      } finally {
        await ctx.close();
      }
    });
  }
});
