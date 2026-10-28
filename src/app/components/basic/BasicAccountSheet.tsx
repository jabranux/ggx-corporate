import { useNavigate } from 'react-router';
import {
  IconUser,
  IconSettings,
  IconShieldCheck,
  IconHeadset,
  IconTrendingUp,
  IconWallet,
  IconLogout,
  IconChevronRight,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '../ui/Badge';
import { useBasicSegment } from '../../contexts/BasicSegmentContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  href: string;
  iconBg: string;
  iconColor: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: IconUser,       label: 'My Profile',        sub: 'Name, contact, store details',         href: '/basic/settings', iconBg: 'bg-blue-50',   iconColor: 'text-blue-600'   },
  { icon: IconSettings,   label: 'Account Settings',  sub: 'Payout, address book, preferences',    href: '/basic/settings', iconBg: 'bg-gray-100',  iconColor: 'text-gray-600'   },
  { icon: IconWallet,     label: 'Earnings & Payout', sub: 'COD balance, payout bank account',     href: '/basic/earnings', iconBg: 'bg-emerald-50',iconColor: 'text-emerald-600'},
  { icon: IconShieldCheck,label: 'Security',           sub: 'Password and login',                   href: '/basic/settings', iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
  { icon: IconHeadset,    label: 'Help & Support',    sub: 'Tickets, chat, help center',           href: '/basic/support',  iconBg: 'bg-orange-50', iconColor: 'text-orange-500' },
];

export function BasicAccountSheet({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { segment } = useBasicSegment();

  if (!open) return null;

  function go(href: string) {
    onClose();
    navigate(href);
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(20,40,80,0.35)', backdropFilter: 'blur(4px)' }} />

      {/* Sheet — centered */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[var(--basic-shell-max,none)] overflow-hidden"
        style={{
          borderRadius: '24px 24px 0 0',
          background: 'rgba(245,249,255,0.98)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 -20px 60px rgba(20,50,100,0.22)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <div className="flex-1 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'rgba(0,0,0,0.07)' }}
          >
            <IconX className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Profile header */}
        <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div
            className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(140deg, #2f9be8, #1e6fd6)' }}
          >
            <span className="text-xl font-bold text-white leading-none">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-snug" style={{ color: '#20303f' }}>Alex Mercado</p>
            <p className="text-xs leading-snug" style={{ color: '#7e93a6' }}>alex.mercado@shop.com</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="info" className="text-[10px] px-1.5 py-0.5 leading-none">Basic</Badge>
              {segment === 'growing' && (
                <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 leading-none">Growing</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Menu items */}
        <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => go(item.href)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl ${item.iconBg}`}>
                <item.icon className={`h-[18px] w-[18px] ${item.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug" style={{ color: '#20303f' }}>{item.label}</p>
                <p className="text-xs leading-snug" style={{ color: '#7e93a6' }}>{item.sub}</p>
              </div>
              <IconChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#c0ccd6' }} />
            </button>
          ))}

          {/* Business upgrade row (growing segment) */}
          {segment === 'growing' && (
            <button
              onClick={() => go('/basic/qualify')}
              className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-amber-50 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-amber-50">
                <IconTrendingUp className="h-[18px] w-[18px] text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug" style={{ color: '#20303f' }}>Business Upgrade</p>
                <p className="text-xs leading-snug" style={{ color: '#7e93a6' }}>Account review pending · GGX will contact you soon</p>
              </div>
              <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 leading-none flex-shrink-0">Review pending</Badge>
            </button>
          )}
        </div>

        {/* Log out */}
        <div className="px-5 pt-3 pb-8">
          <button
            onClick={() => go('/')}
            className="flex w-full items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium transition-colors cursor-pointer"
            style={{ border: '1px solid rgba(224,36,77,0.25)', color: '#e0244d', background: 'rgba(224,36,77,0.04)' }}
          >
            <IconLogout className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
