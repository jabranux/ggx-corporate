/**
 * GGX Basic single-booking item protection — the covered value a chosen
 * protection tier applies to, and the fee that implies.
 *
 * Free Protection covers up to ₱500 with no fee; Increase Protection covers
 * the full applicable value for a fee (see `bookingFees.ts`'s
 * `computeItemProtectionFee` for the fee formula). The tier itself is always
 * an explicit user choice (`BookingDraft.itemProtectionTier`) — never
 * inferred from the covered value, so a high declared value or COD amount
 * never silently switches the selection away from Free.
 */
import type { MerchandiseCod } from './basicBookingDraft';

/**
 * The value item protection applies to: the merchandise Cash on Delivery
 * amount when COD is enabled, otherwise the declared item value. These are
 * deliberately mutually exclusive inputs, never summed or blended — matches
 * the product spec's "when COD is enabled, use the COD amount; when COD is
 * disabled, use the declared item value."
 */
export function getProtectionCoveredValue(input: { merchandiseCod: Pick<MerchandiseCod, 'enabled' | 'amount'>; declaredValue: string }): number {
  const raw = input.merchandiseCod.enabled ? input.merchandiseCod.amount : input.declaredValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
