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
 * left, label on the right, in a 2×2 grid at a larger, more prominent size
 * (desktop visual refinement pass: ~100px-tall cards with an 80px icon chip
 * and a 20px label at `xl:`/1280px+, matching the reference mockup's
 * primary-action emphasis) — instead of stacking the icon above the label.
 * `lg:` (1024–1279px) uses a scaled-down version of the same treatment —
 * the right column is also narrower in that range (`BasicHome.tsx`) — so the
 * 2×2 grid never forces multi-line/character-wrapped labels at 1024px, per
 * this app's "no overflow at 1024px+" rule. Mobile keeps the stacked
 * single-row layout untouched; every change below is `lg:`/`xl:`-scoped.
 */
export function BasicPrimaryShortcuts({ items }: ShortcutRowProps) {
  const navigate = useNavigate();
  const primaryItems = items.slice(0, 4);

  return (
    <div className="flex gap-1 lg:grid lg:grid-cols-2 lg:gap-3 xl:gap-4">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0 active:opacity-70 transition-opacity lg:w-full lg:flex-row lg:items-center lg:gap-3 xl:gap-4 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:px-3 xl:px-5 lg:py-2.5 xl:py-3 lg:hover:border-gray-300 lg:hover:shadow-sm lg:transition-shadow"
          >
            {item.badge && (
              <span className="absolute -top-1.5 right-1 z-10 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none shadow-sm lg:top-2.5 lg:right-2.5 xl:top-3 xl:right-3">
                {item.badge}
              </span>
            )}
            <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 lg:h-14 lg:w-14 xl:h-20 xl:w-20 lg:rounded-xl">
              {item.image ? (
                <img src={item.image} alt="" className="h-16 w-16 object-contain lg:h-10 lg:w-10 xl:h-14 xl:w-14" />
              ) : (
                <Icon className="h-8 w-8 text-blue-600 lg:h-6 lg:w-6 xl:h-9 xl:w-9" />
              )}
            </div>
            <span className="w-full text-center text-[12px] font-semibold leading-tight text-gray-700 break-words lg:w-auto lg:min-w-0 lg:flex-1 lg:text-left lg:text-base xl:text-xl">
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
 * left, label on the right. Row count scales with available width (spec:
 * "5 in one row when sufficient desktop width is available") — 2-up at
 * `lg:` (1024–1439px, where the right column is also narrower), 5-up at
 * the 1440px max-width itself (a custom breakpoint via an arbitrary media
 * variant, not Tailwind's default `xl:`/1280px or even `min-[1400px]:` —
 * both are still too narrow for single-word labels like "Storefront"/
 * "Vouchers" and force an ugly mid-word break; the main column only reaches
 * its full width once the 1440px cap and the 340px rail are both active) —
 * instead of the mobile stacked tile, sized to read as clearly secondary to
 * the larger primary row above it but still comfortable to scan (desktop
 * visual refinement pass). Mobile keeps its existing single-row/carousel
 * behavior untouched.
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
          'flex gap-1 -mx-0.5 px-0.5 lg:grid lg:grid-cols-2 [@media(min-width:1440px)]:grid-cols-5 lg:gap-2.5 [@media(min-width:1440px)]:gap-3 lg:overflow-visible',
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
                'lg:w-full lg:flex-row lg:items-center lg:justify-start lg:gap-2.5 lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white lg:px-2.5 lg:py-3 [@media(min-width:1440px)]:py-4 lg:text-left lg:hover:border-gray-300 lg:hover:bg-gray-50',
              )}
            >
              <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 lg:h-8 lg:w-8 [@media(min-width:1440px)]:h-9 [@media(min-width:1440px)]:w-9 lg:rounded-lg">
                {item.image ? (
                  <img src={item.image} alt="" className="h-10 w-10 object-contain lg:h-5 lg:w-5 [@media(min-width:1440px)]:h-6 [@media(min-width:1440px)]:w-6" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-600 lg:h-4 lg:w-4 [@media(min-width:1440px)]:h-[18px] [@media(min-width:1440px)]:w-[18px]" />
                )}
              </div>
              <span className="w-full text-[11px] font-medium leading-tight text-gray-600 break-words lg:w-auto lg:min-w-0 lg:flex-1 lg:text-xs [@media(min-width:1440px)]:text-sm lg:font-semibold lg:leading-tight lg:whitespace-normal lg:hyphens-auto">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
