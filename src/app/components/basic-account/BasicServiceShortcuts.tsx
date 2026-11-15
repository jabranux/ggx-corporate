import { useNavigate } from 'react-router';
import { IconArrowRight } from '@tabler/icons-react';
import type { BasicServiceItem } from '../../lib/basicServiceCatalog';

interface BasicServiceShortcutsProps {
  primary: BasicServiceItem[];
  secondary: BasicServiceItem[];
}

/**
 * Primary + secondary service shortcuts (spec §3). Both sections are
 * essential and always show the full catalog's most relevant items for this
 * account's KYC answers (or a sensible default order) — selection/ordering
 * only, never access restriction (`lib/basicServiceCatalog.ts`).
 */
export function BasicServiceShortcuts({ primary, secondary }: BasicServiceShortcutsProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {primary.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              className="relative flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-4 text-center hover:border-gray-300 hover:shadow-sm transition-colors cursor-pointer min-w-0"
            >
              {item.badge && (
                <span className="absolute -top-2 -right-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {item.badge}
                </span>
              )}
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700 leading-snug">{item.label}</span>
            </button>
          );
        })}
      </div>

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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {secondary.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                className="flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 text-center hover:bg-gray-50 transition-colors cursor-pointer min-w-0"
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
    </div>
  );
}
