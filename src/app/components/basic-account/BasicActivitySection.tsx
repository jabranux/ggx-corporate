import type { ComponentType } from 'react';
import { useNavigate } from 'react-router';
import { IconArrowRight, IconPackage, IconPackageImport, IconReceipt2, IconTruckDelivery } from '@tabler/icons-react';
import type { BasicActivitySummary, BasicBookingHistoryEntry } from '../../lib/basicBookingHistory';
import { cn } from '../../lib/utils';

function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ActivityMetric {
  key: string;
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  desktopOnly?: boolean;
}

interface BasicActivityOverviewProps {
  /** Used only to decide between the empty state and the metrics. */
  bookings: BasicBookingHistoryEntry[];
  summary: BasicActivitySummary;
}

/**
 * Compact activity snapshot (spec §5) — derived from this account's own
 * confirmed demo bookings (`lib/basicBookingHistory.ts`), the only data this
 * sandbox has that's genuinely scoped to a Basic account's own activity (the
 * shared OMS transaction fixture has no Basic-segment rows — see
 * `BasicHome.tsx`). Collapses to a single compact empty state instead of
 * three zeroed stat tiles, per spec ("avoid giving empty activity dashboards
 * excessive screen space").
 */
export function BasicActivityOverview({ bookings, summary }: BasicActivityOverviewProps) {
  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-3 py-5 text-center shadow-sm">
        <IconTruckDelivery className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
        <p className="text-sm text-gray-500">No activity yet this week.</p>
        <p className="text-xs text-gray-400 mt-0.5">Book your first delivery to see your activity here.</p>
      </div>
    );
  }

  const metrics: ActivityMetric[] = [
    { key: 'bookings', label: 'Bookings', value: String(summary.bookings), icon: IconPackage, tone: 'bg-blue-50 text-blue-600' },
    { key: 'cod', label: 'COD Earnings', value: summary.codEarnings == null ? '—' : peso(summary.codEarnings), icon: IconReceipt2, tone: 'bg-emerald-50 text-emerald-600' },
    { key: 'transit', label: 'In Transit', value: summary.inTransit == null ? '—' : String(summary.inTransit), icon: IconTruckDelivery, tone: 'bg-amber-50 text-amber-600', desktopOnly: true },
    { key: 'delivered', label: 'Delivered', value: summary.delivered == null ? '—' : String(summary.delivered), icon: IconPackageImport, tone: 'bg-violet-50 text-violet-600', desktopOnly: true },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 lg:border-slate-200 bg-white p-3 lg:p-4 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity — last {summary.periodDays} days</p>
      {/* Mobile: two metrics side by side. Desktop: four equal columns with
          subtle vertical dividers filling the card width. */}
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              className={cn(
                'flex min-w-0 items-center gap-2.5 lg:gap-3 lg:px-5',
                i === 0 && 'lg:pl-0',
                i > 0 && 'pl-3 border-l border-gray-100 lg:border-slate-200',
                m.desktopOnly && 'hidden lg:flex',
              )}
            >
              <div className={cn('w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center flex-shrink-0', m.tone)}>
                <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold lg:font-semibold text-gray-900 leading-none truncate">{m.value}</p>
                <p className="text-[11px] lg:text-sm text-gray-500 leading-none mt-1 truncate">{m.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface BasicRecentTransactionsProps {
  bookings: BasicBookingHistoryEntry[];
}

/**
 * Recent bookings list (spec §5), most-recent-first (`getRecentBookings`
 * already returns newest-first). This sandbox's demo booking log has no real
 * fulfillment status field (only `transactionService`'s separate, unrelated
 * OMS fixture does — not scoped to Basic accounts), so this intentionally
 * shows confirmation info only rather than inventing a delivery status.
 */
export function BasicRecentTransactions({ bookings }: BasicRecentTransactionsProps) {
  const navigate = useNavigate();
  const recent = bookings.slice(0, 5);

  return (
    <div className="rounded-2xl border border-gray-100 lg:border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-1 lg:px-4 lg:pt-4">
        <h3 className="text-sm lg:text-base font-semibold text-gray-900">Recent transactions</h3>
        <button
          onClick={() => navigate('/dashboard/transactions')}
          className="flex items-center gap-1 text-xs lg:text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          View all <IconArrowRight className="w-3 h-3" />
        </button>
      </div>

      {recent.length === 0 ? (
        <div className="py-9 text-center">
          <IconPackage className="w-7 h-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No transactions yet.</p>
          <p className="text-xs text-gray-400 mt-1">Your bookings will show up here once you start shipping.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {recent.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate('/dashboard/book-delivery/success', { state: { bookingId: b.id } })}
              className="flex w-full items-center gap-3 px-3 py-3 lg:px-4 lg:py-3.5 text-left active:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <IconPackage className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm lg:text-base font-medium lg:font-semibold text-gray-900 truncate">{b.recipientName ?? 'Recipient'}</p>
                <p className="text-xs lg:text-sm text-gray-400 truncate">{b.trackingNumber}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm lg:text-base font-semibold text-gray-900">{peso(b.total)}</p>
                <p className="text-[11px] lg:text-sm text-gray-400">{new Date(b.confirmedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
