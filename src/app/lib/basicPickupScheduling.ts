/**
 * Pickup-date scheduling for the GGX Basic single-booking flow's Delivery
 * step. Standard pickups are scheduled a few days out; On-Demand is
 * immediate and never uses this module.
 *
 * DEMO/MOCK ONLY — not sourced from a real holiday-calendar service or a
 * documented GGX pickup-cutoff rule. See the flags on each export below.
 */
import type { DeliveryServiceType } from '../services/transactionService';
import { STANDARD_DAY_RANGE, type DeliveryRegion } from './checkoutEstimates';

/**
 * DEMO/MOCK ONLY — not an authoritative PH holiday calendar; replace with a
 * real holiday-calendar service before production. Sample 2026 national
 * holidays/special non-working days, as yyyy-mm-dd strings.
 */
export const MOCK_PH_HOLIDAYS_2026: readonly string[] = [
  '2026-01-01', // New Year's Day
  '2026-02-25', // EDSA People Power Anniversary (special non-working day)
  '2026-04-09', // Araw ng Kagitingan
  '2026-05-01', // Labor Day
  '2026-06-12', // Independence Day
  '2026-08-31', // National Heroes Day (last Monday of August, hardcoded for 2026)
  '2026-11-30', // Bonifacio Day
  '2026-12-25', // Christmas Day
  '2026-12-30', // Rizal Day
];

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** False for Sundays and any date in the mock PH holiday list; true otherwise. */
export function isEligiblePickupDay(date: Date): boolean {
  if (date.getDay() === 0) return false;
  return !MOCK_PH_HOLIDAYS_2026.includes(toIsoDate(date));
}

/**
 * Returns `count` eligible pickup dates (today or later), ascending, skipping
 * Sundays and mock holidays.
 *
 * `cutoffHour = 15` (3:00 PM) is an ASSUMED/MOCK cutoff — not sourced from a
 * documented GGX pickup-cutoff rule; confirm the real cutoff time with
 * product/ops before this ships. Past the cutoff (or outside eligible hours
 * generally), today is excluded even if it would otherwise be eligible.
 */
export function getEligiblePickupDates(count = 5, cutoffHour = 15, now: Date = new Date()): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStillBookable = now.getHours() < cutoffHour && isEligiblePickupDay(cursor);
  if (!todayStillBookable) {
    cursor.setDate(cursor.getDate() + 1);
  }
  while (dates.length < count) {
    if (isEligiblePickupDay(cursor)) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Whether an already-selected pickup date (an ISO yyyy-mm-dd string, as
 * stored on the booking draft) is still confirmable right now — i.e. it
 * would still appear in a freshly-computed `getEligiblePickupDates` list.
 * A date chosen earlier in the session can go stale if the session is left
 * open across midnight or past the (mock) cutoff hour; this is the
 * confirm-time guard against that, independent of whatever the chip row
 * last rendered.
 */
export function isPickupDateSelectable(isoDate: string, cutoffHour = 15, now: Date = new Date()): boolean {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (!isEligiblePickupDay(date)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() < today.getTime()) return false;
  if (date.getTime() === today.getTime() && now.getHours() >= cutoffHour) return false;
  return true;
}

/**
 * Estimated delivery date range for a chosen pickup date. Day-counts for
 * 'standard' come from `checkoutEstimates.ts`'s shared `STANDARD_DAY_RANGE`
 * (not duplicated here). 'on_demand' is immediate/same-day. Does not skip
 * Sundays/holidays when walking forward — that constraint applies to
 * scheduling a pickup, not to the resulting delivery window estimate.
 */
export function estimateDeliveryDateRange(
  pickupDate: Date,
  serviceType: DeliveryServiceType,
  region: DeliveryRegion,
): { from: Date; to: Date; label: string } {
  if (serviceType === 'on_demand') {
    return { from: pickupDate, to: pickupDate, label: 'Within 40 minutes of pickup' };
  }

  const [minDays, maxDays] = STANDARD_DAY_RANGE[region];
  const from = new Date(pickupDate);
  from.setDate(from.getDate() + minDays);
  const to = new Date(pickupDate);
  to.setDate(to.getDate() + maxDays);

  const fmt = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const label = minDays === maxDays
    ? `Estimated delivery ${fmt(from)}`
    : `Estimated delivery ${fmt(from)} – ${fmt(to)}`;

  return { from, to, label };
}
