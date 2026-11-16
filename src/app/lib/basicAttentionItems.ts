/**
 * "Attention needed" reminders for the Basic home (spec §2) — unresolved,
 * account-specific tasks requiring the seller's own action (a sale waiting to
 * be booked, a payment issue, a booking that needs confirming). Deliberately
 * separate from `basicAnnouncements.ts`'s critical advisories: advisories are
 * broadcast operational notices (delays, suspensions) that apply to everyone,
 * while these are per-account action items.
 *
 * Structured mock content for now, no backend integration — swappable later
 * for a real "action items" API without touching
 * `components/basic-account/BasicAttentionNeeded.tsx`. Per spec, an item
 * should disappear once the underlying task is actually resolved, not merely
 * once its notification is read — modeled here with a `resolved` flag on the
 * record itself (never a separate "seen/dismissed" flag), so
 * `getAttentionItems` only ever returns unresolved work.
 */
import type { ComponentType } from 'react';
import { IconAlertCircle, IconCreditCardOff, IconPackageExport } from '@tabler/icons-react';

export type AttentionKind = 'sale_awaiting_booking' | 'payment_issue' | 'confirmation_required';

export interface BasicAttentionItem {
  id: string;
  kind: AttentionKind;
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  /** Higher priority items are shown first and the top one is emphasized. */
  priority: 'high' | 'normal';
  resolved: boolean;
}

const ATTENTION_ITEMS: BasicAttentionItem[] = [
  {
    id: 'sales-awaiting-booking',
    kind: 'sale_awaiting_booking',
    icon: IconPackageExport,
    title: '3 sales are waiting to be booked',
    detail: 'Orders from your storefront and Shopify still need a delivery booked.',
    actionLabel: 'Book now',
    href: '/dashboard/book-delivery',
    priority: 'high',
    resolved: false,
  },
  {
    id: 'payment-method-issue',
    kind: 'payment_issue',
    icon: IconCreditCardOff,
    title: 'A payment didn’t go through',
    detail: 'Your GCash payment for a recent booking failed. Review it to avoid a delayed pickup.',
    actionLabel: 'Review',
    href: '/dashboard/transactions',
    priority: 'normal',
    resolved: false,
  },
  {
    id: 'booking-needs-confirmation',
    kind: 'confirmation_required',
    icon: IconAlertCircle,
    title: 'Booking GGX-2026-004821 needs confirmation',
    detail: 'Confirm the pickup details before 5:00 PM today or it will be released.',
    actionLabel: 'View',
    href: '/dashboard/transactions',
    priority: 'normal',
    resolved: false,
  },
];

const PRIORITY_RANK: Record<BasicAttentionItem['priority'], number> = { high: 0, normal: 1 };

/** Returns only unresolved items, most important first. Resolved items are filtered out entirely. */
export function getAttentionItems(): BasicAttentionItem[] {
  return ATTENTION_ITEMS
    .filter((item) => !item.resolved)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
