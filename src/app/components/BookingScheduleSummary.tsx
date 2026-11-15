/**
 * Pickup/estimated-delivery schedule banner for the GGX Basic single-booking
 * Review step — shared between the mobile Review step
 * (`BookingReviewSummary.tsx`) and the desktop sticky Review & Payment panel
 * (`BookingReviewPaymentPanel.tsx`) so the two surfaces never duplicate this
 * markup or disagree on wording.
 *
 * Two fixed-width columns (`grid-cols-2`), never a wrapping flex row — at
 * mobile widths a wrapping row degrades into the same two-stacked-rows look
 * this banner is meant to avoid, since the delivery estimate's own text
 * ("Estimated delivery Nov 18 – Nov 19") is long enough to force a wrap.
 * Each column carries its own short, explicit label ("Pickup"/"Est.
 * delivery") above the value, so the value itself only needs the date/range
 * — `stripEstimatedDeliveryPrefix` drops `estimateDeliveryDateRange`'s own
 * "Estimated delivery " wording, which would otherwise repeat the column
 * label right next to it.
 *
 * Reads only `draft.firstMile`/`serviceType`/`pickupDate` plus the caller's
 * already-computed `deliveryEstimateLabel` (from `BookDelivery.tsx`'s own
 * `estimateDeliveryDateRange` memo) — never recomputes or invents a date
 * estimate itself, so pickup/delivery info always matches what Pickup &
 * Delivery already showed.
 */
import { IconCalendarEvent, IconTruckDelivery } from '@tabler/icons-react';
import type { BookingDraft } from '../lib/basicBookingDraft';

export interface BookingScheduleSummaryProps {
  draft: BookingDraft;
  /** Already-computed estimate label, or undefined when none applies yet (e.g. no pickup date chosen). */
  deliveryEstimateLabel?: string;
}

function formatPickupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

const ESTIMATED_DELIVERY_PREFIX = 'Estimated delivery ';

function stripEstimatedDeliveryPrefix(label: string): string {
  return label.startsWith(ESTIMATED_DELIVERY_PREFIX) ? label.slice(ESTIMATED_DELIVERY_PREFIX.length) : label;
}

export function BookingScheduleSummary({ draft, deliveryEstimateLabel }: BookingScheduleSummaryProps) {
  const pickupValue = draft.firstMile === 'dropoff'
    ? 'Drop-off at your chosen location'
    : draft.serviceType === 'on_demand'
    ? 'Today · On-Demand'
    : draft.pickupDate
    ? formatPickupDate(draft.pickupDate)
    : 'Not yet selected';

  const deliveryValue = stripEstimatedDeliveryPrefix(
    deliveryEstimateLabel
      ?? (draft.firstMile === 'dropoff' ? 'Depends on drop-off time' : 'Select a pickup date to see an estimate'),
  );

  return (
    <div className="grid grid-cols-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-1.5">
          <IconCalendarEvent className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Pickup</span>
        </div>
        <p className="mt-0.5 text-base font-bold text-blue-900">{pickupValue}</p>
      </div>
      <div className="min-w-0 border-l border-blue-200 pl-3">
        <div className="flex items-center gap-1.5">
          <IconTruckDelivery className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Est. delivery</span>
        </div>
        <p className="mt-0.5 text-base font-bold text-blue-900">{deliveryValue}</p>
      </div>
    </div>
  );
}
