/**
 * Mobile sticky Review & Payment bar for the GGX Basic single-booking
 * flow's Review step — a persistent bottom bar showing the total shipping
 * charge and Confirm Booking. The full fee breakdown, vouchers, and payment
 * method render inline above this bar (in `BookDelivery.tsx`'s Review step
 * content) rather than behind a "View breakdown" tap, so this bar only ever
 * needs the total + CTA. Desktop uses `BookingReviewPaymentPanel.tsx`'s
 * sticky side panel instead.
 *
 * Fixed at the true bottom of the viewport (not offset for a bottom nav —
 * `BasicCorporateLayout.tsx` hides `BasicBottomNav` throughout the booking
 * flow, so there is nothing to clear).
 */
import { Button } from './ui/Button';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import type { BookingDraft } from '../lib/basicBookingDraft';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface BookingPaymentSummaryBarProps {
  draft: BookingDraft;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  blockingReason?: string;
}

export function BookingPaymentSummaryBar({ draft, onConfirm, confirmDisabled, blockingReason }: BookingPaymentSummaryBarProps) {
  const totals = computeBookingTotals(draft);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 px-4 pt-2.5 space-y-2"
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-500">Total shipping charge</span>
        <span className="text-base font-bold text-gray-900">{fmtPHP(totals.total)}</span>
      </div>
      {confirmDisabled && blockingReason && (
        <p className="text-xs text-red-600">{blockingReason}</p>
      )}
      <Button className="w-full" onClick={onConfirm} disabled={confirmDisabled}>
        Confirm Booking
      </Button>
    </div>
  );
}
