/**
 * Compact booking header for the GGX Basic single-booking flow's MOBILE
 * wizard only — back/exit arrow, title, and the thin 4-segment step
 * progress bar. Desktop has no step wizard to show progress through (see
 * `BookDelivery.tsx`'s module docblock) and uses the standard GGX Corporate
 * desktop page-title pattern instead (rendered directly in `BookDelivery.tsx`,
 * not this component) — so this header is only ever mounted while the mobile
 * layout is.
 *
 * Sticky within the scrolling page body (not fixed to the viewport) so it
 * stays visible while scrolling a step's content without covering it.
 */
import { IconChevronLeft } from '@tabler/icons-react';
import { cn } from '../lib/utils';

export const BOOKING_STEP_LABELS = ['Pickup & Delivery', 'Item Details', 'Review & Payment'] as const;

export interface BookingHeaderProps {
  step: number;
  onBack: () => void;
}

export function BookingHeader({ step, onBack }: BookingHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 pt-2 pb-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex-shrink-0 -ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[15px] font-semibold text-gray-900">Book a delivery</h1>
      </div>
      <div>
        <div className="mt-2 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={BOOKING_STEP_LABELS.length} aria-valuenow={step + 1}>
          {BOOKING_STEP_LABELS.map((label, i) => (
            <div key={label} className={cn('h-1 flex-1 rounded-full transition-colors', i <= step ? 'bg-blue-600' : 'bg-gray-200')} />
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Step {step + 1} of {BOOKING_STEP_LABELS.length} · {BOOKING_STEP_LABELS[step]}
        </p>
      </div>
    </div>
  );
}
