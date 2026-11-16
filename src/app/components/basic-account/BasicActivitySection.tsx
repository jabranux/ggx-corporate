import { useNavigate } from 'react-router';
import { IconArrowRight, IconPackage, IconReceipt2, IconTruckDelivery } from '@tabler/icons-react';
import type { BasicBookingHistoryEntry } from '../../lib/basicBookingHistory';

function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isWithinDays(iso: string, days: number): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms <= days * 24 * 60 * 60 * 1000;
}

interface BasicActivityOverviewProps {
  bookings: BasicBookingHistoryEntry[];
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
export function BasicActivityOverview({ bookings }: BasicActivityOverviewProps) {
  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-4 py-5 text-center shadow-sm">
        <IconTruckDelivery className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
        <p className="text-sm text-gray-500">No activity yet this week.</p>
        <p className="text-xs text-gray-400 mt-0.5">Book your first delivery to see your activity here.</p>
      </div>
    );
  }

  const last7Days = bookings.filter((b) => isWithinDays(b.confirmedAt, 7));
  const totalSpend = last7Days.reduce((sum, b) => sum + (b.total || 0) + (b.codAmount || 0), 0);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity — last 7 days</p>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <IconPackage className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 leading-none">{last7Days.length}</p>
            <p className="text-[11px] text-gray-500 leading-none mt-0.5">Bookings</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <IconReceipt2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 leading-none">{peso(totalSpend)}</p>
            <p className="text-[11px] text-gray-500 leading-none mt-0.5">Est. total handled</p>
          </div>
        </div>
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
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <h3 className="text-sm font-semibold text-gray-900">Recent transactions</h3>
        <button
          onClick={() => navigate('/dashboard/transactions')}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
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
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <IconPackage className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{b.recipientName ?? 'Recipient'}</p>
                <p className="text-xs text-gray-400 truncate">{b.trackingNumber}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-semibold text-gray-900">{peso(b.total)}</p>
                <p className="text-[11px] text-gray-400">{new Date(b.confirmedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
