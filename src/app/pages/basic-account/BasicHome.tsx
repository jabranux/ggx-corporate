import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BasicKycModal } from '../../components/basic-account/BasicKycModal';
import { BasicKycInviteCard } from '../../components/basic-account/BasicKycInviteCard';
import { BasicPromoCarousel, BasicFeaturedPromo } from '../../components/basic-account/BasicPromotions';
import { BasicCriticalAlerts, BasicAnnouncementsPanel } from '../../components/basic-account/BasicAnnouncements';
import { BasicPrimaryShortcuts, BasicSecondaryShortcuts } from '../../components/basic-account/BasicServiceShortcuts';
import { BasicActivityOverview, BasicRecentTransactions } from '../../components/basic-account/BasicActivitySection';
import { dismissKycInvitation, getKycProfile, hasCompletedKyc, type BasicKycProfile } from '../../lib/basicKycProfile';
import { getRecommendedServices } from '../../lib/basicServiceCatalog';
import { getRecentBookings } from '../../lib/basicBookingHistory';

/**
 * Basic account home — mobile-first, desktop-adaptive (spec §1), with KYC-
 * driven service personalization (spec §2/§3), promotions + announcements
 * (spec §4), and activity + recent transactions (spec §5).
 *
 * Mobile and desktop render genuinely different information architectures
 * (two distinct trees swapped by breakpoint via `lg:hidden`/`hidden lg:*`)
 * rather than one stretched layout. Both trees are driven by the same state
 * computed once above, so behavior (KYC, dismiss, recommendations) stays
 * identical regardless of which is visible.
 *
 * Mobile content order mirrors the original GGX app's home hierarchy:
 * Welcome → (critical alerts, only when there are any) → compact promo
 * carousel → primary shortcuts (single row of exactly 4) → a grouped KYC-
 * invite-+-secondary-shortcuts card (KYC above, only while profiling is
 * incomplete; secondary below, single row up to 5 or a swipeable carousel
 * at 6+) → activity → recent transactions → regular announcements. Regular
 * announcements deliberately sit at the BOTTOM on mobile so they never push
 * the primary services below the fold; only critical advisories get a
 * near-top placement. Desktop keeps its own composition (KYC/featured
 * promo/announcements in a supporting column) rather than reusing this order.
 */
export function BasicHome() {
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic-guest';

  const [profile, setProfile] = useState<BasicKycProfile>(() => getKycProfile(accountId));
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const bookings = useMemo(() => getRecentBookings(accountId), [accountId]);
  const { primary, secondary } = useMemo(() => getRecommendedServices(profile), [profile]);

  const showInvite = !hasCompletedKyc(profile) && !profile.invitationDismissedAt;

  const handleDismissInvite = () => setProfile(dismissKycInvitation(accountId));
  const handleKycSaved = (next: BasicKycProfile) => setProfile(next);

  const kycInviteCard = showInvite ? (
    <BasicKycInviteCard onPersonalize={() => setKycModalOpen(true)} onDismiss={handleDismissInvite} />
  ) : null;

  const welcome = (
    <div>
      <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
        Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
      </h1>
      <p className="mt-1 text-sm lg:text-base text-gray-600">What do you want to send today?</p>
    </div>
  );

  const primarySection = <BasicPrimaryShortcuts items={primary} />;
  const secondarySection = <BasicSecondaryShortcuts items={secondary} />;
  const activitySection = <BasicActivityOverview bookings={bookings} />;
  const transactionsSection = <BasicRecentTransactions bookings={bookings} />;

  // Mobile only (spec: "group the KYC invitation and secondary shortcuts
  // into one cohesive container, KYC above secondary") — a single card
  // holding the invite banner (when shown), a divider, then "More
  // services". Desktop keeps KYC in its own supporting-column card and
  // secondary shortcuts in the main column (unchanged composition — see
  // the desktop tree below).
  const kycAndSecondaryGroup = (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-4">
      {kycInviteCard}
      {kycInviteCard && <div className="border-t border-gray-100" />}
      {secondarySection}
    </div>
  );

  return (
    <div className="p-4 lg:p-6">
      {/* ── Mobile / tablet: single-column, action-oriented stack (<lg) ── */}
      <div className="lg:hidden space-y-5">
        {welcome}
        <BasicCriticalAlerts />
        <BasicPromoCarousel />
        {primarySection}
        {kycAndSecondaryGroup}
        {activitySection}
        {transactionsSection}
        <BasicAnnouncementsPanel />
      </div>

      {/* ── Desktop: main content + supporting column (spec §1) ── */}
      <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          {welcome}
          <BasicPromoCarousel />
          <div className="space-y-5">
            {primarySection}
            {secondarySection}
          </div>
          {activitySection}
          {transactionsSection}
        </div>

        <div className="lg:col-span-1 space-y-5">
          {kycInviteCard}
          <BasicFeaturedPromo />
          <BasicCriticalAlerts />
          <BasicAnnouncementsPanel />
        </div>
      </div>

      <BasicKycModal
        open={kycModalOpen}
        onClose={() => setKycModalOpen(false)}
        accountId={accountId}
        initialAnswers={profile.answers}
        onSaved={handleKycSaved}
      />
    </div>
  );
}
