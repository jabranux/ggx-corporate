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

export type ClaimStatus = 'open' | 'in-review' | 'approved' | 'denied' | 'settled';

export const CLAIM_STATUS_META: Record<ClaimStatus, { label: string; variant: 'pending' | 'info' | 'success' | 'danger' }> = {
  open:        { label: 'Claim Filed', variant: 'pending' },
  'in-review': { label: 'Under Review', variant: 'info' },
  approved:    { label: 'Approved',    variant: 'success' },
  denied:      { label: 'Rejected',    variant: 'danger' },
  settled:     { label: 'Settled',     variant: 'success' },
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
const SEED_CLAIMS: Claim[] = [
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
