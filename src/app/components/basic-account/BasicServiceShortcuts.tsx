import { useNavigate } from 'react-router';
import { IconArrowRight } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { resolveServiceBadge, resolveServiceHref, SERVICE_BADGE_CLASS, type BasicServiceItem } from '../../lib/basicServiceCatalog';
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
 * left, label on the right, in a 2×2 grid at a consistent, prominent size
 * (desktop visual refinement corrective pass: ~104px-tall cards with a
 * 76px icon chip and a 20px label — hit exactly at 1366px/1440px, this
 * app's primary reference widths). Below a custom 1180px breakpoint the
 * card is a size tier down (56px icon, 16px label): even though primary
 * labels are multi-word ("Same Day Delivery"), individual WORDS like
 * "Standard" still mid-word-break at the full 20px size once the narrower
 * 300px-rail main column shrinks the card below ~225px — confirmed by
 * rendering it at 1024px before picking 1180px as the safe threshold, not
 * by estimate alone. Mobile keeps the stacked single-row layout untouched.
 */
export function BasicPrimaryShortcuts({ items }: ShortcutRowProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic-guest';
  const primaryItems = items.slice(0, 4);

  // `pt-2` (mobile only; padding, since a margin would collapse with the
  // stack's own 16px gap) on top of that gap = 24px between
  // the card above and the icon containers; the badges overhang ~6px above
  // the containers, so they still clear the card above by ~18px.
  return (
    <div className="flex gap-1 pt-2 lg:pt-0 lg:grid lg:grid-cols-2 lg:gap-3 [@media(min-width:1180px)]:gap-4">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        const badge = resolveServiceBadge(item, accountId);
        return (
          <button
            key={item.id}
            onClick={() => navigate(resolveServiceHref(item, accountId))}
            className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0 active:opacity-70 transition-opacity lg:w-full lg:flex-row lg:items-center lg:gap-3 [@media(min-width:1180px)]:gap-4 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:px-3 [@media(min-width:1180px)]:px-5 lg:py-2.5 [@media(min-width:1180px)]:py-3 lg:hover:border-gray-300 lg:hover:shadow-sm lg:transition-shadow"
          >
            {badge && (
              <span className={cn('absolute -top-1.5 right-1 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm lg:top-2.5 lg:right-2.5 [@media(min-width:1180px)]:top-3 [@media(min-width:1180px)]:right-3', SERVICE_BADGE_CLASS[badge.tone])}>
                {badge.label}
              </span>
            )}
            <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm lg:border-0 lg:bg-blue-50 lg:shadow-none lg:h-14 lg:w-14 [@media(min-width:1180px)]:h-[76px] [@media(min-width:1180px)]:w-[76px] lg:rounded-xl">
              {item.image ? (
                <img src={item.image} alt="" className="h-16 w-16 object-contain lg:h-10 lg:w-10 [@media(min-width:1180px)]:h-[52px] [@media(min-width:1180px)]:w-[52px]" />
              ) : (
                <Icon className="h-8 w-8 text-blue-600 lg:h-7 lg:w-7 [@media(min-width:1180px)]:h-9 [@media(min-width:1180px)]:w-9" />
              )}
            </div>
            <span className="w-full text-center text-[12px] font-semibold leading-tight text-gray-700 break-words lg:w-auto lg:min-w-0 lg:flex-1 lg:text-left lg:text-base [@media(min-width:1180px)]:text-xl">
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
 * left, label on the right — sized as a recognizable feature shortcut, not a
 * tiny nav button (corrective pass: ~80px-tall card, 56px icon chip, 18px
 * semibold label, ~12px padding — held constant across breakpoints, unlike
 * the old approach of shrinking text/icons at narrower widths). Row count
 * is what actually scales with available width instead (spec: "5 in one row
 * when space permits"): 2-up at `lg:` (1024px), stepping up through 3/4-up
 * at custom arbitrary-media breakpoints empirically picked so no column
 * width ever forces an ugly mid-word break on a single-word label (e.g.
 * "Storefront") — verified live via actual rendered layout, not just the
 * CSS. Mobile keeps its existing single-row/carousel behavior untouched.
 */
export function BasicSecondaryShortcuts({ items, showHeader = true }: SecondaryShortcutRowProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic-guest';
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
          'flex gap-1 -mx-0.5 px-0.5 lg:grid lg:grid-cols-2 [@media(min-width:1280px)]:grid-cols-3 [@media(min-width:1600px)]:grid-cols-5 lg:gap-3 lg:overflow-visible',
          isCarousel ? 'overflow-x-auto scrollbar-none snap-x snap-proximity' : 'justify-between',
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(resolveServiceHref(item, accountId))}
              className={cn(
                'flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 text-center active:bg-gray-50 transition-colors cursor-pointer',
                isCarousel ? 'w-16 flex-shrink-0 snap-start px-1' : 'flex-1 px-0',
                'lg:w-full lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white lg:p-3 lg:text-left lg:hover:border-gray-300 lg:hover:bg-gray-50',
              )}
            >
              <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 lg:h-14 lg:w-14 lg:rounded-lg">
                {item.image ? (
                  <img src={item.image} alt="" className="h-10 w-10 object-contain lg:h-11 lg:w-11" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-600 lg:h-10 lg:w-10" />
                )}
              </div>
              <span className="w-full text-[11px] font-medium leading-tight text-gray-600 break-words lg:w-auto lg:min-w-0 lg:flex-1 lg:text-lg lg:font-semibold lg:leading-tight lg:whitespace-normal lg:hyphens-auto">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
