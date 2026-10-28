import { Link, useLocation } from 'react-router';
import {
  IconLayoutDashboard,
  IconSparkles,
  IconReceiptTax,
  IconWallet,
  IconBox,
} from '@tabler/icons-react';
import { cn } from '../../lib/utils';

const LEFT_TABS = [
  { label: 'Home',    href: '/basic',         icon: IconLayoutDashboard },
  { label: 'Rewards', href: '/basic/more',    icon: IconSparkles },
];

const RIGHT_TABS = [
  { label: 'Transactions', href: '/basic/orders',   icon: IconReceiptTax },
  { label: 'Earnings',     href: '/basic/earnings', icon: IconWallet },
];

function TabItem({
  label, href, icon: Icon, isActive,
}: { label: string; href: string; icon: React.ComponentType<{ className?: string }>; isActive: boolean }) {
  return (
    <Link
      to={href}
      className={cn(
        'flex flex-1 flex-col items-center justify-end gap-[4px] pb-[13px] pt-[11px] transition-colors',
        isActive ? 'text-[#1e8fd6]' : 'text-[#7e93a6]',
      )}
    >
      <Icon className="w-[23px] h-[23px] flex-shrink-0" />
      <span className="text-[10px] font-bold leading-none">{label}</span>
    </Link>
  );
}

export function BasicBottomNav() {
  const location = useLocation();

  function isActive(href: string) {
    return href === '/basic'
      ? location.pathname === '/basic' || location.pathname === '/basic/'
      : location.pathname.startsWith(href);
  }

  const bookNowActive = location.pathname.startsWith('/basic/deliver');

  return (
    /* Outer wrapper — fixed, centered, no overflow clip so FAB can protrude */
    <nav
      className="fixed left-1/2 z-30 -translate-x-1/2"
      style={{ bottom: 18, width: 'calc(100% - 28px)', overflow: 'visible' }}
    >
      {/* Glass pill background — only covers the nav strip, not the FAB protrusion */}
      <div
        className="absolute inset-x-0 bottom-0 rounded-[26px]"
        style={{
          height: 64,
          background: 'rgba(255,255,255,0.62)',
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
          border: '1px solid rgba(255,255,255,0.75)',
          boxShadow: '0 16px 38px rgba(40,70,120,0.2)',
        }}
      />

      {/* Tab row — align items to bottom of their container */}
      <div className="relative flex items-end justify-around">
        {LEFT_TABS.map((t) => (
          <TabItem key={t.href} {...t} icon={t.icon} isActive={isActive(t.href)} />
        ))}

        {/* Center FAB column */}
        <div className="flex flex-1 flex-col items-center gap-[5px]">
          <Link
            to="/basic/deliver"
            aria-label="Book Now"
            className="flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{
              marginTop: -36,
              background: 'linear-gradient(140deg, #2f9be8, #1e6fd6)',
              boxShadow: '0 10px 22px rgba(30,111,214,0.5), 0 0 0 5px rgba(255,255,255,0.55)',
            }}
          >
            <IconBox className="h-[26px] w-[26px] text-white" />
          </Link>
          <span
            className="pb-[13px] text-[10px] font-extrabold leading-none"
            style={{ color: bookNowActive ? '#1e6fd6' : '#1e6fd6' }}
          >
            Book Now
          </span>
        </div>

        {RIGHT_TABS.map((t) => (
          <TabItem key={t.href} {...t} icon={t.icon} isActive={isActive(t.href)} />
        ))}
      </div>
    </nav>
  );
}
