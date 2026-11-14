/**
 * Compact booking header for the GGX Basic single-booking flow — replaces
 * the default app header (logo/notifications) and bottom nav while the
 * booking route is active (see `BasicCorporateLayout.tsx`). Back arrow,
 * title, and a thin 4-segment progress bar with the current step name, kept
 * to one tight block with no extra vertical spacing.
 *
 * Sticky within the scrolling page body (not fixed to the viewport) so it
 * stays visible while scrolling a step's content without covering it.
 */
import { IconChevronLeft } from '@tabler/icons-react';
import { cn } from '../lib/utils';

export const BOOKING_STEP_LABELS = ['Addresses', 'Delivery', 'Item Details', 'Review'] as const;

export interface BookingHeaderProps {
  step: number;
  onBack: () => void;
}

export function BookingHeader({ step, onBack }: BookingHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 pt-2 pb-2.5 lg:-mx-6 lg:-mt-6 lg:px-6">
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
      <div className="mt-2 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={BOOKING_STEP_LABELS.length} aria-valuenow={step + 1}>
        {BOOKING_STEP_LABELS.map((label, i) => (
          <div key={label} className={cn('h-1 flex-1 rounded-full transition-colors', i <= step ? 'bg-blue-600' : 'bg-gray-200')} />
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Step {step + 1} of {BOOKING_STEP_LABELS.length} · {BOOKING_STEP_LABELS[step]}
      </p>
    </div>
  );
}
