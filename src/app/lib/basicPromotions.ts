/**
 * Promotional content for the Basic home's carousel + desktop featured
 * placement. Structured mock content for now (spec §4) — a dedicated
 * `placements` field keeps the carousel and the desktop featured slot from
 * repeating the same message, and keeps this swappable for a future
 * campaigns/promotions API without touching the rendering components
 * (`components/basic-account/BasicPromotions.tsx`).
 */
import type { ComponentType } from 'react';
import { IconTag, IconBolt, IconGift, IconUserPlus } from '@tabler/icons-react';

export type PromoPlacement = 'carousel' | 'featured';

export interface BasicPromotion {
  id: string;
  placements: PromoPlacement[];
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}

export const PROMOTIONS: BasicPromotion[] = [
  {
    id: 'sulit-bundles',
    placements: ['carousel'],
    icon: IconTag,
    iconClassName: 'bg-pink-50 text-pink-600',
    title: 'Save more with Sulit Bundles',
    body: 'Prepaid deliveries at a lower cost per order.',
    cta: 'View Sulit Bundles',
    href: '/dashboard/sulit-bundles',
  },
  {
    id: 'same-day',
    placements: ['carousel'],
    icon: IconBolt,
    iconClassName: 'bg-orange-50 text-orange-600',
    title: 'Same-Day Delivery is here',
    body: 'Book before 11AM, at the door by 6PM.',
    cta: 'Learn more',
    href: '/dashboard/same-day-delivery',
  },
  {
    id: 'rewards',
    placements: ['carousel'],
    icon: IconGift,
    iconClassName: 'bg-blue-50 text-blue-600',
    title: 'Earn rewards every shipment',
    body: 'Collect points for every delivery you book.',
    cta: 'View Rewards',
    href: '/dashboard/rewards',
  },
  {
    id: 'referrals',
    placements: ['featured'],
    icon: IconUserPlus,
    iconClassName: 'bg-emerald-50 text-emerald-600',
    title: 'Invite a fellow seller',
    body: 'Give them a welcome voucher and earn referral rewards when they book their first delivery.',
    cta: 'Refer and earn',
    href: '/dashboard/referrals',
  },
];

export function getPromotionsFor(placement: PromoPlacement): BasicPromotion[] {
  return PROMOTIONS.filter((p) => p.placements.includes(placement));
}
