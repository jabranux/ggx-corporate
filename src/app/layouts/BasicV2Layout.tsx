import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import {
  IconChevronLeft,
  IconBell,
  IconUser,
  IconLayoutDashboard,
  IconSparkles,
  IconBox,
  IconReceiptTax,
  IconWallet,
} from '@tabler/icons-react';
import { BasicAccountSheet } from '../components/basic/BasicAccountSheet';
import { cn } from '../lib/utils';

const PAGE_TITLES: [string, string][] = [
  ['/basic-v2/delivery/success',  'Booking Confirmed'],
  ['/basic-v2/delivery/booking',  'Review Details'],
  ['/basic-v2/delivery/receiver', 'Receiver Details'],
  ['/basic-v2/delivery',          'Standard Delivery'],
];

function resolveTitle(pathname: string): string | null {
  for (const [prefix, title] of PAGE_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  return null;
}

// ── Full 5-tab bottom nav ─────────────────────────────────────────────────────

const LEFT_TABS = [
  { label: 'Home',    href: '/basic-v2',        icon: IconLayoutDashboard, exact: true },
  { label: 'Rewards', href: '/basic/more',       icon: IconSparkles },
];

const RIGHT_TABS = [
  { label: 'Transactions', href: '/basic/orders',   icon: IconReceiptTax },
  { label: 'Earnings',     href: '/basic/earnings', icon: IconWallet },
];

function V2BottomNav() {
  const location = useLocation();

  function isActive(href: string, exact = false) {
    return exact
      ? location.pathname === href || location.pathname === href + '/'
      : location.pathname.startsWith(href);
  }

  const bookActive = location.pathname.startsWith('/basic-v2/delivery');

  return (
    <nav
      className="flex-shrink-0 bg-white border-t border-gray-100"
      style={{ overflow: 'visible' }}
    >
      <div className="relative flex items-end justify-around h-[60px]">
        {/* Left tabs */}
        {LEFT_TABS.map(({ label, href, icon: Icon, exact }) => (
          <Link
            key={href}
            to={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-end gap-[3px] pb-[13px] pt-[11px] transition-colors',
              isActive(href, exact) ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            <Icon className="w-[22px] h-[22px] flex-shrink-0" />
            <span className="text-[10px] font-bold leading-none">{label}</span>
          </Link>
        ))}

        {/* Center FAB */}
        <div className="flex flex-1 flex-col items-center gap-[4px]">
          <Link
            to="/basic-v2/delivery"
            aria-label="Book Now"
            className="flex h-13 w-13 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{
              marginTop: -28,
              width: 52,
              height: 52,
              background: 'linear-gradient(140deg, #2f9be8, #1e6fd6)',
              boxShadow: '0 6px 18px rgba(30,111,214,0.4)',
            }}
          >
            <IconBox className="w-[24px] h-[24px] text-white" />
          </Link>
          <span
            className="pb-[13px] text-[10px] font-extrabold leading-none"
            style={{ color: bookActive ? '#1e6fd6' : '#1e6fd6' }}
          >
            Book Now
          </span>
        </div>

        {/* Right tabs */}
        {RIGHT_TABS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            to={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-end gap-[3px] pb-[13px] pt-[11px] transition-colors',
              isActive(href) ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            <Icon className="w-[22px] h-[22px] flex-shrink-0" />
            <span className="text-[10px] font-bold leading-none">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function BasicV2Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [acctOpen, setAcctOpen] = useState(false);

  const isHome = location.pathname === '/basic-v2' || location.pathname === '/basic-v2/';
  const isBookingFlow = location.pathname.startsWith('/basic-v2/delivery');
  const pageTitle = resolveTitle(location.pathname);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Phone shell — gradient background */}
      <div
        className="relative mx-auto flex h-screen w-full max-w-[430px] flex-col overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #DDF3FB 0%, #ffffff 100%)', '--basic-shell-max': '430px' } as React.CSSProperties}
      >
        {/* ── Header — transparent so gradient shows through ── */}
        <header className="relative z-10 flex-shrink-0 flex h-14 items-center justify-between px-4">
          {/* Left slot */}
          {isHome ? (
            <img
              src="https://gogoxpress.com/wp-content/uploads/2022/07/gogox-logo.png"
              alt="GOGO XPRESS"
              className="h-7 w-auto"
            />
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center cursor-pointer"
              aria-label="Back"
            >
              <IconChevronLeft className="h-5 w-5 text-blue-600" />
            </button>
          )}

          {/* Center title on inner pages */}
          {!isHome && pageTitle && (
            <p className="truncate px-2 text-base font-bold text-gray-900">{pageTitle}</p>
          )}

          {/* Right slot */}
          {isHome ? (
            <div className="flex items-center gap-2">
              <button className="flex h-9 w-9 items-center justify-center cursor-pointer" aria-label="Notifications">
                <div className="relative">
                  <IconBell className="h-5 w-5 text-blue-600" />
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white" />
                </div>
              </button>
              <button
                className="flex h-9 w-9 items-center justify-center cursor-pointer"
                aria-label="Account"
                onClick={() => setAcctOpen(true)}
              >
                <IconUser className="h-5 w-5 text-blue-600" />
              </button>
            </div>
          ) : (
            <div className="w-[36px]" />
          )}
        </header>

        {/* ── Page content ── */}
        <main className={`relative z-0 flex-1 overflow-y-auto ${isBookingFlow ? 'pb-6' : 'pb-2'}`}>
          <Outlet />
        </main>

        {/* ── Bottom nav — hidden during booking ── */}
        {!isBookingFlow && <V2BottomNav />}

        <BasicAccountSheet open={acctOpen} onClose={() => setAcctOpen(false)} />
      </div>
    </div>
  );
}
