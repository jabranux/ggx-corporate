import { Link, useLocation } from 'react-router';
import { IconHome, IconGift, IconPackage, IconWallet, IconUser } from '@tabler/icons-react';
import { cn } from '../../lib/utils';

interface BasicBottomNavProps {
  onAccountClick: () => void;
  accountActive: boolean;
}

const TABS = [
  { name: 'Home', href: '/dashboard', icon: IconHome },
  { name: 'Rewards', href: '/dashboard/rewards', icon: IconGift },
  { name: 'Transactions', href: '/dashboard/transactions', icon: IconPackage },
  { name: 'Earnings', href: '/dashboard/basic-earnings', icon: IconWallet },
] as const;

/**
 * Fixed 5-tab bottom nav for the Basic mobile experience (spec §5) — purpose-
 * built for Basic, not a collapsed copy of the desktop sidebar. "Account" is
 * not a route: it opens `BasicAccountDrawer` instead of navigating.
 */
export function BasicBottomNav({ onAccountClick, accountActive }: BasicBottomNavProps) {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-gray-200 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.href;
        return (
          <Link
            key={tab.name}
            to={tab.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 cursor-pointer transition-colors',
              isActive ? 'text-blue-600' : 'text-gray-500'
            )}
          >
            <tab.icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-medium truncate">{tab.name}</span>
          </Link>
        );
      })}
      <button
        onClick={onAccountClick}
        className={cn(
          'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 cursor-pointer transition-colors',
          accountActive ? 'text-blue-600' : 'text-gray-500'
        )}
      >
        <IconUser className="w-5 h-5 flex-shrink-0" />
        <span className="text-[11px] font-medium truncate">Account</span>
      </button>
    </nav>
  );
}
