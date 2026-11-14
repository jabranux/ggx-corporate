/**
 * Bulk Booking fee ESTIMATE (frontend preview only).
 *
 * Authoritative fees, surcharges, and insurance are backend/source-system owned
 * (see docs/service_layer_rules.md). This module produces a clearly-labeled
 * estimate so the spreadsheet entry page can give live feedback as the user
 * types, with a pending state when inputs are incomplete. It must not be treated
 * as the source of truth — the booking confirmation returns final fees.
 *
 * Item Protection = max(declaredValue − 500, 0) × 1% (frontend estimate only).
 */

import type { BookingRow } from './bookingValidation';
import type { ServiceTypeKey } from '../data/serviceTypes';
import { BASIC_POUCH_SIZES, type BasicPouchSizeKey } from './basicPouchSizes';

const SIZE_FEE: Record<string, number> = {
  SMALL: 80, MEDIUM: 120, LARGE: 180, BOX: 250, OVERSIZED: 350,
};

const SERVICE_SURCHARGE: Record<ServiceTypeKey, number> = {
  standard: 0, same_day: 70, on_demand: 150, special_pickup: 0, high_volume: 0,
};

/**
 * Shared item-protection estimate, used by both the Business+ bulk estimate
 * below and the GGX Basic single-booking estimate
 * (`estimateBasicBookingFee`) — one formula, not duplicated per surface.
 */
export function computeItemProtectionFee(declaredValue: number): number {
  return Math.max(declaredValue - 500, 0) * 0.01;
}

/**
 * GGX Basic pouch-size fee table, sourced from `basicPouchSizes.ts`'s
 * customer-facing reference prices — the existing GGX Basic product sizes,
 * NOT the Business+ bulk `SIZE_FEE` table above.
 *
 * Flagged pricing mismatch for same-named tiers (frontend estimates only,
 * found while centralizing this calculation — not resolved here, needs a
 * product decision before any unification):
 *   - small:  Basic ₱80  vs Business+ bulk SMALL  ₱80  (match)
 *   - medium: Basic ₱100 vs Business+ bulk MEDIUM ₱120 (mismatch)
 *   - large:  Basic ₱130 vs Business+ bulk LARGE  ₱180 (mismatch)
 *   - xl/xxl: Basic ₱180/₱250 have no equivalent named tier in the bulk
 *     table — bulk's BOX (₱250) / OVERSIZED (₱350) are the closest
 *     conceptual matches by weight class, but at different prices.
 */
export const BASIC_POUCH_FEE: Record<BasicPouchSizeKey, number> = Object.fromEntries(
  BASIC_POUCH_SIZES.map((s) => [s.key, s.price]),
) as Record<BasicPouchSizeKey, number>;

export interface RowFeeBreakdown {
  baseFee: number;
  serviceSurcharge: number;
  itemProtection: number;
  total: number;
}

/**
 * Estimate the fee breakdown for a single row, or `null` when there isn't
 * enough info yet (missing/unknown parcel size or service type).
 *
 * For CUSTOM size, dimweight pricing applies: chargeable weight =
 * max(actual weight, L×W×H÷5000) at an estimated ₱35/kg. Returns null until
 * all four dimension/weight fields carry valid positive numbers.
 */
export function estimateRowFee(row: BookingRow): RowFeeBreakdown | null {
  const size = row.parcelSize?.trim().toUpperCase();
  if (!size) return null;

  const svc = row.serviceType?.trim() as ServiceTypeKey;
  if (!svc || !(svc in SERVICE_SURCHARGE)) return null;
  const serviceSurcharge = SERVICE_SURCHARGE[svc];
  const declared = parseFloat(row.declaredValue) || 0;
  const itemProtection = computeItemProtectionFee(declared);

  if (size === 'CUSTOM') {
    const l = parseFloat(row.lengthCm ?? '');
    const w = parseFloat(row.widthCm ?? '');
    const h = parseFloat(row.heightCm ?? '');
    const wt = parseFloat(row.weightKg ?? '');
    if (!l || !w || !h || !wt || l <= 0 || w <= 0 || h <= 0 || wt <= 0) return null;
    const volumetricWeight = (l * w * h) / 5000;
    const chargeableWeight = Math.max(wt, volumetricWeight);
    const baseFee = Math.ceil(chargeableWeight * 35);
    return { baseFee, serviceSurcharge, itemProtection, total: baseFee + serviceSurcharge + itemProtection };
  }

  if (!(size in SIZE_FEE)) return null;
  const baseFee = SIZE_FEE[size];
  return { baseFee, serviceSurcharge, itemProtection, total: baseFee + serviceSurcharge + itemProtection };
}

export interface FeeEstimate {
  /** Summed shipping fee (base + service surcharge) across computed rows. */
  shipping: number;
  /** Summed item protection fee across computed rows. */
  itemProtection: number;
  /** Total estimated fee across computed rows. */
  total: number;
  /** Rows that produced an estimate. */
  computedRows: number;
  /** Rows still missing inputs needed to estimate (pending, not an error). */
  pendingRows: number;
}

/**
 * Estimate the fee breakdown for a GGX Basic single booking. Mirrors
 * `estimateRowFee`'s shape/semantics but keyed to the Basic pouch-size
 * taxonomy (`BASIC_POUCH_FEE`) instead of the Business+ bulk `SIZE_FEE`
 * table, reusing the same service surcharge and item-protection formula so
 * the calculation stays centralized.
 */
export function estimateBasicBookingFee(input: {
  pouchSize: BasicPouchSizeKey;
  serviceType: ServiceTypeKey;
  declaredValue: number;
}): RowFeeBreakdown {
  const baseFee = BASIC_POUCH_FEE[input.pouchSize] ?? BASIC_POUCH_FEE.small;
  const serviceSurcharge = SERVICE_SURCHARGE[input.serviceType] ?? 0;
  const itemProtection = computeItemProtectionFee(input.declaredValue);
  return { baseFee, serviceSurcharge, itemProtection, total: baseFee + serviceSurcharge + itemProtection };
}

/** Estimate fees across the given (valid) rows. */
export function estimateFees(rows: BookingRow[]): FeeEstimate {
  let shipping = 0;
  let itemProtection = 0;
  let total = 0;
  let computedRows = 0;
  let pendingRows = 0;
  for (const row of rows) {
    const fee = estimateRowFee(row);
    if (fee === null) {
      pendingRows += 1;
    } else {
      shipping += fee.baseFee + fee.serviceSurcharge;
      itemProtection += fee.itemProtection;
      total += fee.total;
      computedRows += 1;
    }
  }
  return { shipping, itemProtection, total, computedRows, pendingRows };
}
