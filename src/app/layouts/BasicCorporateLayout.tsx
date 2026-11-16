import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { useEffect, useState, type ComponentType } from 'react';
import {
  IconLayoutDashboard, IconPackage, IconUpload, IconMessage, IconWallet,
  IconBuildingBank, IconGift, IconTicket, IconUserPlus, IconTag, IconMapPin,
  IconApps, IconBell, IconSettings,
  IconChevronDown, IconUserCircle, IconLogout, IconUser,
} from '@tabler/icons-react';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ui/Dialog';
import { useAuth } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import { JourneyShell } from '../components/journeys/JourneyShell';
import { useNotificationViewer } from '../data/notifications';
import { getUnreadCount } from '../services/notificationService';
import { BasicBottomNav } from '../components/basic-account/BasicBottomNav';
import { BasicAccountDrawer } from '../components/basic-account/BasicAccountDrawer';

interface NavChild {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}
interface NavGroup {
  name: string;
  children: NavChild[];
}

/**
 * Basic desktop sidebar navigation (spec §4). Built on the Corporate design
 * system/components (same primitives, styling, icon set as `RootLayout`), but
 * a dedicated structure — not the Business+ nav arrays — since Basic's
 * feature set and groupings are genuinely different.
 */
function buildBasicNavigation(commerceChildren: NavChild[]): (NavChild & { standalone: true } | NavGroup)[] {
  const groups: (NavChild & { standalone: true } | NavGroup)[] = [
    { name: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard, standalone: true },
    { name: 'Shipments', children: [
      { name: 'Transactions', href: '/dashboard/transactions', icon: IconPackage },
      { name: 'Bulk Upload', href: '/dashboard/bulk-uploader', icon: IconUpload },
    ] },
    { name: 'Support & Requests', children: [
      { name: 'Support Tickets', href: '/dashboard/support-tickets', icon: IconMessage },
    ] },
    { name: 'Finance', children: [
      { name: 'Earnings', href: '/dashboard/basic-earnings', icon: IconWallet },
      { name: 'Payout Settings', href: '/dashboard/payout-settings', icon: IconBuildingBank },
    ] },
    { name: 'Rewards & Savings', children: [
      { name: 'Rewards', href: '/dashboard/rewards', icon: IconGift },
      { name: 'Vouchers', href: '/dashboard/vouchers', icon: IconTicket },
      { name: 'Referrals', href: '/dashboard/referrals', icon: IconUserPlus },
      { name: 'Sulit Bundles', href: '/dashboard/sulit-bundles', icon: IconTag },
    ] },
    { name: 'Account Management', children: [
      { name: 'Address Book', href: '/dashboard/address-book', icon: IconMapPin },
      { name: 'Account Add-ons', href: '/dashboard/account-add-ons', icon: IconApps },
    ] },
  ];
  if (commerceChildren.length > 0) {
    groups.push({ name: 'Commerce', children: commerceChildren });
  }
  groups.push({ name: 'System', children: [
    { name: 'Notifications', href: '/dashboard/notifications', icon: IconBell },
    { name: 'Settings', href: '/dashboard/settings', icon: IconSettings },
  ] });
  return groups;
}

export function BasicCorporateLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // The booking flow (`BookDelivery.tsx`) replaces the default header
  // (logo/notifications) and bottom nav with its own compact
  // `BookingHeader` — a dedicated, focused layout for a multi-step flow,
  // per the product spec. The desktop sidebar is left in place (not asked
  // for, and it sits beside the content rather than competing with it).
  const isBookingFlow = location.pathname.startsWith('/dashboard/book-delivery');

  // The mobile home (`BasicHome.tsx`) integrates the notification bell into
  // its own greeting row and drops this header's logo entirely on mobile —
  // a redundant second "GoGo Xpress / Basic" brand mark right above the
  // exact same thing the bottom nav's "Home" tab already identifies (spec
  // §1). Every other mobile page still needs this header for notification
  // access, since the bottom nav itself has no notifications tab — only the
  // home route drops it, and only below `lg:` (desktop keeps its header,
  // including on the home route, exactly as before).
  const isHomeMobile = location.pathname === '/dashboard';

  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    setAccountDrawerOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  // Optional enabled features (spec §4: "Optional enabled features should
  // appear in their appropriate sidebar group") — same resolution RootLayout
  // uses for Business+, scoped to this Basic account.
  //
  // Inventory/Storefront are held to "Coming soon" for Basic (see
  // `businessModulesService.ts`'s `BASIC_COMMERCE_PENDING_IDS`: the real
  // Commerce backend's consolidated Main Account view isn't segment-aware
  // yet, so a Basic account's own commerce data would be cross-tenant-
  // visible to Business+). The nav/drawer must stay consistent with that —
  // never show a Commerce group for Basic, even if a feature flag is
  // somehow set, until that backend gap is closed.
  const commerceChildren: NavChild[] = [];
  const navigation = buildBasicNavigation(commerceChildren);

  const displayName = user?.name ?? 'Basic Account';
  const displayEmail = user?.email ?? '';
  const initials = displayName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const notificationViewer = useNotificationViewer();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getUnreadCount({ viewer: notificationViewer })
      .then((c) => { if (!cancelled) setUnreadCount(c); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [notificationViewer, location.pathname]);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate('/');
  };

  return (
    <JourneyProvider>
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile; Basic mobile uses the bottom nav + Account drawer instead. */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="flex h-14 items-center gap-3 px-5 border-b border-gray-200 flex-shrink-0">
          <img
            src="https://gogoxpress.com/wp-content/uploads/2022/07/gogox-logo.png"
            alt="GoGo Xpress"
            className="h-7 w-auto"
          />
          <div className="flex items-center leading-none ml-0.5">
            <span className="italic font-light text-[16px] text-gray-500 tracking-wide">Basic</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {navigation.map((item) => {
            if ('standalone' in item) {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            }
            return (
              <div key={item.name} className="mb-1">
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest select-none">
                  {item.name}
                </p>
                <div className="space-y-0.5">
                  {item.children.map((child) => {
                    const isActive = location.pathname === child.href;
                    const isNotifications = child.href === '/dashboard/notifications';
                    return (
                      <Link
                        key={child.name}
                        to={child.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        )}
                      >
                        <child.icon className="w-[17px] h-[17px] flex-shrink-0" />
                        <span>{child.name}</span>
                        {isNotifications && unreadCount > 0 && (
                          <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* The booking flow's mobile compact header (`BookingHeader.tsx`)
            replaces this entirely below `lg:` — this standard app header
            (notifications + account menu) stays for booking on desktop,
            where there's no step wizard and the page needs the same global
            header every other desktop page has. */}
        <header className={cn(
          'h-14 bg-white border-b border-gray-200 items-center gap-3 px-4 lg:px-6 flex-shrink-0',
          isBookingFlow || isHomeMobile ? 'hidden lg:flex' : 'flex',
        )}>
          {/* Mobile-only brand (desktop sidebar already shows it; the home
              route drops this header on mobile entirely — see isHomeMobile
              above — so this never renders alongside the home's own
              greeting-integrated bell). */}
          <div className="flex items-center gap-2 lg:hidden">
            <img
              src="https://gogoxpress.com/wp-content/uploads/2022/07/gogox-logo.png"
              alt="GoGo Xpress"
              className="h-6 w-auto"
            />
            <span className="italic font-light text-sm text-gray-500 tracking-wide">Basic</span>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => navigate('/dashboard/notifications')}
              className="relative w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <IconBell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Desktop account menu — mobile relies on the bottom nav's Account tab/drawer instead. */}
            <div className="relative hidden lg:block">
              <button
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 h-9 pl-1.5 pr-2.5 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                  <IconUser className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="hidden md:flex flex-col items-start justify-center gap-0.5">
                  <span className="text-sm font-medium text-gray-900 leading-none">{displayName}</span>
                </div>
                <IconChevronDown
                  className={cn('w-3.5 h-3.5 text-gray-400 hidden md:block transition-transform duration-150', accountMenuOpen ? 'rotate-180' : '')}
                />
              </button>

              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{displayName}</p>
                      <p className="text-xs text-gray-400 leading-snug">{displayEmail}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { setAccountMenuOpen(false); navigate('/dashboard/settings'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <IconUserCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        Settings
                      </button>
                    </div>
                    <div className="border-t border-gray-100 py-1">
                      <button
                        onClick={() => { setAccountMenuOpen(false); setShowLogoutConfirm(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <IconLogout className="w-4 h-4 flex-shrink-0" />
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className={cn(
          'flex-1 overflow-auto',
          // Fixed bottom nav's own height (~4rem) plus the device's actual
          // home-indicator safe area — a flat `pb-16` isn't enough on
          // devices with a tall safe-area inset (the nav already adds its
          // own `env(safe-area-inset-bottom)`, so content needs the same on
          // top of its ~4rem height to never render underneath it).
          !isBookingFlow && 'pb-[calc(4rem_+_env(safe-area-inset-bottom))] lg:pb-0',
        )}>
          <Outlet />
        </main>
      </div>

      {!isBookingFlow && (
        <BasicBottomNav
          accountActive={accountDrawerOpen}
          onAccountClick={() => setAccountDrawerOpen(true)}
        />
      )}

      <BasicAccountDrawer
        open={accountDrawerOpen}
        onClose={() => setAccountDrawerOpen(false)}
        displayName={displayName}
        displayEmail={displayEmail}
        moreServices={commerceChildren}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Confirm logout"
        description="Are you sure you want to log out of your account?"
        confirmLabel="Log out"
        variant="destructive"
        confirmIcon={<IconLogout className="w-3.5 h-3.5 mr-1.5" />}
      />

      <JourneyShell />
    </div>
    </JourneyProvider>
  );
}
