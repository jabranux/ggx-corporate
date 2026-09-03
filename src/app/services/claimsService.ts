/**
 * claimsService — claims & cancellations facade.
 *
 * All data-returning functions are async to match a real API contract.
 * Currently backed by `data/claims.ts` (module state + localStorage).
 *
 * ── Architecture / ownership ───────────────────────────────────────────────
 * This is a frontend-facing facade. In production, claims are owned by a
 * support/claims system and surfaced via the GGX Corporate BFF; cancellations
 * touch OMS (order state). The frontend does NOT compute official claim
 * approval amounts, refund values, or fulfillment/transaction status — those
 * are backend-owned. Eligibility helpers here are presentation hints only
 * (which actions to OFFER), not authoritative decisions.
 *
 * Notifications raised on claim/cancellation are pushed inside the data layer
 * today (peer data module). When claims move fully behind a backend, the BFF/NS
 * would emit those events instead.
 *
 * Future API endpoints:
 *   GET  /claims                       → getClaimsList
 *   GET  /claims?tracking=X            → getClaimByTrackingNumber
 *   POST /claims                       → fileClaim
 *   POST /transactions/:id/cancel      → cancelBooking
 *   GET  /transactions/:id/cancelled   → isBookingCancelled
 */

import {
  getClaims,
  getClaim,
  getClaimByTracking,
  submitClaim,
  requestCancellation,
  isCancelled,
  isClaimEligible,
  isCancelEligible,
  updateLocalClaimStatus,
  CLAIM_STATUS_META,
  CLAIM_REASONS,
  type Claim,
  type ClaimStatus,
  type SubmitClaimInput,
} from '../data/claims';
import type { TransactionStatus } from '../data/transactions';

export type { Claim, ClaimStatus, SubmitClaimInput };
// Presentation config + static options (not data access).
export { CLAIM_STATUS_META, CLAIM_REASONS };

export interface ClaimFilters {
  status?: ClaimStatus | 'all';
  subaccountId?: string;
}

/** Return a single claim by ID, or null. */
export async function getClaimById(id: string): Promise<Claim | null> {
  return getClaim(id) ?? null;
}

/** Return all claims, with optional status/subaccount filters. */
export async function getClaimsList(filters?: ClaimFilters): Promise<Claim[]> {
  let result = [...getClaims()];
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status);
  }
  if (filters?.subaccountId) {
    result = result.filter((c) => c.accountId === filters.subaccountId);
  }
  return result;
}

/** Return the claim linked to a tracking number, or null. */
export async function getClaimByTrackingNumber(tracking: string): Promise<Claim | null> {
  return getClaimByTracking(tracking) ?? null;
}

/** File a claim (backend persists + emits the notification in production). */
export async function fileClaim(input: SubmitClaimInput): Promise<Claim> {
  return submitClaim(input);
}

/** Request cancellation of a newly-booked transaction. */
export async function cancelBooking(tracking: string, accountName?: string): Promise<void> {
  requestCancellation(tracking, accountName);
}

/** Whether a booking has been cancelled. */
export async function isBookingCancelled(tracking: string): Promise<boolean> {
  return isCancelled(tracking);
}

// Eligibility helpers are pure presentation hints (which actions to offer) and
// stay synchronous — they are not authoritative business decisions.
export function claimEligible(status: TransactionStatus): boolean {
  return isClaimEligible(status);
}
export function cancelEligible(status: TransactionStatus): boolean {
  return isCancelEligible(status);
}

/** Best-effort local display-cache sync from a live QuadX Bridge claim read
 * — see `claimBridgeService.ts`. Never a status transition of its own. */
export function syncLocalClaimStatus(id: string, status: ClaimStatus): void {
  updateLocalClaimStatus(id, status);
}
