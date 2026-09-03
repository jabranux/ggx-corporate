// Claims & Cancellations (frontend/mock).
//
// Claims = refund requests on transactions that remained undelivered, linked to
// a tracking number. Cancellations = only for newly-booked (pending) transactions.
// Both are id-scoped via the canonical account map and may push notifications
// through the existing pushNotification extension point.

import { pushNotification } from './notifications';
import { getAccountIdByName } from './accounts';
import { loadState, saveState } from '../lib/storage';
import type { TransactionStatus } from './transactions';

// 'open' is a GGX-only transient state (just clicked Submit, haven't heard
// back from Bridge yet — Bridge itself has no "just filed" status, it starts
// everything at pending_approval too) — the other six values are QuadX
// Bridge's own canonical claim-status vocabulary, shown as-is, never
// collapsed (see mapBridgeStatusToLocal in claimBridgeService.ts — 'in-review'
// is this file's stand-in key for Bridge's 'pending_approval').
export type ClaimStatus = 'open' | 'in-review' | 'approved' | 'processing' | 'on_hold' | 'denied' | 'settled';

export const CLAIM_STATUS_META: Record<ClaimStatus, { label: string; variant: 'pending' | 'info' | 'success' | 'danger' }> = {
  open:        { label: 'Claim Filed',       variant: 'pending' },
  'in-review': { label: 'Pending Approval',  variant: 'info' },
  approved:    { label: 'Approved',          variant: 'success' },
  processing:  { label: 'Processing',        variant: 'info' },
  on_hold:     { label: 'On Hold',           variant: 'pending' },
  denied:      { label: 'Rejected',          variant: 'danger' },
  settled:     { label: 'Settled',           variant: 'success' },
};

export const CLAIM_REASONS = [
  'Undelivered — returned to sender',
  'Delivery failed',
  'Lost in transit',
  'Damaged item',
  'Significant delay',
  'Other',
];

export interface Claim {
  id: string;
  trackingNumber: string;
  reason: string;
  details?: string;
  amount?: number;
  status: ClaimStatus;
  createdAt: string;
  accountId?: string;
  accountName?: string;
}

// Seed claims linked to existing undelivered transactions.
//
// CLM-1009..CLM-1020: the 12 canonical QuadX Bridge claims (2 per Bridge
// status — Pending Approval, Approved, Processing, On Hold, Rejected,
// Settled). Bridge is the source of truth for claim status/processing; the
// `status` values below are the last-known-good display fallback (what
// ClaimDetail.tsx shows before its live Bridge sync resolves, or if Bridge
// is unreachable) — NOT a second status source to keep in sync by hand.
// `ensureClaimLinked`/`syncLocalClaimStatus` (claimBridgeService.ts,
// ClaimDetail.tsx) overwrite this the moment a live read succeeds, exactly
// like the pre-existing CLM-1001..CLM-1008 claims below already work.
// Mapping used (mirrors mapBridgeStatusToLocal in claimBridgeService.ts):
// pending_approval->in-review, approved->approved, processing->processing,
// on_hold->on_hold, rejected->denied, settled->settled — Bridge's status is
// shown as-is, never collapsed. Linked to Bridge via
// scripts/supabase-link-claims-ggx-corporate.mjs (HeyQ repo) — see
// docs/migration/ggx-corporate-quadx-bridge-claims-integration.md.
const SEED_CLAIMS: Claim[] = [
  { id: 'CLM-1020', trackingNumber: 'GGX-2026-CLM-0012', reason: 'Delivery failed', details: 'Repeated failed delivery attempts; refund claim settled by Finance.', amount: 1120, status: 'settled', createdAt: 'May 12, 2026' },
  { id: 'CLM-1019', trackingNumber: 'GGX-2026-CLM-0011', reason: 'Lost in transit', details: 'Parcel confirmed lost in the network; claim settled with a Finance reference on file.', amount: 2999, status: 'settled', createdAt: 'May 14, 2026' },
  { id: 'CLM-1018', trackingNumber: 'GGX-2026-CLM-0010', reason: 'Damaged item', details: 'Photos show packaging damage consistent with handling prior to pickup, not transit.', amount: 3400, status: 'denied', createdAt: 'May 17, 2026' },
  { id: 'CLM-1017', trackingNumber: 'GGX-2026-CLM-0009', reason: 'Other', details: 'Declared value not substantiated; claim reviewed and denied.', amount: 1500, status: 'denied', createdAt: 'May 18, 2026' },
  { id: 'CLM-1016', trackingNumber: 'GGX-2026-CLM-0008', reason: 'Lost in transit', details: 'High-value parcel lost in transit; claim on hold mid-processing.', amount: 6100, status: 'on_hold', createdAt: 'May 21, 2026' },
  { id: 'CLM-1015', trackingNumber: 'GGX-2026-CLM-0007', reason: 'Undelivered — returned to sender', details: 'Approved, but placed on hold pending an outstanding balance check.', amount: 2750, status: 'on_hold', createdAt: 'May 22, 2026' },
  { id: 'CLM-1014', trackingNumber: 'GGX-2026-CLM-0006', reason: 'Other', details: 'Booking fee charged for a shipment that was never created.', amount: 980, status: 'processing', createdAt: 'May 23, 2026' },
  { id: 'CLM-1013', trackingNumber: 'GGX-2026-CLM-0005', reason: 'Lost in transit', details: 'Escalated after 6 days with no tracking movement. Claim approved and now with Finance.', amount: 4200, status: 'processing', createdAt: 'May 24, 2026' },
  { id: 'CLM-1012', trackingNumber: 'GGX-2026-CLM-0004', reason: 'Delivery failed', details: 'Three failed delivery attempts logged; requesting a refund instead of redelivery.', amount: 1875, status: 'approved', createdAt: 'May 27, 2026' },
  { id: 'CLM-1011', trackingNumber: 'GGX-2026-CLM-0003', reason: 'Undelivered — returned to sender', details: 'Parcel was mishandled at the sort facility and returned without a proper delivery attempt.', amount: 3300, status: 'approved', createdAt: 'May 28, 2026' },
  { id: 'CLM-1010', trackingNumber: 'GGX-2026-CLM-0002', reason: 'Damaged item', details: 'Item arrived with a cracked housing; photos submitted with the claim.', amount: 5120, status: 'in-review', createdAt: 'May 30, 2026' },
  { id: 'CLM-1009', trackingNumber: 'GGX-2026-CLM-0001', reason: 'Lost in transit', details: 'Tracking has shown no scan update in 4 days past the committed delivery window.', amount: 2450, status: 'in-review', createdAt: 'May 31, 2026' },
  { id: 'CLM-1008', trackingNumber: 'GGX-2026-90006', reason: 'Delivery failed', details: 'Rider attempted delivery but building was closed. High-value COD shipment.', amount: 43200, status: 'open',      createdAt: 'May 30, 2026', accountId: 'acme-luzon',        accountName: 'Acme Luzon' },
  { id: 'CLM-1007', trackingNumber: 'GGX-2026-90008', reason: 'Delivery failed', details: 'Package marked undelivered without delivery attempt logged.', amount: 9400,  status: 'open',      createdAt: 'May 31, 2026', accountId: 'acme-corporation', accountName: 'Acme Corporation' },
  { id: 'CLM-1006', trackingNumber: 'GGX-2026-90003', reason: 'Lost in transit', details: 'Package departed origin hub but never arrived at destination hub.', amount: 55000, status: 'in-review', createdAt: 'May 29, 2026', accountId: 'acme-luzon',        accountName: 'Acme Luzon' },
  { id: 'CLM-1005', trackingNumber: 'GGX-2024-89230', reason: 'Delivery failed', details: 'Third failed attempt. Recipient confirmed availability; requesting investigation.', amount: 19500, status: 'in-review', createdAt: 'May 15, 2026', accountId: 'acme-corporation', accountName: 'Acme Corporation' },
  { id: 'CLM-1004', trackingNumber: 'GGX-2024-89229', reason: 'Undelivered — returned to sender', details: 'Package returned without proper delivery attempts. Requesting full COD refund.', amount: 72000, status: 'approved',   createdAt: 'May 14, 2026', accountId: 'acme-luzon',        accountName: 'Acme Luzon' },
  { id: 'CLM-1003', trackingNumber: 'GGX-2024-89227', reason: 'Delivery failed', details: 'Repeated failed delivery; no notification sent to recipient.', amount: 15600, status: 'settled',    createdAt: 'May 13, 2026', accountId: 'acme-corporation', accountName: 'Acme Corporation' },
  { id: 'CLM-1002', trackingNumber: 'GGX-2024-89236', reason: 'Delivery failed', details: 'Rider marked undelivered but recipient was available.', amount: 12300, status: 'denied',     createdAt: 'May 18, 2026', accountId: 'acme-luzon',        accountName: 'Acme Luzon' },
  { id: 'CLM-1001', trackingNumber: 'GGX-2024-89231', reason: 'Undelivered — returned to sender', details: 'Returned after failed delivery attempts; requesting refund of fees.', amount: 4300, status: 'settled',    createdAt: 'May 16, 2026', accountId: 'acme-corporation', accountName: 'Acme Corporation' },
];

// Hydrate from localStorage (persisted across reloads); fall back to seed.
const CLAIMS: Claim[] = loadState<Claim[]>('claims', SEED_CLAIMS);
function persistClaims(): void { saveState('claims', CLAIMS); }

let claimSeq = 1;
function nextClaimId(): string {
  return `CLM-${2000 + claimSeq++}`;
}

export function getClaims(): readonly Claim[] {
  return CLAIMS;
}

export function getClaim(id: string): Claim | undefined {
  return CLAIMS.find((c) => c.id === id);
}

export function getClaimByTracking(tracking: string): Claim | undefined {
  return CLAIMS.find((c) => c.trackingNumber === tracking);
}

/**
 * Best-effort write-through from a live QuadX Bridge claim read (see
 * `claimBridgeService.ts`) so the Claims list page shows reasonably fresh
 * status without itself making a live Bridge call per row. Never throws,
 * never notifies — this is a display-cache sync, not a status transition.
 */
export function updateLocalClaimStatus(id: string, status: ClaimStatus): void {
  const claim = CLAIMS.find((c) => c.id === id);
  if (!claim || claim.status === status) return;
  claim.status = status;
  persistClaims();
}

export interface SubmitClaimInput {
  trackingNumber: string;
  reason: string;
  details: string;
  amount?: number;
  accountName?: string;
}

/** File a claim, prepend it, and push a transaction-category notification. */
export function submitClaim(input: SubmitClaimInput): Claim {
  const id = nextClaimId();
  const accountId = input.accountName ? getAccountIdByName(input.accountName) : undefined;
  const claim: Claim = {
    id,
    trackingNumber: input.trackingNumber,
    reason: input.reason,
    details: input.details.trim() || undefined,
    amount: input.amount,
    status: 'open',
    createdAt: 'Just now',
    accountId,
    accountName: input.accountName,
  };
  CLAIMS.unshift(claim);
  persistClaims();

  pushNotification({
    category: 'transaction',
    scope: accountId ? 'subaccount' : 'parent',
    accountId,
    accountName: input.accountName,
    title: 'Claim filed',
    body: `Claim ${id} filed for ${input.trackingNumber} — ${input.reason}.`,
    href: '/dashboard/claims',
    meta: { trackingNumber: input.trackingNumber },
  });

  return claim;
}

// --- Cancellations (newly-booked only) ------------------------------------

const CANCELLED = new Set<string>(loadState<string[]>('cancellations', []));

export function isCancelled(tracking: string): boolean {
  return CANCELLED.has(tracking);
}

/** Request cancellation of a newly-booked transaction; pushes a notification. */
export function requestCancellation(tracking: string, accountName?: string): void {
  CANCELLED.add(tracking);
  saveState('cancellations', [...CANCELLED]);
  const accountId = accountName ? getAccountIdByName(accountName) : undefined;
  pushNotification({
    category: 'transaction',
    scope: accountId ? 'subaccount' : 'parent',
    accountId,
    accountName,
    title: 'Booking cancelled',
    body: `Booking ${tracking} was cancelled.`,
    href: `/dashboard/transactions/${tracking}`,
    meta: { trackingNumber: tracking },
  });
}

// --- Eligibility -----------------------------------------------------------

/** Claims are for transactions that should have been delivered but weren't. */
export function isClaimEligible(status: TransactionStatus): boolean {
  return status === 'failed' || status === 'returned' || status === 'in-transit' || status === 'picked-up';
}

/** Cancellation is only allowed for newly-booked (pending) transactions. */
export function isCancelEligible(status: TransactionStatus): boolean {
  return status === 'pending';
}
