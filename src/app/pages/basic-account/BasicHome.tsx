import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconBell } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { BasicKycModal } from '../../components/basic-account/BasicKycModal';
import { BasicKycInviteCard } from '../../components/basic-account/BasicKycInviteCard';
import { BasicPromoCarousel, BasicFeaturedPromo } from '../../components/basic-account/BasicPromotions';
import { BasicCriticalAlerts, BasicAnnouncementsPanel } from '../../components/basic-account/BasicAnnouncements';
import { BasicAttentionNeeded } from '../../components/basic-account/BasicAttentionNeeded';
import { BasicPrimaryShortcuts, BasicSecondaryShortcuts } from '../../components/basic-account/BasicServiceShortcuts';
import { BasicActivityOverview, BasicRecentTransactions } from '../../components/basic-account/BasicActivitySection';
import { dismissKycInvitation, getKycProfile, hasCompletedKyc, type BasicKycProfile } from '../../lib/basicKycProfile';
import { getRecommendedServices } from '../../lib/basicServiceCatalog';
import { getRecentBookings } from '../../lib/basicBookingHistory';
import { useNotificationViewer } from '../../data/notifications';
import { getUnreadCount } from '../../services/notificationService';

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
 * Mobile content hierarchy (spec §1): personalized greeting with the
 * notification bell integrated beside it (no separate logo header) →
 * critical service advisories, only when any exist → "Attention needed"
 * account reminders, only when any are outstanding → primary shortcuts
 * (single row of exactly 4) → a grouped KYC-invite-+-secondary-shortcuts
 * card (KYC above, only while profiling is incomplete; secondary below,
 * single row up to 5 or a swipeable carousel at 6+) → the campaign-style
 * promotional carousel → activity → recent transactions → regular
 * announcements. Regular announcements deliberately sit at the BOTTOM on
 * mobile so they never push the primary services below the fold; only
 * critical advisories get a near-top placement. None of the conditional
 * sections reserve space when empty — each returns `null` outright. Desktop
 * keeps its own, unchanged composition (own header bell, KYC/featured
 * promo/announcements in a supporting column, promo carousel near the top)
 * rather than reusing this order — this pass is mobile-only.
 */
export function BasicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  // Mobile only: the notification bell normally lives in the top app header
  // (`BasicCorporateLayout.tsx`), but that header is dropped on the mobile
  // home (spec §1 — "remove the redundant logo header, integrate the bell
  // alongside the greeting") in favor of surfacing it right next to the
  // personalized greeting instead. Desktop is unaffected — it keeps its own
  // header bell exactly as before.
  const notificationViewer = useNotificationViewer();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getUnreadCount({ viewer: notificationViewer })
      .then((c) => { if (!cancelled) setUnreadCount(c); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [notificationViewer]);

  const greetingText = (
    <>
      <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
        Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
      </h1>
      <p className="mt-1 text-sm lg:text-base text-gray-600">What do you want to send today?</p>
    </>
  );

  // Desktop keeps its existing composition exactly (own header bell).
  const welcome = <div>{greetingText}</div>;

  // Mobile-only greeting row with the integrated bell.
  const mobileGreeting = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">{greetingText}</div>
      <button
        onClick={() => navigate('/dashboard/notifications')}
        className="relative mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm active:bg-gray-50 cursor-pointer transition-colors"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <IconBell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
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
        {mobileGreeting}
        <BasicCriticalAlerts />
        <BasicAttentionNeeded />
        {primarySection}
        {kycAndSecondaryGroup}
        <BasicPromoCarousel />
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
