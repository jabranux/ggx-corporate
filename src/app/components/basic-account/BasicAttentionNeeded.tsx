import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconChevronRight } from '@tabler/icons-react';
import { Drawer } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { getAttentionItems, type BasicAttentionItem } from '../../lib/basicAttentionItems';

const VISIBLE_LIMIT = 2;

/** The single most important item — title, short description, and a CTA button. */
function PrimaryAttentionRow({ item }: { item: BasicAttentionItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
        <Icon className="h-4.5 w-4.5 text-blue-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{item.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{item.detail}</p>
      </div>
      <Button size="sm" className="flex-shrink-0" onClick={() => navigate(item.href)}>
        {item.actionLabel}
      </Button>
    </div>
  );
}

/**
 * The second item — title only, no description or CTA button. The whole row
 * is the tap target (spec §1), navigating straight to the relevant action, so
 * it reads clearly as a lighter-weight item than the primary row above it.
 */
function SecondaryAttentionRow({ item }: { item: BasicAttentionItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <button
      onClick={() => navigate(item.href)}
      className="flex w-full items-center gap-3 px-3.5 py-2 text-left cursor-pointer active:bg-gray-50 transition-colors"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-3.5 w-3.5 text-gray-500" />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{item.title}</p>
      <IconChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
    </button>
  );
}

/** Full-detail row used inside the "+N more" drawer for overflow items. */
function OverflowAttentionRow({ item }: { item: BasicAttentionItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3 px-1 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 leading-snug">{item.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{item.detail}</p>
      </div>
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => navigate(item.href)}>
        {item.actionLabel}
      </Button>
    </div>
  );
}

/**
 * Compact "Needs your attention" card (spec §1) for unresolved, account-
 * specific tasks — distinct from `BasicCriticalAlerts`' operational
 * advisories both in purpose (per-account action items vs. broadcast
 * notices) and in treatment (a neutral/blue action card here, amber warning
 * styling there). Renders nothing when there's nothing outstanding — no
 * empty space is reserved. Item order/filtering (priority first, resolved
 * items dropped entirely) is unchanged — only the presentation here changed.
 *
 * Only the first (most important) item gets a description and CTA button;
 * the second is a single compact, fully-clickable row with just a title —
 * a deliberately lighter weight than the first, per spec. Anything beyond
 * those two collapses under a "+N more" row that opens a `Drawer` with the
 * full detail for the remainder, so the card itself never grows past two
 * short rows regardless of how many reminders exist.
 */
export function BasicAttentionNeeded() {
  const items = getAttentionItems();
  const [viewAllOpen, setViewAllOpen] = useState(false);
  if (items.length === 0) return null;

  const [primaryItem, secondaryItem, ...overflow] = items;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="px-3.5 pt-2.5 pb-0.5">
          <h3 className="text-sm font-semibold text-gray-900">Needs your attention</h3>
        </div>
        <div className="divide-y divide-gray-100">
          <PrimaryAttentionRow item={primaryItem} />
          {secondaryItem && <SecondaryAttentionRow item={secondaryItem} />}
        </div>
        {overflow.length > 0 && (
          <button
            onClick={() => setViewAllOpen(true)}
            className="flex w-full items-center justify-center gap-1 border-t border-gray-100 px-3.5 py-2 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            +{overflow.length} more <IconChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <Drawer open={viewAllOpen} onClose={() => setViewAllOpen(false)} title="Needs your attention">
        <div className="-mx-1 divide-y divide-gray-100">
          {overflow.map((item) => (
            <OverflowAttentionRow key={item.id} item={item} />
          ))}
        </div>
      </Drawer>
    </div>
  );
}
