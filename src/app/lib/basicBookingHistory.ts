/**
 * DEMO-ONLY local history for confirmed GGX Basic single bookings.
 *
 * This is NOT a real Transaction/OMS record. Real booking creation, status,
 * and Transactions-page visibility are backend-owned and explicitly
 * deferred — see `docs/roadmap.md`'s "Deferred Production-Only Items" entry
 * for real order placement ("Checkout currently completes as demo/in-page
 * state. Needs POST /orders or equivalent."), the same boundary Storefront
 * checkout already follows (`data/transactions.ts`'s `transactions` array is
 * derived once from the OMS fixture at module load — there is no mutation
 * API to append a real row to it).
 *
 * This module only gives "Confirm Booking" a real, visible, persisted effect
 * for the demo. It must never be presented as a real Transaction, and the
 * confirmation UI must not claim this booking is trackable through the real
 * Transactions page.
 */
import { loadState, saveState } from './storage';
import { getBasicPouchSize, type BasicPouchSizeKey } from './basicPouchSizes';
import type { BookingDraft, FirstMile, FeePayer, SenderPaymentMethod } from './basicBookingDraft';
import type { DeliveryServiceType } from '../services/transactionService';

export interface BasicBookingHistoryEntry {
  id: string;
  confirmedAt: string;
  pickupName: string | null;
  recipientName: string | null;
  itemDescription: string;
  total: number;
  /** Sample-only identifier for the Booking Confirmation screen — never a real GGX tracking number (see this file's header comment). */
  trackingNumber: string;
  firstMile: FirstMile;
  serviceType: DeliveryServiceType;
  pickupDate: string | null;
  deliveryEstimateLabel: string | undefined;
  pouchLabel: string;
  /** The selected pouch's key, so the Confirmation screen can render its real illustration (`basicPouchSizes.ts`'s `iconUrl`) instead of a generic icon. */
  pouchSize: BasicPouchSizeKey;
  feePayer: FeePayer;
  senderPaymentMethod: SenderPaymentMethod;
  /** Merchandise COD amount, separate from `total` (the shipping charge) — see `basicBookingTotals.ts`'s `codAmount`. 0 when COD is off. */
  codAmount: number;
}

function key(accountId: string): string {
  return `basicBookingHistory.${accountId}`;
}

/** `GGX-{year}-{6 digits}` — same shape as the original /basic module's demo tracking number, always surfaced as a labeled sample, never as a real shipment reference. */
function generateSampleTrackingNumber(): string {
  const year = new Date().getFullYear();
  const digits = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `GGX-${year}-${digits}`;
}

/** Appends a demo booking record. Call this BEFORE clearing the draft, never after. */
export function recordBookingConfirmation(
  accountId: string,
  draft: BookingDraft,
  total: number,
  codAmount: number,
  deliveryEstimateLabel: string | undefined,
): BasicBookingHistoryEntry {
  const entry: BasicBookingHistoryEntry = {
    id: `BKG-${Date.now()}`,
    confirmedAt: new Date().toISOString(),
    pickupName: draft.pickupAddress?.name ?? null,
    recipientName: draft.recipientAddress?.name ?? null,
    itemDescription: draft.itemDescription,
    total,
    trackingNumber: generateSampleTrackingNumber(),
    firstMile: draft.firstMile,
    serviceType: draft.serviceType,
    pickupDate: draft.pickupDate,
    deliveryEstimateLabel,
    pouchLabel: getBasicPouchSize(draft.pouchSize).label,
    pouchSize: draft.pouchSize,
    feePayer: draft.feePayer,
    senderPaymentMethod: draft.senderPaymentMethod,
    codAmount,
  };
  const history = loadState<BasicBookingHistoryEntry[]>(key(accountId), []);
  saveState(key(accountId), [entry, ...history]);
  return entry;
}

export interface BasicActivitySummary {
  /** Reporting window in days — every metric below covers the same window. */
  periodDays: number;
  /** Bookings confirmed within the window. */
  bookings: number;
  /**
   * COD actually collected within the window. `null` = not available: the demo
   * booking log only stores the COD amount declared at booking time, with no
   * collected/remitted state, and declared COD must not be shown as earnings.
   */
  codEarnings: number | null;
  /** Shipments currently in transit. `null` = the booking log has no delivery status. */
  inTransit: number | null;
  /** Shipments delivered within the window. `null` = the booking log has no delivery status. */
  delivered: number | null;
}

/**
 * Last-N-days activity for the Basic home. Only `bookings` is derivable from
 * the demo log; the rest become real numbers once the backend exposes delivery
 * and COD-collection status (Future BFF: GET /accounts/:id/activity?days=7).
 */
export function getActivitySummary(accountId: string, periodDays = 7): BasicActivitySummary {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const bookings = getRecentBookings(accountId).filter((b) => new Date(b.confirmedAt).getTime() >= cutoff).length;
  return { periodDays, bookings, codEarnings: null, inTransit: null, delivered: null };
}

export function getRecentBookings(accountId: string): BasicBookingHistoryEntry[] {
  return loadState<BasicBookingHistoryEntry[]>(key(accountId), []);
}
