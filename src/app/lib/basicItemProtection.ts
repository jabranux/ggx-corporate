/**
 * GGX Basic single-booking item protection — which of the two protection
 * tiers (Free vs Increase) a given declared value implies.
 *
 * Free Protection covers up to ₱500 with no fee; anything above that is the
 * Increase Protection tier (see `bookingFees.ts`'s `computeItemProtectionFee`
 * for the fee formula itself — this module only answers the UI-selection
 * question, not the fee).
 */

/**
 * True when `declaredValue` implies the Free Protection tier is the correct
 * selection — empty, non-numeric, zero, or any value up to and including
 * ₱500. Anything above ₱500 implies Increase Protection.
 */
export function isFreeProtectionSelected(declaredValue: string): boolean {
  const n = Number(declaredValue);
  return !(Number.isFinite(n) && n > 500);
}
