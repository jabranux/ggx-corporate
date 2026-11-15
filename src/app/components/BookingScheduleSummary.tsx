/**
 * Prominent pickup/estimated-delivery schedule summary for the GGX Basic
 * single-booking Review step — shared between the mobile Review step
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

  // Stacked (not side-by-side) so the labels never need to truncate — this
  // block renders both inside the ~280px desktop sidebar panel and the full-
  // width mobile Review card, and a 2-column grid left the fallback copy
  // ("Select a pickup date to see an estimate") clipped in the narrower one.
  return (
    <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
      <div className="flex items-start gap-2">
        <IconCalendarEvent className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Pickup</p>
          <p className="text-sm font-semibold text-blue-900">{pickupLabel}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-blue-200 pt-2">
        <IconTruckDelivery className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Estimated delivery</p>
          <p className="text-sm font-semibold text-blue-900">{deliveryLabel}</p>
        </div>
      </div>
    </div>
  );
}
