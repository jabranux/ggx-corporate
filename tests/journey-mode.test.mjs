/**
 * UX Journey Showcase Mode — focused coverage.
 *
 * Pure-logic checks (P3 eligibility/pricing helpers, the registry) run via a
 * dynamic import of the Vite-served TS module inside the page, same pattern
 * as the rest of this suite. DOM checks drive the real UI: the floating CTA
 * / drawer / active indicator, P1's journey-only Main Account admin
 * capability override, P2's simulated (non-persisting) cutoff outcome, and
 * P3's edit drawer + revised-amount preview. Blocked-state coverage for P3
 * (Picked Up / already-paid) is intentionally logic-only — the journey does
 * not add separate drawer entries to demonstrate blocked states.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5194;

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

// ---------------------------------------------------------------------------
// Pure logic — transactionEditEligibility + journeyPricing (P3)
// ---------------------------------------------------------------------------

describe('transactionEditEligibility (P3 eligibility helper)', () => {
  it('is editable before pickup when unpaid, COD, or billing', async () => {
    const results = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/transactionEditEligibility.ts');
      return ['unpaid', 'cod', 'billing'].map((paymentKind) =>
        mod.getEditEligibility({ status: 'pending', paymentKind }));
    });
    for (const r of results) assert.equal(r.editable, true);
  });

  it('blocks editing at Picked Up or any later status, regardless of payment', async () => {
    const results = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/transactionEditEligibility.ts');
      return ['picked-up', 'in-transit', 'delivered', 'failed', 'returned'].map((status) =>
        mod.getEditEligibility({ status, paymentKind: 'cod' }));
    });
    for (const r of results) {
      assert.equal(r.editable, false);
      assert.equal(r.reason, 'picked_up');
      assert.match(r.message, /already been picked up/i);
    }
  });

  it('blocks editing an already-paid transaction even before pickup', async () => {
    const r = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/transactionEditEligibility.ts');
      return mod.getEditEligibility({ status: 'pending', paymentKind: 'paid' });
    });
    assert.equal(r.editable, false);
    assert.equal(r.reason, 'already_paid');
    assert.match(r.message, /paid transactions cannot be edited/i);
  });

  it('the picked-up rule takes priority over the payment rule', async () => {
    const r = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/transactionEditEligibility.ts');
      return mod.getEditEligibility({ status: 'delivered', paymentKind: 'paid' });
    });
    assert.equal(r.reason, 'picked_up');
  });
});

describe('journeyPricing (P3 revised-amount preview)', () => {
  it('prices shipping by pouch size and adds Item Protection only when enabled', async () => {
    const [withProtection, without, small] = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/journeyPricing.ts');
      return [
        mod.computeProposedAmount({ pouchSize: 'MEDIUM', declaredValue: 1800, itemProtection: true }),
        mod.computeProposedAmount({ pouchSize: 'MEDIUM', declaredValue: 1800, itemProtection: false }),
        mod.computeProposedAmount({ pouchSize: 'SMALL', declaredValue: 1800, itemProtection: false }),
      ];
    });
    assert.equal(without, 129);
    assert.equal(withProtection, 129 + 13); // (1800 − 500) × 1% = 13
    assert.equal(small, 99);
  });

  it('never charges Item Protection under the ₱500 free tier', async () => {
    const fee = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/journeyPricing.ts');
      return mod.computeItemProtectionFee(400);
    });
    assert.equal(fee, 0);
  });
});

describe('journey registry', () => {
  it('lists exactly the finished journeys, grouped by category/subcategory', async () => {
    const groups = await page.evaluate(async () => {
      const mod = await import('/src/app/data/journeyRegistry.ts');
      return mod.groupJourneys(mod.JOURNEYS);
    });
    const titles = groups.flatMap((g) => g.subgroups.flatMap((s) => s.journeys.map((j) => j.title))).sort();
    assert.deepEqual(titles, ['Cutoff Handling', 'Edit Delivery Details', 'Main Account — Payout Setup'].sort());
    const bulkUpload = groups.find((g) => g.category === 'Bulk Upload');
    assert.ok(bulkUpload, 'Bulk Upload category present');
    assert.deepEqual(bulkUpload.subgroups.map((s) => s.subcategory).sort(), ['COD Booking', 'SDD'].sort());
  });
});

// ---------------------------------------------------------------------------
// Shell — floating CTA, drawer, active indicator, exit-returns-route
// ---------------------------------------------------------------------------

describe('Journey Showcase shell', () => {
  it('floating CTA opens a drawer listing the registry journeys', async () => {
    await page.goto(`${server.base}/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^ux journeys$/i }).click();
    await page.getByRole('dialog', { name: /ux journeys/i }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('Main Account — Payout Setup').waitFor();
    await page.getByText('Cutoff Handling').waitFor();
    await page.getByText('Edit Delivery Details').waitFor();
    await page.getByRole('dialog', { name: /ux journeys/i }).getByLabel('Close').click();
  });

  it('launches a journey from an arbitrary dashboard route and exit returns to it', async () => {
    await page.goto(`${server.base}/dashboard/transactions`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^ux journeys$/i }).click();
    await page.getByText('Cutoff Handling').click();
    await page.waitForURL('**/dashboard/bulk-uploader', { timeout: 10_000 });
    await page.getByText(/UX Journey: SDD · Cutoff Handling/).waitFor({ timeout: 10_000 });

    await page.getByRole('button', { name: /^exit$/i }).click();
    await page.waitForURL('**/dashboard/transactions', { timeout: 10_000 });
    assert.equal(await page.getByText(/UX Journey:/).count(), 0, 'indicator clears on exit');
  });
});

// ---------------------------------------------------------------------------
// P1 — COD Main Account Payout Setup
// ---------------------------------------------------------------------------

describe('P1 — COD Main Account Payout Setup', () => {
  it('grants Payment Settings only while the journey is active for a Manager, and blocks it otherwise', async () => {
    const mgr = await signIn(server.base, 'manager');
    try {
      // Normal mode: a Manager cannot reach Payment Settings.
      await mgr.page.goto(`${server.base}/dashboard/payment-settings`, { waitUntil: 'networkidle' });
      await mgr.page.getByText(/access restricted/i).waitFor({ timeout: 10_000 });

      // Launch the journey from an arbitrary starting route.
      await mgr.page.goto(`${server.base}/dashboard`, { waitUntil: 'networkidle' });
      await mgr.page.getByRole('button', { name: /^ux journeys$/i }).click();
      await mgr.page.getByText('Main Account — Payout Setup').click();
      await mgr.page.waitForURL('**/bulk-uploader/summary/journey-cod-payout', { timeout: 10_000 });
      await mgr.page.getByText(/UX Journey: COD · Main Account Payout Setup/).waitFor({ timeout: 10_000 });

      // COD batch ready → Complete Booking → blocked on payout setup.
      await mgr.page.getByRole('button', { name: /complete booking/i }).click();
      const payoutDialogHeading = mgr.page.getByRole('heading', { name: /set up a payout account/i });
      await payoutDialogHeading.waitFor({ state: 'visible', timeout: 10_000 });

      // Open Payment Settings — journey-only admin capability grants the route.
      const payoutPanel = payoutDialogHeading.locator('xpath=..');
      await payoutPanel.getByRole('button', { name: /open payment settings/i }).click();
      await mgr.page.waitForURL('**/dashboard/payment-settings', { timeout: 10_000 });
      await mgr.page.getByRole('heading', { name: /^payment settings$/i }).waitFor({ timeout: 10_000 });
      const restricted = await mgr.page.getByText(/access restricted/i).count();
      assert.equal(restricted, 0, 'journey capability must bypass the admin-only guard here');

      // No payout bank yet — fixture starts clean.
      await mgr.page.getByText(/no payout bank on file yet/i).waitFor({ timeout: 10_000 });

      // Add Bank Account → OTP → Pending (never auto-verified).
      await mgr.page.getByRole('button', { name: /add bank account/i }).click();
      const addBankHeading = mgr.page.getByRole('heading', { name: /^add bank account$/i });
      await addBankHeading.waitFor({ state: 'visible', timeout: 10_000 });
      const addBankPanel = addBankHeading.locator('xpath=..');
      await addBankPanel.locator('select').selectOption('BDO Unibank');
      await addBankPanel.locator('input[placeholder="Account number"]').fill('1234567890');
      await addBankPanel.getByRole('button', { name: /^continue$/i }).click();

      await mgr.page.getByPlaceholder('------').fill('123456');
      await mgr.page.getByRole('button', { name: /verify & continue/i }).click();

      await mgr.page.getByText('BDO Unibank').waitFor({ timeout: 10_000 });
      await mgr.page.getByText('Pending', { exact: true }).first().waitFor({ timeout: 10_000 });

      // Exit journey mode — scenario state clears, normal guard behavior returns.
      await mgr.page.getByRole('button', { name: /^exit$/i }).click();
      await mgr.page.waitForURL('**/dashboard', { timeout: 10_000 });
      await mgr.page.goto(`${server.base}/dashboard/payment-settings`, { waitUntil: 'networkidle' });
      await mgr.page.getByText(/access restricted/i).waitFor({ timeout: 10_000 });
    } finally {
      await mgr.browser.close();
    }
  });

  it('is isolated from a direct deep link to the fixture batch id without an active journey', async () => {
    await page.goto(`${server.base}/dashboard/bulk-uploader/summary/journey-cod-payout`, { waitUntil: 'networkidle' });
    // Normal default review content shows (rows needing fixes), not the clean journey fixture.
    await page.getByText('Rows needing fixes', { exact: true }).waitFor({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// P2 — SDD Cutoff Handling
// ---------------------------------------------------------------------------

describe('P2 — SDD Cutoff Handling', () => {
  it('shows a deterministic post-cutoff banner and a simulated outcome that adds nothing to Recent Uploads', async () => {
    await page.goto(`${server.base}/dashboard/bulk-uploader`, { waitUntil: 'networkidle' });
    const beforeRows = await page.locator('table tbody tr').count();

    await page.getByRole('button', { name: /^ux journeys$/i }).click();
    await page.getByText('Cutoff Handling').click();
    await page.waitForURL('**/dashboard/bulk-uploader', { timeout: 10_000 });

    await page.getByText(/same-day cutoff has passed/i).waitFor({ timeout: 10_000 });
    await page.getByText(/next pickup:/i).waitFor();

    await page.setInputFiles('input[type=file]', {
      name: 'journey-batch.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Name,Mobile\nJourney Row,+639170000000\n'),
    });
    await page.getByRole('button', { name: /upload & validate/i }).click();

    await page.getByRole('heading', { name: /batch scheduled/i }).waitFor({ timeout: 10_000 });
    await page.getByText(/no orders were created/i).waitFor();
    await page.getByRole('button', { name: /^done$/i }).click();

    const afterRows = await page.locator('table tbody tr').count();
    assert.equal(afterRows, beforeRows, 'the simulated outcome must not add a row to Recent Uploads');

    await page.getByRole('button', { name: /^exit$/i }).click();
  });
});

// ---------------------------------------------------------------------------
// P3 — Edit Delivery Details
// ---------------------------------------------------------------------------

describe('P3 — Edit Delivery Details', () => {
  it('edits item/pouch size, previews the revised amount, confirms into journey state, and discards on exit', async () => {
    await page.goto(`${server.base}/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^ux journeys$/i }).click();
    await page.getByText('Edit Delivery Details').click();
    await page.waitForURL('**/dashboard/transactions/GGX-JOURNEY-EDIT-001', { timeout: 10_000 });
    await page.getByText(/UX Journey: Transactions · Edit Delivery Details/).waitFor({ timeout: 10_000 });

    await page.getByRole('button', { name: /edit delivery details/i }).click();
    const drawer = page.getByRole('dialog', { name: /edit delivery details/i });
    await drawer.waitFor({ state: 'visible', timeout: 10_000 });

    await drawer.locator('select').selectOption('LARGE');
    await drawer.getByText(/revised/i).waitFor({ timeout: 10_000 }); // amount preview reacts to the size change

    const itemInput = drawer.locator('input').nth(1); // [0]=pickup date, [1]=item name
    await itemInput.fill('Journey Edited Item Name');

    await drawer.getByRole('button', { name: /^confirm$/i }).click();
    await drawer.getByText(/delivery details updated/i).waitFor({ timeout: 10_000 });
    await drawer.getByRole('button', { name: /^done$/i }).click();

    // The Transaction Details page reflects the confirmed edit.
    await page.getByText('Journey Edited Item Name').waitFor({ timeout: 10_000 });
    await page.getByText('LARGE').first().waitFor({ timeout: 10_000 });

    // Exit discards journey state — re-launching starts clean again.
    await page.getByRole('button', { name: /^exit$/i }).click();
    await page.getByRole('button', { name: /^ux journeys$/i }).click();
    await page.getByText('Edit Delivery Details').click();
    await page.waitForURL('**/dashboard/transactions/GGX-JOURNEY-EDIT-001', { timeout: 10_000 });
    await page.getByText('Gift Hamper Set').waitFor({ timeout: 10_000 });
    const stale = await page.getByText('Journey Edited Item Name').count();
    assert.equal(stale, 0, 'exiting must discard journey-local edits');
    await page.getByRole('button', { name: /^exit$/i }).click();
  });

  it('is isolated from a direct deep link to the fixture tracking number without an active journey', async () => {
    await page.goto(`${server.base}/dashboard/transactions/GGX-JOURNEY-EDIT-001`, { waitUntil: 'networkidle' });
    await page.getByText(/transaction not found/i).waitFor({ timeout: 10_000 });
  });
});
