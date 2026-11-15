import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  IconCircleCheckFilled,
  IconCopy,
  IconCheck,
  IconUserCircle,
  IconTruckDelivery,
  IconBuildingStore,
  IconPackage,
  IconCalendarEvent,
  IconMapPin,
  IconHome,
} from '@tabler/icons-react';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { useAuth } from '../../contexts/AuthContext';
import { getRecentBookings } from '../../lib/basicBookingHistory';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function fmtPickupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Conditional shipping-fee payment state (spec: Scenario A/B/C). Derived
 * ONLY from `feePayer`/`senderPaymentMethod` — never inferred beyond what
 * those two fields actually say. This app has no real payment gateway (every
 * GCash option is explicitly "Simulated — no real payment is processed," see
 * `ShippingFeePayerSelector.tsx`), so there is no genuine async "pending/
 * failed" status to surface (Scenario D) — that limitation is reported in
 * this session's final report rather than faked here.
 *
 * Returns `null` for anything that isn't one of the three known
 * combinations — e.g. a history record persisted before these fields
 * existed, where `feePayer`/`senderPaymentMethod` come back `undefined`.
 * Never falls through to "paid" by default: that would misrepresent an
 * unknown/missing payment state as a completed payment.
 */
function derivePaymentState(feePayer: unknown, senderPaymentMethod: unknown) {
  if (feePayer === 'receiver') {
    return { kind: 'due_delivery' as const };
  }
  if (feePayer === 'sender' && senderPaymentMethod === 'cash_pickup') {
    return { kind: 'due_pickup' as const };
  }
  if (feePayer === 'sender' && (senderPaymentMethod === 'gcash_qr' || senderPaymentMethod === 'gcash_wallet')) {
    // Treated as a completed simulated payment, same demo boundary the
    // "Simulated" badge already discloses at selection time.
    return { kind: 'paid_simulated' as const };
  }
  return null;
}

/**
 * Confirmation screen for the GGX Basic single-booking flow.
 *
 * Draft clearing happens exactly once, in `BookDelivery`'s own
 * `handleConfirm`, before navigating here — never on this route's mount.
 * Revisiting this screen (e.g. browser Back after starting a new booking)
 * must not clear a different, not-yet-confirmed draft.
 *
 * Reads the just-recorded demo history entry (not the draft, which is
 * already cleared by the time this screen mounts) for its summary and
 * payment-state messaging — see `lib/basicBookingHistory.ts`.
 */
export function BookDeliverySuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic';
  const [copied, setCopied] = useState(false);

  // Bound to the booking just confirmed (passed via navigation state), not
  // just "whatever is newest" — otherwise revisiting this screen after
  // starting a second booking, or a second tab confirming one in between,
  // would silently swap in a different booking's details. Falls back to the
  // most recent record only when no id was handed over at all (e.g. a
  // direct link or a refresh, which drops router state).
  const bookingId = (location.state as { bookingId?: string } | null)?.bookingId;
  const history = getRecentBookings(accountId);
  const entry = (bookingId ? history.find((h) => h.id === bookingId) : undefined) ?? history[0];

  const handleCopyTracking = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.trackingNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied/unavailable (e.g. insecure context) —
      // the tracking number is still visible and selectable on the page.
    }
  };

  const paymentState = entry ? derivePaymentState(entry.feePayer, entry.senderPaymentMethod) : null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 lg:p-6">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
            <IconCircleCheckFilled className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Booking confirmed!</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your delivery has been scheduled. Here are your booking details.
          </p>
        </div>

        {entry && (
          <div className="mt-5 space-y-3">
            {/* Tracking number — prominent, copyable, clearly labeled as a demo sample rather than a real shipment reference. */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">Sample tracking number</p>
                <button
                  type="button"
                  onClick={handleCopyTracking}
                  aria-label="Copy tracking number"
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-blue-500 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                >
                  {copied ? <IconCheck className="w-4 h-4" /> : <IconCopy className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-0.5 text-xl font-extrabold tracking-wide text-blue-700">{entry.trackingNumber}</p>
              <p className="mt-1 text-xs text-blue-700">
                Demo booking — this sample identifier isn't a real GGX shipment and won't appear in Transactions.
              </p>
            </div>

            {/* Compact booking summary — only what's needed right after booking. */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-2.5">
              <SummaryRow icon={IconUserCircle} label="Recipient" value={entry.recipientName ?? 'Not set'} />
              <SummaryRow
                icon={entry.firstMile === 'pickup' ? IconTruckDelivery : IconBuildingStore}
                label="Delivery service"
                value={entry.firstMile === 'pickup' ? 'Rider Pickup' : 'Drop-off'}
              />
              <SummaryRow icon={IconPackage} label="Item" value={`${entry.itemDescription} · ${entry.pouchLabel}`} />
              <SummaryRow
                icon={IconCalendarEvent}
                label="Pickup"
                value={
                  entry.firstMile === 'dropoff'
                    ? 'At your chosen location'
                    : entry.serviceType === 'on_demand'
                    ? 'Today · On-Demand'
                    : entry.pickupDate
                    ? fmtPickupDate(entry.pickupDate)
                    : 'Not set'
                }
              />
              <SummaryRow
                icon={IconMapPin}
                label="Estimated delivery"
                value={entry.deliveryEstimateLabel ?? 'Not yet available'}
              />
            </div>

            {/* Conditional shipping-fee payment state — see `derivePaymentState` above. */}
            {paymentState?.kind === 'due_pickup' && (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Payment due: {fmtPHP(entry.total)}</p>
                <p className="text-xs text-gray-500">Cash · Paid by sender</p>
                <Alert variant="warning">
                  Please prepare {fmtPHP(entry.total)} in cash. Our rider will collect the shipping fee upon pickup.
                </Alert>
              </div>
            )}
            {paymentState?.kind === 'due_delivery' && (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Payment due: {fmtPHP(entry.total)}</p>
                <p className="text-xs text-gray-500">Cash · Paid by recipient</p>
                <Alert variant="warning">
                  The recipient will need to pay {fmtPHP(entry.total)} in cash upon delivery.
                </Alert>
                {/* Shipping fee and merchandise COD are separate charges — never summed — but both are cash the recipient must have ready, so surface it here too. */}
                {entry.codAmount > 0 && (
                  <p className="text-xs text-gray-500">
                    Separately, the recipient will also pay {fmtPHP(entry.codAmount)} cash on delivery for the merchandise itself.
                  </p>
                )}
              </div>
            )}
            {paymentState?.kind === 'paid_simulated' && (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Amount paid: {fmtPHP(entry.total)}</p>
                <p className="text-xs text-gray-500">Paid · GCash (simulated for this demo)</p>
                <Alert variant="success">
                  Your shipping fee has been paid. No additional shipping payment is required upon pickup or delivery.
                </Alert>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button className="w-full" onClick={() => navigate('/dashboard/book-delivery')}>Book another delivery</Button>
          <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard/transactions')}>Go to Transactions</Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/dashboard')}>
            <IconHome className="w-4 h-4" /> Back to Home
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          This is a demo confirmation — real booking creation and tracking through Transactions require the
          backend order API, which is not yet connected (see docs/roadmap.md).
        </p>
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof IconUserCircle; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}
