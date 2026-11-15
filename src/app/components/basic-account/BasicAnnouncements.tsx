import { useState } from 'react';
import { IconAlertTriangle, IconBellRinging } from '@tabler/icons-react';
import { Alert } from '../ui/Alert';
import { Drawer } from '../ui/Dialog';
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
 */
export function BasicCriticalAlerts() {
  const critical = getCriticalAnnouncements();
  if (critical.length === 0) return null;

  return (
    <div className="space-y-2">
      {critical.map((a) => (
        <Alert key={a.id} variant="warning" icon={<IconAlertTriangle className="w-4 h-4" />} title={a.title}>
          {a.body}
        </Alert>
      ))}
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
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
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
            <div key={a.id} className="flex items-start gap-3 px-4 py-3">
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
            <Alert key={a.id} variant="warning" icon={<IconAlertTriangle className="w-4 h-4" />} title={a.title}>
              {a.body}
            </Alert>
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
