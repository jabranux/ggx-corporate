import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconChevronRight } from '@tabler/icons-react';
import { Drawer } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { getAttentionItems, type BasicAttentionItem } from '../../lib/basicAttentionItems';

const VISIBLE_LIMIT = 2;

function AttentionRow({ item, emphasized }: { item: BasicAttentionItem; emphasized?: boolean }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <div className={emphasized ? 'flex items-start gap-3 px-3.5 py-3' : 'flex items-start gap-3 px-3.5 py-2.5'}>
      <div
        className={
          emphasized
            ? 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100'
            : 'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100'
        }
      >
        <Icon className={emphasized ? 'h-4.5 w-4.5 text-blue-600' : 'h-4 w-4 text-gray-500'} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={emphasized ? 'text-sm font-semibold text-gray-900 leading-snug' : 'text-sm font-medium text-gray-800 leading-snug'}>
          {item.title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{item.detail}</p>
      </div>
      <Button size="sm" variant={emphasized ? 'default' : 'outline'} className="flex-shrink-0" onClick={() => navigate(item.href)}>
        {item.actionLabel}
      </Button>
    </div>
  );
}

/**
 * Compact "attention needed" card (spec §2) for unresolved, account-specific
 * tasks — distinct from `BasicCriticalAlerts`' operational advisories both in
 * purpose (per-account action items vs. broadcast notices) and in treatment
 * (a neutral/blue action card here, amber warning styling there). Renders
 * nothing when there's nothing outstanding — no empty space is reserved.
 *
 * The most important item is emphasized (larger icon chip, bolder title,
 * solid CTA); the rest are compact rows capped at `VISIBLE_LIMIT`, with a
 * "+N more" row opening a `Drawer` for the remainder — never more than one
 * extra item inflates the home's scroll length.
 */
export function BasicAttentionNeeded() {
  const items = getAttentionItems();
  const [viewAllOpen, setViewAllOpen] = useState(false);
  if (items.length === 0) return null;

  const visible = items.slice(0, VISIBLE_LIMIT);
  const overflowCount = items.length - visible.length;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="px-3.5 pt-3 pb-1">
          <h3 className="text-sm font-semibold text-gray-900">Attention needed</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {visible.map((item, i) => (
            <AttentionRow key={item.id} item={item} emphasized={i === 0} />
          ))}
        </div>
        {overflowCount > 0 && (
          <button
            onClick={() => setViewAllOpen(true)}
            className="flex w-full items-center justify-center gap-1 border-t border-gray-100 px-3.5 py-2.5 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            +{overflowCount} more <IconChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <Drawer open={viewAllOpen} onClose={() => setViewAllOpen(false)} title="Attention needed">
        <div className="-mx-1 divide-y divide-gray-100">
          {items.map((item, i) => (
            <AttentionRow key={item.id} item={item} emphasized={i === 0} />
          ))}
        </div>
      </Drawer>
    </div>
  );
}
