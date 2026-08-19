/**
 * Edit-eligibility rules for "Edit Delivery Details" (UX Journey P3).
 *
 * A narrow, pure helper so eligibility can be unit-tested independently of
 * the Journey UI. Two rules only — do not add more shipment-status or
 * payment-status branches here without a matching product requirement:
 *
 *   1. Editable only before the rider tags the shipment `Picked Up`.
 *   2. Editable only when unpaid, payable on delivery (COD), or payable
 *      through billing/account billing — not when already paid.
 */

import type { TransactionStatus } from '../data/transactions';

/** Payment states relevant to edit eligibility (a simplified view of `payment.method`). */
export type EditPaymentKind = 'unpaid' | 'cod' | 'billing' | 'paid';

export interface EditEligibilityInput {
  status: TransactionStatus;
  paymentKind: EditPaymentKind;
}

export type EditBlockedReason = 'picked_up' | 'already_paid';

export type EditEligibilityResult =
  | { editable: true }
  | { editable: false; reason: EditBlockedReason; message: string };

export const EDIT_BLOCKED_MESSAGES: Record<EditBlockedReason, string> = {
  picked_up: 'This shipment can no longer be edited because it has already been picked up.',
  already_paid: 'Paid transactions cannot be edited at this time.',
};

/** Statuses reached at or after the rider picks up the shipment. */
const POST_PICKUP_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  'picked-up',
  'in-transit',
  'delivered',
  'failed',
  'returned',
]);

const EDITABLE_PAYMENT_KINDS: ReadonlySet<EditPaymentKind> = new Set(['unpaid', 'cod', 'billing']);

/** Whether a transaction may currently have its delivery details edited. */
export function getEditEligibility(input: EditEligibilityInput): EditEligibilityResult {
  if (POST_PICKUP_STATUSES.has(input.status)) {
    return { editable: false, reason: 'picked_up', message: EDIT_BLOCKED_MESSAGES.picked_up };
  }
  if (!EDITABLE_PAYMENT_KINDS.has(input.paymentKind)) {
    return { editable: false, reason: 'already_paid', message: EDIT_BLOCKED_MESSAGES.already_paid };
  }
  return { editable: true };
}

export function isEditable(input: EditEligibilityInput): boolean {
  return getEditEligibility(input).editable;
}
