/**
 * transactionService — frontend-facing transaction domain facade.
 *
 * ── Architecture intent ────────────────────────────────────────────────────
 * This service is a FRONTEND FACADE shaped around what the Transactions UI
 * needs. It is NOT a direct OMS client and does NOT map 1:1 to any single
 * backend system. In production, the GGX Corporate frontend should call a
 * GGX Corporate API / BFF / API gateway, which in turn aggregates and shapes
 * data from the appropriate source systems:
 *
 *   UI → frontend service layer → GGX Corporate API/BFF → source systems
 *
 * Likely source-system ownership behind this facade:
 *   • OMS                       — order/transaction records, official tx status
 *   • fulfillment / FarEye-linked systems — rider/courier assignment, fulfillment status
 *   • FTX                       — fees, earnings, settlements, ledgers, official finance values
 *   • Cashinator                — payment processing + payment status
 *   • Contract Manager          — account/subaccount/contract context
 *   • AMS                       — location data
 *   • NS                        — notification events
 *   • Support/Claims systems    — related tickets and claims
 *
 * ── Business-computation rule ──────────────────────────────────────────────
 * The GGX Corporate frontend must NOT be the source of truth for business
 * math or operational decisions. It may only do PRESENTATION logic: filtering,
 * sorting, grouping, formatting, UI counts, permission-based show/hide, and
 * form-completeness checks.
 *
 * Official values — shipping/COD/protection fees, fuel surcharge, earnings,
 * settlements, ledger totals, payout amounts, payment status, SLA hit/miss,
 * delivery efficiency, RTS rate, claim approval amounts, fulfillment status,
 * official transaction status, billing balances, penalties, remittances — must
 * come from source systems (FTX, OMS, Cashinator, …) via the BFF.
 *
 * The mock values returned here are SAMPLE precomputed fields that stand in for
 * backend-provided data. They are intentionally treated as if the backend
 * supplied them, NOT computed as frontend source-of-truth.
 *
 * All functions are async to match a real API contract.
 * Currently backed by `data/transactions.ts` (static mock seed).
 *
 * Note: `subaccount` on the Transaction type is currently a display name string.
 * Full ID-based subaccount matching is deferred — the subaccount field on the
 * transaction row stores the name, not the canonical id. Use the `accountId`
 * field on `TransactionBatch` (batch-origin transactions) for ID-based lookups.
 *
 * Future API endpoints (shaped by the BFF, not direct source systems):
 *   GET /transactions              → getTransactions
 *   GET /transactions/:id          → getTransactionById
 *   GET /transactions?subaccount=X → getTransactionsBySubaccountId
 *   GET /transactions/batches      → getTransactionBatches
 *   GET /settlements/:id/transactions → getTransactionsBySettlementId
 */

import {
  transactions,
  deliveries,
  statusConfig,
  getTransactionByTracking,
  subaccountDisplayLabel,
  sourceTypeLabel,
  serviceTypeLabel,
  bookingMethodGroup,
  SERVICE_TYPE_SHORT_LABEL,
  SOURCE_TYPE_LABEL,
  BOOKING_METHOD_LABEL,
  BOOKING_METHOD_ANALYTICS_LABEL,
  SOURCE_TYPE_ORDER,
  BOOKING_METHOD_ORDER,
  type Transaction,
  type TransactionSummary,
  type TransactionStatus,
  type TransactionSource,
  type TransactionBatch,
  type DeliveryServiceType,
  type SourceType,
  type BookingMethod,
  type OrderAttribution,
  type Party,
} from '../data/transactions';
import { getAccountIdByName } from '../data/accounts';
import { getSettlement } from '../data/earnings';
import type { SettlementTransaction } from '../data/earnings';
import {
  getOnDemandProgress,
  deliveryStageFromStatus,
  OD_STAGE_DEFS,
  type OnDemandProgress,
  type OnDemandDeliveryStage,
} from '../data/onDemandDelivery';
import {
  acceptedOrders,
  buildTransactionFromOrder,
  getOrderByTracking,
} from '../data/storefrontOrders';
import {
  getSessionUploads,
  getBatchRowsState,
  getSpreadsheetBatchRows,
  buildBatchRowFiller,
  spreadsheetRowToBatchRowSnapshot,
  BATCH_ROW_SAMPLE_FILLER,
  type UploadRecord,
  type BatchRowSnapshot,
} from '../data/bulkUploads';

export type { Transaction, TransactionSummary, TransactionStatus, TransactionSource, TransactionBatch, DeliveryServiceType, SourceType, BookingMethod, OrderAttribution, OnDemandProgress, OnDemandDeliveryStage };

/**
 * On-Demand live delivery progress (re-exported for UI consumers). Derives the
 * courier-style stage stepper + mocked ETA + rider map position from a granular
 * delivery stage. Demo / presentation only — dispatch status and real ETAs are
 * backend-owned.
 */
export { getOnDemandProgress, OD_STAGE_DEFS };

/**
 * Resolve OD delivery progress for a transaction. Storefront-accepted orders
 * carry an explicit granular delivery stage; existing seed OD transactions fall
 * back to a stage derived from their coarse status (with a failed/returned
 * exception marker). The two status axes — buyer order acceptance vs delivery
 * progress — stay separate; this only reads the delivery side.
 */
export function resolveOnDemandProgress(tx: Transaction): OnDemandProgress {
  const order = getOrderByTracking(tx.trackingNumber);
  if (order?.deliveryStage) return getOnDemandProgress(order.deliveryStage);
  const exception = tx.status === 'failed' ? 'failed' : tx.status === 'returned' ? 'returned' : undefined;
  return getOnDemandProgress(deliveryStageFromStatus(tx.status), { exception });
}

// ── Synthesized storefront-order delivery transactions ─────────────────────────
// Accepted storefront orders "reveal" a delivery transaction. We synthesize these
// on demand (rather than mutate the static seed) so the list, detail, and public
// tracking surfaces resolve them by tracking number alongside seed transactions.

function synthesizedTransactions(): Transaction[] {
  return acceptedOrders()
    .map(buildTransactionFromOrder)
    .filter((t): t is Transaction => !!t);
}

// ── Synthesized Bulk Upload batch transactions ─────────────────────────────
// A batch's "Ready to book" / "Needs review" rows are validated upload rows,
// NOT transactions — see docs/context/bulk-booking.md. A real Transaction is
// only created once a batch is actually processed/booked (Bulk Upload's
// Complete Booking / Continue to payment step marks the upload record
// `awaiting-payment` or `completed`). Rather than maintain a second,
// hand-synced transaction list, booked batches are synthesized on demand from
// the upload record + the SAME live row classification the Review page itself
// produces (`getBatchRowsState`/`getSpreadsheetBatchRows`) — mirroring the
// existing `synthesizedTransactions()` pattern for accepted storefront orders.

const BULK_TX_SENDER: Party = {
  name: 'GGX Corporate Warehouse',
  contactNumber: '+63 917 000 1234',
  address: 'GGX Fulfillment Hub, Bonifacio Global City, Taguig',
};

const SERVICE_TYPE_BY_UPLOAD_MODE: Record<UploadRecord['uploadMode'], DeliveryServiceType> = {
  standard: 'standard',
  'same-day': 'same_day',
  'on-demand': 'on_demand',
};

/**
 * The full set of concrete rows for a batch: real edited rows first (from the
 * SAME live state the Review page produced — see `data/bulkUploads.ts`), then
 * shared sample filler for the base valid-row count that has no per-row detail.
 *
 * File uploads: `validRows` is the base "no issues from the start" count —
 * rows promoted from Fixes/Needs review are ADDITIONAL on top of it (mirrors
 * `BulkUploadSummary.tsx`'s `totalValidCount = validBaseCount + readyFromFlagged
 * + reviewList.length`), so the filler count is `validRows` unconditionally.
 * In-app spreadsheet batches have no separate fix/review pool — `validRows` IS
 * the total, so captured rows fill INTO it rather than adding to it.
 */
function bulkBatchRowSnapshots(record: UploadRecord): BatchRowSnapshot[] {
  if (record.source === 'spreadsheet') {
    const captured = getSpreadsheetBatchRows(record.id).map(spreadsheetRowToBatchRowSnapshot);
    return [...captured, ...buildBatchRowFiller(record.validRows - captured.length)];
  }
  const { readyRows, reviewRows } = getBatchRowsState(record.id);
  return [...buildBatchRowFiller(record.validRows), ...readyRows, ...reviewRows];
}

/** Build the delivery Transactions a booked (awaiting-payment/completed) Bulk Upload batch reveals. */
function buildTransactionsFromBulkBatch(record: UploadRecord): Transaction[] {
  const serviceType = SERVICE_TYPE_BY_UPLOAD_MODE[record.uploadMode];
  const batch: TransactionBatch = {
    batchId: record.id,
    fileName: record.fileName,
    uploadedVia: 'bulk_upload',
    accountId: record.accountId,
    accountName: record.accountName,
  };
  const attribution: OrderAttribution = {
    accountScope: record.accountType,
    sourceType: 'bulk_upload',
    bookingMethod: record.source === 'spreadsheet' ? 'bulk_in_app_spreadsheet' : 'bulk_template_upload',
  };
  // Anchored to the same mock "today" the rest of the app uses (see
  // storefrontOrders.ts's nowStamp) so freshly-booked rows sort as most recent.
  const date = '2026-05-31';
  const datePart = record.id.replace(/^UPLOAD-/, '');

  return bulkBatchRowSnapshots(record).map((row, i) => {
    const declared = Number(row.declaredValue) || 0;
    const isCod = row.cod === 'Yes';
    return {
      trackingNumber: `GGX-${datePart}-${String(i + 1).padStart(4, '0')}`,
      destination: row.location || '—',
      type: serviceType === 'standard' ? 'Standard' : 'Express',
      serviceType,
      status: 'pending',
      date,
      subaccount: record.accountName,
      source: 'bulk_upload',
      attribution,
      createdAt: date,
      pickupDate: date,
      deliveryDate: '—',
      sender: BULK_TX_SENDER,
      recipient: { name: row.recipientName || 'Recipient', contactNumber: row.mobileNumber || '—', address: row.location || '—' },
      items: [{ name: row.itemName || 'Item', quantity: 1, description: 'Bulk Upload item', price: declared }],
      packaging: { size: row.pouchSize || 'SMALL', dimensions: '30cm x 20cm x 15cm', weight: '1 kg' },
      store: { name: record.fileName, url: '—' },
      fees: { serviceFee: 0, shippingFee: 120, protectionFee: 0, discount: 0, processingFee: 0 },
      payment: {
        method: isCod ? 'Cash on Delivery (COD)' : 'Prepaid',
        paidBy: isCod ? 'Recipient' : 'Sender',
        codAmount: isCod ? declared : 0,
      },
      timeline: [],
      batch,
    };
  });
}

/** Booked (awaiting-payment/completed) Bulk Upload batches, synthesized into real Transactions. */
function synthesizedBulkBatchTransactions(): Transaction[] {
  return getSessionUploads()
    .filter((r) => r.status === 'awaiting-payment' || r.status === 'completed')
    .flatMap(buildTransactionsFromBulkBatch);
}

function toSummary(t: Transaction): TransactionSummary {
  return {
    tracking: t.trackingNumber,
    recipient: t.recipient.name,
    destination: t.destination,
    status: t.status,
    type: t.type,
    serviceType: t.serviceType,
    date: t.date,
    subaccount: t.subaccount,
    source: t.source,
    shopifyStoreName: t.shopifyStoreName,
    sourceType: t.attribution.sourceType,
  };
}

/** Seed transactions + synthesized accepted-order deliveries + booked bulk batches (synthesized first). */
function allTransactions(): Transaction[] {
  return [...synthesizedTransactions(), ...synthesizedBulkBatchTransactions(), ...transactions];
}
function allSummaries(): TransactionSummary[] {
  return [...synthesizedTransactions().map(toSummary), ...synthesizedBulkBatchTransactions().map(toSummary), ...deliveries];
}

/** Attribution display helpers + label maps (re-exported for UI consumers). */
export { sourceTypeLabel, bookingMethodGroup, SOURCE_TYPE_LABEL, BOOKING_METHOD_LABEL };

/**
 * Service-type display helpers (re-exported for UI consumers). `serviceTypeLabel`
 * gives the full label; `SERVICE_TYPE_SHORT_LABEL` the compact form used in the
 * Type badge + Service Type filter options.
 */
export { serviceTypeLabel, SERVICE_TYPE_SHORT_LABEL };

/**
 * Subaccount column display label (re-exported for UI consumers). Shopify-sourced
 * transactions render as "{Subaccount Name} - Shopify"; the underlying value is
 * unchanged so filtering/scoping stays intact.
 */
export { subaccountDisplayLabel };

/** Resolve a transaction's subaccount name to its canonical account id. */
function txAccountId(tx: Transaction): string | undefined {
  return tx.batch?.accountId ?? getAccountIdByName(tx.subaccount);
}

/**
 * Presentation status mapping (status → label + badge variant). Re-exported so
 * UI consumers can style status without importing the data module directly.
 * This is display config, not a business value.
 */
export { statusConfig };

type StatusVariant = 'success' | 'info' | 'warning' | 'danger' | 'pending' | 'default';

export interface TransactionFilters {
  status?: TransactionStatus | 'all';
  type?: string;
  /** Delivery service type (Standard / Same-Day / On-Demand). */
  serviceType?: DeliveryServiceType | 'all';
  /** High-level Source (attribution). */
  sourceType?: SourceType | 'all';
  /** Subaccount display name (legacy; prefer `subaccountId` once migration is complete). */
  subaccountName?: string;
  /** Canonical subaccount id. If provided, takes precedence over `subaccountName`. */
  subaccountId?: string;
  search?: string;
}

/** Return the full transaction list, with optional filters applied. */
export async function getTransactions(
  filters?: TransactionFilters
): Promise<TransactionSummary[]> {
  let result = allSummaries();
  if (!filters) return result;

  const { status, type, serviceType, sourceType, subaccountName, subaccountId, search } = filters;

  if (status && status !== 'all') {
    result = result.filter((t) => t.status === status);
  }
  if (type && type !== 'all') {
    result = result.filter((t) => t.type.toLowerCase() === type.toLowerCase());
  }
  if (serviceType && serviceType !== 'all') {
    result = result.filter((t) => t.serviceType === serviceType);
  }
  if (sourceType && sourceType !== 'all') {
    result = result.filter((t) => t.sourceType === sourceType);
  }
  if (subaccountId && subaccountId !== 'all' && subaccountId !== 'main') {
    // Match via batch.accountId or the subaccount-name→id bridge, so manual,
    // Shopify-sourced, and storefront-order rows (no batch origin) are scoped too.
    const ids = new Set(
      allTransactions().filter((t) => txAccountId(t) === subaccountId).map((t) => t.trackingNumber)
    );
    result = result.filter((t) => ids.has(t.tracking));
  } else if (subaccountName && subaccountName !== 'all') {
    result = result.filter((t) => t.subaccount === subaccountName);
  }
  if (search && search.trim().length >= 2) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.tracking.toLowerCase().includes(q) ||
        t.recipient.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q)
    );
  }
  return result;
}

/** Return a single full transaction by tracking number, or null. */
export async function getTransactionById(
  trackingNumber: string
): Promise<Transaction | null> {
  const seed = getTransactionByTracking(trackingNumber);
  if (seed) return seed;
  // Fall back to a synthesized delivery from an accepted storefront order.
  const order = getOrderByTracking(trackingNumber);
  if (order) return buildTransactionFromOrder(order) ?? null;
  // Fall back to a synthesized Transaction from a booked Bulk Upload batch —
  // otherwise a freshly-booked batch's rows would be visible (and clickable)
  // in the Transactions list but 404 on their own detail page.
  const bulk = synthesizedBulkBatchTransactions().find((t) => t.trackingNumber === trackingNumber);
  if (bulk) return bulk;
  // Fall back to a generated Batch Details filler row (see
  // `getTransactionBatchTransactions`/`paginateBatchTransactions`) — a large
  // batch's rows beyond its small concrete sample must still resolve on their
  // own detail page (the table's "View" action links every row, not just the
  // concrete ones), exactly like a real seed/bulk row.
  const filler = parseFillerTracking(trackingNumber);
  if (filler) {
    const group = await getTransactionBatchById(filler.batchId);
    const fillerCount = group ? group.counts.total - group.transactions.length : 0;
    if (group && filler.fillerIndex >= 0 && filler.fillerIndex < fillerCount) {
      return fillerRowToTransaction(group, filler.fillerIndex, fillerStatusBuckets(group));
    }
  }
  return null;
}

/**
 * Return transaction summaries for a given subaccount.
 * Uses batch.accountId (canonical ID) where available, with a name fallback.
 */
export async function getTransactionsBySubaccountId(
  subaccountId: string
): Promise<TransactionSummary[]> {
  if (subaccountId === 'main') return allSummaries();

  // Match via batch origin OR the subaccount-name→id bridge, so batch, manual,
  // Shopify-sourced, and storefront-order rows for the subaccount are all included.
  const ids = new Set(
    allTransactions().filter((t) => txAccountId(t) === subaccountId).map((t) => t.trackingNumber)
  );
  return allSummaries().filter((d) => ids.has(d.tracking));
}

/**
 * Return the transaction list for a given settlement.
 * Maps settlement transaction records to a lightweight format.
 */
export async function getTransactionsBySettlementId(
  settlementId: string
): Promise<SettlementTransaction[]> {
  const settlement = getSettlement(settlementId);
  return settlement?.transactions ?? [];
}

/** Return recent transactions for a dashboard preview (newest first, capped). */
export async function getRecentTransactions(
  limit = 5,
  subaccountId?: string
): Promise<TransactionSummary[]> {
  const all = await getTransactions(
    subaccountId ? { subaccountId } : undefined
  );
  return all.slice(0, limit);
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export interface DashboardStats {
  /** Counts by status from the active seed (standalone sample — not the full business volume). */
  byStatus: Record<TransactionStatus, number>;
  total: number;
  /** Percentage of delivered out of total, rounded to one decimal. */
  successRate: number;
  /** Total COD collected across all transactions in the seed. */
  totalCod: number;
}

/**
 * Return delivery breakdown stats computed from the transaction seed.
 * These are used to drive the Delivery Performance card on the Dashboard.
 * In production, the BFF would supply pre-aggregated counts for the
 * selected period; the frontend must not own these aggregations.
 */
export async function getDashboardStats(subaccountId?: string): Promise<DashboardStats> {
  const subset = subaccountId && subaccountId !== 'main'
    ? transactions.filter(
        (t) => t.batch?.accountId === subaccountId || t.subaccount === subaccountId
      )
    : transactions;

  const byStatus = { delivered: 0, 'in-transit': 0, 'picked-up': 0, pending: 0, failed: 0, returned: 0, cancelled: 0 } as Record<TransactionStatus, number>;
  let totalCod = 0;
  for (const t of subset) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    totalCod += t.payment.codAmount;
  }
  const total = subset.length;
  const successRate = total > 0 ? Math.round((byStatus.delivered / total) * 1000) / 10 : 0;
  return { byStatus, total, successRate, totalCod };
}

// ─── Basic analytics (Dashboard) ───────────────────────────────────────────────
//
// Lightweight, presentation-only aggregates for the Dashboard's "Basic Analytics"
// section — distinct from the gated Advanced Data Analytics module (which owns
// efficiency / RTS / SLA metrics). Counts and groupings are derived here and
// treated as BACKEND-PROVIDED, consistent with getDashboardStats; the frontend is
// not the source of truth for business math.

export interface BasicAnalytics {
  /** Booking count per delivery service type (Standard / Same-Day / On-Demand). */
  serviceTypeMix: { key: DeliveryServiceType; label: string; count: number }[];
  /** Booking count per high-level Source (GoBenta vs Product Checkout kept separate). */
  sourceMix: { key: SourceType; label: string; count: number }[];
  /** Booking count per granular booking method (two bulk methods kept separate). */
  bookingMethodMix: { key: BookingMethod; label: string; count: number }[];
  /** Daily booking volume for the active period (oldest → newest). */
  dailyVolume: { date: string; count: number }[];
  /** Total bookings in the active period. */
  periodTotal: number;
  /** Status breakdown for the active period (drives filter-responsive KPI cards). */
  byStatus: Record<TransactionStatus, number>;
  /** Total COD for the active period. */
  totalCod: number;
  /** Delivery success rate for the active period (0–100, one decimal). */
  successRate: number;
}

/**
 * Return lightweight booking analytics, optionally scoped to a subaccount and/or
 * filtered by a rolling day window and service type. Service-type mix always lists
 * all three delivery tiers (zero included) so charts are stable across filter changes.
 *
 * `days` is a rolling window relative to the most recent date in the scoped dataset
 * (mock anchor) — not a wall-clock window — so presets show meaningful deltas even
 * when the seed data pre-dates today.
 */
export async function getBasicAnalytics(
  subaccountId?: string,
  options: { days?: number; serviceType?: DeliveryServiceType | 'all' } = {},
): Promise<BasicAnalytics> {
  const base = subaccountId && subaccountId !== 'main'
    ? transactions.filter(
        (t) => t.batch?.accountId === subaccountId || t.subaccount === subaccountId
      )
    : transactions;

  // Rolling window: anchor on the most recent date in the dataset so presets
  // produce visible differences even when seed data pre-dates today.
  let subset = base;
  if (options.days) {
    const sorted = base.map((t) => t.date).sort();
    const anchor = sorted[sorted.length - 1];
    if (anchor) {
      const anchorMs = new Date(anchor).getTime();
      const cutoffMs = anchorMs - (options.days - 1) * 86_400_000;
      const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
      subset = base.filter((t) => t.date >= cutoff);
    }
  }
  if (options.serviceType && options.serviceType !== 'all') {
    subset = subset.filter((t) => t.serviceType === options.serviceType);
  }

  const order: DeliveryServiceType[] = ['standard', 'same_day', 'on_demand'];
  const counts: Record<DeliveryServiceType, number> = { standard: 0, same_day: 0, on_demand: 0 };
  const byStatus = { delivered: 0, 'in-transit': 0, 'picked-up': 0, pending: 0, failed: 0, returned: 0, cancelled: 0 } as Record<TransactionStatus, number>;
  // Attribution breakdowns: source mix + granular booking-method mix.
  const sourceCounts = Object.fromEntries(SOURCE_TYPE_ORDER.map((k) => [k, 0])) as Record<SourceType, number>;
  const bmCounts = Object.fromEntries(BOOKING_METHOD_ORDER.map((k) => [k, 0])) as Record<BookingMethod, number>;
  let totalCod = 0;
  for (const t of subset) {
    counts[t.serviceType] = (counts[t.serviceType] ?? 0) + 1;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    sourceCounts[t.attribution.sourceType] += 1;
    bmCounts[t.attribution.bookingMethod] += 1;
    totalCod += t.payment.codAmount;
  }
  const serviceTypeMix = order.map((key) => ({
    key, label: SERVICE_TYPE_SHORT_LABEL[key], count: counts[key],
  }));
  const sourceMix = SOURCE_TYPE_ORDER.map((key) => ({
    key, label: SOURCE_TYPE_LABEL[key], count: sourceCounts[key],
  }));
  const bookingMethodMix = BOOKING_METHOD_ORDER.map((key) => ({
    key, label: BOOKING_METHOD_ANALYTICS_LABEL[key], count: bmCounts[key],
  }));

  const byDate = new Map<string, number>();
  for (const t of subset) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
  const dailyVolume = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  const periodTotal = subset.length;
  const successRate = periodTotal > 0 ? Math.round((byStatus.delivered / periodTotal) * 1000) / 10 : 0;
  return { serviceTypeMix, sourceMix, bookingMethodMix, dailyVolume, periodTotal, byStatus, totalCod, successRate };
}

// ─── Batch grouping ──────────────────────────────────────────────────────────
//
// The "By Batch" view groups bulk-upload-origin transactions. In production the
// batch grouping, counts, and roll-up status would be provided by the BFF
// (sourced from OMS for membership and fulfillment systems for status). The
// counts/status below are SAMPLE precomputed fields, not frontend source-of-truth.

/** Sample roll-up counts for a batch (backend-provided in production). */
export interface BatchCounts {
  total: number;
  delivered: number;
  inProgress: number;
  failed: number;
}

export interface TransactionBatchGroup {
  batch: TransactionBatch;
  /** Member transactions as lightweight summaries (link to detail by tracking). */
  transactions: TransactionSummary[];
  /** Precomputed sample roll-up — treat as backend-provided, not UI-computed. */
  counts: BatchCounts;
  /** Precomputed sample status label — treat as backend-provided. */
  status: { label: string; variant: StatusVariant };
  /** Display date for the batch (backend would provide an uploadedAt field). */
  uploadedDate: string;
}

/** Derive the display date from the batch id format `UPLOAD-YYYY-MM-DD-NNN`. */
function batchUploadedDate(batchId: string): string {
  const m = batchId.match(/UPLOAD-(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '—';
}

/** Roll-up status from a count breakdown (used for backend-reported counts). */
function rollupStatusFromCounts(c: BatchCounts): { label: string; variant: StatusVariant } {
  if (c.total === 0) return { label: 'Empty', variant: 'default' };
  if (c.delivered === c.total) return { label: 'Complete', variant: 'success' };
  if (c.inProgress > 0) return { label: 'In Progress', variant: 'info' };
  if (c.failed === c.total) return { label: 'Failed', variant: 'danger' };
  return { label: 'Partial', variant: 'warning' };
}

/**
 * Sample roll-up status derived from member statuses (stands in for backend value).
 * `failed` groups every terminal, non-successful outcome (delivery failed and
 * still moving through the return pipeline, fully returned, or cancelled) —
 * this rollup only distinguishes delivered / in-progress / not-successful, so
 * cancelled must land here rather than falling into `inProgress` by omission.
 */
function batchRollupStatus(items: Transaction[]): { label: string; variant: StatusVariant } {
  const total = items.length;
  const delivered = items.filter((t) => t.status === 'delivered').length;
  const failed = items.filter((t) => t.status === 'failed' || t.status === 'returned' || t.status === 'cancelled').length;
  const inProgress = total - delivered - failed;
  return rollupStatusFromCounts({ total, delivered, inProgress, failed });
}

/**
 * Return bulk-upload batches with member transactions and sample roll-up fields.
 * Optionally scoped to a single subaccount by canonical id (batch.accountId).
 * Sorted newest-first by batch id (date-encoded).
 */
export async function getTransactionBatches(
  subaccountId?: string
): Promise<TransactionBatchGroup[]> {
  const map = new Map<string, { batch: TransactionBatch; items: Transaction[] }>();

  for (const tx of allTransactions()) {
    if (!tx.batch) continue;
    if (subaccountId && subaccountId !== 'main' && tx.batch.accountId !== subaccountId) continue;
    const key = tx.batch.batchId;
    if (!map.has(key)) map.set(key, { batch: tx.batch, items: [] });
    map.get(key)!.items.push(tx);
  }

  // A booked (awaiting-payment/completed) Bulk Upload batch with zero valid
  // rows produces zero synthesized transactions (`buildTransactionsFromBulkBatch`)
  // and so would otherwise never appear above — indistinguishable from a
  // nonexistent batch id. It's still a real, existing (empty) batch, so seed an
  // entry for it directly from the upload record.
  for (const record of getSessionUploads()) {
    if (record.status !== 'awaiting-payment' && record.status !== 'completed') continue;
    if (map.has(record.id)) continue;
    if (subaccountId && subaccountId !== 'main' && record.accountId !== subaccountId) continue;
    map.set(record.id, {
      batch: { batchId: record.id, fileName: record.fileName, uploadedVia: 'bulk_upload', accountId: record.accountId, accountName: record.accountName },
      items: [],
    });
  }

  const summaryIndex = allSummaries();
  const groups: TransactionBatchGroup[] = Array.from(map.values()).map(({ batch, items }) => {
    const summaries = items
      .map((t) => summaryIndex.find((d) => d.tracking === t.trackingNumber))
      .filter((d): d is TransactionSummary => !!d);
    // Use backend-reported counts when present (realistic upload sizes);
    // fall back to counts derived from visible mock items.
    const rc = batch.reportedCounts;
    return {
      batch,
      transactions: summaries,
      counts: rc
        ? { total: rc.total, delivered: rc.delivered, inProgress: rc.inProgress, failed: rc.failed }
        : {
            total: items.length,
            delivered: items.filter((t) => t.status === 'delivered').length,
            inProgress: items.filter(
              (t) => t.status === 'in-transit' || t.status === 'picked-up' || t.status === 'pending'
            ).length,
            failed: items.filter((t) => t.status === 'failed' || t.status === 'returned' || t.status === 'cancelled').length,
          },
      status: rc ? rollupStatusFromCounts(rc) : batchRollupStatus(items),
      uploadedDate: batchUploadedDate(batch.batchId),
    };
  });

  return groups.sort((a, b) => b.batch.batchId.localeCompare(a.batch.batchId));
}

/**
 * Return the single batch group for one batch id (used by the Completed Batch
 * Details page and the dedicated Batch Details page so both render the SAME
 * transaction records the main Transactions "By Batch" view does — not a
 * separate/copied dataset).
 *
 * `subaccountId` enforces the same account/tenant isolation as
 * `getTransactionBatches` — a manager (or an admin drilled into a specific
 * subaccount) passing another account's batch id gets `null`, identical to a
 * genuinely nonexistent id ("don't reveal existence", same convention as the
 * Ops Requests proxy routes). Omit it only for an already-scoped caller (e.g.
 * a session-owned Bulk Upload record already checked by
 * `canViewBulkUploadBatch`).
 */
export async function getTransactionBatchById(
  batchId: string,
  subaccountId?: string
): Promise<TransactionBatchGroup | null> {
  const groups = await getTransactionBatches(subaccountId);
  return groups.find((g) => g.batch.batchId === batchId) ?? null;
}

// ─── Paginated batch transactions (dedicated Batch Details page) ───────────
//
// The batch groups above carry only the batch's CONCRETE sample transaction
// records (real seed rows / real synthesized Bulk Upload rows). A batch's
// backend-reported `counts.total` can run into the hundreds or thousands —
// far more than the concrete rows this mock seed maintains per batch — so a
// real batch detail page cannot just render `group.transactions`. This mirrors
// a real backend: the concrete rows are returned first (page 0..N), and any
// remaining reported count is filled by deterministic, indexable sample rows
// generated ON DEMAND per requested index — never materializing the full
// batch in memory or in the DOM. Treat this the same as every other
// "sample precomputed field" in this file: it stands in for a real paginated
// `GET /transactions/batches/:id/transactions?page=&pageSize=&search=` BFF
// endpoint, not frontend-owned business logic.

export interface BatchTransactionsQuery {
  /** 1-based page number. */
  page: number;
  pageSize: number;
  /** Matches tracking number or recipient (case-insensitive substring). */
  search?: string;
  status?: TransactionStatus | 'all';
}

export interface BatchTransactionsPage {
  items: TransactionSummary[];
  /** Total rows matching the query (before pagination, after search/status filter). */
  total: number;
  page: number;
  pageSize: number;
}

/** Remaining status buckets to distribute across generated filler rows, after subtracting the batch's own concrete rows. */
function fillerStatusBuckets(group: TransactionBatchGroup): { delivered: number; inProgress: number; failed: number } {
  const { counts, transactions: items } = group;
  const realDelivered = items.filter((t) => t.status === 'delivered').length;
  const realFailed = items.filter((t) => t.status === 'failed' || t.status === 'returned' || t.status === 'cancelled').length;
  const realInProgress = items.length - realDelivered - realFailed;
  return {
    delivered: Math.max(0, counts.delivered - realDelivered),
    inProgress: Math.max(0, counts.inProgress - realInProgress),
    failed: Math.max(0, counts.failed - realFailed),
  };
}

function fillerStatusAt(index: number, buckets: { delivered: number; inProgress: number; failed: number }): TransactionStatus {
  if (index < buckets.delivered) return 'delivered';
  if (index < buckets.delivered + buckets.inProgress) return 'in-transit';
  if (index < buckets.delivered + buckets.inProgress + buckets.failed) return 'failed';
  return 'delivered'; // overflow past the reported buckets — default to the majority-case outcome
}

/** Build a generated filler row's tracking number (parsed back by `parseFillerTracking`). */
function fillerTrackingNumber(batchId: string, fillerIndex: number): string {
  return `${batchId}-${String(fillerIndex + 1).padStart(5, '0')}`;
}

/**
 * Parse a generated filler tracking number back into its originating batch id
 * + 0-based filler index, so `getTransactionById` can resolve a filler row's
 * own detail page. Returns `null` for anything else (a real tracking number —
 * this app's real trackings never end in a bare 5-digit segment).
 */
function parseFillerTracking(tracking: string): { batchId: string; fillerIndex: number } | null {
  const m = tracking.match(/^(.+)-(\d{5})$/);
  if (!m) return null;
  return { batchId: m[1], fillerIndex: Number(m[2]) - 1 };
}

/** Generate one deterministic filler row for a batch at a given filler-local index (0-based, beyond the concrete rows). */
function fillerBatchRowAt(
  group: TransactionBatchGroup,
  fillerIndex: number,
  buckets: { delivered: number; inProgress: number; failed: number }
): TransactionSummary {
  const sample = BATCH_ROW_SAMPLE_FILLER[fillerIndex % BATCH_ROW_SAMPLE_FILLER.length];
  return {
    tracking: fillerTrackingNumber(group.batch.batchId, fillerIndex),
    recipient: sample.recipientName,
    destination: sample.location,
    status: fillerStatusAt(fillerIndex, buckets),
    type: 'Standard',
    serviceType: 'standard',
    date: group.uploadedDate,
    subaccount: group.batch.accountName ?? '—',
    source: 'bulk_upload',
    sourceType: 'bulk_upload',
  };
}

/**
 * Build a full (minimal but real-shaped) `Transaction` for a generated filler
 * row, so it resolves on its own detail page (`getTransactionById`) exactly
 * like a real seed/bulk-upload row — same sender/fees/payment defaults as
 * `buildTransactionsFromBulkBatch` uses for real Bulk Upload rows, since a
 * filler row IS presentationally a bulk-upload delivery, just one this mock
 * seed has no unique per-row detail for.
 */
function fillerRowToTransaction(
  group: TransactionBatchGroup,
  fillerIndex: number,
  buckets: { delivered: number; inProgress: number; failed: number }
): Transaction {
  const summary = fillerBatchRowAt(group, fillerIndex, buckets);
  const attribution: OrderAttribution = {
    accountScope: group.batch.accountId ? 'subaccount' : 'main',
    sourceType: 'bulk_upload',
    bookingMethod: 'bulk_template_upload',
  };
  return {
    trackingNumber: summary.tracking,
    destination: summary.destination,
    type: 'Standard',
    serviceType: summary.serviceType,
    status: summary.status,
    date: summary.date,
    subaccount: summary.subaccount,
    source: 'bulk_upload',
    attribution,
    createdAt: summary.date,
    pickupDate: summary.date,
    deliveryDate: summary.status === 'delivered' ? summary.date : '—',
    sender: BULK_TX_SENDER,
    recipient: { name: summary.recipient, contactNumber: '—', address: summary.destination },
    items: [{ name: 'Item', quantity: 1, description: 'Bulk Upload item', price: 0 }],
    packaging: { size: 'SMALL', dimensions: '30cm x 20cm x 15cm', weight: '1 kg' },
    store: { name: group.batch.fileName, url: '—' },
    fees: { serviceFee: 0, shippingFee: 120, protectionFee: 0, discount: 0, processingFee: 0 },
    payment: { method: 'Prepaid', paidBy: 'Sender', codAmount: 0 },
    timeline: [],
    batch: group.batch,
  };
}

/** Resolve the row at a global 0-based index within a batch's full (reported) row count. */
function batchRowAt(group: TransactionBatchGroup, index: number, buckets: { delivered: number; inProgress: number; failed: number }): TransactionSummary {
  if (index < group.transactions.length) return group.transactions[index];
  return fillerBatchRowAt(group, index - group.transactions.length, buckets);
}

function matchesBatchRowQuery(row: TransactionSummary, search: string, status?: TransactionStatus | 'all'): boolean {
  if (status && status !== 'all' && row.status !== status) return false;
  if (!search) return true;
  const q = search.toLowerCase();
  return row.tracking.toLowerCase().includes(q) || row.recipient.toLowerCase().includes(q);
}

/**
 * Pure, synchronous pagination over an ALREADY-RESOLVED batch group. Exposed
 * so a caller that already holds the group (e.g. the Batch Details page,
 * which loads it once for the header) can page/search/filter without
 * re-resolving the batch (and re-scanning every batch in the app) on every
 * page click or keystroke — `getTransactionBatchTransactions` below is a thin
 * async wrapper over this for callers that don't already have the group.
 *
 * With no search/status filter this only ever computes the requested page
 * window (`pageSize` rows), never the full reported total. A search/status
 * filter requires scanning the full reported range to find matches — the
 * same cost profile as an unindexed backend table scan — but the result
 * (and therefore the DOM) is still capped at one page.
 */
export function paginateBatchTransactions(
  group: TransactionBatchGroup,
  query: BatchTransactionsQuery
): BatchTransactionsPage {
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.floor(query.pageSize));
  const search = query.search?.trim().toLowerCase() ?? '';
  const statusFilter = query.status;
  const total = group.counts.total;
  const buckets = fillerStatusBuckets(group);

  if (!search && (!statusFilter || statusFilter === 'all')) {
    const start = (page - 1) * pageSize;
    const items = Array.from(
      { length: Math.max(0, Math.min(pageSize, total - start)) },
      (_, i) => batchRowAt(group, start + i, buckets)
    );
    return { items, total, page, pageSize };
  }

  const matches: TransactionSummary[] = [];
  for (let i = 0; i < total; i++) {
    const row = batchRowAt(group, i, buckets);
    if (matchesBatchRowQuery(row, search, statusFilter)) matches.push(row);
  }
  const start = (page - 1) * pageSize;
  return { items: matches.slice(start, start + pageSize), total: matches.length, page, pageSize };
}

/**
 * Return one page of a batch's transactions, scoped/authorized the same way
 * as `getTransactionBatchById` — a batch outside `subaccountId`'s scope
 * resolves as `null`, indistinguishable from a nonexistent batch id. Resolves
 * the batch group itself, then delegates to `paginateBatchTransactions` — a
 * caller that already has the group (see above) should call that directly
 * instead of paying for a fresh batch resolution on every page/search change.
 */
export async function getTransactionBatchTransactions(
  batchId: string,
  query: BatchTransactionsQuery,
  subaccountId?: string
): Promise<BatchTransactionsPage | null> {
  const group = await getTransactionBatchById(batchId, subaccountId);
  if (!group) return null;
  return paginateBatchTransactions(group, query);
}

/**
 * Return every row of a batch (respecting the same scope/authorization rule)
 * for client-side CSV export. Only called on an explicit user Export action —
 * never as part of rendering the paginated table — mirroring how a real
 * export would hit a separate full-data endpoint/job rather than the
 * paginated read path.
 */
export async function getAllTransactionBatchRows(
  batchId: string,
  subaccountId?: string
): Promise<TransactionSummary[] | null> {
  const group = await getTransactionBatchById(batchId, subaccountId);
  if (!group) return null;
  const buckets = fillerStatusBuckets(group);
  return Array.from({ length: group.counts.total }, (_, i) => batchRowAt(group, i, buckets));
}

// ─── Detail totals ───────────────────────────────────────────────────────────

/** Sample precomputed detail totals (backend/FTX-provided in production). */
export interface TransactionTotals {
  itemsTotal: number;
  feesTotal: number;
}

/**
 * Return display totals for a transaction detail view.
 *
 * IMPORTANT: In production these are OFFICIAL financial values owned by FTX and
 * delivered by the BFF as fields on the transaction payload — the frontend must
 * not be their source of truth. They are derived here only because the static
 * mock seed has no precomputed totals; treat the result as backend-provided.
 */
export function getTransactionTotals(transaction: Transaction): TransactionTotals {
  return {
    itemsTotal: transaction.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    feesTotal: Object.values(transaction.fees).reduce((sum, fee) => sum + fee, 0),
  };
}
