import { useNavigate } from 'react-router';
import {
  IconPackage, IconMapSearch, IconUpload, IconMessage, IconWallet, IconMapPin,
} from '@tabler/icons-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Basic account home/dashboard — minimal by design (spec §9): a booking
 * entry point, a track-shipment shortcut, an empty "recent transactions"
 * state, and a few feature shortcuts. No Business+ operational dashboards,
 * advanced analytics, or business metrics. "Book a delivery" now opens the
 * real single-booking flow at `/dashboard/book-delivery`
 * (`pages/basic-account/BookDelivery.tsx`); the full personalized dashboard
 * experience (recent transactions, etc.) remains a separate, later phase.
 */
export function BasicHome() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const shortcuts = [
    { name: 'Bulk Upload', icon: IconUpload, href: '/dashboard/bulk-uploader' },
    { name: 'Support Tickets', icon: IconMessage, href: '/dashboard/support-tickets' },
    { name: 'Earnings', icon: IconWallet, href: '/dashboard/basic-earnings' },
    { name: 'Address Book', icon: IconMapPin, href: '/dashboard/address-book' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-gray-600">Here's what's happening with your deliveries today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
              <IconPackage className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Book a delivery</h3>
            <p className="text-sm text-gray-500 mt-1">
              Send a parcel with rider pickup or drop-off, and track its fee and status as you go.
            </p>
            <Button className="mt-4" onClick={() => navigate('/dashboard/book-delivery')}>Book a delivery</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
              <IconMapSearch className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Track a shipment</h3>
            <p className="text-sm text-gray-500 mt-1">
              Look up any of your orders and follow its delivery status.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => navigate('/dashboard/transactions')}>
              Go to Transactions
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-gray-900">Recent transactions</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/transactions')}>
              View all
            </Button>
          </div>
          <div className="py-10 text-center">
            <IconPackage className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No transactions yet.</p>
            <p className="text-xs text-gray-400 mt-1">Your bookings will show up here once you start shipping.</p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Shortcuts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {shortcuts.map((s) => (
            <button
              key={s.name}
              onClick={() => navigate(s.href)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-4 text-center hover:border-gray-300 hover:shadow-sm transition-colors cursor-pointer min-w-0"
            >
              <s.icon className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <span className="text-xs font-medium text-gray-700 truncate w-full">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
