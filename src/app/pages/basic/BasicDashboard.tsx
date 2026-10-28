import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  IconArrowRight,
  IconCircleCheckFilled,
  IconHourglass,
  IconTruck,
  IconGift,
} from '@tabler/icons-react';
import { Badge } from '../../components/ui/Badge';
import { BasicPromoCarousel } from '../../components/basic/BasicPromoCarousel';
import { BasicGlassCard } from '../../components/basic/BasicGlassCard';
import { BasicActivitySummary } from '../../components/basic/BasicActivitySummary';
import { useBasicSegment } from '../../contexts/BasicSegmentContext';

// Illustrated asset imports (Vite resolves to hashed URLs)
import iconSdd      from '@/assets/basic/icon-sdd.png';
import iconStandard from '@/assets/basic/icon-standard.png';
import iconBulk     from '@/assets/basic/icon-bulk.png';
import iconPacks    from '@/assets/basic/icon-packs.png';
import iconShopify  from '@/assets/basic/icon-shopify.png';
import iconStorefront from '@/assets/basic/icon-storefront.png';
import iconRewards  from '@/assets/basic/icon-rewards.png';
import iconReferrals from '@/assets/basic/icon-referrals.png';
import iconAnalytics from '@/assets/basic/icon-analytics.png';

// ── Primary action tiles (4-up horizontal row) ───────────────────────────────

interface PrimaryTile {
  label: string;
  img: string;
  href: string;
  badge?: string;
  tileBg?: string;
}

const PRIMARY_TILES: PrimaryTile[] = [
  {
    label: 'Same Day\nDelivery',
    img: iconSdd,
    href: '/basic/same-day',
  },
  {
    label: 'Standard\nDelivery',
    img: iconStandard,
    href: '/basic/deliver?type=standard',
  },
  {
    label: 'Bulk\nUpload',
    img: iconBulk,
    href: '/basic/bulk',
    badge: 'Free',
  },
  {
    label: 'Sulit\nBundles',
    img: iconPacks,
    href: '/basic/more',
    badge: 'New',
    tileBg: 'linear-gradient(140deg, rgba(116,182,239,0.5), rgba(232,122,166,0.4))',
  },
];

// ── Secondary tiles (5-up row) ───────────────────────────────────────────────

interface SecondaryTile {
  label: string;
  img: string;
  href: string;
}

const SECONDARY_TILES: SecondaryTile[] = [
  { label: 'Shopify',     img: iconShopify,    href: '/basic/store' },
  { label: 'Storefront',  img: iconStorefront, href: '/basic/store' },
  { label: 'Rewards',     img: iconRewards,    href: '/basic/more' },
  { label: 'Referrals',   img: iconReferrals,  href: '/basic/more' },
  { label: 'Analytics',   img: iconAnalytics,  href: '/basic/earnings' },
];

// ── Recent orders ─────────────────────────────────────────────────────────────

const MOCK_ORDERS = [
  { id: 'GGX-240601-001', recipient: 'Maria Santos',   status: 'in-transit', time: '2h ago' },
  { id: 'GGX-240531-009', recipient: 'Juan dela Cruz', status: 'delivered',  time: 'Yesterday' },
  { id: 'GGX-240531-007', recipient: 'Ana Reyes',      status: 'pending',    time: 'Yesterday' },
  { id: 'GGX-240530-022', recipient: 'Carlo Bautista', status: 'delivered',  time: '2 days ago' },
];

const STATUS_CFG: Record<string, {
  label: string;
  variant: 'info' | 'success' | 'pending';
  icon: React.ComponentType<{ className?: string }>;
}> = {
  'in-transit': { label: 'In Transit', variant: 'info',    icon: IconTruck },
  'delivered':  { label: 'Delivered',  variant: 'success', icon: IconCircleCheckFilled },
  'pending':    { label: 'Pending',    variant: 'pending', icon: IconHourglass },
};

// ─────────────────────────────────────────────────────────────────────────────

export function BasicDashboard() {
  const navigate = useNavigate();
  const { segment } = useBasicSegment();
  const [greeting] = useState(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  });

  return (
    <div className="space-y-[18px] px-4 pt-3 pb-2">

      {/* ── 1. Promo carousel ── */}
      <BasicPromoCarousel />

      {/* ── 2. Welcome greeting ── */}
      <div>
        <p className="text-[15.5px] font-medium" style={{ color: '#5d7589' }}>
          {greeting}
        </p>
        <h1
          className="text-[29px] font-extrabold leading-tight tracking-tight"
          style={{ color: '#20303f', letterSpacing: '-0.02em' }}
        >
          Welcome, <span style={{ color: '#1e8fd6' }}>Max!</span>
        </h1>
        <p className="mt-1 text-[15.5px] font-medium" style={{ color: '#5d7589' }}>
          What do you want to send today?
        </p>
      </div>

      {/* ── 3. Services glass container ── */}
      <BasicGlassCard className="p-[18px_14px_15px]">
        {/* Row 1 — 4 primary tiles */}
        <div className="flex gap-[9px]">
          {PRIMARY_TILES.map((tile) => (
            <button
              key={tile.label}
              onClick={() => navigate(tile.href)}
              className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              {/* Badge */}
              {tile.badge && (
                <span
                  className="absolute -right-[5px] -top-[9px] z-10 rounded-[9px] px-2 py-0.5 text-[9px] font-extrabold text-white"
                  style={{
                    background: tile.badge === 'New' ? '#5ab94a' : '#22c55e',
                    boxShadow: '0 3px 8px rgba(90,185,74,0.4)',
                  }}
                >
                  {tile.badge}
                </span>
              )}

              {/* Tile box */}
              <div
                className="flex h-[80px] w-full items-center justify-center rounded-[18px]"
                style={{
                  background: tile.tileBg ?? 'rgba(255,255,255,0.62)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  boxShadow: '0 5px 14px rgba(40,70,120,0.08)',
                }}
              >
                <img
                  src={tile.img}
                  alt={tile.label.replace('\n', ' ')}
                  className="h-[62px] w-[62px] max-w-full object-contain"
                />
              </div>

              {/* Label */}
              <p
                className="mt-[7px] whitespace-pre-line text-center text-[11px] font-bold leading-snug"
                style={{ color: '#33485c' }}
              >
                {tile.label}
              </p>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div
          className="my-[15px] mx-1"
          style={{ height: 1, background: 'rgba(255,255,255,0.6)' }}
        />

        {/* Row 2 — 5 secondary tiles */}
        <div className="flex justify-between px-[2px]">
          {SECONDARY_TILES.map((tile) => (
            <Link
              key={tile.label}
              to={tile.href}
              className="flex min-w-0 flex-1 flex-col items-center active:opacity-70 transition-opacity"
            >
              <div className="flex h-[56px] w-full max-w-[56px] items-center justify-center">
                <img src={tile.img} alt={tile.label} className="h-[50px] w-[50px] max-w-full object-contain" />
              </div>
              <span
                className="mt-[6px] text-center text-[10.5px] font-bold"
                style={{ color: '#33485c' }}
              >
                {tile.label}
              </span>
            </Link>
          ))}
        </div>

        {/* View all link */}
        <div className="mt-[14px] flex items-center justify-center gap-[6px]">
          <Link
            to="/basic/more"
            className="flex items-center gap-[6px] text-[13.5px] font-medium"
            style={{ color: '#1e8fd6' }}
          >
            View all
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </BasicGlassCard>

      {/* ── 4. Activity summary ── */}
      <BasicActivitySummary />

      {/* ── 5. Recent Orders ── */}
      <BasicGlassCard className="overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <p className="text-sm font-bold" style={{ color: '#20303f' }}>Recent Orders</p>
          <Link
            to="/basic/orders"
            className="flex items-center gap-0.5 text-xs font-medium"
            style={{ color: '#1e8fd6' }}
          >
            See all <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.5)' }}>
          {MOCK_ORDERS.map((o) => {
            const sc = STATUS_CFG[o.status];
            const StatusIcon = sc.icon;
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/basic/orders/${o.id}`)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-white/20"
              >
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background:
                      o.status === 'delivered'  ? 'rgba(209,250,229,0.7)' :
                      o.status === 'in-transit' ? 'rgba(219,234,254,0.7)' :
                                                  'rgba(255,237,213,0.7)',
                  }}
                >
                  <StatusIcon className={`h-5 w-5 ${
                    o.status === 'delivered'  ? 'text-emerald-500' :
                    o.status === 'in-transit' ? 'text-blue-500'    : 'text-orange-400'
                  }`} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-snug" style={{ color: '#20303f' }}>
                    {o.id}
                  </p>
                  <p className="text-xs leading-snug" style={{ color: '#5d7589' }}>{o.recipient}</p>
                </div>

                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <Badge variant={sc.variant} className="text-[10px] px-2 py-0.5 leading-none">
                    {sc.label}
                  </Badge>
                  <span className="text-[11px] leading-none" style={{ color: '#7e93a6' }}>{o.time}</span>
                </div>
              </button>
            );
          })}
        </div>
      </BasicGlassCard>

      {/* ── 6. Upgrade nudge (basic segment only) ── */}
      {segment === 'basic' && (
        <BasicGlassCard className="flex items-center gap-3 p-4">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(251,191,36,0.25)' }}
          >
            <IconGift className="h-5 w-5" style={{ color: '#d97706' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug" style={{ color: '#20303f' }}>
              Ship more to unlock benefits
            </p>
            <Link
              to="/basic/qualify"
              className="text-xs font-semibold leading-snug"
              style={{ color: '#1e8fd6' }}
            >
              Learn about Business pricing →
            </Link>
          </div>
        </BasicGlassCard>
      )}

      <div className="h-1" />
    </div>
  );
}
