/**
 * Centralized total/fee computation for the GGX Basic single-booking flow,
 * shared by the page's own Confirm handler and every Review-step display
 * (desktop sticky panel, mobile sticky bar + breakdown drawer, compact
 * review cards) — one calculation, never duplicated per surface.
 */
import { estimateBasicBookingFee } from './bookingFees';
import { getProtectionCoveredValue } from './basicItemProtection';
import type { BookingDraft } from './basicBookingDraft';

export interface BookingTotals {
  baseFee: number;
  serviceSurcharge: number;
  /** baseFee + serviceSurcharge — the shipping charge, before protection/voucher. */
  shipping: number;
  itemProtection: number;
  /** Covered value item protection was computed against (COD amount or declared value). */
  coveredValue: number;
  discount: number;
  /** max(shipping + itemProtection - discount, 0). Never includes merchandise COD. */
  total: number;
  /** Merchandise COD amount — collected separately from the receiver, never part of `total`. */
  codAmount: number;
}

export function computeBookingTotals(draft: BookingDraft): BookingTotals {
  const coveredValue = getProtectionCoveredValue({ merchandiseCod: draft.merchandiseCod, declaredValue: draft.declaredValue });
  const fee = estimateBasicBookingFee({
    pouchSize: draft.pouchSize,
    serviceType: draft.serviceType,
    coveredValue,
    protectionTier: draft.itemProtectionTier,
  });
  const shipping = fee.baseFee + fee.serviceSurcharge;
  const total = Math.max(shipping + fee.itemProtection - draft.voucherDiscount, 0);
  const codAmount = draft.merchandiseCod.enabled ? (Number(draft.merchandiseCod.amount) || 0) : 0;
  return {
    baseFee: fee.baseFee,
    serviceSurcharge: fee.serviceSurcharge,
    shipping,
    itemProtection: fee.itemProtection,
    coveredValue,
    discount: draft.voucherDiscount,
    total,
    codAmount,
  };
}
