/**
 * Storefront Orders — buyer commerce orders placed through the public storefront
 * (/shop) or single-product (/buy) checkout.
 *
 * ── Product model (see docs/storefront_rules.md) ───────────────────────────────
 * A Storefront Order is the BUYER's commerce order. It is NOT a delivery
 * transaction. A delivery (fulfillment) transaction is created only after the
 * seller ACCEPTS the order. The two carry separate status fields so they never
 * contradict each other:
 *
 *   Storefront Order status : awaiting_acceptance → accepted | rejected
 *   Delivery status (OD)     : looking_for_driver … delivered  (only after accept)
 *
 * Persisted to localStorage (demo). Backend-owned in production:
 *   GET  /accounts/:id/storefront/orders
 *   POST /accounts/:id/storefront/orders/:orderId/accept|reject
 */

import { loadState, saveState } from '../lib/storage';
import {
  type Transaction,
  type DeliveryServiceType,
  type Party,
  type SourceType,
  type BookingMethod,
} from './transactions';
import {
  type OnDemandDeliveryStage,
  nextDeliveryStage,
  statusFromDeliveryStage,
} from './onDemandDelivery';
import { getAccountNameById } from './accounts';

export type StorefrontOrderStatus = 'awaiting_acceptance' | 'accepted' | 'rejected';
export type StorefrontOrderChannel = 'storefront_checkout' | 'product_checkout';

export const STOREFRONT_ORDER_STATUS_META: Record<StorefrontOrderStatus, {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'pending' | 'default' | 'info';
}> = {
  awaiting_acceptance: { label: 'Awaiting seller acceptance', variant: 'pending' },
  accepted:            { label: 'Accepted by seller',         variant: 'success' },
  rejected:            { label: 'Rejected',                   variant: 'danger' },
};

export interface StoreOrderDisplayStatus {
  label: string;
  variant: 'success' | 'info' | 'warning' | 'danger' | 'pending' | 'default';
}

export interface StorefrontOrderItem {
  productId?: string;
  /** Selected variant id, when this line was a specific variant — additive
   * (Commerce Phase 4 fix). Without it, two differently-selected variants of
   * the same product are indistinguishable to the seller fulfilling the order. */
  variantId?: string;
  /** Human-readable variant label (e.g. "Black / M") and SKU, carried
   * through from `CartItem.productSnapshot` — additive (Commerce Phase 4 fix). */
  variantLabel?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface StorefrontOrder {
  id: string;
  scopeAccountId: string;
  storeName: string;
  storeSlug?: string;
  channel: StorefrontOrderChannel;
  /** Buyer's delivery preference at checkout. */
  serviceType: DeliveryServiceType;
  status: StorefrontOrderStatus;
  placedAt: string;
  buyer: { name: string; mobile: string; address: string; destination: string };
  items: StorefrontOrderItem[];
  codTotal: number;
  /** Linked delivery tracking number — present once accepted. */
  trackingNumber?: string;
  /** Granular OD delivery stage — present once accepted (OD orders). */
  deliveryStage?: OnDemandDeliveryStage;
  acceptedAt?: string;
  rejectedReason?: string;
  /**
   * Applied promo code + the server-computed discount amount already
   * subtracted into `codTotal` — additive (Commerce Phase 4). The discount
   * itself is never computed here; by the time `placeOrder` is called it has
   * already been authoritatively validated/redeemed against the real
   * Commerce backend (`promotionsService.ts`'s `redeemPromotionCode`). Absent
   * when no promo was applied.
   */
  promoCode?: string;
  discountAmount?: number;
}

// ─── Seed (demo) ────────────────────────────────────────────────────────────────
// Acme Luzon has the storefront + On-Demand add-on enabled, so its store is where
// OD buyer orders land. Two cleanly-separated demo states (replacing the old
// confusing "pending but already booked" GGX-2026-90011 seed):
//   1. SO-2026-0001 — buyer placed an OD order, awaiting seller acceptance, NO
//      delivery transaction yet.
//   2. SO-2026-0002 — accepted by seller; linked OD delivery GGX-2026-90011 is
//      already "Driver assigned".
const SEED: StorefrontOrder[] = [
  {
    id: 'SO-2026-0002',
    scopeAccountId: 'acme-luzon',
    storeName: 'Acme Luzon Shop',
    storeSlug: 'acme-luzon',
    channel: 'product_checkout',
    serviceType: 'on_demand',
    status: 'accepted',
    placedAt: '2026-05-31 08:40 AM',
    buyer: {
      name: 'Brightline Pharmacy',
      mobile: '+63 917 233 0099',
      address: 'G/F Sunrise Bldg, Legaspi Village, Makati City, Metro Manila',
      destination: 'Makati City, Metro Manila',
    },
    items: [
      { productId: 'prod-1002', name: 'Ceramic Pour-Over Set', quantity: 2, unitPrice: 420 },
    ],
    codTotal: 840,
    trackingNumber: 'GGX-2026-90011',
    deliveryStage: 'driver_assigned',
    acceptedAt: '2026-05-31 08:52 AM',
  },
  {
    id: 'SO-2026-0001',
    scopeAccountId: 'acme-luzon',
    storeName: 'Acme Luzon Shop',
    storeSlug: 'acme-luzon',
    channel: 'storefront_checkout',
    serviceType: 'on_demand',
    status: 'awaiting_acceptance',
    placedAt: '2026-05-31 09:15 AM',
    buyer: {
      name: 'Joanna Cruz',
      mobile: '+63 918 770 5521',
      address: 'Unit 14B, The Grove Towers, Pasig City, Metro Manila',
      destination: 'Pasig City, Metro Manila',
    },
    items: [
      { productId: 'prod-1001', name: 'Single-Origin Coffee Beans 1kg', quantity: 1, unitPrice: 850 },
      { productId: 'prod-1002', name: 'Ceramic Pour-Over Set', quantity: 1, unitPrice: 420 },
    ],
    codTotal: 1270,
  },
];

const STORE_KEY = 'storefrontOrders';
const orders: StorefrontOrder[] = loadState<StorefrontOrder[]>(STORE_KEY, SEED);
function persist(): void { saveState(STORE_KEY, orders); }

/**
 * Buyer-order-facing display status for the Store Orders queue. Distinct from the
 * delivery transaction status: it reflects the order's acceptance + fulfilment
 * lifecycle (Awaiting acceptance → Accepted → Preparing → Ready for pickup → Out
 * for delivery → Completed, or Cancelled), derived from the order status + OD
 * delivery stage. Keeps "awaiting acceptance" and delivery progress unambiguous.
 */
export function storeOrderDisplay(o: StorefrontOrder): StoreOrderDisplayStatus {
  if (o.status === 'awaiting_acceptance') return { label: 'Awaiting seller acceptance', variant: 'pending' };
  if (o.status === 'rejected') return { label: 'Cancelled', variant: 'default' };
  switch (o.deliveryStage) {
    case 'preparing':        return { label: 'Preparing', variant: 'warning' };
    case 'ready_for_pickup': return { label: 'Ready for pickup', variant: 'warning' };
    case 'handed_to_rider':
    case 'picked_up':
    case 'en_route':         return { label: 'Out for delivery', variant: 'info' };
    case 'delivered':        return { label: 'Completed', variant: 'success' };
    case 'cancelled':        return { label: 'Cancelled', variant: 'default' };
    default:                 return { label: 'Accepted', variant: 'info' };
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** All orders for a scope (newest first), or every order in main/consolidated view. */
export function listOrders(scopeId: string | undefined): StorefrontOrder[] {
  const list = scopeId ? orders.filter((o) => o.scopeAccountId === scopeId) : [...orders];
  return list.slice().sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

export function getOrder(id: string): StorefrontOrder | undefined {
  return orders.find((o) => o.id === id);
}

/** Find an accepted order by its linked delivery tracking number. */
export function getOrderByTracking(trackingNumber: string): StorefrontOrder | undefined {
  return orders.find((o) => o.trackingNumber === trackingNumber);
}

/** Accepted orders that have a linked delivery transaction. */
export function acceptedOrders(): StorefrontOrder[] {
  return orders.filter((o) => o.status === 'accepted' && !!o.trackingNumber);
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export interface PlaceOrderInput {
  scopeAccountId: string;
  storeName: string;
  storeSlug?: string;
  channel: StorefrontOrderChannel;
  serviceType: DeliveryServiceType;
  buyer: { name: string; mobile: string; address: string; destination: string };
  items: StorefrontOrderItem[];
  codTotal: number;
  /** See `StorefrontOrder.promoCode`/`discountAmount` — additive, optional. */
  promoCode?: string;
  discountAmount?: number;
}

let seq = 100;
function nextOrderId(): string {
  // Avoid colliding with seeded ids.
  let id: string;
  do {
    seq += 1;
    id = `SO-2026-${String(seq).padStart(4, '0')}`;
  } while (orders.some((o) => o.id === id));
  return id;
}

function nextTrackingNumber(): string {
  let n = 90100;
  let tn: string;
  do {
    n += 1;
    tn = `GGX-2026-${n}`;
  } while (orders.some((o) => o.trackingNumber === tn));
  return tn;
}

function nowStamp(): string {
  // Anchored to the mock "today" so seed + new orders read consistently.
  return '2026-05-31';
}

/** Place a new buyer order. Always starts at "Awaiting seller acceptance". */
export function placeOrder(input: PlaceOrderInput): StorefrontOrder {
  const order: StorefrontOrder = {
    id: nextOrderId(),
    scopeAccountId: input.scopeAccountId,
    storeName: input.storeName,
    storeSlug: input.storeSlug,
    channel: input.channel,
    serviceType: input.serviceType,
    status: 'awaiting_acceptance',
    placedAt: `${nowStamp()} (just now)`,
    buyer: input.buyer,
    items: input.items,
    codTotal: input.codTotal,
    promoCode: input.promoCode,
    discountAmount: input.discountAmount,
  };
  orders.unshift(order);
  persist();
  return order;
}

/**
 * Seller accepts an order. This is the point the order becomes booked: a delivery
 * transaction is created (tracking number assigned) and, for On-Demand, the
 * delivery starts at "Looking for driver".
 */
export function acceptOrder(id: string): StorefrontOrder | undefined {
  const order = orders.find((o) => o.id === id);
  if (!order || order.status !== 'awaiting_acceptance') return order;
  order.status = 'accepted';
  order.trackingNumber = nextTrackingNumber();
  order.acceptedAt = `${nowStamp()} (just now)`;
  if (order.serviceType === 'on_demand') order.deliveryStage = 'looking_for_driver';
  persist();
  return order;
}

/** Seller rejects/cancels an order (mocked). */
export function rejectOrder(id: string, reason?: string): StorefrontOrder | undefined {
  const order = orders.find((o) => o.id === id);
  if (!order) return order;
  order.status = 'rejected';
  order.rejectedReason = reason;
  if (order.deliveryStage) order.deliveryStage = 'cancelled';
  persist();
  return order;
}

/** Advance an accepted OD order's delivery to the next stage (demo progression). */
export function advanceDelivery(id: string): StorefrontOrder | undefined {
  const order = orders.find((o) => o.id === id);
  if (!order || order.status !== 'accepted' || !order.deliveryStage) return order;
  const next = nextDeliveryStage(order.deliveryStage);
  if (next) { order.deliveryStage = next; persist(); }
  return order;
}

// ─── Synthesized delivery transaction ────────────────────────────────────────
// Accepted orders "reveal" a delivery transaction. Rather than mutate the static
// transaction seed, we synthesize a Transaction from the order on demand so the
// existing detail / public-tracking / list surfaces resolve it by tracking number.

const ORDER_SENDER: Party = {
  name: 'Acme Luzon Shop',
  contactNumber: '+63 917 987 6543',
  address: 'Warehouse 3, Light Industrial Park, Calamba, Laguna',
};

function channelSource(channel: StorefrontOrderChannel): { sourceType: SourceType; bookingMethod: BookingMethod } {
  return channel === 'storefront_checkout'
    ? { sourceType: 'gobenta', bookingMethod: 'storefront_checkout' }
    : { sourceType: 'product_checkout', bookingMethod: 'single_product_checkout' };
}

/** Build the delivery Transaction that an accepted order reveals. */
export function buildTransactionFromOrder(order: StorefrontOrder): Transaction | undefined {
  if (order.status !== 'accepted' || !order.trackingNumber) return undefined;
  const stage = order.deliveryStage ?? 'looking_for_driver';
  const status = statusFromDeliveryStage(stage);
  const { sourceType, bookingMethod } = channelSource(order.channel);
  const subaccountName = getAccountNameById(order.scopeAccountId) ?? order.storeName;

  return {
    trackingNumber: order.trackingNumber,
    destination: order.buyer.destination,
    type: order.serviceType === 'standard' ? 'Standard' : 'Express',
    serviceType: order.serviceType,
    status,
    date: nowStamp(),
    subaccount: subaccountName,
    source: 'manual',
    attribution: {
      accountScope: 'subaccount',
      sourceType,
      bookingMethod,
      connectedStore: order.storeName,
    },
    createdAt: order.placedAt,
    pickupDate: nowStamp(),
    deliveryDate: status === 'delivered' ? nowStamp() : '—',
    sender: ORDER_SENDER,
    recipient: { name: order.buyer.name, contactNumber: order.buyer.mobile, address: order.buyer.address },
    items: order.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      description: 'Storefront order item',
      price: it.unitPrice,
    })),
    packaging: { size: 'SMALL', dimensions: '30cm x 20cm x 15cm', weight: '1.5 kg' },
    store: { name: order.storeName, url: order.storeSlug ? `gogoxpress.shop/${order.storeSlug}` : 'gogoxpress.shop' },
    fees: { serviceFee: 0, shippingFee: 0, protectionFee: 0, discount: 0, processingFee: 0 },
    payment: { method: 'Cash on Delivery (COD)', paidBy: 'Recipient', codAmount: order.codTotal },
    timeline: [],
  };
}
