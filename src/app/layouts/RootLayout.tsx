import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import {
  IconLayoutDashboard,
  IconPackage,
  IconUpload,
  IconReceipt,
  IconChartBar,
  IconCode,
  IconMessage,
  IconBuilding,
  IconMapPin,
  IconSettings,
  IconSearch,
  IconBell,
  IconUser,
  IconMenu2,
  IconX,
  IconLogout,
  IconChevronDown,
  IconUserCircle,
  IconLock,
  IconAdjustmentsHorizontal,
  IconCreditCard,
  IconWallet,
  IconCheck,
  IconSelector,
  IconArrowsLeftRight,
  IconUsers,
  IconFileText,
  IconReceiptRefund,
  IconActivityHeartbeat,
  IconClipboardList,
  IconBuildingStore,
  IconApps,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import { JourneyShell } from '../components/journeys/JourneyShell';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { getFeatureStateSync } from '../services/featureEnablementService';
import {
  useNotificationViewer, CATEGORY_META,
} from '../data/notifications';
// Notification data reads/writes go through the notificationService facade.
// `useNotificationViewer` (hook) + `CATEGORY_META` (presentation) stay in data.
import {
  getNotifications, getUnreadCount, markVisibleRead, formatNotificationTime,
  type AppNotification,
} from '../services/notificationService';
// Topbar cross-domain search sources its lists via the service facades.
import { getTransactions, type TransactionSummary } from '../services/transactionService';
import { getClaimsList, type Claim } from '../services/claimsService';
import { getTicketsList, type SupportTicket } from '../services/ticketsService';

interface NavChild {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavItem {
  name: string;
  href?: string;
  icon?: ComponentType<{ className?: string }>;
  type?: 'group';
  children?: NavChild[];
}

// Helper to build a group label entry.
const grp = (name: string, children: NavChild[]): NavItem => ({ type: 'group', name, children });

const standardAccountNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard },
  grp('Operations', [
    { name: 'Transactions',  href: '/dashboard/transactions',  icon: IconPackage },
    { name: 'Bulk Upload',   href: '/dashboard/bulk-uploader', icon: IconUpload },
    { name: 'Claims',        href: '/dashboard/claims',        icon: IconReceiptRefund },
    { name: 'SLA Alerts',           href: '/dashboard/sla-alerts',          icon: IconActivityHeartbeat },
    { name: 'Operations Requests',  href: '/dashboard/operations-requests', icon: IconClipboardList },
    { name: 'Support Tickets',      href: '/dashboard/support-tickets',     icon: IconMessage },
  ]),
  grp('Analytics & Reports', [
    { name: 'Analytics', href: '/dashboard/analytics', icon: IconChartBar },
    { name: 'Reports',   href: '/dashboard/reports',   icon: IconFileText },
  ]),
  grp('Finance', [
    { name: 'Earnings',           href: '/dashboard/earnings',         icon: IconWallet },
    { name: 'Billing Statements', href: '/dashboard/billing',          icon: IconReceipt },
    { name: 'Payment Settings',   href: '/dashboard/payment-settings', icon: IconCreditCard },
  ]),
  grp('Account Management', [
    { name: 'Subaccounts',   href: '/dashboard/subaccounts',  icon: IconBuilding },
    { name: 'Address Book',  href: '/dashboard/address-book', icon: IconMapPin },
  ]),
  grp('Integrations', [
    { name: 'API Integration', href: '/dashboard/api-access', icon: IconCode },
    { name: 'Shopify',         href: '/dashboard/shopify',    icon: IconBuildingStore },
  ]),
  grp('System', [
    { name: 'Notifications', href: '/dashboard/notifications', icon: IconBell },
    { name: 'Settings',      href: '/dashboard/settings',      icon: IconSettings },
  ]),
];

const mainAccountNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard },
  grp('Operations', [
    { name: 'Transactions',    href: '/dashboard/transactions',   icon: IconPackage },
    { name: 'Bulk Upload',     href: '/dashboard/bulk-uploader',  icon: IconUpload },
    { name: 'Claims',               href: '/dashboard/claims',               icon: IconReceiptRefund },
    { name: 'SLA Alerts',           href: '/dashboard/sla-alerts',           icon: IconActivityHeartbeat },
    { name: 'Operations Requests',  href: '/dashboard/operations-requests',  icon: IconClipboardList },
    { name: 'Support Tickets',      href: '/dashboard/support-tickets',      icon: IconMessage },
  ]),
  grp('Analytics & Reports', [
    { name: 'Analytics', href: '/dashboard/analytics', icon: IconChartBar },
    { name: 'Reports',   href: '/dashboard/reports',   icon: IconFileText },
  ]),
  grp('Finance', [
    { name: 'Earnings',           href: '/dashboard/earnings',         icon: IconWallet },
    { name: 'Billing Statements', href: '/dashboard/billing',          icon: IconReceipt },
    { name: 'Payment Settings',   href: '/dashboard/payment-settings', icon: IconCreditCard },
  ]),
  grp('Account Management', [
    { name: 'Subaccounts',         href: '/dashboard/subaccounts',       icon: IconBuilding },
    { name: 'Users & Permissions', href: '/dashboard/users-permissions', icon: IconUsers },
    { name: 'Address Book',        href: '/dashboard/address-book',      icon: IconMapPin },
  ]),
  grp('Integrations', [
    { name: 'API Integration', href: '/dashboard/api-access', icon: IconCode },
    { name: 'Shopify',         href: '/dashboard/shopify',    icon: IconBuildingStore },
  ]),
  grp('System', [
    { name: 'Notifications', href: '/dashboard/notifications', icon: IconBell },
    { name: 'Settings',      href: '/dashboard/settings',      icon: IconSettings },
  ]),
];

const subaccountNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard },
  grp('Operations', [
    { name: 'Transactions',    href: '/dashboard/transactions',   icon: IconPackage },
    { name: 'Bulk Upload',     href: '/dashboard/bulk-uploader',  icon: IconUpload },
    { name: 'Claims',              href: '/dashboard/claims',              icon: IconReceiptRefund },
    { name: 'SLA Alerts',          href: '/dashboard/sla-alerts',          icon: IconActivityHeartbeat },
    { name: 'Operations Requests', href: '/dashboard/operations-requests', icon: IconClipboardList },
    { name: 'Support Tickets',     href: '/dashboard/support-tickets',     icon: IconMessage },
  ]),
  grp('Analytics & Reports', [
    { name: 'Analytics', href: '/dashboard/analytics', icon: IconChartBar },
    { name: 'Reports',   href: '/dashboard/reports',   icon: IconFileText },
  ]),
  grp('Account Management', [
    { name: 'Address Book',    href: '/dashboard/address-book', icon: IconMapPin },
  ]),
  grp('Integrations', [
    { name: 'API Integration', href: '/dashboard/api-access', icon: IconCode },
    { name: 'Shopify',         href: '/dashboard/shopify',    icon: IconBuildingStore },
  ]),
  grp('System', [
    { name: 'Notifications', href: '/dashboard/notifications', icon: IconBell },
    { name: 'Settings',      href: '/dashboard/settings',      icon: IconSettings },
  ]),
];

// Managers: Operations + scoped Analytics & Reports + System only.
const managerNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard },
  grp('Operations', [
    { name: 'Transactions',    href: '/dashboard/transactions',   icon: IconPackage },
    { name: 'Bulk Upload',     href: '/dashboard/bulk-uploader',  icon: IconUpload },
    { name: 'Claims',              href: '/dashboard/claims',              icon: IconReceiptRefund },
    { name: 'SLA Alerts',          href: '/dashboard/sla-alerts',          icon: IconActivityHeartbeat },
    { name: 'Operations Requests', href: '/dashboard/operations-requests', icon: IconClipboardList },
    { name: 'Support Tickets',     href: '/dashboard/support-tickets',     icon: IconMessage },
  ]),
  grp('Analytics & Reports', [
    { name: 'Analytics', href: '/dashboard/analytics', icon: IconChartBar },
    { name: 'Reports',   href: '/dashboard/reports',   icon: IconFileText },
  ]),
  // Managers see Integrations scoped to their assigned subaccount: API
  // Integration (logs/config) + Shopify connection state.
  grp('Integrations', [
    { name: 'API Integration', href: '/dashboard/api-access', icon: IconCode },
    { name: 'Shopify',         href: '/dashboard/shopify',    icon: IconBuildingStore },
  ]),
  grp('System', [
    { name: 'Notifications', href: '/dashboard/notifications', icon: IconBell },
    { name: 'Settings',      href: '/dashboard/settings',      icon: IconSettings },
  ]),
];

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    subAccountsEnabled,
    subAccounts,
    currentAccount,
    setCurrentAccount,
    getCurrentAccountName,
    isMainAccountView,
  } = useSubAccounts();

  const { user, logout } = useAuth();
  const isManager = user?.role === 'manager';

  // Managers see only Operations, Analytics & Reports, and System.
  const navigation = isManager
    ? managerNavigation
    : !subAccountsEnabled
    ? standardAccountNavigation
    : isMainAccountView()
    ? mainAccountNavigation
    : subaccountNavigation;

  // Progressive reveal (docs/business_plus_modules.md → Navigation):
  //  - "Account Add-ons" lives in the Account Management group (discovery surface).
  //  - A Commerce group appears only when Inventory/Storefront are enabled for the
  //    current scope. Enabled add-ons get their own sidebar page; others stay in
  //    Account Add-ons only.
  const moduleCtx = useModuleAccessContext();
  const inventoryEnabled = getFeatureStateSync('inventory', moduleCtx.scopeAccountId).enabled;
  const storefrontEnabled = getFeatureStateSync('storefront', moduleCtx.scopeAccountId).enabled;
  const commerceChildren: NavChild[] = [
    ...(inventoryEnabled ? [{ name: 'Inventory', href: '/dashboard/inventory', icon: IconPackage }] : []),
    ...(storefrontEnabled ? [{ name: 'Storefront', href: '/dashboard/storefront', icon: IconBuildingStore }] : []),
  ];

  const addOnsChild: NavChild = { name: 'Account Add-ons', href: '/dashboard/account-add-ons', icon: IconApps };

  const finalNavigation: NavItem[] = [];
  let addOnsInjected = false;
  for (const item of navigation) {
    if (item.type === 'group' && item.name === 'Account Management') {
      // Hide Subaccounts nav entry until the add-on has been enabled.
      const children = (item.children ?? []).filter(
        (c) => subAccountsEnabled || c.name !== 'Subaccounts'
      );
      finalNavigation.push(grp(item.name, [...children, addOnsChild]));
      addOnsInjected = true;
    } else {
      finalNavigation.push(item);
    }
    if (item.type === 'group' && item.name === 'Operations' && commerceChildren.length > 0) {
      finalNavigation.push(grp('Commerce', commerceChildren));
    }
  }
  // Managers have no Account Management group — add a minimal one (just Add-ons)
  // just above the System group so the discovery surface is always reachable.
  if (!addOnsInjected) {
    const systemIdx = finalNavigation.findIndex((i) => i.type === 'group' && i.name === 'System');
    const acctGroup = grp('Account Management', [addOnsChild]);
    if (systemIdx >= 0) finalNavigation.splice(systemIdx, 0, acctGroup);
    else finalNavigation.push(acctGroup);
  }

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [switchAccountModalOpen, setSwitchAccountModalOpen] = useState(false);
  const [subaccountExpanded, setSubaccountExpanded] = useState(false);
  const [subaccountSearch, setSubaccountSearch] = useState('');

  // Topbar search state
  const [topbarQuery, setTopbarQuery] = useState('');
  const [topbarOpen, setTopbarOpen] = useState(false);
  const topbarRef = useRef<HTMLDivElement>(null);

  // Cross-domain search source lists, loaded from the service facades.
  // Refreshed on navigation (matches the bell's freshness) so newly created
  // claims surface in search. Filtering stays local (presentation-only).
  const [searchTx, setSearchTx] = useState<TransactionSummary[]>([]);
  const [searchClaims, setSearchClaims] = useState<Claim[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getTransactions(), getClaimsList()])
      .then(([tx, claims]) => {
        if (!active) return;
        setSearchTx(tx);
        setSearchClaims(claims);
      })
      .catch(() => { /* keep last-known lists */ });
    return () => { active = false; };
  }, [location.pathname]);

  // Tickets are NOT part of the eager per-navigation load above: unrelated
  // dashboard pages must not call /api/support/tickets just to support topbar
  // search. Instead, loaded lazily the first time the user types a qualifying
  // (>=2 char) topbar query, then reused for the rest of this RootLayout's
  // lifetime — navigating around does not refetch it.
  const [searchTickets, setSearchTickets] = useState<SupportTicket[]>([]);
  const ticketsLoadState = useRef<'idle' | 'loading' | 'loaded'>('idle');

  useEffect(() => {
    if (topbarQuery.trim().length < 2 || ticketsLoadState.current !== 'idle') return;
    ticketsLoadState.current = 'loading';
    let active = true;
    getTicketsList()
      .then((tickets) => {
        if (!active) return;
        setSearchTickets(tickets);
        ticketsLoadState.current = 'loaded';
      })
      .catch(() => {
        if (active) ticketsLoadState.current = 'idle'; // allow retry on the next qualifying keystroke
      });
    return () => { active = false; };
  }, [topbarQuery]);

  // Close all transient popovers/dropdowns when the route changes.
  useEffect(() => {
    setAccountMenuOpen(false);
    setNotificationsOpen(false);
    setTopbarOpen(false);
    setTopbarQuery('');
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate('/');
  };

  // Display identity from the authenticated user (falls back for safety).
  const displayName = user?.name ?? 'Max Rodriguez';
  const displayEmail = user?.email ?? 'max@email.com';

  // Account-menu items route into the existing Settings page (no separate
  // profile/security/preferences routes exist).
  const goToSettings = () => {
    setAccountMenuOpen(false);
    navigate('/dashboard/settings');
  };

  // Notification bell — unified model filtered by the current viewer's account
  // scope. Live unread count drives the badge. Opening the popover snapshots the
  // visible list (so unread emphasis persists while open) then marks them read.
  const notificationViewer = useNotificationViewer();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifSnapshot, setNotifSnapshot] = useState<AppNotification[]>([]);

  // Keep the badge count fresh: on mount, viewer change, and route change
  // (route change matches the prior per-render freshness so new pushes show).
  useEffect(() => {
    let cancelled = false;
    getUnreadCount({ viewer: notificationViewer })
      .then((c) => { if (!cancelled) setUnreadCount(c); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [notificationViewer, location.pathname]);

  // Refresh badge immediately when a notification is pushed on the same page.
  useEffect(() => {
    const refresh = () => {
      getUnreadCount({ viewer: notificationViewer })
        .then((c) => setUnreadCount(c))
        .catch(() => {});
    };
    window.addEventListener('ggx:notification-push', refresh);
    return () => window.removeEventListener('ggx:notification-push', refresh);
  }, [notificationViewer]);

  const openNotifications = async () => {
    const list = await getNotifications({ viewer: notificationViewer });
    setNotifSnapshot(list.map((n) => ({ ...n })));
    setNotificationsOpen(true);
    await markVisibleRead({ viewer: notificationViewer });
    setUnreadCount(0);
  };

  const handleNotificationClick = (n: AppNotification) => {
    setNotificationsOpen(false);
    if (n.href) navigate(n.href);
  };

  const handleSwitchAccount = (accountId: string) => {
    setCurrentAccount(accountId);
    setSubaccountExpanded(false);
    setSubaccountSearch('');
  };

  const handleOpenAccountSwitcher = () => {
    setAccountMenuOpen(false);
    setSwitchAccountModalOpen(true);
  };

  const accountOptions = subAccountsEnabled
    ? [
        { id: 'main', name: 'Main Account', type: 'Manage all accounts' },
        ...subAccounts.map((sa) => ({ id: sa.id, name: sa.name, type: 'Subaccount' })),
      ]
    : [];

  const filtered = accountOptions.filter((acc) =>
    acc.name.toLowerCase().includes(subaccountSearch.toLowerCase())
  );

  const currentAccountName = getCurrentAccountName();
  const currentAccountType = currentAccount === 'main' ? 'Manage all accounts' : 'Subaccount';

  const initials = currentAccountName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <JourneyProvider>
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col',
          'transform transition-transform duration-200 ease-in-out',
          'lg:translate-x-0 lg:static',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center gap-3 px-5 border-b border-gray-200 flex-shrink-0">
          <img
            src="https://gogoxpress.com/wp-content/uploads/2022/07/gogox-logo.png"
            alt="GoGo Xpress"
            className="h-7 w-auto"
          />
          <div className="flex items-center leading-none ml-0.5">
            <span className="italic font-light text-[16px] text-gray-500 tracking-wide">Business+</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="ml-auto lg:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {finalNavigation.map((item) => {
            if (item.type === 'group' && item.children) {
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
                          onClick={() => setMobileMenuOpen(false)}
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
            }

            const isActive = location.pathname === item.href;
            const Icon = item.icon!;
            return (
              <Link
                key={item.name}
                to={item.href!}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {subAccountsEnabled && !isManager && (
          <div className="flex-shrink-0 border-t border-gray-200">
            {subaccountExpanded && (
              <div className="border-b border-gray-200 bg-gray-50/70">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Accounts</span>
                  <button
                    onClick={() => { setSubaccountExpanded(false); setSubaccountSearch(''); }}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors"
                  >
                    <IconX className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative px-3 pb-2">
                  <IconSearch className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" style={{ left: '1.375rem' }} />
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    value={subaccountSearch}
                    onChange={(e) => setSubaccountSearch(e.target.value)}
                    autoFocus
                    className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="px-2 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
                  {filtered.map((acc) => {
                    const isSel = acc.id === currentAccount;
                    const accInit = acc.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
                    return (
                      <button
                        key={acc.id}
                        onClick={() => handleSwitchAccount(acc.id)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors cursor-pointer',
                          isSel ? 'bg-blue-50' : 'hover:bg-white hover:shadow-sm'
                        )}
                      >
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                          isSel ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                        )}>
                          {accInit}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className={cn('text-sm font-medium truncate leading-snug', isSel ? 'text-blue-700' : 'text-gray-800')}>
                            {acc.name}
                          </p>
                          <p className="text-xs text-gray-400 leading-snug">{acc.type}</p>
                        </div>
                        {isSel && <IconCheck className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">No accounts found</p>
                  )}
                </div>

                <div className="px-3 pb-3 border-t border-gray-200 pt-2">
                  <Link
                    to="/dashboard/subaccounts"
                    onClick={() => { setSubaccountExpanded(false); setMobileMenuOpen(false); }}
                    className="flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 cursor-pointer transition-colors py-1 rounded-lg hover:bg-blue-50"
                  >
                    <IconBuilding className="w-3.5 h-3.5" />
                    Manage Subaccounts
                  </Link>
                </div>
              </div>
            )}

            <button
              onClick={() => { setSubaccountExpanded(!subaccountExpanded); setSubaccountSearch(''); }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors group',
                subaccountExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'
              )}
            >
              <Avatar initials={initials} shape="square" size="base" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{currentAccountName}</p>
                <p className="text-xs text-gray-500 leading-tight mt-0.5">{currentAccountType}</p>
              </div>
              <IconSelector className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 group-hover:text-gray-600 transition-colors" />
            </button>
          </div>
        )}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-gray-900/40 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 lg:px-6 flex-shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-1.5 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <IconMenu2 className="w-5 h-5" />
          </button>

          {/* Topbar search — lightweight grouped-result dropdown.
              Global Cmd+K is deferred until backend search is available. */}
          <div className="flex-1 max-w-md relative" ref={topbarRef}>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search tracking numbers, orders..."
                value={topbarQuery}
                onChange={(e) => {
                  setTopbarQuery(e.target.value);
                  setTopbarOpen(e.target.value.trim().length >= 2);
                }}
                onFocus={() => topbarQuery.trim().length >= 2 && setTopbarOpen(true)}
                className="w-full h-9 pl-10 pr-4 rounded-lg border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
              />
              {topbarQuery && (
                <button
                  type="button"
                  onClick={() => { setTopbarQuery(''); setTopbarOpen(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <IconX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {topbarOpen && (() => {
              const q = topbarQuery.trim().toLowerCase();
              const txResults = searchTx
                .filter((d) => d.tracking.toLowerCase().includes(q) || d.recipient.toLowerCase().includes(q))
                .slice(0, 4);
              const claimResults = searchClaims
                .filter((c) => c.id.toLowerCase().includes(q) || c.trackingNumber.toLowerCase().includes(q))
                .slice(0, 3);
              const ticketResults = searchTickets
                .filter((t) =>
                  t.id.toLowerCase().includes(q) ||
                  (t.reference?.toLowerCase().includes(q) ?? false) ||
                  t.trackingNumber.toLowerCase().includes(q),
                )
                .slice(0, 3);
              const hasResults = txResults.length > 0 || claimResults.length > 0 || ticketResults.length > 0;
              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTopbarOpen(false)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] w-full min-w-[320px] bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                    {!hasResults ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-sm text-gray-500">No results for <span className="font-medium">"{topbarQuery}"</span></p>
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                        {txResults.length > 0 && (
                          <div>
                            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Transactions</p>
                            {txResults.map((d) => (
                              <button key={d.tracking} type="button"
                                onClick={() => { navigate(`/dashboard/transactions/${d.tracking}`); setTopbarOpen(false); setTopbarQuery(''); }}
                                className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                <IconPackage className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 leading-snug">{d.tracking}</p>
                                  <p className="text-xs text-gray-500 leading-snug truncate">{d.recipient} · {d.destination}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {claimResults.length > 0 && (
                          <div>
                            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Claims</p>
                            {claimResults.map((c) => (
                              <button key={c.id} type="button"
                                onClick={() => { navigate(`/dashboard/transactions/${c.trackingNumber}`); setTopbarOpen(false); setTopbarQuery(''); }}
                                className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                <IconReceiptRefund className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 leading-snug">{c.id}</p>
                                  <p className="text-xs text-gray-500 leading-snug">{c.trackingNumber} · {c.reason}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {ticketResults.length > 0 && (
                          <div>
                            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Support Tickets</p>
                            {ticketResults.map((t) => (
                              <button key={t.id} type="button"
                                onClick={() => { navigate(`/dashboard/support-tickets/${t.id}`); setTopbarOpen(false); setTopbarQuery(''); }}
                                className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                <IconMessage className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 leading-snug">{t.reference?.trim() || t.id}</p>
                                  <p className="text-xs text-gray-500 leading-snug truncate">{t.issueType} · {t.trackingNumber}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="px-4 py-2 border-t border-gray-100">
                          <p className="text-[11px] text-gray-400">Global Cmd+K search deferred — backend search required.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <div className="relative">
              <button
                onClick={() => (notificationsOpen ? setNotificationsOpen(false) : openNotifications())}
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

              {notificationsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotificationsOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">Notifications</p>
                      {notifSnapshot.length > 0 && (
                        <span className="text-xs text-gray-400">{notifSnapshot.length} recent</span>
                      )}
                    </div>

                    {notifSnapshot.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <IconBell className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm font-medium text-gray-700">No new notifications</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Important account, upload, and delivery updates will appear here.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                          {notifSnapshot.map((n) => {
                            const meta = CATEGORY_META[n.category];
                            const Icon = meta.icon;
                            const clickable = !!n.href;
                            return (
                              <button
                                key={n.id}
                                type="button"
                                disabled={!clickable}
                                onClick={clickable ? () => handleNotificationClick(n) : undefined}
                                className={cn(
                                  'w-full text-left flex items-start gap-3 px-4 py-3 transition-colors',
                                  clickable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default',
                                  !n.read && 'bg-blue-50/40'
                                )}
                              >
                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', meta.bgClass)}>
                                  <Icon className={cn('w-4 h-4', meta.iconClass)} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{meta.label}</span>
                                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                                  </div>
                                  <p className={cn('text-sm leading-snug', n.read ? 'text-gray-700' : 'text-gray-900 font-medium')}>{n.title}</p>
                                  {n.scope === 'subaccount' && n.accountName && (
                                    <span className="inline-flex items-center text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5 mb-0.5">
                                      {n.accountName}
                                    </span>
                                  )}
                                  <p className="text-xs text-gray-500 leading-snug mt-0.5">{n.body}</p>
                                  <p className="text-[11px] text-gray-400 mt-1">{formatNotificationTime(n.timestamp)}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="border-t border-gray-100">
                          <Link
                            to="/dashboard/notifications"
                            onClick={() => setNotificationsOpen(false)}
                            className="block w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-2.5 transition-colors"
                          >
                            View all notifications
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="w-px h-5 bg-gray-200 mx-2" />

            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-2.5 h-9 pl-1.5 pr-2.5 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                  <IconUser className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="hidden md:flex flex-col items-start justify-center gap-0.5">
                  <span className="text-sm font-medium text-gray-900 leading-none">{displayName}</span>
                  {isManager ? (
                    <span className="text-[11px] text-gray-400 leading-none">{user?.accountName}</span>
                  ) : subAccountsEnabled ? (
                    <span className="text-[11px] text-gray-400 leading-none">{currentAccountName}</span>
                  ) : null}
                </div>
                <IconChevronDown
                  className={cn(
                    'w-3.5 h-3.5 text-gray-400 hidden md:block transition-transform duration-150',
                    accountMenuOpen ? 'rotate-180' : ''
                  )}
                />
              </button>

              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] w-60 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                          <IconUser className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{displayName}</p>
                          <p className="text-xs text-gray-400 leading-snug">{displayEmail}</p>
                        </div>
                      </div>
                      {subAccountsEnabled && !isManager && (
                        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-bold text-white leading-none">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate leading-snug">{currentAccountName}</p>
                              <p className="text-xs text-gray-400 leading-snug">{currentAccountType}</p>
                            </div>
                          </div>
                          <button
                            onClick={handleOpenAccountSwitcher}
                            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer transition-colors ml-2 flex-shrink-0"
                          >
                            <IconArrowsLeftRight className="w-3 h-3" />
                            Switch
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="py-1">
                      <p className="px-4 pt-1.5 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</p>
                      <button onClick={goToSettings} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                        <IconUserCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        My Profile
                      </button>
                      <button onClick={goToSettings} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                        <IconLock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        Security
                      </button>
                      <button onClick={goToSettings} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                        <IconAdjustmentsHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        Preferences
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

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Switch Account modal — triggered from the topbar "Switch" button.
          Lists Main Account + all subaccounts; active account has a checkmark. */}
      <Dialog
        open={switchAccountModalOpen}
        onClose={() => setSwitchAccountModalOpen(false)}
        title="Switch Account"
        size="sm"
      >
        <p className="text-sm text-gray-500 mb-4">Select an account to switch to.</p>
        <div className="space-y-1">
          {accountOptions.map((acc) => {
            const isSel = acc.id === currentAccount;
            const accInit = acc.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
            return (
              <button
                key={acc.id}
                onClick={() => {
                  handleSwitchAccount(acc.id);
                  setSwitchAccountModalOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-left',
                  isSel ? 'bg-blue-50' : 'hover:bg-gray-50'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                    isSel ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  )}
                >
                  {accInit}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium truncate leading-snug',
                      isSel ? 'text-blue-700' : 'text-gray-800'
                    )}
                  >
                    {acc.name}
                  </p>
                  <p className="text-xs text-gray-400 leading-snug">{acc.type}</p>
                </div>
                {isSel && <IconCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link
            to="/dashboard/subaccounts"
            onClick={() => setSwitchAccountModalOpen(false)}
            className="flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors py-1 rounded-lg hover:bg-blue-50 cursor-pointer"
          >
            <IconBuilding className="w-3.5 h-3.5" />
            Manage Subaccounts
          </Link>
        </div>
      </Dialog>

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
