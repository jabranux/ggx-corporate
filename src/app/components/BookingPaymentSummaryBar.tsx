/**
 * Mobile sticky Review & Payment bar for the GGX Basic single-booking
 * flow's Review step — replaces the old large inline Review & Payment card
 * with a persistent bottom bar: total shipping charge, a "View breakdown"
 * action (opens the full fee/voucher/payment drawer), and Confirm Booking.
 * Desktop uses `BookingReviewPaymentPanel.tsx`'s sticky side panel instead.
 *
 * Fixed at the true bottom of the viewport (not offset for a bottom nav —
 * `BasicCorporateLayout.tsx` hides `BasicBottomNav` throughout the booking
 * flow, so there is nothing to clear).
 */
import { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { Button } from './ui/Button';
import { Drawer } from './ui/Dialog';
import { BookingFeeBreakdownContent } from './BookingFeeBreakdownContent';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import type { BookingDraft } from '../lib/basicBookingDraft';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface BookingPaymentSummaryBarProps {
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  blockingReason?: string;
}

export function BookingPaymentSummaryBar({ draft, onChange, onConfirm, confirmDisabled, blockingReason }: BookingPaymentSummaryBarProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const totals = computeBookingTotals(draft);

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 px-4 pt-2.5 space-y-2"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-500">Total shipping charge</p>
            <p className="text-base font-bold text-gray-900">{fmtPHP(totals.total)}</p>
          </div>
          <button
            type="button"
            onClick={() => setBreakdownOpen(true)}
            className="flex items-center gap-0.5 text-xs font-semibold text-blue-600"
          >
            View breakdown <IconChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {confirmDisabled && blockingReason && (
          <p className="text-xs text-red-600">{blockingReason}</p>
        )}
        <Button className="w-full" onClick={onConfirm} disabled={confirmDisabled}>
          Confirm Booking
        </Button>
      </div>

      <Drawer open={breakdownOpen} onClose={() => setBreakdownOpen(false)} title="Fee breakdown">
        <BookingFeeBreakdownContent draft={draft} onChange={onChange} totals={totals} showFinalTotal />
      </Drawer>
    </>
  );
}
