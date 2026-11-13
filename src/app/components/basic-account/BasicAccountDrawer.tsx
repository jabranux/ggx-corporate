import { useEffect, useRef, type ComponentType } from 'react';
import { useNavigate } from 'react-router';
import {
  IconX, IconMapPin, IconBuildingBank, IconTicket, IconUserPlus, IconGift,
  IconTag, IconApps, IconHelpCircle, IconMessage, IconSettings, IconLogout,
} from '@tabler/icons-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

interface DrawerLink {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface BasicAccountDrawerProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  displayEmail: string;
  /** Additional activated add-on features (e.g. Inventory, Storefront) shown under "More Services". */
  moreServices: DrawerLink[];
  onLogout: () => void;
}

const ACCOUNT_MANAGEMENT_LINKS: DrawerLink[] = [
  { name: 'Address Book', href: '/dashboard/address-book', icon: IconMapPin },
  { name: 'Payout Settings', href: '/dashboard/payout-settings', icon: IconBuildingBank },
];

const REWARDS_GRID: DrawerLink[] = [
  { name: 'Vouchers', href: '/dashboard/vouchers', icon: IconTicket },
  { name: 'Referrals', href: '/dashboard/referrals', icon: IconUserPlus },
  { name: 'Rewards', href: '/dashboard/rewards', icon: IconGift },
  { name: 'Sulit Bundles', href: '/dashboard/sulit-bundles', icon: IconTag },
];

/**
 * Mobile Account drawer (spec §5) — a dedicated pop-out side panel, NOT a
 * collapsed copy of the desktop sidebar. Deliberately excludes Bulk Upload
 * and Notifications (spec's own constraint): Notifications stays behind the
 * header bell, Bulk Upload stays reachable from Home/the bottom nav.
 *
 * Focus-trap/Escape/focus-restore mirrors the established pattern in
 * `ReadyRowsDrawer.tsx` (added there after a Codex accessibility finding).
 */
export function BasicAccountDrawer({ open, onClose, displayName, displayEmail, moreServices, onLogout }: BasicAccountDrawerProps) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      if (previouslyFocusedRef.current instanceof HTMLElement) previouslyFocusedRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const initials = displayName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const go = (href: string) => { onClose(); navigate(href); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Account menu">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative w-full max-w-[360px] h-full bg-white shadow-xl overflow-y-auto"
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-900">Account</span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
            aria-label="Close account menu"
          >
            <IconX className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Avatar initials={initials} shape="circle" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{displayName}</p>
              <p className="text-xs text-gray-400 truncate leading-snug">{displayEmail}</p>
            </div>
            <Badge variant="info">Basic Account</Badge>
          </div>
        </div>

        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Account Management</p>
          <div className="space-y-0.5">
            {ACCOUNT_MANAGEMENT_LINKS.map((l) => (
              <button
                key={l.name}
                onClick={() => go(l.href)}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <l.icon className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
                {l.name}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Rewards & Savings</p>
          <div className="grid grid-cols-4 gap-2">
            {REWARDS_GRID.map((l) => (
              <button
                key={l.name}
                onClick={() => go(l.href)}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors min-w-0"
              >
                <l.icon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{l.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">More Services</p>
          <div className="space-y-0.5">
            <button
              onClick={() => go('/dashboard/account-add-ons')}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <IconApps className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
              Account Add-ons
            </button>
            {moreServices.map((l) => (
              <button
                key={l.name}
                onClick={() => go(l.href)}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <l.icon className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
                {l.name}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Help & Support</p>
          <div className="space-y-0.5">
            <a
              href="https://gogoxpress.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className={cn('w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors')}
            >
              <IconHelpCircle className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
              Help Center
            </a>
            <button
              onClick={() => go('/dashboard/support-tickets')}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <IconMessage className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
              Support Tickets
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="space-y-0.5">
            <button
              onClick={() => go('/dashboard/settings')}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <IconSettings className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
              Settings
            </button>
            <button
              onClick={() => { onClose(); onLogout(); }}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
            >
              <IconLogout className="w-[18px] h-[18px] flex-shrink-0" />
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
