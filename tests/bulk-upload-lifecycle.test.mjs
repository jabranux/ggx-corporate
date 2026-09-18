/**
 * Regression coverage for the Bulk Upload review/lifecycle enhancement:
 *
 *   Upload row → validated / Ready to book → batch processed/booked → real
 *   Transaction created.
 *
 * - The Review Before Booking page must never claim its "Ready to book" rows
 *   were "created as Awaiting payment" — they are validated upload rows, not
 *   transactions yet — and must offer a "View all N ready rows" CTA that opens
 *   an in-page drawer instead of a premature deep link into Transactions or a
 *   navigation away from the review page.
 * - Booking a batch (upload record transitions to `awaiting-payment` /
 *   `completed`) is the ONLY point real Transaction records appear for that
 *   batch — before that, the batch must be invisible to the Transactions
 *   list/batch view (transactionService.ts's synthesized bulk-batch
 *   transactions, see `synthesizedBulkBatchTransactions`).
 * - Completed Batch Details reads the SAME transaction records the main
 *   Transactions "By Batch" view does (`getTransactionBatchById`), with the
 *   column set aligned to the main Transactions table's terminology.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5201;

let server;
let browser;
let page;

before(async () => {
  server = await startDevServer(PORT);
  const session = await signIn(server.base, 'admin');
  browser = session.browser;
  page = session.page;
});
after(async () => { await browser?.close(); stopDevServer(server); });

describe('Review Before Booking — "Ready to book" semantics', () => {
  it('never claims rows were created as Awaiting payment, and opens an in-page drawer (no navigation, no duplicate CTA)', async () => {
    const summaryUrl = `${server.base}/dashboard/bulk-uploader/summary/UPLOAD-2026-05-19-001`;
    await page.goto(summaryUrl, { waitUntil: 'networkidle' });
    const bodyText = await page.evaluate(() => document.body.innerText);

    assert.ok(bodyText.includes('ready to book'), 'expects "ready to book" copy on the Ready to book card');
    assert.ok(!bodyText.includes('created as'), 'must not claim rows were "created as" any transaction state before booking');
    assert.ok(!bodyText.includes('View all in Transactions'), 'must not deep-link pre-booking rows into Transactions');

    // Exactly one "View all N ready rows" CTA (the old duplicate bottom link is gone),
    // and it must be a button, not a link — it does not navigate anywhere.
    const ctaCount = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((el) => /View all \d+ ready rows?/.test(el.textContent ?? '')).length
    );
    assert.equal(ctaCount, 1, 'expected exactly one "View all N ready rows" CTA button');

    await page.click('button:has-text("ready rows")');
    // Still the same URL — this must be a client-side drawer, not a route change.
    assert.equal(page.url(), summaryUrl, 'opening the Ready to book drawer must not navigate away from Review');

    const drawer = page.locator('[role="dialog"][aria-label="Ready to book rows"]');
    await drawer.waitFor({ state: 'visible', timeout: 5_000 });
    assert.ok(await drawer.locator('text=Ready to book').first().isVisible(), 'drawer header should read "Ready to book"');
    await drawer.locator('input[placeholder*="Search by recipient"]').fill('zzz-no-such-row-zzz');
    assert.ok(
      await drawer.locator('text=No ready rows match').isVisible(),
      'searching for a non-matching query should show the empty-search state',
    );

    // Closing the drawer must not trigger the unsaved-work "Leave bulk upload?" guard.
    await drawer.locator('button[aria-label="Close"]').click();
    await drawer.waitFor({ state: 'hidden', timeout: 5_000 });
    const leaveDialogVisible = await page.locator('text=Leave bulk upload?').isVisible().catch(() => false);
    assert.equal(leaveDialogVisible, false, 'closing the drawer must not trigger the "Leave bulk upload?" exit guard');
    assert.equal(page.url(), summaryUrl, 'the Review page URL must be unchanged after closing the drawer');
  });
});

describe('Booked batches create real Transactions at the correct lifecycle point', () => {
  it('a batch still needs-review has no linked Transactions, and never leaks into the Transactions list', async () => {
    const result = await page.evaluate(async () => {
      const bulkSvc = await import('/src/app/services/bulkUploadService.ts');
      const txnSvc = await import('/src/app/services/transactionService.ts');

      const id = 'TEST-LIFECYCLE-001';
      const account = { accountId: 'acme-corporation', accountName: 'Acme Corporation', accountType: 'subaccount' };
      const record = bulkSvc.createUploadRecord(id, 'lifecycle_test.xlsx', 'standard', 'pickup', 'needs-review', account);
      record.totalRows = 5;
      record.validRows = 2;
      record.errorRows = 3;
      bulkSvc.addUpload(record);

      const beforeGroup = await txnSvc.getTransactionBatchById(id);
      const beforeAll = await txnSvc.getTransactions();
      const leaked = beforeAll.some((t) => t.tracking.includes(id) || t.tracking.startsWith('GGX-LIFECYCLE'));

      return { beforeGroup, leakedIntoAllList: leaked };
    });

    assert.equal(result.beforeGroup, null, 'a needs-review batch must have no linked transaction batch group yet');
    assert.equal(result.leakedIntoAllList, false, 'pre-booking rows must never appear in the main Transactions list');
  });

  it('booking transitions the record and synthesizes real Transactions from the SAME live row data the Review page produced', async () => {
    const result = await page.evaluate(async () => {
      const bulkSvc = await import('/src/app/services/bulkUploadService.ts');
      const txnSvc = await import('/src/app/services/transactionService.ts');

      const id = 'TEST-LIFECYCLE-002';
      const account = { accountId: 'acme-corporation', accountName: 'Acme Corporation', accountType: 'subaccount' };
      const record = bulkSvc.createUploadRecord(id, 'lifecycle_test2.xlsx', 'standard', 'pickup', 'needs-review', account);
      record.totalRows = 12;
      record.validRows = 10; // "no issues from the start" base count
      record.errorRows = 2;
      bulkSvc.addUpload(record);

      // Mirror what BulkUploadSummary.tsx pushes after a Revalidate: one row
      // promoted from Fixes/Needs review to Ready, one still Needs review.
      bulkSvc.setBatchRowsState(id, {
        readyRows: [{
          key: '1', recipientName: 'Test Ready Recipient', mobileNumber: '+639170000001',
          itemName: 'Test Item', location: 'Makati City, Metro Manila',
          declaredValue: '750', pouchSize: 'SMALL', referenceId: 'REF-T1', cod: 'No',
        }],
        reviewRows: [{
          key: '2', recipientName: 'Test Review Recipient', mobileNumber: '+639170000002',
          itemName: 'Test Item 2', location: 'Pasig City, Metro Manila',
          declaredValue: '900', pouchSize: 'MEDIUM', referenceId: 'REF-T2', cod: 'Yes',
        }],
      });

      // Not booked yet — still invisible to Transactions.
      const stillHidden = await txnSvc.getTransactionBatchById(id);

      // Book it (mirrors handleCompleteBooking's status transition).
      bulkSvc.updateUploadStatus(id, 'awaiting-payment');
      const group = await txnSvc.getTransactionBatchById(id);
      const recipients = group?.transactions.map((t) => t.recipient) ?? [];
      const scoped = await txnSvc.getTransactionsBySubaccountId('acme-corporation');
      const scopedTrackings = new Set(group?.transactions.map((t) => t.tracking) ?? []);
      const allScopedPresent = [...scopedTrackings].every((tr) => scoped.some((s) => s.tracking === tr));

      // Idempotent re-read — must not duplicate on a second call.
      const groupAgain = await txnSvc.getTransactionBatchById(id);

      // Every listed transaction must also resolve on its own detail page —
      // not just appear (and be clickable) in the list/batch views.
      const firstTracking = group?.transactions[0]?.tracking;
      const detail = firstTracking ? await txnSvc.getTransactionById(firstTracking) : null;

      return {
        stillHiddenWasNull: stillHidden === null,
        total: group?.counts.total,
        transactionCount: group?.transactions.length,
        recipients,
        allScopedPresent,
        totalAgain: groupAgain?.counts.total,
        detailResolved: detail !== null && detail?.trackingNumber === firstTracking,
      };
    });

    assert.equal(result.stillHiddenWasNull, true, 'must stay hidden from Transactions until actually booked');
    // total = validRows (10, base/no-detail) + 1 promoted ready + 1 needs-review = 12
    assert.equal(result.total, 12, 'booked total must be validRows + promoted-ready + needs-review, not just validRows');
    assert.equal(result.transactionCount, 12, 'every counted transaction must be a real, individually resolvable row');
    assert.ok(result.recipients.includes('Test Ready Recipient'), 'the promoted Ready row\'s real data must thread through to the Transaction');
    assert.ok(result.recipients.includes('Test Review Recipient'), 'the Needs-review row is still bookable and must also become a real Transaction');
    assert.equal(result.allScopedPresent, true, 'booked batch transactions must be scoped correctly by subaccount id');
    assert.equal(result.totalAgain, 12, 'repeated reads must be idempotent, never re-synthesizing duplicates');
    assert.equal(result.detailResolved, true, 'a booked bulk transaction must resolve on its own detail page, not 404');
  });

  it('reopening an awaiting-payment batch for payment shows the FULL booked total, not just the base valid-row count', async () => {
    const id = await page.evaluate(async () => {
      const bulkSvc = await import('/src/app/services/bulkUploadService.ts');
      const id = 'TEST-LIFECYCLE-003';
      const account = { accountId: 'acme-corporation', accountName: 'Acme Corporation', accountType: 'subaccount' };
      const record = bulkSvc.createUploadRecord(id, 'lifecycle_test3.xlsx', 'standard', 'pickup', 'needs-review', account);
      record.totalRows = 12;
      record.validRows = 10;
      record.errorRows = 2;
      bulkSvc.addUpload(record);
      bulkSvc.setBatchRowsState(id, {
        readyRows: [{ key: '1', recipientName: 'Promoted Ready', mobileNumber: '', itemName: 'Item', location: 'Makati City, Metro Manila', declaredValue: '500', pouchSize: 'SMALL', referenceId: '', cod: 'No' }],
        reviewRows: [{ key: '2', recipientName: 'Still Review', mobileNumber: '', itemName: 'Item', location: 'Pasig City, Metro Manila', declaredValue: '500', pouchSize: 'SMALL', referenceId: '', cod: 'No' }],
      });
      bulkSvc.updateUploadStatus(id, 'awaiting-payment');
      return id;
    });

    await page.goto(`${server.base}/dashboard/bulk-uploader/summary/${id}`, { waitUntil: 'networkidle' });
    const bodyText = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);
    // 10 base + 1 promoted-ready + 1 needs-review = 12 bookings ready for payment.
    assert.ok(bodyText.includes('12 bookings ready for payment'), `expected the full booked total (12) in the payment-mode summary, got: ${bodyText}`);
  });
});

describe('Completed Batch Details — same records as the main Transactions page', () => {
  it('renders the aligned column set and links rows into Transactions, using real seeded batch data', async () => {
    await page.goto(`${server.base}/dashboard/bulk-uploader/completed/UPLOAD-2026-05-18-002`, { waitUntil: 'networkidle' });

    const headers = await page.$$eval('table thead th', (ths) => ths.map((th) => th.textContent?.trim()));
    assert.deepEqual(headers, ['Tracking Number', 'Recipient', 'Destination', 'Service Type', 'Status', 'Date']);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(!bodyText.includes('Item Name'), 'Item Name must be removed from the completed-batch transaction table');
    assert.ok(bodyText.includes('GGX-2024-89239'), 'expected the real seeded transaction linked to this batch to render');

    await page.click('table tbody tr');
    await page.waitForURL('**/dashboard/transactions/GGX-2024-89239', { timeout: 10_000 });
  });
});
