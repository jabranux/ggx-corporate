import { useNavigate } from 'react-router';
import { IconArrowRight } from '@tabler/icons-react';
import type { BasicServiceItem } from '../../lib/basicServiceCatalog';
import { cn } from '../../lib/utils';

interface ShortcutRowProps {
  items: BasicServiceItem[];
}

interface SecondaryShortcutRowProps extends ShortcutRowProps {
  /**
   * Set `false` when a parent container renders its own "More features" /
   * "View all" heading above this row (spec §3 — the mobile KYC/secondary
   * group reorders that heading to the top of the shared container).
   * Defaults to `true` so desktop, which still uses this component's own
   * heading, is unaffected.
   */
  showHeader?: boolean;
}

/**
 * Primary service shortcuts (spec §2/§3, refined per the mobile layout
 * correction pass) — always exactly 4 items in a single row (the recommender
 * already caps primary at 4; `slice(0, 4)` is just a defensive guard), each
 * tile sharing the row's width evenly (`flex-1`), never scrolling or
 * wrapping. Larger icon containers/labels than the secondary row — these are
 * the home's hero actions. Uses the legacy `/basic` module's own illustrated
 * icon (`item.image`) when the catalog has one, falling back to the Tabler
 * icon otherwise (see `lib/basicServiceCatalog.ts`). Labels never truncate —
 * they wrap up to two lines instead. Selection/ordering is KYC-driven but
 * never restricts access (`lib/basicServiceCatalog.ts`).
 */
export function BasicPrimaryShortcuts({ items }: ShortcutRowProps) {
  const navigate = useNavigate();
  const primaryItems = items.slice(0, 4);

  return (
    <div className="flex gap-1 lg:gap-3">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0 lg:gap-2 active:opacity-70 transition-opacity"
          >
            {item.badge && (
              <span className="absolute -top-1.5 right-1 lg:right-3 z-10 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none shadow-sm">
                {item.badge}
              </span>
            )}
            <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50">
              {item.image ? (
                <img src={item.image} alt="" className="h-16 w-16 object-contain lg:h-14 lg:w-14" />
              ) : (
                <Icon className="h-8 w-8 text-blue-600 lg:h-7 lg:w-7" />
              )}
            </div>
            <span className="w-full text-center text-[12px] font-semibold leading-tight text-gray-700 break-words lg:text-sm">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Secondary feature shortcuts — up to 5 fit evenly in one non-scrolling row
 * (same even-width pattern as primary, just smaller); once 6 or more are
 * available (the recommender's current default), they become a horizontally
 * swipeable carousel instead of wrapping to a second row, with scroll-snap
 * for a deliberate swipe feel. The full catalog stays one tap away via
 * "View all" either way. On `lg`+ screens there's enough width to lay these
 * out as a non-scrolling grid regardless of count.
 */
export function BasicSecondaryShortcuts({ items, showHeader = true }: SecondaryShortcutRowProps) {
  const navigate = useNavigate();
  const isCarousel = items.length >= 6;

  return (
    <div>
      {showHeader && (
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500">More features</h3>
          <button
            onClick={() => navigate('/dashboard/services')}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            View all <IconArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
      <div
        className={cn(
          'flex gap-1 -mx-0.5 px-0.5 lg:grid lg:grid-cols-6 lg:gap-3 lg:overflow-visible',
          isCarousel ? 'overflow-x-auto scrollbar-none snap-x snap-proximity' : 'justify-between',
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              className={cn(
                'flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 lg:gap-1.5 lg:py-1.5 text-center active:bg-gray-50 transition-colors cursor-pointer lg:w-full lg:px-1',
                isCarousel ? 'w-16 flex-shrink-0 snap-start px-1' : 'flex-1 px-0',
              )}
            >
              <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 lg:h-11 lg:w-11">
                {item.image ? (
                  <img src={item.image} alt="" className="h-10 w-10 object-contain lg:h-8 lg:w-8" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-600 lg:h-4.5 lg:w-4.5" />
                )}
              </div>
              <span className="w-full text-[11px] font-medium leading-tight text-gray-600 break-words">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
