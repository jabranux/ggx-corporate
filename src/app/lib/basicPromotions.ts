/**
 * Promotional content for the Basic home's carousel (mobile and desktop share
 * the same single placement — the desktop supporting column no longer has a
 * separate featured slot; referral promotion now lives here too). Structured
 * mock content for now (spec §4/§5), swappable for a future campaigns API
 * without touching the rendering component (`components/basic-account/BasicPromotions.tsx`).
 *
 * Entries carry `label`/`headline`/`image`/`bannerClassName` for the
 * campaign-style banner treatment (spec §5: "visually distinct from ordinary
 * dashboard cards"); `image` reuses the legacy `/basic` module's own
 * illustrated artwork (never imported from that module's components — just
 * the same static assets), matching how service shortcuts already reuse
 * them. `image` is optional — a slide without one (e.g. referrals) just
 * renders without the trailing illustration.
 */
import type { ComponentType } from 'react';
import { IconTag, IconBolt, IconGift, IconUserPlus } from '@tabler/icons-react';
import iconPacksBanner from '../../assets/basic/icon-packs-banner.png';
import iconSdd from '../../assets/basic/icon-sdd.png';
import iconRewardsBanner from '../../assets/basic/icon-rewards.png';

export type PromoPlacement = 'carousel';

export interface BasicPromotion {
  id: string;
  placements: PromoPlacement[];
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  /** Small eyebrow/campaign label shown above the headline (carousel banner only). */
  label?: string;
  /** Bold banner headline (carousel banner only) — falls back to `title` when absent. */
  headline?: string;
  /** Large campaign illustration (carousel banner only) — falls back to the `icon` chip when absent. */
  image?: string;
  /** Tailwind gradient classes for the banner background (carousel banner only). */
  bannerClassName?: string;
}

export const PROMOTIONS: BasicPromotion[] = [
  {
    id: 'sulit-bundles',
    placements: ['carousel'],
    icon: IconTag,
    iconClassName: 'bg-pink-50 text-pink-600',
    title: 'More deliveries. More savings.',
    body: 'Get lower shipping costs with prepaid bundles.',
    cta: 'Explore bundles',
    href: '/dashboard/sulit-bundles',
    label: 'Sulit Bundles',
    headline: 'More deliveries. More savings.',
    image: iconPacksBanner,
    bannerClassName: 'bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400',
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
    label: 'Same-Day Delivery',
    headline: 'At the door by 6PM.',
    image: iconSdd,
    bannerClassName: 'bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400',
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
    label: 'GGX Rewards',
    headline: 'Earn rewards every shipment.',
    image: iconRewardsBanner,
    bannerClassName: 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500',
  },
  {
    id: 'referrals',
    placements: ['carousel'],
    icon: IconUserPlus,
    iconClassName: 'bg-emerald-50 text-emerald-600',
    title: 'Invite a fellow seller',
    body: 'Give them a welcome voucher and earn referral rewards when they book their first delivery.',
    cta: 'Refer and earn',
    href: '/dashboard/referrals',
    label: 'Referrals',
    headline: 'Invite a fellow seller.',
    bannerClassName: 'bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400',
  },
];

export function getPromotionsFor(placement: PromoPlacement): BasicPromotion[] {
  return PROMOTIONS.filter((p) => p.placements.includes(placement));
}
