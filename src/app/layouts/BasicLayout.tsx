import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  IconBell,
  IconChevronLeft,
  IconUser,
} from '@tabler/icons-react';
import { BasicAuroraBg } from '../components/basic/BasicAuroraBg';
import { BasicBottomNav } from '../components/basic/BasicBottomNav';
import { BasicAccountSheet } from '../components/basic/BasicAccountSheet';

const PAGE_TITLES: [string, string][] = [
  ['/basic/more',                  'More Features'],
  ['/basic/qualify',               'Business Benefits'],
  ['/basic/business-preview',      'GGX Business+'],
  ['/basic/deliver/success',       'Booking Confirmed'],
  ['/basic/deliver/booking',       'Review Details'],
  ['/basic/deliver/receiver',      'Receiver Details'],
  ['/basic/deliver',               'Standard Delivery'],
  ['/basic/address-book',          'Address Book'],
  ['/basic/account',               'Account'],
  ['/basic/orders',                'Transactions'],
  ['/basic/bulk',                  'Bulk Upload'],
  ['/basic/store',                 'Your Store'],
  ['/basic/inventory',             'Inventory'],
  ['/basic/earnings',              'Earnings'],
  ['/basic/support',               'Help & Support'],
  ['/basic/settings',              'Settings'],
  ['/basic/same-day',              'Same-Day Delivery'],
];

function resolveTitle(pathname: string): string | null {
  for (const [prefix, title] of PAGE_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  return null;
}

const glassBtn =
  'flex h-[42px] w-[42px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95';
const glassBtnStyle = {
  background: 'rgba(255,255,255,0.55)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.7)',
  boxShadow: '0 4px 14px rgba(40,70,120,0.1)',
} as const;

export function BasicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [acctOpen, setAcctOpen] = useState(false);

  const isHome = location.pathname === '/basic' || location.pathname === '/basic/';
  const isBookingFlow = location.pathname.startsWith('/basic/deliver');
  const pageTitle = resolveTitle(location.pathname);

  return (
    /* Page backdrop (shell is fluid; only visible if the shell is ever inset) */
    <div className="min-h-screen bg-slate-100">
      {/* Fluid full-viewport shell (no phone-width cap) */}
      <div
        data-shell="basic"
        className="relative mx-auto flex h-screen w-full flex-col overflow-hidden"
        style={{ background: 'var(--basic-bg)' }}
      >
        {/* Aurora blur blobs — behind everything */}
        <BasicAuroraBg />

        {/* ── Header ── */}
        <header
          className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between px-4"
          style={{
            background: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
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
              className={glassBtn}
              style={glassBtnStyle}
              aria-label="Back"
            >
              <IconChevronLeft className="h-[22px] w-[22px]" style={{ color: '#20303f' }} />
            </button>
          )}

          {/* Center — page title on inner pages only */}
          {!isHome && pageTitle && (
            <p className="truncate px-2 text-base font-bold" style={{ color: '#20303f' }}>
              {pageTitle}
            </p>
          )}

          {/* Right slot — visible on Home only */}
          {isHome ? (
            <div className="flex items-center gap-[11px]">
              <button className={glassBtn} style={glassBtnStyle} aria-label="Notifications">
                <div className="relative">
                  <IconBell className="h-[20px] w-[20px]" style={{ color: '#20303f' }} />
                  <span
                    className="absolute right-[-1px] top-[-1px] h-2 w-2 rounded-full border-2 border-white"
                    style={{ background: '#e0244d' }}
                  />
                </div>
              </button>
              <button
                className={glassBtn}
                style={glassBtnStyle}
                aria-label="Account"
                onClick={() => setAcctOpen(true)}
              >
                <IconUser className="h-[20px] w-[20px]" style={{ color: '#1e8fd6' }} />
              </button>
            </div>
          ) : (
            /* Spacer keeps back-button and title balanced */
            <div className="w-[42px]" />
          )}
        </header>

        {/* ── Page content ── */}
        {/* pb-[96px] clears the fixed glass nav pill; booking flow hides nav so less padding needed */}
        <main className={`relative z-10 flex-1 overflow-y-auto ${isBookingFlow ? 'pb-6' : 'pb-[96px]'}`}>
          <Outlet />
        </main>

        {/* ── Glass bottom nav — hidden during booking flow ── */}
        {!isBookingFlow && <BasicBottomNav />}

        {/* ── Account sheet (Home header icon) ── */}
        <BasicAccountSheet open={acctOpen} onClose={() => setAcctOpen(false)} />
      </div>
    </div>
  );
}
