// Single source of truth for transaction mock data.
//
// Both the Transactions list and the Transaction Details page read from here so
// that clicking a row resolves to the matching record (looked up by tracking
// number via the `:id` route param).

import { getServiceTypeLabel, type ServiceTypeKey } from './serviceTypes';

export type TransactionStatus =
  | 'delivered'
  | 'in-transit'
  | 'picked-up'
  | 'pending'
  | 'failed'
  | 'returned'
  | 'cancelled';

/** Legacy origin channel (kept for back-compat). Superseded by `attribution`. */
export type TransactionSource = 'manual' | 'bulk_upload' | 'api' | 'shopify';

// ── Order attribution model (see docs/context/future-backlog.md §1) ───────────
// Four dimensions: account scope/ownership, high-level Source, connected
// store/integration, and booking method. The Transactions list stays simple
// (ownership in the Subaccount column + a short Source column); detail/filters/
// exports/reports use the fuller attribution. Backend stays granular (e.g. bulk
// template vs in-app spreadsheet) for analytics; the frontend label rolls both
// bulk methods up to "Bulk Upload".

/** High-level origin shown in the Transactions "Source" column (short labels). */
export type SourceType = 'ggx_dashboard' | 'bulk_upload' | 'api' | 'shopify' | 'gobenta' | 'product_checkout';

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  ggx_dashboard:    'GGX Dashboard',
  bulk_upload:      'Bulk Upload',
  api:              'API',
  shopify:          'Shopify',
  gobenta:          'GoBenta',
  product_checkout: 'Product Checkout',
};

/** How the order was created (backend stays granular; frontend label rolls bulk up). */
export type BookingMethod =
  | 'single_booking'
  | 'bulk_template_upload'
  | 'bulk_in_app_spreadsheet'
  | 'api_created'
  | 'shopify_import'
  | 'storefront_checkout'
  | 'single_product_checkout';

export const BOOKING_METHOD_LABEL: Record<BookingMethod, string> = {
  single_booking:          'Single Booking',
  bulk_template_upload:    'Bulk Upload',
  bulk_in_app_spreadsheet: 'Bulk Upload',
  api_created:             'API-created',
  shopify_import:          'Shopify Import',
  storefront_checkout:     'Storefront Checkout',
  single_product_checkout: 'Single Product Checkout',
};

/**
 * Analytics labels keep the two bulk methods distinct (they roll up to a single
 * "Bulk Upload" only in list/detail UI) so analytics can measure template upload
 * vs in-app spreadsheet separately, per the attribution model.
 */
export const BOOKING_METHOD_ANALYTICS_LABEL: Record<BookingMethod, string> = {
  single_booking:          'Single Booking',
  bulk_template_upload:    'Bulk Upload (Template)',
  bulk_in_app_spreadsheet: 'Bulk Upload (In-app)',
  api_created:             'API-created',
  shopify_import:          'Shopify Import',
  storefront_checkout:     'Storefront Checkout',
  single_product_checkout: 'Single Product Checkout',
};

/** Fixed display order for source / booking-method analytics breakdowns. */
export const SOURCE_TYPE_ORDER: SourceType[] = [
  'ggx_dashboard', 'bulk_upload', 'api', 'shopify', 'gobenta', 'product_checkout',
];
export const BOOKING_METHOD_ORDER: BookingMethod[] = [
  'single_booking', 'bulk_template_upload', 'bulk_in_app_spreadsheet',
  'api_created', 'shopify_import', 'storefront_checkout', 'single_product_checkout',
];

/** Analytics-safe rollup group (both bulk methods → 'bulk_upload'; others 1:1). */
export function bookingMethodGroup(method: BookingMethod): string {
  return method === 'bulk_template_upload' || method === 'bulk_in_app_spreadsheet'
    ? 'bulk_upload'
    : method;
}

/** Full order attribution carried on a transaction. */
export interface OrderAttribution {
  /** Ownership scope: Main Account vs a Subaccount. */
  accountScope: 'main' | 'subaccount';
  /** High-level origin (short, list-friendly). */
  sourceType: SourceType;
  /** How the order was created (granular). */
  bookingMethod: BookingMethod;
  /** Connected store / integration display name, when applicable. */
  connectedStore?: string;
  /** Integration id when from a connected integration (Shopify / GoBenta / API). */
  integrationId?: string;
  /** Who created the order (when known). */
  createdBy?: string;
}

/**
 * Delivery service type for a transaction. A subset of the Business+ service
 * types (the bookable delivery tiers) — fulfillment-only types are excluded.
 * On-Demand is a DISTINCT type (never merged with Same-Day). See
 * docs/service_type_rules.md.
 */
export type DeliveryServiceType = Extract<ServiceTypeKey, 'standard' | 'same_day' | 'on_demand'>;

/** Short labels for the Type column badge + Service Type filter options. */
export const SERVICE_TYPE_SHORT_LABEL: Record<DeliveryServiceType, string> = {
  standard: 'Standard',
  same_day: 'Same-Day',
  on_demand: 'On-Demand',
};

/** Full service-type label (re-exported via serviceTypes) for detail views. */
export function serviceTypeLabel(key: DeliveryServiceType): string {
  return getServiceTypeLabel(key);
}

export const statusConfig: Record<TransactionStatus, { variant: 'success' | 'info' | 'warning' | 'danger' | 'pending' | 'default'; label: string }> = {
  delivered: { variant: 'success', label: 'Delivered' },
  'in-transit': { variant: 'info', label: 'In Transit' },
  'picked-up': { variant: 'warning', label: 'Picked Up' },
  failed: { variant: 'danger', label: 'Failed' },
  pending: { variant: 'pending', label: 'Pending' },
  returned: { variant: 'default', label: 'Returned' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
};

export interface TransactionItem {
  name: string;
  quantity: number;
  description: string;
  attributes?: Record<string, string>;
  price: number;
}

export interface TimelineEvent {
  status: string;
  date: string;
  note?: string;
  hasProof?: boolean;
}

export interface Party {
  name: string;
  contactNumber: string;
  address: string;
}

/** Bulk Upload origin for transactions created from a batch. */
export interface TransactionBatch {
  batchId: string;
  fileName: string;
  uploadedVia: 'bulk_upload';
  accountId?: string;
  accountName?: string;
  /** Reported counts from the upload source (backend-provided; overrides derived counts). */
  reportedCounts?: {
    total: number;
    delivered: number;
    inProgress: number;
    failed: number;
  };
}

export interface Transaction {
  // List + summary fields
  trackingNumber: string;
  destination: string;
  type: 'Express' | 'Standard';
  /** Bookable delivery service type (Standard / Same-Day / On-Demand). */
  serviceType: DeliveryServiceType;
  status: TransactionStatus;
  date: string;
  subaccount: string;
  /** Legacy origin channel. Defaults to 'manual' / 'bulk_upload'. */
  source: TransactionSource;
  /** Shopify store display name when source === 'shopify'. */
  shopifyStoreName?: string;
  /** Full order attribution (scope, source, connected store, booking method). */
  attribution: OrderAttribution;
  // Detail fields
  createdAt: string;
  pickupDate: string;
  deliveryDate: string;
  sender: Party;
  recipient: Party;
  items: TransactionItem[];
  packaging: { size: string; dimensions: string; weight: string };
  store: { name: string; url: string };
  fees: { serviceFee: number; shippingFee: number; protectionFee: number; discount: number; processingFee: number };
  payment: { method: string; paidBy: string; codAmount: number };
  timeline: TimelineEvent[];
  /** Present only when this transaction was created from a Bulk Upload batch. */
  batch?: TransactionBatch;
  /** OMS `status_remarks` for the current status (e.g. "DELIVERED", "FOR PICKUP"). Not yet rendered standalone in the UI — carried through so the field exists once a real OMS feed replaces the mock. */
  statusRemarks?: string;
  /** OMS `failure_reason` — set only while the current status reflects an active delivery/pickup issue (failed, for_return, out_for_return, return_in_transit, pickup-in-progress-with-issue). */
  failureReason?: string;
}

// ── OMS-shaped sample data adapter ──────────────────────────────────────────
// Raw order records live in `data/omsOrders.ts`, patterned after a real OMS
// order payload (tracking_number, status, events, fees, parcel, addresses,
// consignor/consignee, metadata, …). `lib/omsOrderMapper.ts` normalizes each
// one into the `Transaction` shape below. This module owns the one thing an
// OMS order has no concept of — Business+ account attribution (which
// subaccount, which booking channel/batch) — and merges it in per tracking
// number. See docs/context/oms-sample-data.md for the full adapter write-up.
//
//   OMS-shaped sample data → normalizer → Transaction (this file) → UI

import { omsOrders } from './omsOrders';
import { mapOmsOrderToTransaction, type OmsOrderAttribution } from '../lib/omsOrderMapper';

/** Business+ account/origin context, keyed by tracking number. */
const ATTRIBUTION: Record<string, OmsOrderAttribution> = {
  // ── Shopify-sourced orders (booked via the GGX Shopify plugin) ───────────
  'GGX-2026-90021': { subaccount: 'Acme Luzon', source: 'shopify', shopifyStoreName: 'Acme Luzon Online' },
  'GGX-2026-90020': { subaccount: 'Acme Corporation', source: 'shopify', shopifyStoreName: 'Acme Corporation Store' },
  'GGX-2026-90019': { subaccount: 'Acme Luzon', source: 'shopify', shopifyStoreName: 'Acme Luzon Online' },
  'GGX-2026-90018': { subaccount: 'Acme Corporation', source: 'shopify', shopifyStoreName: 'Acme Corporation Store' },
  // ── May 31 (today) ────────────────────────────────────────────────────────
  'GGX-2026-90010': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-31-001', fileName: 'may31_express_orders.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation', reportedCounts: { total: 247, delivered: 5, inProgress: 240, failed: 2 } } },
  'GGX-2026-90009': { subaccount: 'Acme Luzon', batch: { batchId: 'UPLOAD-2026-05-31-002', fileName: 'may31_luzon_am.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-luzon', accountName: 'Acme Luzon', reportedCounts: { total: 184, delivered: 12, inProgress: 170, failed: 2 } } },
  'GGX-2026-90008': { subaccount: 'Acme Corporation', sourceType: 'product_checkout', connectedStore: 'TechGear PH — product link' },
  // ── May 30 ────────────────────────────────────────────────────────────────
  'GGX-2026-90007': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-30-001', fileName: 'may30_corporate.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation', reportedCounts: { total: 312, delivered: 298, inProgress: 11, failed: 3 } } },
  'GGX-2026-90006': { subaccount: 'Acme Luzon', batch: { batchId: 'UPLOAD-2026-05-30-002', fileName: 'may30_priority.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-luzon', accountName: 'Acme Luzon', reportedCounts: { total: 67, delivered: 58, inProgress: 3, failed: 6 } } },
  'GGX-2026-90005': { subaccount: 'Acme Corporation' },
  'GGX-2026-90004': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-30-001', fileName: 'may30_corporate.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation' } },
  // ── May 29 ────────────────────────────────────────────────────────────────
  'GGX-2026-90003': { subaccount: 'Acme Luzon' },
  'GGX-2026-90002': { subaccount: 'Acme Corporation' },
  'GGX-2026-90001': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-29-001', fileName: 'may29_vismin.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation', reportedCounts: { total: 205, delivered: 150, inProgress: 52, failed: 3 } } },
  // ── May 18–15 (existing) ──────────────────────────────────────────────────
  'GGX-2024-89240': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-18-003', fileName: 'daily_orders_batch3.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation', reportedCounts: { total: 198, delivered: 189, inProgress: 5, failed: 4 } } },
  'GGX-2024-89239': { subaccount: 'Acme Luzon', batch: { batchId: 'UPLOAD-2026-05-18-002', fileName: 'weekend_deliveries.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-luzon', accountName: 'Acme Luzon', reportedCounts: { total: 156, delivered: 148, inProgress: 6, failed: 2 } } },
  'GGX-2024-89238': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-17-001', fileName: 'may17_morning.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation', reportedCounts: { total: 423, delivered: 410, inProgress: 9, failed: 4 } } },
  'GGX-2024-89237': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-17-001', fileName: 'may17_morning.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation' } },
  'GGX-2024-89236': { subaccount: 'Acme Luzon', batch: { batchId: 'UPLOAD-2026-05-17-002', fileName: 'luzon_daily.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-luzon', accountName: 'Acme Luzon', reportedCounts: { total: 76, delivered: 64, inProgress: 4, failed: 8 } } },
  'GGX-2024-89235': { subaccount: 'Acme Corporation' },
  'GGX-2024-89234': { subaccount: 'Acme Luzon', batch: { batchId: 'UPLOAD-2026-05-18-001', fileName: 'morning_batch.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-luzon', accountName: 'Acme Luzon', reportedCounts: { total: 134, delivered: 128, inProgress: 3, failed: 3 } } },
  'GGX-2024-89233': { subaccount: 'Acme Corporation', sourceType: 'gobenta', connectedStore: 'Acme GoBenta Shop' },
  'GGX-2024-89232': { subaccount: 'Acme Luzon' },
  'GGX-2024-89231': { subaccount: 'Acme Corporation', createdBy: 'Maria Santos' },
  // ── May 14–12 (older, SLA-notable) ────────────────────────────────────────
  'GGX-2024-89230': { subaccount: 'Acme Corporation' },
  'GGX-2024-89229': { subaccount: 'Acme Luzon', batch: { batchId: 'UPLOAD-2026-05-14-001', fileName: 'may14_southern.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-luzon', accountName: 'Acme Luzon', reportedCounts: { total: 112, delivered: 95, inProgress: 6, failed: 11 } } },
  'GGX-2024-89228': { subaccount: 'Acme Corporation' },
  'GGX-2024-89227': { subaccount: 'Acme Corporation', batch: { batchId: 'UPLOAD-2026-05-13-001', fileName: 'may13_central_luzon.xlsx', uploadedVia: 'bulk_upload', accountId: 'acme-corporation', accountName: 'Acme Corporation', reportedCounts: { total: 89, delivered: 80, inProgress: 2, failed: 7 } } },
  'GGX-2024-89226': { subaccount: 'Acme Luzon' },
};

export const transactions: Transaction[] = omsOrders.map((order) =>
  mapOmsOrderToTransaction(order, ATTRIBUTION[order.tracking_number] ?? { subaccount: 'Acme Corporation' })
);

/** Summary rows for the Transactions list. */
export interface TransactionSummary {
  tracking: string;
  recipient: string;
  destination: string;
  status: TransactionStatus;
  type: string;
  serviceType: DeliveryServiceType;
  date: string;
  subaccount: string;
  source: TransactionSource;
  shopifyStoreName?: string;
  /** High-level Source for the list's Source column. */
  sourceType: SourceType;
}

export const deliveries: TransactionSummary[] = transactions.map((t) => ({
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
}));

/**
 * Subaccount column display label = ownership only (Main Account or the
 * Subaccount name), never blank/N/A. Source now has its own column, so the
 * old "{Subaccount} - Shopify" concatenation has been removed (attribution
 * model: do not concatenate Subaccount + Source + Store in the table).
 */
export function subaccountDisplayLabel(t: Pick<TransactionSummary, 'subaccount'>): string {
  return t.subaccount || 'Main Account';
}

/** Short Source label for the Transactions list "Source" column. */
export function sourceTypeLabel(t: Pick<TransactionSummary, 'sourceType'>): string {
  return SOURCE_TYPE_LABEL[t.sourceType];
}

/** Look up a full transaction by its tracking number (the `:id` route param). */
export function getTransactionByTracking(tracking: string | undefined): Transaction | undefined {
  if (!tracking) return undefined;
  return transactions.find((t) => t.trackingNumber === tracking);
}
