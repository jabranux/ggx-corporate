import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArrowRight, IconBell } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { BasicKycModal } from '../../components/basic-account/BasicKycModal';
import { BasicKycInviteCard } from '../../components/basic-account/BasicKycInviteCard';
import { BasicPromoCarousel } from '../../components/basic-account/BasicPromotions';
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
 * account reminders (a header "X pending" badge, a fully-clickable first
 * row, and a combined second row — title + "+N more" — opening the full
 * pending list), only when any are outstanding → primary shortcuts (single
 * row of exactly 4) → a grouped "More features" card (heading + View all,
 * then the KYC invite when profiling is incomplete, then secondary
 * shortcuts — single row up to 5 or a swipeable carousel at 6+) → the
 * campaign-style promotional carousel → activity → recent transactions →
 * regular announcements. Regular announcements deliberately sit at the
 * BOTTOM on mobile so they never push the primary services below the fold;
 * only critical advisories get a near-top placement. None of the
 * conditional sections reserve space when empty — each returns `null`
 * outright. Desktop keeps its own header bell and a distinct, narrower
 * supporting column (desktop layout refinement pass), but follows the same
 * principle of never reserving space for an empty conditional section.
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

  // Desktop keeps the original card (filled button, original padding) —
  // mobile gets the fully-clickable/text-link compact variant (spec §2).
  // Two separate elements, not one shared with a responsive class, since the
  // difference is behavioral (whole-card onClick), not just visual.
  const kycInviteCard = showInvite ? (
    <BasicKycInviteCard onPersonalize={() => setKycModalOpen(true)} onDismiss={handleDismissInvite} />
  ) : null;
  const mobileKycInviteCard = showInvite ? (
    <BasicKycInviteCard onPersonalize={() => setKycModalOpen(true)} onDismiss={handleDismissInvite} compact />
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

  const firstName = user?.name ? user.name.split(' ')[0] : '';
  const greetingText = (
    <>
      <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
        {firstName ? (
          <>Welcome, <span className="text-blue-600">{firstName}</span>!</>
        ) : (
          'Welcome!'
        )}
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
  const activitySection = <BasicActivityOverview bookings={bookings} />;
  const transactionsSection = <BasicRecentTransactions bookings={bookings} />;

  // Mobile only (spec §3 — "More features" heading + View all above the KYC
  // invitation, which sits above the secondary shortcuts; no divider between
  // KYC and secondary, relying on the invite's own tinted surface for
  // contrast instead). Desktop keeps KYC in its own supporting-column card
  // and secondary shortcuts (with their own heading) in the main column —
  // unchanged composition, see the desktop tree below.
  const kycAndSecondaryGroup = (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500">More features</h3>
        <button
          onClick={() => navigate('/dashboard/services')}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          View all <IconArrowRight className="w-3 h-3" />
        </button>
      </div>
      {mobileKycInviteCard}
      <BasicSecondaryShortcuts items={secondary} showHeader={false} />
    </div>
  );

  // Desktop "More features" section (desktop visual refinement pass): a
  // section heading + View all, then the KYC/personalize card full-width in
  // the main column, then the secondary feature cards underneath — mirrors
  // the mobile group's ordering but un-nested (no shared card wrapper), to
  // match the reference layout's spacing between these as separate blocks.
  const desktopMoreFeaturesGroup = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">More features</h3>
        <button
          onClick={() => navigate('/dashboard/services')}
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          View all <IconArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {kycInviteCard}
      <BasicSecondaryShortcuts items={secondary} showHeader={false} />
    </div>
  );

  return (
    <div className="min-h-full bg-[#F3F6FA] p-4 lg:p-6">
      {/* ── Mobile / tablet: single-column, action-oriented stack (<lg) ──
          `space-y-4` (tightened from `space-y-5`) so the now-more-compact
          reminders/KYC sections pull the promo banner higher up common
          mobile screens, per a follow-up refinement request — without
          cutting into any single section's own internal padding. */}
      <div className="lg:hidden space-y-4">
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

      {/* ── Desktop: main content + a narrower supporting column, centered
          within a 1440px max-width (desktop visual refinement pass). Content
          hierarchy: welcome → main features (2×2, more prominent) → more
          features heading → KYC card → secondary feature cards → promo
          carousel → activity → recent transactions. The supporting column
          leads with the fully-expanded critical advisory, then "Needs your
          attention", then announcements — KYC has moved into the main
          column so this column is now purely operational/informational.
          The right column is 300px at `lg:` (1024–1439px) and the spec's
          preferred 340px at the 1440px max-width itself — a fixed 340px at
          1024px would leave too little room for the main column's larger
          2×2 cards and 5-up secondary row (see `BasicServiceShortcuts.tsx`
          for why this matches its own breakpoint exactly). */}
      <div className="hidden lg:grid lg:mx-auto lg:max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_300px] [@media(min-width:1440px)]:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
        <div className="space-y-6">
          {welcome}
          {primarySection}
          {desktopMoreFeaturesGroup}
          <BasicPromoCarousel />
          {activitySection}
          {transactionsSection}
        </div>

        <div className="space-y-4">
          <BasicCriticalAlerts variant="expanded" />
          <BasicAttentionNeeded />
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
