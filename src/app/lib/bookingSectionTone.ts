/**
 * Shared color mapping for the Basic single-booking flow's mobile Accordion
 * "current / completed / pending" section treatment (step indicators + card
 * border/background) — see `BookingAccordionFlow.tsx`. Desktop reverted to
 * its original neutral cards on 2026-11-26 (product request), so this is
 * mobile-only now.
 */
export type BookingSectionTone = 'current' | 'completed' | 'pending';

/** Card border + soft background for a section in this tone. Omit `tone` to keep a component's original default styling untouched. */
export function bookingSectionToneCardClassName(tone?: BookingSectionTone): string {
  switch (tone) {
    case 'current':
      return 'border-blue-200 bg-blue-50';
    case 'completed':
      return 'border-green-200 bg-green-50';
    case 'pending':
      return 'border-gray-200 bg-gray-50';
    default:
      return '';
  }
}
