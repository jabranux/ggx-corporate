/**
 * Compact, horizontal pickup/estimated-delivery schedule summary for the GGX
 * Basic single-booking Review step — shared between the mobile Review step
 * (`BookingReviewSummary.tsx`) and the desktop sticky Review & Payment panel
 * (`BookingReviewPaymentPanel.tsx`) so the two surfaces never duplicate this
 * markup or disagree on wording.
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

export function BookingScheduleSummary({ draft, deliveryEstimateLabel }: BookingScheduleSummaryProps) {
  const pickupLabel = draft.firstMile === 'dropoff'
    ? 'Drop-off at your chosen location'
    : draft.serviceType === 'on_demand'
    ? 'Today · On-Demand'
    : draft.pickupDate
    ? formatPickupDate(draft.pickupDate)
    : 'Not yet selected';

  const deliveryLabel = deliveryEstimateLabel
    ?? (draft.firstMile === 'dropoff' ? 'Depends on drop-off time' : 'Select a pickup date to see an estimate');

  // Compact and horizontal, matching Step 1's own date-chip/estimate-line
  // density — no separate "Pickup"/"Estimated delivery" headings, since
  // `deliveryLabel` already spells out "Estimated delivery …" itself
  // (`estimateDeliveryDateRange`'s `label`); repeating it as a heading above
  // read as duplicated text. `flex-wrap` lets the second item drop to its
  // own line in the ~280px desktop sidebar instead of truncating.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-900">
        <IconCalendarEvent className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden="true" />
        <span className="sr-only">Pickup: </span>
        {pickupLabel}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-blue-800">
        <IconTruckDelivery className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden="true" />
        <span className="sr-only">Delivery: </span>
        {deliveryLabel}
      </span>
    </div>
  );
}
