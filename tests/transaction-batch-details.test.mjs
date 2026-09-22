/**
 * Regression coverage for the Transactions → Deliveries → By Batch UX
 * enhancement: a dedicated Batch Details page
 * (`/dashboard/transactions/batches/:batchId`, `TransactionBatchDetails.tsx`)
 * replaces the old inline accordion-expand / capped-sample-preview behavior on
 * the By Batch list.
 *
 * Covers: the By Batch list itself (no accordion, no inline preview, a "View
 * batch" action), the dedicated route (direct load, invalid id, account
 * isolation), and the paginated/searchable transactions service
 * (`getTransactionBatchTransactions` in `transactionService.ts`).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5202;

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

describe('By Batch list — compact cards, no inline expansion', () => {
  it('has no expand/collapse affordance, no inline transaction table, and no capped-sample messaging', async () => {
    await page.goto(`${server.base}/dashboard/transactions?tab=batches`, { waitUntil: 'networkidle' });
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(bodyText.includes('UPLOAD-2026-05-31-001'), 'expected a seeded batch card to render');
    assert.ok(!bodyText.includes('Use Export for the full list'), 'the old capped-sample messaging must be gone');
    assert.ok(!/Showing \d+ of [\d,]+ transactions in this batch/.test(bodyText), 'the old "Showing N of X" per-batch preview copy must be gone');

    // No inline per-batch transaction table exists on this page (batch cards
    // are compact summaries only — every real transaction row lives on the
    // dedicated Batch Details page instead).
    const inlineTrackingCells = await page.evaluate(() =>
      [...document.querySelectorAll('td')].some((td) => /^GGX-\d{4}-\d+$/.test(td.textContent?.trim() ?? ''))
    );
    assert.equal(inlineTrackingCells, false, 'no individual transaction rows should render inline on the By Batch list');

    const viewBatchButtons = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((el) => el.textContent?.trim() === 'View batch').length
    );
    assert.ok(viewBatchButtons > 0, 'expected at least one explicit "View batch" action');
  });

  it('clicking a batch card (or its "View batch" action) opens the dedicated Batch Details route via client-side navigation', async () => {
    await page.goto(`${server.base}/dashboard/transactions?tab=batches`, { waitUntil: 'networkidle' });
    const card = page.locator('text=UPLOAD-2026-05-31-001').first();
    await card.waitFor({ state: 'visible' });
    await card.click();
    await page.waitForURL('**/dashboard/transactions/batches/UPLOAD-2026-05-31-001', { timeout: 10_000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(bodyText.includes('may31_express_orders.xlsx'), 'expected the batch detail header to render');
  });
});

describe('Batch Details page — states', () => {
  it('shows a clear not-found state for a nonexistent batch id (direct route load)', async () => {
    await page.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-DOES-NOT-EXIST`, { waitUntil: 'networkidle' });
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(bodyText.includes('This batch could not be found'), 'expected the not-found state');
  });

  it('renders the full column set (Tracking Number | Recipient | Destination | Source | Service Type | Status | Date | Actions), the summary stats, and a working Back to Transactions action', async () => {
    await page.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-2026-05-31-001`, { waitUntil: 'networkidle' });
    const headers = await page.$$eval('table thead th', (ths) => ths.map((th) => th.textContent?.trim()));
    assert.deepEqual(headers, ['Tracking Number', 'Recipient', 'Destination', 'Source', 'Service Type', 'Status', 'Date', 'Actions']);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(bodyText.includes('247'), 'expected the reported total (247) to render in the summary stats');
    assert.ok(bodyText.includes('% delivered'), 'expected a delivery progress readout');

    await page.click('text=Back to Transactions');
    await page.waitForURL('**/dashboard/transactions?tab=batches', { timeout: 10_000 });
    const backBodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(backBodyText.includes('UPLOAD-2026-05-31-001'), 'Back to Transactions must land on the By Batch view, not All Transactions');
  });

  it('a generated filler row (beyond the batch\'s small concrete sample) still resolves on its own transaction detail page — never a dead "View" link', async () => {
    await page.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-2026-05-31-001`, { waitUntil: 'networkidle' });
    // Row 2+ on page 1 of this batch (247 total, 1 concrete seed row) is generated filler.
    const secondRow = page.locator('table tbody tr').nth(1);
    const fillerTracking = await secondRow.locator('td').first().textContent();
    await secondRow.click();
    await page.waitForURL(`**/dashboard/transactions/${fillerTracking?.trim()}`, { timeout: 10_000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.ok(!bodyText.toLowerCase().includes('not found'), `expected a real detail page for generated tracking ${fillerTracking}, got: ${bodyText.slice(0, 200)}`);
    assert.ok(bodyText.includes(fillerTracking?.trim() ?? ''), 'expected the detail page to show the same tracking number');
  });

  it('search narrows the table and shows a no-results state for a non-matching query', async () => {
    await page.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-2026-05-31-001`, { waitUntil: 'networkidle' });
    await page.fill('input[placeholder*="Search by tracking number"]', 'zzz-no-such-row-zzz');
    await page.waitForSelector('text=No transactions match');
  });

  it('an empty batch (zero total) shows an empty-batch state instead of an empty table with no messaging', async () => {
    const emptyId = await page.evaluate(async () => {
      const bulkSvc = await import('/src/app/services/bulkUploadService.ts');
      const id = 'TEST-EMPTY-BATCH-001';
      const account = { accountId: 'acme-corporation', accountName: 'Acme Corporation', accountType: 'subaccount' };
      const record = bulkSvc.createUploadRecord(id, 'empty_batch.xlsx', 'standard', 'pickup', 'needs-review', account);
      record.totalRows = 0;
      record.validRows = 0;
      record.errorRows = 0;
      bulkSvc.addUpload(record);
      bulkSvc.updateUploadStatus(id, 'completed');
      return id;
    });
    await page.goto(`${server.base}/dashboard/transactions/batches/${emptyId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=This batch has no transactions.');
  });
});

describe('Batch Details page — account isolation', () => {
  it('a manager cannot open another subaccount\'s batch via a direct URL (resolves as not-found, never a data leak)', async () => {
    const { browser: mbrowser, page: mpage } = await signIn(server.base, 'manager');
    try {
      // The manager fixture is scoped to acme-luzon; UPLOAD-2026-05-31-001 belongs to acme-corporation.
      await mpage.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-2026-05-31-001`, { waitUntil: 'networkidle' });
      const bodyText = await mpage.evaluate(() => document.body.innerText);
      assert.ok(bodyText.includes('This batch could not be found'), 'cross-tenant batch access must render as not-found');
      assert.ok(!bodyText.includes('may31_express_orders.xlsx'), 'must never render another subaccount\'s batch data');
    } finally {
      await mbrowser.close();
    }
  });

  it('a manager CAN open their own subaccount\'s batch', async () => {
    const { browser: mbrowser, page: mpage } = await signIn(server.base, 'manager');
    try {
      // UPLOAD-2026-05-31-002 belongs to acme-luzon, matching the manager fixture's scope.
      await mpage.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-2026-05-31-002`, { waitUntil: 'networkidle' });
      const bodyText = await mpage.evaluate(() => document.body.innerText);
      assert.ok(bodyText.includes('may31_luzon_am.xlsx'), 'expected the manager\'s own subaccount batch to render');
    } finally {
      await mbrowser.close();
    }
  });
});

describe('Batch Details page — mobile layout', () => {
  it('renders correctly at 375px with no horizontal page overflow', async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${server.base}/dashboard/transactions/batches/UPLOAD-2026-05-31-001`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=may31_express_orders.xlsx');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `expected no horizontal page overflow at 375px, got ${overflow}px`);
    await page.setViewportSize({ width: 1280, height: 900 });
  });
});

describe('getTransactionBatchTransactions — pagination, search, and generated large-batch rows', () => {
  it('paginates a large reported batch without materializing more than one page, and search/status filters narrow correctly', async () => {
    const result = await page.evaluate(async () => {
      const txnSvc = await import('/src/app/services/transactionService.ts');

      // UPLOAD-2026-05-18-003 has reportedCounts.total = 198 (a single unambiguous
      // seed batch) but only 1 concrete seed row — the rest must come from the
      // generated filler, never fully materialized in memory at once.
      const batchId = 'UPLOAD-2026-05-18-003';

      const page1 = await txnSvc.getTransactionBatchTransactions(batchId, { page: 1, pageSize: 50 });
      const page2 = await txnSvc.getTransactionBatchTransactions(batchId, { page: 2, pageSize: 50 });
      const lastPage = await txnSvc.getTransactionBatchTransactions(batchId, { page: 4, pageSize: 50 });

      const uniqueAcrossPages = new Set([...page1.items, ...page2.items].map((r) => r.tracking)).size;

      const searchResult = await txnSvc.getTransactionBatchTransactions(batchId, { page: 1, pageSize: 50, search: 'GGX-2024-89240' });
      const statusResult = await txnSvc.getTransactionBatchTransactions(batchId, { page: 1, pageSize: 500, status: 'delivered' });
      const noMatch = await txnSvc.getTransactionBatchTransactions(batchId, { page: 1, pageSize: 50, search: 'zzz-no-such-row-zzz' });

      const notFound = await txnSvc.getTransactionBatchTransactions('UPLOAD-DOES-NOT-EXIST', { page: 1, pageSize: 50 });

      return {
        total: page1.total,
        page1Count: page1.items.length,
        page2Count: page2.items.length,
        lastPageCount: lastPage.items.length,
        uniqueAcrossPages,
        searchTotal: searchResult.total,
        searchFirstTracking: searchResult.items[0]?.tracking,
        statusAllDelivered: statusResult.items.every((r) => r.status === 'delivered'),
        statusCount: statusResult.items.length,
        noMatchCount: noMatch.items.length,
        notFound,
      };
    });

    assert.equal(result.total, 198, 'expected the batch\'s backend-reported total');
    assert.equal(result.page1Count, 50, 'a full page should return exactly pageSize rows');
    assert.equal(result.page2Count, 50, 'the second page should also be full');
    assert.equal(result.lastPageCount, 48, '198 total / 50 per page leaves a partial 4th page of 48');
    assert.equal(result.uniqueAcrossPages, 100, 'page 1 and page 2 must not overlap or repeat rows');
    assert.equal(result.searchTotal, 1, 'searching by the real seeded tracking number should find exactly it');
    assert.equal(result.searchFirstTracking, 'GGX-2024-89240', 'search must match by tracking number');
    assert.ok(result.statusAllDelivered, 'a status filter must only return rows of that status');
    assert.ok(result.statusCount > 0, 'expected at least one delivered row (real + generated) in this batch');
    assert.equal(result.noMatchCount, 0, 'a non-matching search should return zero rows, not an error');
    assert.equal(result.notFound, null, 'a nonexistent batch id must resolve to null, not throw');
  });

  it('enforces the same account-scope isolation as getTransactionBatches/getTransactionBatchById', async () => {
    const result = await page.evaluate(async () => {
      const txnSvc = await import('/src/app/services/transactionService.ts');
      const outOfScope = await txnSvc.getTransactionBatchTransactions('UPLOAD-2026-05-31-001', { page: 1, pageSize: 50 }, 'acme-luzon');
      const inScope = await txnSvc.getTransactionBatchTransactions('UPLOAD-2026-05-31-001', { page: 1, pageSize: 50 }, 'acme-corporation');
      return { outOfScope, inScopeTotal: inScope?.total };
    });
    assert.equal(result.outOfScope, null, 'a batch outside the given subaccount scope must resolve to null');
    assert.equal(result.inScopeTotal, 247, 'the matching subaccount scope must still resolve the batch');
  });

  it('paginateBatchTransactions (sync, pre-resolved group) matches getTransactionBatchTransactions (async, re-resolves) exactly, avoiding a redundant batch resolution per page/search change', async () => {
    const result = await page.evaluate(async () => {
      const txnSvc = await import('/src/app/services/transactionService.ts');
      const group = await txnSvc.getTransactionBatchById('UPLOAD-2026-05-18-003');
      const sync = txnSvc.paginateBatchTransactions(group, { page: 2, pageSize: 50, search: '', status: 'all' });
      const async_ = await txnSvc.getTransactionBatchTransactions('UPLOAD-2026-05-18-003', { page: 2, pageSize: 50 });
      return { syncTrackings: sync.items.map((r) => r.tracking), asyncTrackings: async_.items.map((r) => r.tracking) };
    });
    assert.deepEqual(result.syncTrackings, result.asyncTrackings, 'the pre-resolved-group path and the re-resolving path must produce identical rows');
  });
});

describe('getTransactionById — resolves generated Batch Details filler rows', () => {
  it('resolves a valid generated filler tracking into a real, detail-page-ready Transaction', async () => {
    const result = await page.evaluate(async () => {
      const txnSvc = await import('/src/app/services/transactionService.ts');
      // UPLOAD-2026-05-31-001 has 1 concrete real row + 246 generated filler rows.
      const pageResult = await txnSvc.getTransactionBatchTransactions('UPLOAD-2026-05-31-001', { page: 1, pageSize: 5 });
      const fillerTracking = pageResult.items[1].tracking; // index 0 is the one real row; 1+ is generated
      const detail = await txnSvc.getTransactionById(fillerTracking);
      return { fillerTracking, resolved: detail !== null, matches: detail?.trackingNumber === fillerTracking, hasBatch: detail?.batch?.batchId === 'UPLOAD-2026-05-31-001' };
    });
    assert.ok(result.resolved, `expected ${result.fillerTracking} to resolve via getTransactionById`);
    assert.ok(result.matches, 'the resolved transaction must carry the same tracking number');
    assert.ok(result.hasBatch, 'the resolved transaction must be linked back to its originating batch');
  });

  it('rejects an out-of-range or bogus filler-shaped tracking number (never fabricates a row past the reported total)', async () => {
    const result = await page.evaluate(async () => {
      const txnSvc = await import('/src/app/services/transactionService.ts');
      // UPLOAD-2026-05-31-001 has only 247 total rows — index 99999 is far out of range.
      const outOfRange = await txnSvc.getTransactionById('UPLOAD-2026-05-31-001-99999');
      const unknownBatch = await txnSvc.getTransactionById('UPLOAD-DOES-NOT-EXIST-00001');
      return { outOfRange, unknownBatch };
    });
    assert.equal(result.outOfRange, null, 'an index beyond the batch\'s reported total must not resolve');
    assert.equal(result.unknownBatch, null, 'a filler-shaped tracking for a nonexistent batch must not resolve');
  });
});
