/**
 * omsOrderMapper — normalizes an OMS-shaped sample order into the Business+
 * `Transaction` order model.
 *
 * This is the adapter boundary described in `docs/context/oms-sample-data.md`:
 *
 *   OMS-shaped sample data (`data/omsOrders.ts`) → this mapper
 *   → Business+ order model (`data/transactions.ts` `Transaction`) → UI
 *
 * UI/page code must never import `data/omsOrders.ts` directly or branch on raw
 * OMS status strings — only `data/transactions.ts` (which owns account
 * attribution) and `services/transactionService.ts` call into this file. When
 * a real OMS/BFF integration lands, only this module's function bodies should
 * need to change; `Transaction` and its callers stay the same.
 */

import type { OmsOrder } from '../data/omsOrders';
import type {
  Transaction,
  TransactionStatus,
  DeliveryServiceType,
  Party,
  TransactionItem,
  TimelineEvent,
  TransactionSource,
  SourceType,
  BookingMethod,
  TransactionBatch,
} from '../data/transactions';

/** Business+-owned context a raw OMS order has no concept of (account scope, origin, batch). */
export interface OmsOrderAttribution {
  subaccount: string;
  source?: TransactionSource;
  shopifyStoreName?: string;
  sourceType?: SourceType;
  bookingMethod?: BookingMethod;
  connectedStore?: string;
  createdBy?: string;
  batch?: TransactionBatch;
}

/** Granular OMS status → coarse Business+ status bucket used by badges/filters/eligibility. */
const OMS_STATUS_TO_COARSE: Record<string, TransactionStatus> = {
  pending: 'pending',
  for_pickup: 'pending',
  pickup_rider_found: 'pending',
  out_for_pickup: 'pending',
  pickup_failed: 'pending',
  picked_up: 'picked-up',
  received_at_pickup_hub: 'picked-up',
  for_transfer: 'picked-up',
  in_transit: 'in-transit',
  out_for_delivery: 'in-transit',
  delivered: 'delivered',
  delivery_failed: 'failed',
  for_return: 'failed',
  out_for_return: 'failed',
  return_in_transit: 'failed',
  returned: 'returned',
  cancelled: 'cancelled',
};

const SERVICE_NAME_TO_TYPE: Record<string, DeliveryServiceType> = {
  next_day: 'standard',
  same_day: 'same_day',
  instant: 'on_demand',
};

const PACKAGING_BY_SHIPMENT: Record<string, { size: string; dimensions: string; weight: string }> = {
  'small-pouch': { size: 'SMALL POUCH', dimensions: '25cm x 18cm x 5cm', weight: '0.5 kg' },
  'medium-pouch': { size: 'MEDIUM POUCH', dimensions: '35cm x 25cm x 8cm', weight: '1.5 kg' },
  'large-pouch': { size: 'LARGE POUCH', dimensions: '45cm x 32cm x 10cm', weight: '2.5 kg' },
  'small-box': { size: 'SMALL BOX', dimensions: '30cm x 20cm x 15cm', weight: '1.5 kg' },
  'medium-box': { size: 'MEDIUM BOX', dimensions: '40cm x 30cm x 20cm', weight: '3.2 kg' },
  'large-box': { size: 'LARGE BOX', dimensions: '55cm x 40cm x 30cm', weight: '6.5 kg' },
  document: { size: 'DOCUMENT', dimensions: '32cm x 23cm x 2cm', weight: '0.2 kg' },
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: 'Cash on Delivery (COD)',
  prepaid: 'Prepaid (Online Checkout)',
  wallet: 'E-Wallet (Prepaid)',
  bank_transfer: 'Bank Transfer (Prepaid)',
};

function money(v: string | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 'out_for_delivery' -> 'Out For Delivery' */
function titleCase(status: string): string {
  return status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** OMS `YYYY-MM-DD HH:MM:SS...+ZZZZ` -> `Mon D, YYYY h:mm AM/PM` for display. */
function formatOmsTimestamp(omsTimestamp: string): string {
  const [datePart, timePart] = omsTimestamp.split(' ');
  const [hh, mm] = timePart.slice(0, 5).split(':').map(Number);
  const date = new Date(`${datePart}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const period = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${dateLabel} ${hour12}:${String(mm).padStart(2, '0')} ${period}`;
}

function omsDatePart(omsTimestamp: string): string {
  return omsTimestamp.slice(0, 10);
}

function deriveSourceType(a: OmsOrderAttribution): SourceType {
  if (a.sourceType) return a.sourceType;
  const legacy = a.source ?? (a.batch ? 'bulk_upload' : 'manual');
  switch (legacy) {
    case 'shopify': return 'shopify';
    case 'bulk_upload': return 'bulk_upload';
    case 'api': return 'api';
    default: return 'ggx_dashboard';
  }
}

function deriveBookingMethod(a: OmsOrderAttribution, sourceType: SourceType): BookingMethod {
  if (a.bookingMethod) return a.bookingMethod;
  switch (sourceType) {
    case 'shopify': return 'shopify_import';
    case 'bulk_upload': return 'bulk_template_upload';
    case 'api': return 'api_created';
    case 'gobenta': return 'storefront_checkout';
    case 'product_checkout': return 'single_product_checkout';
    default: return 'single_booking';
  }
}

/**
 * Resolve the coarse Business+ status for a raw OMS status. Unmapped statuses
 * fail loudly here — at the adapter boundary — instead of silently defaulting
 * to 'pending', which would misrepresent an unknown/unsupported status as
 * "newly booked, not yet started" (incorrectly implying cancel-eligible/active
 * to downstream consumers such as `claims.ts`'s `isCancelEligible`). Add new
 * OMS statuses to `OMS_STATUS_TO_COARSE` explicitly rather than widening this
 * fallback.
 */
function mapCoarseStatus(omsStatus: string): TransactionStatus {
  const coarse = OMS_STATUS_TO_COARSE[omsStatus];
  if (!coarse) {
    throw new Error(
      `omsOrderMapper: unmapped OMS status "${omsStatus}" — add it to OMS_STATUS_TO_COARSE in omsOrderMapper.ts instead of assuming a default status.`
    );
  }
  return coarse;
}

/** Normalize one OMS-shaped sample order into the Business+ `Transaction` model. */
export function mapOmsOrderToTransaction(order: OmsOrder, attribution: OmsOrderAttribution): Transaction {
  const status = mapCoarseStatus(order.status);
  const serviceType = SERVICE_NAME_TO_TYPE[order.service.name] ?? 'standard';
  const type: 'Express' | 'Standard' = serviceType === 'standard' ? 'Standard' : 'Express';
  const packaging = PACKAGING_BY_SHIPMENT[order.shipment] ?? PACKAGING_BY_SHIPMENT['medium-pouch'];

  const sender: Party = {
    name: order.pickup_address.name,
    contactNumber: order.pickup_address.mobile_number,
    address: [order.pickup_address.line_1, order.pickup_address.city, order.pickup_address.state].filter(Boolean).join(', '),
  };
  const recipient: Party = {
    name: order.delivery_address.name,
    contactNumber: order.delivery_address.mobile_number,
    address: [order.delivery_address.line_1, order.delivery_address.city, order.delivery_address.state].filter(Boolean).join(', '),
  };

  const items: TransactionItem[] = order.items
    .filter((i) => i.type === 'product')
    .map((i) => ({
      name: i.description,
      description: i.description,
      quantity: i.quantity,
      price: i.quantity > 0 ? money(i.amount) / i.quantity : money(i.amount),
    }));

  // `order.breakdown.fee` and `order.fees.transaction_fee` are the same OMS
  // transaction fee surfaced in two response sections (mirrors the reference
  // OMS payload's own duplication) — represent it exactly once, as
  // `processingFee`. There is no distinct OMS field for a separate "service
  // fee", so it stays 0 rather than double-counting the transaction fee.
  const fees = {
    serviceFee: 0,
    shippingFee: money(order.fees.shipping_fee),
    protectionFee: money(order.fees.insurance_fee),
    discount: -Math.abs(money(order.breakdown.discount)),
    processingFee: money(order.fees.transaction_fee),
  };

  const paidBy = order.metadata.service_fees_payor === 'seller' ? 'Sender' : 'Recipient';
  const payment = {
    method: PAYMENT_METHOD_LABEL[order.payment.method] ?? 'Prepaid',
    paidBy,
    codAmount: order.payment.method === 'cod' ? money(order.grand_total) : 0,
  };

  // Newest-first, matching the existing Tracking Timeline / public tracking convention.
  const timeline: TimelineEvent[] = [...order.events].reverse().map((e) => ({
    status: titleCase(e.status),
    date: formatOmsTimestamp(e.status_updated_at),
    note: e.remarks || undefined,
    hasProof: !!(e.photo || e.signature),
  }));

  const pickedUpEvent = order.events.find((e) => e.status === 'picked_up');
  const deliveredEvent = order.events.find((e) => e.status === 'delivered');

  const sourceType = deriveSourceType(attribution);
  const bookingMethod = deriveBookingMethod(attribution, sourceType);
  const shopifyStoreName = attribution.shopifyStoreName;
  const connectedStore = attribution.connectedStore ?? shopifyStoreName;

  return {
    trackingNumber: order.tracking_number,
    destination: `${order.delivery_address.city}, ${order.delivery_address.state}`,
    type,
    serviceType,
    status,
    date: omsDatePart(order.created_at),
    subaccount: attribution.subaccount,
    source: attribution.source ?? (attribution.batch ? 'bulk_upload' : 'manual'),
    shopifyStoreName,
    attribution: {
      accountScope: attribution.subaccount === 'Main Account' ? 'main' : 'subaccount',
      sourceType,
      bookingMethod,
      connectedStore,
      createdBy: attribution.createdBy,
    },
    createdAt: formatOmsTimestamp(order.created_at),
    pickupDate: omsDatePart(pickedUpEvent?.status_updated_at ?? order.pickup_at),
    deliveryDate: deliveredEvent ? omsDatePart(deliveredEvent.status_updated_at) : '—',
    sender,
    recipient,
    items,
    packaging,
    store: shopifyStoreName
      ? { name: shopifyStoreName, url: `${attribution.subaccount.toLowerCase().replace(/\s+/g, '-')}.myshopify.com` }
      : { name: 'TechGear Philippines', url: 'techgear.ph' },
    fees,
    payment,
    timeline,
    batch: attribution.batch,
    statusRemarks: order.status_remarks || undefined,
    failureReason: order.failure_reason ?? undefined,
  };
}
