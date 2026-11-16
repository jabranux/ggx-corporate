/**
 * Full Basic service/feature catalog + KYC-driven recommendation ordering for
 * the Basic home's Primary/Secondary service shortcuts and "View all" catalog
 * page (`pages/basic-account/BasicServiceCatalogPage.tsx`).
 *
 * Business rule (basic_user_requirements.md §6, repeated in this feature's
 * own spec): KYC answers only influence ordering/selection — every item here
 * stays reachable through `CATALOG`/the "View all" page regardless of
 * profiling state. Nothing here gates access; it only ranks relevance.
 */
import type { ComponentType } from 'react';
import {
  IconPackage, IconUpload, IconBolt, IconTag, IconShoppingBag,
  IconBuildingStore, IconTicket, IconGift, IconUserPlus, IconChartBar,
  IconMapPin, IconWallet, IconBuildingBank, IconMessage, IconApps,
} from '@tabler/icons-react';
import type { BasicKycAnswers, BasicKycProfile, KycDailyOrders, KycDeliveryNeeds, KycMainUse, KycSellingChannel } from './basicKycProfile';
import { hasCompletedKyc } from './basicKycProfile';

// Reuses the legacy `/basic` module's own illustrated service icons (never
// imported FROM that module's components — just the same static assets) so
// the Corporate home's shortcuts match the original GGX app's look rather
// than a generic icon-in-a-circle. Only 9 of the 15 catalog items have a
// legacy illustration; the rest fall back to their existing Tabler icon
// (see `BasicServiceShortcuts.tsx`, which renders `image` when present).
import iconSdd from '../../assets/basic/icon-sdd.png';
import iconStandard from '../../assets/basic/icon-standard.png';
import iconBulk from '../../assets/basic/icon-bulk.png';
import iconPacks from '../../assets/basic/icon-packs.png';
import iconShopify from '../../assets/basic/icon-shopify.png';
import iconStorefront from '../../assets/basic/icon-storefront.png';
import iconRewards from '../../assets/basic/icon-rewards.png';
import iconReferrals from '../../assets/basic/icon-referrals.png';
import iconAnalytics from '../../assets/basic/icon-analytics.png';

export type ServiceCategory = 'Shipping' | 'Commerce' | 'Rewards' | 'Finance' | 'Insights' | 'Account' | 'Support';

/** Profile-derived tags a catalog item can match against. 'everyone' always matches. */
export type ServiceTag =
  | 'everyone'
  | KycMainUse
  | KycSellingChannel
  | 'low-volume' | 'mid-volume' | 'high-volume'
  | 'same-day' | 'nationwide';

export interface BasicServiceItem {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Legacy `/basic` illustrated icon (preferred over `icon` when present — see this file's import block). */
  image?: string;
  href: string;
  category: ServiceCategory;
  badge?: string;
  /** Profile signals this item is relevant to; used only for ranking. */
  tags: ServiceTag[];
  /** Base relevance when no profile signal matches — keeps a sensible default order. */
  baseWeight: number;
  /**
   * Eligible for the home's 4-item primary shortcut row (booking/service
   * entry points only). Items without this flag never appear there — the
   * recommender still just ranks within this pool, it never gates access
   * (the full catalog stays reachable via "View all" regardless).
   */
  primaryEligible?: boolean;
  /**
   * Eligible for the home's secondary shortcut row — service discovery/
   * adoption only (spec §4). Utility and transaction-support pages (Earnings,
   * Address Book, Account Add-ons, Support Tickets, Merchant Analytics) are
   * deliberately left unflagged so they never surface there, staying
   * reachable only through "View all".
   */
  secondaryEligible?: boolean;
}

export const CATALOG: BasicServiceItem[] = [
  {
    id: 'standard-delivery', label: 'Standard Delivery', description: 'Book a rider pickup or drop-off for a single parcel.',
    icon: IconPackage, image: iconStandard, href: '/dashboard/book-delivery', category: 'Shipping',
    tags: ['everyone', 'personal', 'selling', 'business', 'exploring', 'low-volume'], baseWeight: 10,
    primaryEligible: true,
  },
  {
    id: 'bulk-upload', label: 'Bulk Upload', description: 'Upload a spreadsheet to book many shipments at once.',
    icon: IconUpload, image: iconBulk, href: '/dashboard/bulk-uploader', category: 'Shipping', badge: 'Free',
    tags: ['selling', 'business', 'mid-volume', 'high-volume'], baseWeight: 9,
    primaryEligible: true,
  },
  {
    id: 'same-day-delivery', label: 'Same-Day Delivery', description: 'Urgent, same-day delivery for time-sensitive orders.',
    icon: IconBolt, image: iconSdd, href: '/dashboard/same-day-delivery', category: 'Shipping', badge: 'Growing',
    tags: ['business', 'same-day'], baseWeight: 3,
    primaryEligible: true,
  },
  {
    id: 'sulit-bundles', label: 'Sulit Bundles', description: 'Prepaid delivery bundles at a lower per-order cost.',
    icon: IconTag, image: iconPacks, href: '/dashboard/sulit-bundles', category: 'Rewards', badge: 'New',
    tags: ['selling', 'business', 'mid-volume', 'high-volume'], baseWeight: 7,
    primaryEligible: true, secondaryEligible: true,
  },
  {
    id: 'basic-shopify', label: 'Shopify', description: 'Connect your Shopify store as a selling channel.',
    icon: IconShoppingBag, image: iconShopify, href: '/dashboard/basic-shopify', category: 'Commerce',
    tags: ['selling', 'shopify'], baseWeight: 2,
    primaryEligible: true, secondaryEligible: true,
  },
  {
    id: 'storefront', label: 'Storefront', description: 'Build a free storefront so buyers can order directly from you.',
    icon: IconBuildingStore, image: iconStorefront, href: '/dashboard/account-add-ons', category: 'Commerce',
    tags: ['selling', 'facebook_instagram', 'own_website'], baseWeight: 6,
    primaryEligible: true, secondaryEligible: true,
  },
  {
    id: 'vouchers', label: 'Vouchers', description: 'View and apply promo codes for your deliveries.',
    icon: IconTicket, href: '/dashboard/vouchers', category: 'Rewards',
    tags: ['everyone'], baseWeight: 5,
    secondaryEligible: true,
  },
  {
    id: 'rewards', label: 'Rewards', description: 'Earn perks as you ship more with GoGo Xpress.',
    icon: IconGift, image: iconRewards, href: '/dashboard/rewards', category: 'Rewards',
    tags: ['everyone', 'exploring'], baseWeight: 5,
    secondaryEligible: true,
  },
  {
    id: 'referrals', label: 'Referrals', description: 'Invite other sellers and earn referral rewards.',
    icon: IconUserPlus, image: iconReferrals, href: '/dashboard/referrals', category: 'Rewards',
    tags: ['everyone'], baseWeight: 4,
    secondaryEligible: true,
  },
  {
    id: 'merchant-analytics', label: 'Merchant Analytics', description: 'Track your shipping and selling performance over time.',
    icon: IconChartBar, image: iconAnalytics, href: '/dashboard/basic-merchant-analytics', category: 'Insights',
    tags: ['business', 'mid-volume', 'high-volume'], baseWeight: 4,
  },
  {
    id: 'address-book', label: 'Address Book', description: 'Save and manage your pickup and delivery addresses.',
    icon: IconMapPin, href: '/dashboard/address-book', category: 'Account',
    tags: ['everyone'], baseWeight: 5,
  },
  {
    id: 'earnings', label: 'Earnings', description: 'View your COD earnings and disbursable balance.',
    icon: IconWallet, href: '/dashboard/basic-earnings', category: 'Finance',
    tags: ['selling', 'business'], baseWeight: 6,
  },
  {
    id: 'payout-settings', label: 'Payout Settings', description: 'Set up your bank details to receive disbursements.',
    icon: IconBuildingBank, href: '/dashboard/payout-settings', category: 'Finance',
    tags: ['selling', 'business'], baseWeight: 3,
  },
  {
    id: 'support-tickets', label: 'Support Tickets', description: 'Get help from GoGo Xpress support.',
    icon: IconMessage, href: '/dashboard/support-tickets', category: 'Support',
    tags: ['everyone'], baseWeight: 3,
  },
  {
    id: 'account-add-ons', label: 'Account Add-ons', description: 'Discover and activate more account features.',
    icon: IconApps, href: '/dashboard/account-add-ons', category: 'Account',
    tags: ['everyone'], baseWeight: 2,
  },
];

export function getCatalogItem(id: string): BasicServiceItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function groupCatalogByCategory(): { category: ServiceCategory; items: BasicServiceItem[] }[] {
  const order: ServiceCategory[] = ['Shipping', 'Commerce', 'Rewards', 'Finance', 'Insights', 'Account', 'Support'];
  return order
    .map((category) => ({ category, items: CATALOG.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0);
}

function volumeTag(dailyOrders: KycDailyOrders): ServiceTag | null {
  if (dailyOrders === '1-5') return 'low-volume';
  if (dailyOrders === '6-20') return 'mid-volume';
  if (dailyOrders === '21-50' || dailyOrders === '51+') return 'high-volume';
  return null;
}

function deliveryTags(deliveryNeeds: KycDeliveryNeeds): ServiceTag[] {
  if (deliveryNeeds === 'same-day') return ['same-day'];
  if (deliveryNeeds === 'nationwide') return ['nationwide'];
  if (deliveryNeeds === 'both') return ['same-day', 'nationwide'];
  return [];
}

/** Derives the full set of profile tags an answer set matches, for scoring. */
function tagsForAnswers(answers: BasicKycAnswers): Set<ServiceTag> {
  const tags = new Set<ServiceTag>(['everyone', answers.mainUse]);
  answers.sellingChannels.forEach((c) => tags.add(c));
  const vol = volumeTag(answers.dailyOrders);
  if (vol) tags.add(vol);
  deliveryTags(answers.deliveryNeeds).forEach((t) => tags.add(t));
  return tags;
}

function scoreItem(item: BasicServiceItem, profileTags: Set<ServiceTag> | null): number {
  if (!profileTags) return item.baseWeight;
  const matches = item.tags.filter((t) => profileTags.has(t)).length;
  // Profile matches dominate ordering; baseWeight only breaks ties between
  // equally-matched items so the order stays stable and sensible.
  return matches * 100 + item.baseWeight;
}

export interface RecommendedServices {
  primary: BasicServiceItem[];
  secondary: BasicServiceItem[];
}

/**
 * Ranks the catalog by relevance to the account's KYC answers (or a sensible
 * default order when profiling hasn't been completed yet) and splits it into
 * a 4-item primary row (service/booking entry points only — `primaryEligible`)
 * and a secondary row (service discovery/adoption only — `secondaryEligible`,
 * spec §4; excludes utility/transaction-support pages like Earnings, Address
 * Book, Account Add-ons, Support Tickets, and Merchant Analytics, which stay
 * reachable only via "View all"). Primary and secondary are ranked from two
 * separate eligibility pools, and any item chosen for primary is excluded
 * from secondary, so the two rows never duplicate a service. KYC only ever
 * reorders/selects within these pools — it never restricts access to the
 * full catalog (see this file's header comment).
 */
export function getRecommendedServices(profile: BasicKycProfile | null): RecommendedServices {
  const profileTags = profile && hasCompletedKyc(profile) && profile.answers ? tagsForAnswers(profile.answers) : null;
  const byScoreDesc = (a: BasicServiceItem, b: BasicServiceItem) => scoreItem(b, profileTags) - scoreItem(a, profileTags);

  const primary = CATALOG.filter((item) => item.primaryEligible).sort(byScoreDesc).slice(0, 4);
  const primaryIds = new Set(primary.map((item) => item.id));
  const secondary = CATALOG
    .filter((item) => item.secondaryEligible && !primaryIds.has(item.id))
    .sort(byScoreDesc);

  return { primary, secondary };
}
