import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconChevronRight } from '@tabler/icons-react';
import { Drawer } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { getAttentionItems, type BasicAttentionItem } from '../../lib/basicAttentionItems';

/**
 * The single most important item — title, short description, no CTA button.
 * The entire row is the tap target (spec §1 — "remove the CTA button, make
 * the whole row clickable").
 */
function PrimaryAttentionRow({ item }: { item: BasicAttentionItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <button
      onClick={() => navigate(item.href)}
      className="flex w-full items-start gap-3 px-3 py-3 text-left cursor-pointer active:bg-gray-50 transition-colors"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
        <Icon className="h-4.5 w-4.5 text-blue-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{item.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{item.detail}</p>
      </div>
      <IconChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400" />
    </button>
  );
}

/**
 * Second row — combines the second reminder's title with a "+N more" count
 * for anything beyond it (spec §1, e.g. "A payment didn't go through +1
 * more ›"). The whole row opens the full pending-items list, so there's no
 * separate counter element to tap.
 */
function CombinedSecondaryRow({
  item,
  moreCount,
  onOpenAll,
}: {
  item: BasicAttentionItem;
  moreCount: number;
  onOpenAll: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onOpenAll}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer active:bg-gray-50 transition-colors"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-3.5 w-3.5 text-gray-500" />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
        {item.title}
        {moreCount > 0 && <span className="text-gray-400"> +{moreCount} more</span>}
      </p>
      <IconChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
    </button>
  );
}

/** Full-detail row used inside the full pending-items drawer. */
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
 * The header badge always reflects the real unresolved count. Only the first
 * (most important) item gets a description; a second row, when a second item
 * exists, combines that item's title with a "+N more" count for everything
 * beyond it and opens a drawer with the full pending list — so the card
 * never grows past two short rows regardless of how many reminders exist.
 * When there's only one outstanding item, the second row doesn't render at
 * all.
 */
export function BasicAttentionNeeded() {
  const items = getAttentionItems();
  const [viewAllOpen, setViewAllOpen] = useState(false);
  if (items.length === 0) return null;

  const [primaryItem, secondaryItem, ...overflow] = items;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-0.5">
          <h3 className="text-sm font-semibold text-gray-900">Needs your attention</h3>
          <span className="flex-shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            {items.length} pending
          </span>
        </div>
        <div className="divide-y divide-gray-100">
          <PrimaryAttentionRow item={primaryItem} />
          {secondaryItem && (
            <CombinedSecondaryRow item={secondaryItem} moreCount={overflow.length} onOpenAll={() => setViewAllOpen(true)} />
          )}
        </div>
      </div>

      {secondaryItem && (
        <Drawer open={viewAllOpen} onClose={() => setViewAllOpen(false)} title="Needs your attention">
          <div className="-mx-1 divide-y divide-gray-100">
            {items.map((item) => (
              <OverflowAttentionRow key={item.id} item={item} />
            ))}
          </div>
        </Drawer>
      )}
    </div>
  );
}
