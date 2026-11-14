/**
 * Desktop sticky Review & Payment panel for the GGX Basic single-booking
 * flow's Review step — sits in the right column alongside the compact
 * review cards (`BookingReviewSummary.tsx`). Mobile uses
 * `BookingPaymentSummaryBar.tsx` instead (a persistent bottom bar, not this
 * full inline panel) — both share their fee/voucher/payment content via
 * `BookingFeeBreakdownContent.tsx` so the logic is never duplicated.
 */
import { useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { BookingFeeBreakdownContent } from './BookingFeeBreakdownContent';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import { cn } from '../lib/utils';
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
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const totals = computeBookingTotals(draft);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Review &amp; Payment</h2>

        <button
          type="button"
          onClick={() => setBreakdownOpen((o) => !o)}
          aria-expanded={breakdownOpen}
          className="flex w-full items-center justify-between"
        >
          <span className="flex items-center gap-1 font-semibold text-gray-900">
            Total shipping charge
            <IconChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', breakdownOpen && 'rotate-180')} />
          </span>
          <span className="font-bold text-gray-900">{fmtPHP(totals.total)}</span>
        </button>

        {breakdownOpen && <BookingFeeBreakdownContent draft={draft} onChange={onChange} totals={totals} />}
        {!breakdownOpen && draft.merchandiseCod.enabled && (
          <p className="text-xs text-gray-400">
            Plus {fmtPHP(totals.codAmount)} merchandise COD, collected separately from the receiver.
          </p>
        )}

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
