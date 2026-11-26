/**
 * Shared state/color mapping for the Basic single-booking flow's "current /
 * completed / pending" section treatment (mobile Accordion step indicators
 * + desktop section cards) — one source of truth so the same blue/green/grey
 * palette reads identically on both layouts, per the 2026-11-26 visual
 * refinement request.
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

/** First-incomplete-is-current progression shared by both layouts: earlier valid sections read as completed, the first invalid one is current, anything after it is pending. */
export function bookingSectionTone(index: number, firstIncompleteIndex: number): BookingSectionTone {
  if (firstIncompleteIndex === -1 || index < firstIncompleteIndex) return 'completed';
  if (index === firstIncompleteIndex) return 'current';
  return 'pending';
}
