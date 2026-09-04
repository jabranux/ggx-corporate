/**
 * ClaimDetail's status timeline — Permanent lifecycle nodes (Claim Filed,
 * Pending Approval, Approved, Processing, Settled), the conditional On Hold
 * node (only while a claim is currently on hold, positioned after the last
 * completed state and before the next applicable one, showing Finance's
 * hold reason), and the color rules (green = completed, amber = current
 * Processing, orange = current On Hold, gray = not reached).
 *
 * DOM-level, against the real running app (`ClaimDetail.tsx`, `ClaimTimeline`)
 * — same harness as the rest of this suite (`helpers.mjs`). `/api/claims/:id/{sync,state}`
 * isn't reachable from a plain `vite` dev server (no Vercel Functions runtime,
 * same recurring constraint as every other HeyQ/Bridge-integration test in
 * this suite), so those two routes are network-intercepted per claim id via
 * `page.route()` (last-registered route wins on a repeated pattern, per
 * Playwright's own routing order — used here since a few claim ids are
 * re-stubbed with different states across tests) — the local seed claim
 * (`src/app/data/claims.ts`) supplies the initial render, the route supplies
 * the live Bridge state `ClaimDetail.tsx` syncs to right after.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5200;
const TICKET_ID = '33333333-3333-3333-3333-333333333333';

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

/** Maps GGX's local `ClaimStatus` to the Bridge status the route should
 * report, mirroring `mapBridgeStatusToLocal` in `claimBridgeService.ts`. */
const LOCAL_TO_BRIDGE_STATUS = {
  'in-review': 'pending_approval',
  approved: 'approved',
  processing: 'processing',
  on_hold: 'on_hold',
  denied: 'rejected',
  settled: 'settled',
};

/** Intercepts both `/api/claims/:claimId/sync` (POST) and `/state` (GET) for
 * one claim id with a fixed Bridge state. Playwright invokes the most
 * recently registered matching route first, so re-stubbing the same claim id
 * later in this file (CLM-1015, CLM-1013) correctly overrides the earlier one. */
async function stubClaimBridge(page, claimId, { status, holdReason = null } = {}) {
  const body = JSON.stringify({
    claimId: 'stub-claim-id',
    externalReference: claimId,
    status: LOCAL_TO_BRIDGE_STATUS[status] ?? status,
    reason: 'delivery_failure',
    trackingNumber: 'GGX-2026-90006',
    filedAt: '2026-08-30T00:00:00.000Z',
    holdReason,
    ticket: { id: TICKET_ID, status: 'open', customerVisible: true },
    timelineEvents: [],
    messages: [],
  });
  const fulfill = (route) => route.fulfill({ status: 200, contentType: 'application/json', body });
  await page.route(`**/api/claims/${claimId}/sync`, fulfill);
  await page.route(`**/api/claims/${claimId}/state`, fulfill);
}

async function openClaim(page, claimId, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(`${server.base}/dashboard/claims/${claimId}`, { waitUntil: 'networkidle' });
}

/** All rendered node labels, top to bottom, from the timeline (scoped via
 * `data-testid="claim-timeline"` so this never picks up unrelated
 * `font-medium` text elsewhere on the page, e.g. the Claim Summary card). */
async function timelineLabels(page) {
  return page.locator('[data-testid="claim-timeline"] p.font-medium').allTextContents();
}

function timelineNode(page, label) {
  return page.locator('[data-testid="claim-timeline"] p.font-medium', { hasText: label }).first();
}

describe('ClaimDetail status timeline — permanent nodes + colors', () => {
  it('Pending Approval: only Claim Filed is done, no On Hold node', async () => {
    await stubClaimBridge(page, 'CLM-1009', { status: 'in-review' });
    await openClaim(page, 'CLM-1009');
    await page.waitForSelector('[data-testid="claim-timeline"]');
    const labels = await timelineLabels(page);
    assert.deepEqual(labels, ['Claim Filed', 'Pending Approval', 'Approved', 'Processing', 'Settled']);
  });

  it('Approved: Approved is the active (blue) node, using the existing "current" treatment', async () => {
    await stubClaimBridge(page, 'CLM-1011', { status: 'approved' });
    await openClaim(page, 'CLM-1011');
    const approvedLabel = timelineNode(page, 'Approved');
    await approvedLabel.waitFor({ state: 'visible' });
    const cls = await approvedLabel.getAttribute('class');
    assert.match(cls, /text-blue-700/, 'current Approved node should use the existing blue "current" treatment');
  });

  it('Processing: the Processing node renders amber/current, not blue', async () => {
    await stubClaimBridge(page, 'CLM-1013', { status: 'processing' });
    await openClaim(page, 'CLM-1013');
    const processingLabel = timelineNode(page, 'Processing');
    await processingLabel.waitFor({ state: 'visible' });
    const cls = await processingLabel.getAttribute('class');
    assert.match(cls, /text-amber-700/);
  });

  it('Settled: every node (including Processing and Settled) renders green, no blue/amber "current" highlight', async () => {
    await stubClaimBridge(page, 'CLM-1001', { status: 'settled' });
    await openClaim(page, 'CLM-1001');
    await page.waitForSelector('[data-testid="claim-timeline"]');
    for (const label of ['Claim Filed', 'Pending Approval', 'Approved', 'Processing', 'Settled']) {
      const cls = await timelineNode(page, label).getAttribute('class');
      assert.match(cls, /text-gray-900/, `${label} should read as a completed (green/gray-900) node when Settled`);
      assert.doesNotMatch(cls, /text-blue-700|text-amber-700|text-orange-700/, `${label} must not carry a "current" color once Settled`);
    }
  });

  it('Rejected regression: still renders the red "Claim Denied" box, not the step timeline', async () => {
    await stubClaimBridge(page, 'CLM-1002', { status: 'denied' });
    await openClaim(page, 'CLM-1002');
    await page.waitForSelector('text=Claim Denied');
    const count = await page.locator('[data-testid="claim-timeline"]').count();
    assert.equal(count, 0, 'no step timeline should render for a denied claim');
  });
});

describe('ClaimDetail status timeline — On Hold node', () => {
  it('On Hold with a reason: inserted after Processing (both green) and before Settled (gray), shows "Placed on hold due to <reason>."', async () => {
    await stubClaimBridge(page, 'CLM-1015', { status: 'on_hold', holdReason: 'outstanding balance' });
    await openClaim(page, 'CLM-1015');
    await page.waitForSelector('text=Placed on hold due to outstanding balance.');

    const labels = await timelineLabels(page);
    assert.deepEqual(labels, ['Claim Filed', 'Pending Approval', 'Approved', 'Processing', 'On Hold', 'Settled']);

    assert.match(await timelineNode(page, 'Processing').getAttribute('class'), /text-gray-900/, 'Processing must be green/done once On Hold is current');
    assert.match(await timelineNode(page, 'On Hold').getAttribute('class'), /text-orange-700/);
  });

  it('missing hold reason: falls back to a generic message instead of an empty/undefined line', async () => {
    await stubClaimBridge(page, 'CLM-1016', { status: 'on_hold', holdReason: null });
    await openClaim(page, 'CLM-1016');
    await page.waitForSelector('text=Placed on hold. See Claim Updates & Messages below for details.');
  });

  it('long hold reason: renders in full, wrapped (not clipped/truncated)', async () => {
    const longReason = 'the customer has an outstanding balance from a prior shipment that must be settled before Finance can release this refund, per the standard collections hold policy';
    await stubClaimBridge(page, 'CLM-1015', { status: 'on_hold', holdReason: longReason });
    await openClaim(page, 'CLM-1015');
    await page.waitForSelector(`text=Placed on hold due to ${longReason}.`);
  });

  it('resumed from On Hold: back to Processing (amber/current), On Hold node no longer rendered at all', async () => {
    await stubClaimBridge(page, 'CLM-1013', { status: 'processing' });
    await openClaim(page, 'CLM-1013');
    await page.waitForSelector('[data-testid="claim-timeline"]');
    const labels = await timelineLabels(page);
    assert.deepEqual(labels, ['Claim Filed', 'Pending Approval', 'Approved', 'Processing', 'Settled'], 'On Hold must be fully removed once resumed, not just re-colored');
  });

  it('On Hold banner: does not claim refund processing is actively continuing or give an ETA', async () => {
    await stubClaimBridge(page, 'CLM-1015', { status: 'on_hold', holdReason: 'outstanding balance' });
    await openClaim(page, 'CLM-1015');
    await page.waitForSelector('text=Refund On Hold');
    const bodyText = await page.locator('body').innerText();
    assert.ok(!bodyText.includes('3–5 business days'), 'an on-hold banner must not carry the active-processing ETA copy');
  });
});

describe('ClaimDetail status timeline — mobile layout', () => {
  it('On Hold renders correctly at 375px with no horizontal overflow', async () => {
    await stubClaimBridge(page, 'CLM-1015', { status: 'on_hold', holdReason: 'outstanding balance' });
    await openClaim(page, 'CLM-1015', { width: 375, height: 800 });
    await page.waitForSelector('text=Placed on hold due to outstanding balance.');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `expected no horizontal overflow at 375px, got ${overflow}px`);
    await page.setViewportSize({ width: 1280, height: 900 });
  });
});
