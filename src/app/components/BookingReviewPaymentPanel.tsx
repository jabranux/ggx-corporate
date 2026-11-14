/**
 * Desktop sticky Review & Payment panel for the GGX Basic single-booking
 * flow's Review step — sits in the right column alongside the compact
 * review cards (`BookingReviewSummary.tsx`). Mobile uses
 * `BookingPaymentSummaryBar.tsx` instead (a persistent bottom bar, not this
 * full inline panel) — both share their fee/voucher/payment content via
 * `BookingFeeBreakdownContent.tsx` so the logic is never duplicated.
 *
 * The fee breakdown, vouchers, and payment method always render in full —
 * there is no collapse/expand toggle, so every charge is visible without an
 * extra interaction.
 */
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { BookingFeeBreakdownContent } from './BookingFeeBreakdownContent';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import type { BookingDraft } from '../lib/basicBookingDraft';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface BookingReviewPaymentPanelProps {
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** Human-readable reason Confirm Booking is disabled, shown above the CTA. */
  blockingReason?: string;
}

export function BookingReviewPaymentPanel({ draft, onChange, onConfirm, confirmDisabled, blockingReason }: BookingReviewPaymentPanelProps) {
  const totals = computeBookingTotals(draft);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Review &amp; Payment</h2>

        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-900">Total shipping charge</span>
          <span className="font-bold text-gray-900">{fmtPHP(totals.total)}</span>
        </div>

        <BookingFeeBreakdownContent draft={draft} onChange={onChange} totals={totals} />

        {confirmDisabled && blockingReason && (
          <p className="text-xs text-red-600">{blockingReason}</p>
        )}
        <Button className="w-full" onClick={onConfirm} disabled={confirmDisabled}>
          Confirm Booking
        </Button>
      </CardContent>
    </Card>
  );
}
