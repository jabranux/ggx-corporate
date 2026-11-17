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
 *
 * Desktop (`lg:`+) switches to a compact horizontal card — icon chip on the
 * left, label on the right, in a 4-up grid — instead of stacking the icon
 * above the label (desktop layout refinement pass). Mobile keeps the stacked
 * single-row layout untouched; every change below is `lg:`-scoped.
 */
export function BasicPrimaryShortcuts({ items }: ShortcutRowProps) {
  const navigate = useNavigate();
  const primaryItems = items.slice(0, 4);

  return (
    <div className="flex gap-1 lg:grid lg:grid-cols-4 lg:gap-3">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0 active:opacity-70 transition-opacity lg:w-full lg:flex-row lg:items-center lg:gap-3 lg:rounded-xl lg:border lg:border-gray-100 lg:bg-white lg:px-3 lg:py-3 lg:hover:border-gray-200 lg:hover:shadow-sm lg:transition-shadow"
          >
            {item.badge && (
              <span className="absolute -top-1.5 right-1 z-10 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none shadow-sm lg:top-2 lg:right-2">
                {item.badge}
              </span>
            )}
            <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 lg:h-11 lg:w-11 lg:rounded-lg">
              {item.image ? (
                <img src={item.image} alt="" className="h-16 w-16 object-contain lg:h-8 lg:w-8" />
              ) : (
                <Icon className="h-8 w-8 text-blue-600 lg:h-5 lg:w-5" />
              )}
            </div>
            <span className="w-full text-center text-[12px] font-semibold leading-tight text-gray-700 break-words lg:w-auto lg:min-w-0 lg:flex-1 lg:text-left lg:text-sm">
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
 * "View all" either way.
 *
 * Desktop (`lg:`+) switches to a compact horizontal card — icon chip on the
 * left, label on the right, 3-up (so items wrap to 2 rows at 6 items) —
 * instead of the mobile stacked tile, matching the primary row's desktop
 * treatment at a smaller size (desktop layout refinement pass). Mobile keeps
 * its existing single-row/carousel behavior untouched.
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
          'flex gap-1 -mx-0.5 px-0.5 lg:grid lg:grid-cols-3 lg:gap-2.5 lg:overflow-visible',
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
                'flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 text-center active:bg-gray-50 transition-colors cursor-pointer',
                isCarousel ? 'w-16 flex-shrink-0 snap-start px-1' : 'flex-1 px-0',
                'lg:w-full lg:flex-row lg:items-center lg:justify-start lg:gap-2.5 lg:rounded-lg lg:border lg:border-gray-100 lg:bg-white lg:px-2.5 lg:py-2.5 lg:text-left lg:hover:border-gray-200 lg:hover:bg-gray-50',
              )}
            >
              <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 lg:h-8 lg:w-8 lg:rounded-md">
                {item.image ? (
                  <img src={item.image} alt="" className="h-10 w-10 object-contain lg:h-6 lg:w-6" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-600 lg:h-4 lg:w-4" />
                )}
              </div>
              <span className="w-full text-[11px] font-medium leading-tight text-gray-600 break-words lg:w-auto lg:min-w-0 lg:flex-1 lg:text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
