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

/** Seed transactions + synthesized accepted-order deliveries (synthesized first). */
function allTransactions(): Transaction[] {
  return [...synthesizedTransactions(), ...transactions];
}
function allSummaries(): TransactionSummary[] {
  return [...synthesizedTransactions().map(toSummary), ...deliveries];
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
  if (c.total > 0 && c.delivered === c.total) return { label: 'Complete', variant: 'success' };
  if (c.inProgress > 0) return { label: 'In Progress', variant: 'info' };
  if (c.failed === c.total) return { label: 'Failed', variant: 'danger' };
  return { label: 'Partial', variant: 'warning' };
}

/** Sample roll-up status derived from member statuses (stands in for backend value). */
function batchRollupStatus(items: Transaction[]): { label: string; variant: StatusVariant } {
  const total = items.length;
  const delivered = items.filter((t) => t.status === 'delivered').length;
  const failed = items.filter((t) => t.status === 'failed' || t.status === 'returned').length;
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

  for (const tx of transactions) {
    if (!tx.batch) continue;
    if (subaccountId && subaccountId !== 'main' && tx.batch.accountId !== subaccountId) continue;
    const key = tx.batch.batchId;
    if (!map.has(key)) map.set(key, { batch: tx.batch, items: [] });
    map.get(key)!.items.push(tx);
  }

  const groups: TransactionBatchGroup[] = Array.from(map.values()).map(({ batch, items }) => {
    const summaries = items
      .map((t) => deliveries.find((d) => d.tracking === t.trackingNumber))
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
            failed: items.filter((t) => t.status === 'failed' || t.status === 'returned').length,
          },
      status: rc ? rollupStatusFromCounts(rc) : batchRollupStatus(items),
      uploadedDate: batchUploadedDate(batch.batchId),
    };
  });

  return groups.sort((a, b) => b.batch.batchId.localeCompare(a.batch.batchId));
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
