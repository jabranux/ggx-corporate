/**
 * Focused tests for the hierarchical Concern Category picker.
 *
 * Verifies:
 * - Parent category with children & leaf category display
 * - Opening nested fly-out submenu / subcategory selection
 * - Formatted hierarchical label ("Parent Category > Subcategory")
 * - Mobile drill-in and Back action behavior
 * - Canonical live subcategory ID submission
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5192;
let server;
let browser;
let page;

const CATEGORIES_WITH_NESTING = [
  {
    id: 'cat-general',
    slug: 'general',
    name: 'General Inquiry',
    subcategories: [
      { id: 'sub-gen-info', name: 'General Information' },
      { id: 'sub-gen-account', name: 'Account Assistance' },
    ],
  },
  {
    id: 'cat-delivery',
    slug: 'delivery',
    name: 'Delivery Concerns',
    requiresTracking: true,
    subcategories: [
      { id: 'sub-del-delay', name: 'Delayed Package' },
      { id: 'sub-del-failed', name: 'Failed Attempt' },
    ],
  },
  {
    id: 'cat-other',
    slug: 'other',
    name: 'Other Issues',
    subcategories: [], // Leaf category without children
  },
];

const TICKETS_FIXTURE = [
  {
    id: 'tkt-1',
    reference: 'HQ-1001',
    subject: 'Test issue',
    status: 'open',
    priority: 'normal',
    supportTeam: 'Customer Support',
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T00:00:00Z',
    canReopen: false,
  },
];

before(async () => {
  server = await startDevServer(PORT);
  const session = await signIn(server.base, 'admin');
  browser = session.browser;
  page = session.page;

  // Stub HeyQ support routes with nested category taxonomy
  await page.addInitScript(({ categories, tickets }) => {
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
        window.__lastTicketPayload = body;
        return json({
          id: 'tkt-created-sub', reference: 'HQ-2026-999', subject: body.subject,
          issueType: 'Delivery Concerns', status: 'open', priority: 'normal',
          supportTeam: 'Customer Support', createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(), canReopen: false,
          messages: [{ id: 'm1', from: 'you', authorLabel: 'You', body: body.description, createdAt: new Date().toISOString() }],
        });
      }
      if (u.includes('/api/support/tickets')) {
        return json(tickets);
      }
      return orig(url, init);
    };
  }, { categories: CATEGORIES_WITH_NESTING, tickets: TICKETS_FIXTURE });
});

after(async () => {
  await browser?.close();
  stopDevServer(server);
});

describe('Hierarchical Concern Category Picker (Desktop)', () => {
  it('displays hierarchical categories, flyout submenu, formatted label, and sends subcategory ID', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });

    // Open Report an Issue drawer using Submit a Ticket button
    await page.getByRole('button', { name: /submit a ticket|report an issue/i }).first().click();
    await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ state: 'visible' });

    // Wait for picker to be ready
    const pickerTrigger = page.locator('#report-category');
    await pickerTrigger.waitFor({ state: 'visible' });

    // Initial label should default to first leaf subcategory ("General Inquiry > General Information")
    assert.match(await pickerTrigger.innerText(), /General Inquiry > General Information/);

    // Open picker
    await pickerTrigger.click();

    // Top-level items should be visible
    await page.getByRole('option', { name: 'Delivery Concerns' }).waitFor({ state: 'visible' });
    await page.getByRole('option', { name: 'Other Issues' }).waitFor({ state: 'visible' });

    // Hover/click on "Delivery Concerns" to open fly-out submenu
    await page.getByRole('option', { name: 'Delivery Concerns' }).hover();
    await page.getByRole('option', { name: 'Delayed Package' }).waitFor({ state: 'visible' });

    // Select subcategory "Delayed Package"
    await page.getByRole('option', { name: 'Delayed Package' }).click();

    // Picker closes and label reflects hierarchy
    assert.equal(await page.getByRole('listbox').count(), 0);
    assert.equal(await pickerTrigger.innerText(), 'Delivery Concerns > Delayed Package');

    // Fill form and submit
    await page.locator('#report-subject').fill('Late package delivery');
    await page.locator('#report-description').fill('Package has been delayed for 3 days past SLA.');
    await page.getByRole('button', { name: /submit report/i }).click();

    await page.getByText(/report submitted/i).waitFor({ state: 'visible' });

    // Assert submitted payload carried canonical subcategory ID "sub-del-delay"
    const lastPayload = await page.evaluate(() => window.__lastTicketPayload);
    assert.equal(lastPayload.categoryId, 'sub-del-delay');

    // Close drawer via Done button
    await page.getByRole('button', { name: /done/i }).click();
  });

  it('selects a leaf category directly when it has no subcategories', async () => {
    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });

    // Open drawer
    await page.getByRole('button', { name: /submit a ticket|report an issue/i }).first().click();
    await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ state: 'visible' });

    const pickerTrigger = page.locator('#report-category');
    await pickerTrigger.waitFor({ state: 'visible' });
    await pickerTrigger.click();

    // Select leaf category "Other Issues"
    await page.getByRole('option', { name: 'Other Issues' }).click();
    assert.equal(await pickerTrigger.innerText(), 'Other Issues');

    // Close drawer
    await page.getByRole('button', { name: /close/i }).click();
  });
});

describe('Hierarchical Concern Category Picker (Mobile drill-in)', () => {
  it('drills into subcategories inline and supports Back navigation', async () => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(`${server.base}/dashboard/support-tickets`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /submit a ticket|report an issue/i }).first().click();
    await page.getByRole('dialog', { name: /report an issue/i }).waitFor({ state: 'visible' });

    const pickerTrigger = page.locator('#report-category');
    await pickerTrigger.waitFor({ state: 'visible' });
    await pickerTrigger.click();

    // Tap parent "General Inquiry"
    await page.getByRole('option', { name: 'General Inquiry' }).click();

    // Mobile view drills in: "Back to categories" button appears along with subcategories
    await page.getByRole('button', { name: /back to categories/i }).waitFor({ state: 'visible' });
    await page.getByRole('option', { name: 'Account Assistance' }).waitFor({ state: 'visible' });

    // Tap Back
    await page.getByRole('button', { name: /back to categories/i }).click();

    // Returns to top-level list
    await page.getByRole('option', { name: 'Delivery Concerns' }).waitFor({ state: 'visible' });

    // Drill in again & select "Failed Attempt"
    await page.getByRole('option', { name: 'Delivery Concerns' }).click();
    await page.getByRole('option', { name: 'Failed Attempt' }).click();

    // Selected label shows full hierarchy
    assert.equal(await pickerTrigger.innerText(), 'Delivery Concerns > Failed Attempt');
  });
});
