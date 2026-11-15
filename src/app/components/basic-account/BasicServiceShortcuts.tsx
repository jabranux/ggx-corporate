import { useNavigate } from 'react-router';
import { IconArrowRight } from '@tabler/icons-react';
import type { BasicServiceItem } from '../../lib/basicServiceCatalog';

interface ShortcutRowProps {
  items: BasicServiceItem[];
}

/**
 * Primary service shortcuts (spec §2/§3) — a single horizontal row of
 * compact icon shortcuts (the original GGX mobile app's arrangement), never
 * a wrapping dashboard-card grid. `min-w-0`/`overflow-x-auto` on the
 * container lets it scroll instead of wrap if more than 4 items are ever
 * passed in; on wide (`lg`+) screens it becomes a non-scrolling grid since
 * there's room to lay every item out evenly. Selection/ordering is
 * KYC-driven but never restricts access (`lib/basicServiceCatalog.ts`).
 */
export function BasicPrimaryShortcuts({ items }: ShortcutRowProps) {
  const navigate = useNavigate();

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-0.5 px-0.5 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            className="relative flex flex-shrink-0 flex-col items-center gap-1.5 w-[72px] lg:w-full cursor-pointer"
          >
            {item.badge && (
              <span className="absolute -top-1 right-2.5 lg:right-6 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                {item.badge}
              </span>
            )}
            <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
            </div>
            <span className="text-[11px] lg:text-xs font-semibold text-gray-700 text-center leading-tight w-full truncate">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Secondary feature shortcuts (spec §4) — a single horizontally scrollable
 * row of smaller icon shortcuts, never a wrapping multi-row grid, with the
 * full catalog still one tap away via "View all". On `lg`+ screens there's
 * enough width to lay these out as a non-scrolling grid instead.
 */
export function BasicSecondaryShortcuts({ items }: ShortcutRowProps) {
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500">More services</h3>
        <button
          onClick={() => navigate('/dashboard/services')}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          View all <IconArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-none -mx-0.5 px-0.5 lg:grid lg:grid-cols-6 lg:overflow-visible">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              className="flex flex-shrink-0 flex-col items-center gap-1.5 w-16 lg:w-full rounded-lg px-1 py-2 text-center hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4.5 h-4.5 text-gray-600" />
              </div>
              <span className="text-[11px] font-medium text-gray-600 leading-tight truncate w-full">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
