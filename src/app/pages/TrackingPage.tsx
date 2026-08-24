import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import {
  IconPackage,
  IconCircleCheck,
  IconTruck,
  IconAlertCircle,
  IconSearch,
  IconExternalLink,
  IconBolt,
  IconHeadset,
  IconClock,
} from '@tabler/icons-react';
import { getTransactionById, resolveOnDemandProgress, statusConfig, type Transaction } from '../services/transactionService';
import { getOrderById, STOREFRONT_ORDER_STATUS_META, type StorefrontOrder } from '../services/storefrontOrdersService';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { OnDemandBadge, OnDemandRoute, OnDemandTimeline } from '../components/OnDemandTracker';
import { OnDemandMap } from '../components/OnDemandMap';

const statusIcon: Record<string, React.ReactNode> = {
  delivered: <IconCircleCheck className="w-6 h-6 text-green-500" />,
  'in-transit': <IconTruck className="w-6 h-6 text-blue-500" />,
  'picked-up': <IconPackage className="w-6 h-6 text-amber-500" />,
  pending: <IconPackage className="w-6 h-6 text-gray-400" />,
  failed: <IconAlertCircle className="w-6 h-6 text-red-500" />,
  returned: <IconAlertCircle className="w-6 h-6 text-gray-500" />,
  cancelled: <IconAlertCircle className="w-6 h-6 text-red-500" />,
};

function TrackingResult({ transaction }: { transaction: Transaction }) {
  const status = statusConfig[transaction.status];

  return (
    <div className="space-y-6">
      {/* Status hero */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
            {statusIcon[transaction.status] ?? <IconPackage className="w-6 h-6 text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{transaction.trackingNumber}</h2>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="text-sm text-gray-500">
              {transaction.type} Delivery · Booked {transaction.date}
            </p>
          </div>
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Destination</p>
            <p className="text-sm text-gray-900">{transaction.destination}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Recipient</p>
            <p className="text-sm text-gray-900">{transaction.recipient.name}</p>
          </div>
          {transaction.deliveryDate !== '—' && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Delivered On</p>
              <p className="text-sm text-gray-900">{transaction.deliveryDate}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Service Type</p>
            <p className="text-sm text-gray-900">{transaction.type}</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-5">Tracking Timeline</h3>
        <div className="space-y-0">
          {transaction.timeline.map((event, index) => {
            const isLatest = index === 0;
            const isLast = index === transaction.timeline.length - 1;
            return (
              <div key={index} className="relative flex gap-4">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200" />
                )}
                {/* Dot */}
                <div className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                  isLatest
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300'
                }`}>
                  {isLatest && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
                  <p className={`font-medium text-sm ${isLatest ? 'text-gray-900' : 'text-gray-600'}`}>
                    {event.status}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{event.date}</p>
                  {event.note && (
                    <p className="text-xs text-gray-500 mt-1">{event.note}</p>
                  )}
                  {event.hasProof && (
                    <span className="inline-block mt-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      Proof of delivery available
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Package summary */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Package Details</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Size</p>
            <p className="text-sm text-gray-900">{transaction.packaging.size}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Dimensions</p>
            <p className="text-sm text-gray-900">{transaction.packaging.dimensions}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Weight</p>
            <p className="text-sm text-gray-900">{transaction.packaging.weight}</p>
          </div>
        </div>
      </div>

      {/* Sent by */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
        <IconPackage className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <p className="text-sm text-gray-600">
          Sent via <span className="font-medium text-gray-800">GGX Business+</span> by{' '}
          <span className="font-medium text-gray-800">{transaction.sender.name}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Public On-Demand live-tracking state. Demo only — current status, mocked ETA,
 * pickup/drop-off cards, courier-style timeline, placeholder map, and a support
 * CTA. No buyer-facing app or real map/dispatch integration required.
 */
function OnDemandTrackingResult({ transaction }: { transaction: Transaction }) {
  const progress = resolveOnDemandProgress(transaction);

  return (
    <div className="space-y-6">
      {/* Status hero */}
      <div className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <IconBolt className="w-6 h-6 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{transaction.trackingNumber}</h2>
              <OnDemandBadge />
              <Badge className="bg-violet-100 text-violet-800">{progress.currentLabel}</Badge>
            </div>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-violet-700">{progress.eta}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Live map mockup */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <OnDemandMap progress={progress} />
      </div>

      {/* Pickup / drop-off */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Route</h3>
        <OnDemandRoute
          pickup={{ name: transaction.sender.name, address: transaction.sender.address }}
          dropoff={{ name: transaction.recipient.name, address: transaction.recipient.address }}
        />
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-5">Delivery progress</h3>
        <OnDemandTimeline progress={progress} />
      </div>

      {/* Support CTA */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <IconHeadset className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600">
            Questions about this On-Demand delivery? Our support team can help.
          </p>
        </div>
        <a href="mailto:support@gogoxpress.com" className="sm:flex-shrink-0">
          <Button variant="outline" size="sm" className="w-full">
            <IconHeadset className="w-4 h-4 mr-1.5" />
            Contact support
          </Button>
        </a>
      </div>
    </div>
  );
}

/**
 * Buyer-facing state for a storefront order that the seller has not yet booked
 * for delivery (awaiting acceptance, or rejected). No delivery/tracking exists
 * yet, so this shows the order state rather than delivery progress.
 */
function OrderStatusResult({ order }: { order: StorefrontOrder }) {
  const meta = STOREFRONT_ORDER_STATUS_META[order.status];
  const rejected = order.status === 'rejected';
  const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-6 shadow-sm bg-white ${rejected ? 'border-gray-200' : 'border-amber-200'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${rejected ? 'bg-gray-100' : 'bg-amber-50'}`}>
            {rejected ? <IconAlertCircle className="w-6 h-6 text-gray-400" /> : <IconClock className="w-6 h-6 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{order.id}</h2>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>
            <p className="text-sm text-gray-500">
              {rejected
                ? 'This order was not accepted by the seller and was not booked for delivery.'
                : 'Waiting for the seller to accept your order. Tracking begins once it’s accepted and booked.'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Order summary</h3>
        <div className="space-y-2.5">
          {order.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{it.quantity} × {it.name}</span>
              <span className="text-gray-900">{peso(it.unitPrice * it.quantity)}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-2 flex items-center justify-between font-semibold">
            <span className="text-gray-900">Total (COD)</span>
            <span className="text-gray-900">{peso(order.codTotal)}</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Deliver to</p>
            <p className="text-gray-900">{order.buyer.name}</p>
            <p className="text-gray-500">{order.buyer.address}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Store</p>
            <p className="text-gray-900">{order.storeName}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
        <IconHeadset className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <p className="text-sm text-gray-600">
          Questions about this order? <a href="mailto:support@gogoxpress.com" className="font-medium text-blue-600 hover:text-blue-800">Contact support</a>.
        </p>
      </div>
    </div>
  );
}

function TrackingNotFound({ trackingNumber }: { trackingNumber: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <IconAlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-gray-900">Package not found</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
        No package was found for tracking number{' '}
        <span className="font-medium text-gray-700 break-all">{trackingNumber}</span>.
        Please double-check the number and try again.
      </p>
    </div>
  );
}

export function TrackingPage() {
  const { trackingNumber } = useParams<{ trackingNumber?: string }>();
  const [query, setQuery] = useState(trackingNumber ?? '');
  const [searched, setSearched] = useState(trackingNumber ?? '');
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(
    trackingNumber ? undefined : null
  );
  // A storefront order that has no delivery yet (awaiting acceptance / rejected).
  const [order, setOrder] = useState<StorefrontOrder | null>(null);
  const [loading, setLoading] = useState(!!trackingNumber);

  useEffect(() => {
    let active = true;
    if (!searched) { setTransaction(null); setOrder(null); setLoading(false); return; }
    setLoading(true);
    setTransaction(undefined);
    setOrder(null);
    // A reference can be a delivery tracking number (GGX-…) or a storefront order
    // id (SO-…). Try the delivery first; fall back to the order. An accepted order
    // resolves to its delivery; an awaiting/rejected order shows its order state.
    getTransactionById(searched)
      .then(async (tx) => {
        if (!active) return;
        if (tx) { setTransaction(tx); setLoading(false); return; }
        const o = await getOrderById(searched);
        if (!active) return;
        if (o?.status === 'accepted' && o.trackingNumber) {
          const delivery = await getTransactionById(o.trackingNumber);
          if (!active) return;
          setTransaction(delivery);
        } else if (o) {
          setOrder(o);
          setTransaction(null);
        } else {
          setTransaction(null);
        }
        setLoading(false);
      })
      .catch(() => { if (active) { setTransaction(null); setLoading(false); } });
    return () => { active = false; };
  }, [searched]);

  const handleSearch = () => {
    const trimmed = query.trim();
    if (trimmed) setSearched(trimmed);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <IconPackage className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">GGX Business+</span>
          </div>
          <Link
            to="/"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <IconExternalLink className="w-3.5 h-3.5" />
            Merchant login
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Track your package</h1>
          <p className="text-sm text-gray-500 mt-1">Enter a GGX tracking number or storefront order number to see updates.</p>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="e.g. GGX-2026-90007"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <Button onClick={handleSearch} disabled={!query.trim()}>
            <IconSearch className="w-4 h-4 mr-1.5" />
            Track
          </Button>
        </div>

        {/* Results */}
        {loading && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
            Looking up your package…
          </div>
        )}

        {!loading && transaction === null && !order && searched && (
          <TrackingNotFound trackingNumber={searched} />
        )}

        {!loading && !transaction && order && (
          <OrderStatusResult order={order} />
        )}

        {!loading && transaction && (
          transaction.serviceType === 'on_demand'
            ? <OnDemandTrackingResult transaction={transaction} />
            : <TrackingResult transaction={transaction} />
        )}

        {!loading && !searched && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
            <IconPackage className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Enter a tracking number above to get started.</p>
          </div>
        )}
      </main>

      <footer className="max-w-2xl mx-auto px-4 py-8 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} GGX Business+. All rights reserved.
      </footer>
    </div>
  );
}
