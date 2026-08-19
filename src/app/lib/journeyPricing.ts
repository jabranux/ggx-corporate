/**
 * Deterministic, scenario-level fee calculation used ONLY by the Edit Delivery
 * Details journey (P3) to preview a revised amount before confirmation.
 *
 * This is not a pricing engine and must not be treated as one: it is a small,
 * fixed lookup + the same Item Protection formula already used by the Bulk
 * Booking fee preview (`docs/context/bulk-booking.md`). Authoritative pricing
 * remains backend-owned.
 */

/** Flat mock shipping fee by pouch/box size, mirroring RECEPTACLE_SIZES. */
export const JOURNEY_POUCH_SIZE_FEE: Record<string, number> = {
  SMALL: 99,
  MEDIUM: 129,
  LARGE: 169,
  BOX: 199,
  OVERSIZED: 249,
  CUSTOM: 299,
};

const DEFAULT_SHIPPING_FEE = JOURNEY_POUCH_SIZE_FEE.SMALL;

/** Item Protection fee: free under ₱500 declared value, then 1% of the excess. */
export function computeItemProtectionFee(declaredValue: number): number {
  if (declaredValue <= 500) return 0;
  return Math.round((declaredValue - 500) * 0.01 * 100) / 100;
}

export interface ProposedAmountInput {
  pouchSize: string;
  /** Declared/item value used for the Item Protection formula. */
  declaredValue: number;
  itemProtection: boolean;
}

/** Proposed payable amount (shipping + protection). Excludes COD (cash collected, not charged). */
export function computeProposedAmount(input: ProposedAmountInput): number {
  const shippingFee = JOURNEY_POUCH_SIZE_FEE[input.pouchSize] ?? DEFAULT_SHIPPING_FEE;
  const protectionFee = input.itemProtection ? computeItemProtectionFee(input.declaredValue) : 0;
  return Math.round((shippingFee + protectionFee) * 100) / 100;
}
