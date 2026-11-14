/**
 * Booking voucher service — DEMO/MOCK ONLY, for the GGX Basic single-booking
 * flow's Review & Payment voucher field.
 *
 * Deliberately separate from `promotionsService.ts`: that service is the
 * real, backend-authoritative Commerce storefront-buyer promo system, keyed
 * by a seller's `storeSlug` — a different domain (a buyer discount on a
 * seller's storefront order), not a GGX-issued voucher applied to a seller's
 * own shipping fee. No backend contract exists yet for booking-level
 * vouchers.
 *
 * This mock never calls a backend, never affects any real transaction or
 * booking submission, and resets every session (in-memory catalog only).
 * Prepaid-bundle redemption is intentionally out of scope here — nothing in
 * the existing module-catalog/add-ons services exposes a reusable bundle
 * concept to build on.
 */

export type VoucherDiscountType = 'fixed' | 'percentage';

export interface BookingVoucherResult {
  valid: boolean;
  code: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  message?: string;
}

/** A voucher as shown in the "Available promos" list — the same mock catalog
 * entries `validateBookingVoucher` matches against, with the display copy
 * the list needs. `expiresAt` is optional (ISO date) — not every promo has one. */
export interface BookingVoucherCatalogEntry {
  code: string;
  name: string;
  description: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  expiresAt?: string;
}

const MOCK_BOOKING_VOUCHERS: Record<string, BookingVoucherCatalogEntry> = {
  SULIT10: { code: 'SULIT10', name: 'Sulit Shipping Discount', description: '₱10 off your shipping fee', discountType: 'fixed', discountValue: 10, expiresAt: '2026-12-31' },
  GOGO20: { code: 'GOGO20', name: 'GoGo Welcome Discount', description: '₱20 off your shipping fee', discountType: 'fixed', discountValue: 20, expiresAt: '2026-12-31' },
  FIRST15: { code: 'FIRST15', name: 'First Booking Discount', description: '₱15 off your shipping fee', discountType: 'fixed', discountValue: 15 },
};

/** The current "Available promos" list — demo-only, same catalog `validateBookingVoucher` checks against. */
export function listAvailableBookingVouchers(): BookingVoucherCatalogEntry[] {
  return Object.values(MOCK_BOOKING_VOUCHERS);
}

/** DEMO ONLY — never wired to real redemption or any backend call. */
export async function validateBookingVoucher(code: string): Promise<BookingVoucherResult> {
  const normalized = code.trim().toUpperCase();
  const match = MOCK_BOOKING_VOUCHERS[normalized];
  if (!match) {
    return {
      valid: false,
      code: normalized,
      discountType: 'fixed',
      discountValue: 0,
      message: 'Invalid or expired promo code.',
    };
  }
  return { valid: true, code: normalized, discountType: match.discountType, discountValue: match.discountValue };
}

/** Discount is always capped at the shipping fee it applies to — never negative, never over 100% of it. */
export function computeVoucherDiscount(result: BookingVoucherResult, shippingFee: number): number {
  if (!result.valid) return 0;
  if (result.discountType === 'percentage') {
    return Math.round(shippingFee * (result.discountValue / 100));
  }
  return Math.min(result.discountValue, shippingFee);
}
