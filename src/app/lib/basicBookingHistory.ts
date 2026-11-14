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
import type { BookingDraft } from './basicBookingDraft';

export interface BasicBookingHistoryEntry {
  id: string;
  confirmedAt: string;
  pickupName: string | null;
  recipientName: string | null;
  itemDescription: string;
  total: number;
}

function key(accountId: string): string {
  return `basicBookingHistory.${accountId}`;
}

/** Appends a demo booking record. Call this BEFORE clearing the draft, never after. */
export function recordBookingConfirmation(
  accountId: string,
  draft: BookingDraft,
  total: number,
): BasicBookingHistoryEntry {
  const entry: BasicBookingHistoryEntry = {
    id: `BKG-${Date.now()}`,
    confirmedAt: new Date().toISOString(),
    pickupName: draft.pickupAddress?.name ?? null,
    recipientName: draft.recipientAddress?.name ?? null,
    itemDescription: draft.itemDescription,
    total,
  };
  const history = loadState<BasicBookingHistoryEntry[]>(key(accountId), []);
  saveState(key(accountId), [entry, ...history]);
  return entry;
}

export function getRecentBookings(accountId: string): BasicBookingHistoryEntry[] {
  return loadState<BasicBookingHistoryEntry[]>(key(accountId), []);
}
