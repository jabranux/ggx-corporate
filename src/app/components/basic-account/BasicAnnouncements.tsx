import { useState } from 'react';
import { IconAlertTriangle, IconBellRinging, IconChevronDown } from '@tabler/icons-react';
import { Drawer } from '../ui/Dialog';
import { cn } from '../../lib/utils';
import { getCriticalAnnouncements, getRegularAnnouncements } from '../../lib/basicAnnouncements';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/**
 * Critical service advisories only (spec §1/§5) — kept separate from
 * `BasicAnnouncementsPanel` so the home can surface these near the top
 * without also pulling the full regular-announcements list up with them
 * (spec: "regular announcements should not push the primary services below
 * the fold"). Renders nothing when there are none.
 *
 * Compact by default — a single line (icon + title), tap to expand the full
 * body — rather than a permanently-expanded `Alert`, per the mobile card-
 * styling pass ("critical service advisories should be compact with
 * expandable details"). Each item expands independently.
 */
export function BasicCriticalAlerts() {
  const critical = getCriticalAnnouncements();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (critical.length === 0) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {critical.map((a) => {
        const isOpen = expanded.has(a.id);
        return (
          <div key={a.id} className="overflow-hidden rounded-2xl bg-amber-50 shadow-sm">
            <button
              onClick={() => toggle(a.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer"
              aria-expanded={isOpen}
            >
              <IconAlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-amber-900">{a.title}</p>
              <IconChevronDown className={cn('h-4 w-4 flex-shrink-0 text-amber-500 transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <p className="px-3 pb-3 text-xs leading-snug text-amber-800">{a.body}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Regular announcements (spec §4/§5): a compact, low-intrusion list with a
 * "View all" drawer for the rest (the drawer also repeats any critical
 * alerts, so it's a complete record even though `BasicCriticalAlerts`
 * renders those separately elsewhere on the page). Structured mock content
 * for now (`lib/basicAnnouncements.ts`) — swappable for a real feed later.
 */
export function BasicAnnouncementsPanel() {
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const critical = getCriticalAnnouncements();
  const regular = getRegularAnnouncements();
  const visibleRegular = regular.slice(0, 3);

  if (visibleRegular.length === 0) return null;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <h3 className="text-sm font-semibold text-gray-900">Announcements</h3>
          {regular.length > visibleRegular.length && (
            <button
              onClick={() => setViewAllOpen(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              View all
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {visibleRegular.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-3 py-3">
              <IconBellRinging className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 leading-snug">{a.title}</p>
                <p className="text-xs text-gray-500 leading-snug mt-0.5">{a.body}</p>
              </div>
              <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">{formatDate(a.date)}</span>
            </div>
          ))}
        </div>
      </div>

      <Drawer open={viewAllOpen} onClose={() => setViewAllOpen(false)} title="Announcements">
        <div className="space-y-3">
          {critical.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg bg-amber-50 px-3 py-2.5">
              <IconAlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-900 leading-snug">{a.title}</p>
                <p className="text-xs text-amber-800 leading-snug mt-0.5">{a.body}</p>
              </div>
            </div>
          ))}
          {regular.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <IconBellRinging className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 leading-snug">{a.title}</p>
                <p className="text-xs text-gray-500 leading-snug mt-0.5">{a.body}</p>
              </div>
              <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">{formatDate(a.date)}</span>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
