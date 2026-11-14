/**
 * Buyer-facing checkout estimates (presentation/demo only).
 *
 * Friendly, timing/value-based delivery labels and a mock delivery-fee estimate
 * for the public storefront / product checkout. Buyers never see the internal
 * STD / SDD / OD service keys. Real rates are backend-owned (see
 * docs/service_type_rules.md); these are clearly-labeled demo estimates,
 * consistent with the bulk uploader's "estimated fees" treatment.
 */
import type { DeliveryServiceType } from '../services/transactionService';

export type DeliveryRegion = 'metro' | 'luzon' | 'vismin' | 'unknown';

// Keyword matching keeps this resilient to province-name variants from the
// location cascade without enumerating every province.
const MM_NEARBY = ['metro manila', 'manila', 'cavite', 'laguna', 'rizal', 'bulacan'];
const VISMIN = [
  'cebu', 'bohol', 'negros', 'iloilo', 'capiz', 'aklan', 'antique', 'guimaras',
  'leyte', 'samar', 'biliran', 'siquijor', 'davao', 'misamis', 'bukidnon',
  'zamboanga', 'cotabato', 'sultan kudarat', 'sarangani', 'lanao', 'agusan',
  'surigao', 'maguindanao', 'basilan', 'sulu', 'tawi', 'camiguin',
];

/**
 * Strict Metro Manila (NCR) check — used for Same-day / On-demand eligibility,
 * which are Metro-only. Narrower than the `metro` estimate bucket (that also
 * covers nearby provinces for Standard timing).
 */
export function isMetroManila(province: string): boolean {
  const p = province.trim().toLowerCase();
  return p.includes('metro manila') || p === 'ncr' || p.includes('national capital region');
}

/** Classify a delivery province into a coarse region for estimates. */
export function classifyRegion(province: string): DeliveryRegion {
  const p = province.trim().toLowerCase();
  if (!p) return 'unknown';
  if (MM_NEARBY.some((k) => p.includes(k))) return 'metro';
  if (VISMIN.some((k) => p.includes(k))) return 'vismin';
  return 'luzon';
}

/** Single source of truth for Standard delivery day-counts by region — `STANDARD_LABEL` and `basicPickupScheduling.ts`'s `estimateDeliveryDateRange` both derive from this instead of each hardcoding their own numbers. */
export const STANDARD_DAY_RANGE: Record<DeliveryRegion, [number, number]> = {
  metro: [1, 2],
  luzon: [3, 5],
  vismin: [5, 7],
  unknown: [3, 7],
};

const STANDARD_LABEL: Record<DeliveryRegion, string> = {
  metro: `Estimated ${STANDARD_DAY_RANGE.metro[0]}–${STANDARD_DAY_RANGE.metro[1]} days`,
  luzon: `Estimated ${STANDARD_DAY_RANGE.luzon[0]}–${STANDARD_DAY_RANGE.luzon[1]} days`,
  vismin: `Estimated ${STANDARD_DAY_RANGE.vismin[0]}–${STANDARD_DAY_RANGE.vismin[1]} days`,
  unknown: 'Estimated delivery depends on location',
};

/** Buyer-facing timing/value label for a delivery option. */
export function friendlyDeliveryLabel(serviceType: DeliveryServiceType, region: DeliveryRegion): string {
  switch (serviceType) {
    case 'on_demand': return 'Within 40 minutes';
    case 'same_day':  return 'Within the day';
    case 'standard':  return STANDARD_LABEL[region];
  }
}

const STANDARD_FEE: Record<DeliveryRegion, number> = {
  metro: 79,
  luzon: 120,
  vismin: 165,
  unknown: 99,
};

/** Mock delivery-fee estimate (demo only — real rates are backend-owned). */
export function estimateDeliveryFee(serviceType: DeliveryServiceType, region: DeliveryRegion): number {
  switch (serviceType) {
    case 'on_demand': return 199;
    case 'same_day':  return 160;
    case 'standard':  return STANDARD_FEE[region];
  }
}
