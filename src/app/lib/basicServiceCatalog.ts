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
  IconMapPin, IconWallet, IconBuildingBank, IconMessage, IconApps, IconCode,
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
import iconVouchers from '../../assets/basic/icon-vouchers.png';

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
   * In the single eligible pool for the home's primary (4-item) and
   * secondary (up to 5-item) recommendation rows — a fixed 11-item list
   * (Standard Delivery, Same Day Delivery, Bulk Upload, Sulit Bundles, API
   * Integration, Vouchers, Rewards, Referrals, Shopify, Storefront,
   * Analytics). KYC answers only re-rank within this pool to choose the top
   * 4 (primary) and next up to 5 (secondary) — the same item never appears
   * in both. Transactional utility pages (Earnings, Address Book, Payout
   * Settings, Support Tickets, Account Add-ons) are deliberately left
   * unflagged so they never surface in either row, staying reachable only
   * through "View all" (which always lists the complete, ungated catalog).
   */
  eligible?: boolean;
}

export const CATALOG: BasicServiceItem[] = [
  {
    id: 'same-day-delivery', label: 'Same Day Delivery', description: 'Urgent, same-day delivery for time-sensitive orders.',
    icon: IconBolt, image: iconSdd, href: '/dashboard/same-day-delivery', category: 'Shipping', badge: 'Growing',
    tags: ['business', 'same-day'], baseWeight: 11,
    eligible: true,
  },
  {
    id: 'standard-delivery', label: 'Standard Delivery', description: 'Book a rider pickup or drop-off for a single parcel.',
    icon: IconPackage, image: iconStandard, href: '/dashboard/book-delivery', category: 'Shipping',
    tags: ['everyone', 'personal', 'selling', 'business', 'exploring', 'low-volume'], baseWeight: 10,
    eligible: true,
  },
  {
    id: 'bulk-upload', label: 'Bulk Upload', description: 'Upload a spreadsheet to book many shipments at once.',
    icon: IconUpload, image: iconBulk, href: '/dashboard/bulk-uploader', category: 'Shipping', badge: 'Free',
    tags: ['selling', 'business', 'mid-volume', 'high-volume'], baseWeight: 9,
    eligible: true,
  },
  {
    id: 'sulit-bundles', label: 'Sulit Bundles', description: 'Prepaid delivery bundles at a lower per-order cost.',
    icon: IconTag, image: iconPacks, href: '/dashboard/sulit-bundles', category: 'Rewards', badge: 'New',
    tags: ['selling', 'business', 'mid-volume', 'high-volume'], baseWeight: 8,
    eligible: true,
  },
  {
    id: 'vouchers', label: 'Vouchers', description: 'View and apply promo codes for your deliveries.',
    icon: IconTicket, image: iconVouchers, href: '/dashboard/vouchers', category: 'Rewards',
    tags: ['everyone'], baseWeight: 7,
    eligible: true,
  },
  {
    id: 'rewards', label: 'Rewards', description: 'Earn perks as you ship more with GoGo Xpress.',
    icon: IconGift, image: iconRewards, href: '/dashboard/rewards', category: 'Rewards',
    tags: ['everyone', 'exploring'], baseWeight: 6,
    eligible: true,
  },
  {
    id: 'referrals', label: 'Referrals', description: 'Invite other sellers and earn referral rewards.',
    icon: IconUserPlus, image: iconReferrals, href: '/dashboard/referrals', category: 'Rewards',
    tags: ['everyone'], baseWeight: 5,
    eligible: true,
  },
  {
    id: 'basic-shopify', label: 'Shopify', description: 'Connect your Shopify store as a selling channel.',
    icon: IconShoppingBag, image: iconShopify, href: '/dashboard/basic-shopify', category: 'Commerce',
    tags: ['selling', 'shopify'], baseWeight: 4,
    eligible: true,
  },
  {
    id: 'storefront', label: 'Storefront', description: 'Build a free storefront so buyers can order directly from you.',
    icon: IconBuildingStore, image: iconStorefront, href: '/dashboard/account-add-ons', category: 'Commerce',
    tags: ['selling', 'facebook_instagram', 'own_website'], baseWeight: 3,
    eligible: true,
  },
  {
    id: 'merchant-analytics', label: 'Analytics', description: 'Track your shipping and selling performance over time.',
    icon: IconChartBar, image: iconAnalytics, href: '/dashboard/basic-merchant-analytics', category: 'Insights',
    tags: ['business', 'mid-volume', 'high-volume'], baseWeight: 2,
    eligible: true,
  },
  {
    id: 'api-integration', label: 'API Integration', description: 'Connect your own systems to GGX with API keys and webhooks.',
    icon: IconCode, href: '/dashboard/basic-api-integration', category: 'Account',
    tags: ['business', 'mid-volume', 'high-volume'], baseWeight: 1,
    eligible: true,
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
 * Ranks the single 11-item eligible pool (see `eligible` on
 * `BasicServiceItem`) by relevance to the account's KYC answers (or a
 * sensible default order when profiling hasn't been completed yet) and
 * splits the ranked list into a 4-item primary row and a next-up-to-5-item
 * secondary row. Because both rows draw from the same ranked list, a service
 * can never appear in both at once. Utility/transaction-support pages
 * (Earnings, Address Book, Payout Settings, Support Tickets, Account
 * Add-ons) are excluded from the pool entirely, so they never surface in
 * either row — they stay reachable only via "View all". KYC only ever
 * reorders/selects within the eligible pool — it never restricts access to
 * the full catalog (see this file's header comment).
 */
export function getRecommendedServices(profile: BasicKycProfile | null): RecommendedServices {
  const profileTags = profile && hasCompletedKyc(profile) && profile.answers ? tagsForAnswers(profile.answers) : null;
  const byScoreDesc = (a: BasicServiceItem, b: BasicServiceItem) => scoreItem(b, profileTags) - scoreItem(a, profileTags);

  const ranked = CATALOG.filter((item) => item.eligible).sort(byScoreDesc);
  const primary = ranked.slice(0, 4);
  const secondary = ranked.slice(4, 9);

  return { primary, secondary };
}
