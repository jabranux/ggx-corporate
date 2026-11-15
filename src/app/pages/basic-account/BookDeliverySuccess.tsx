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
  IconHome,
} from '@tabler/icons-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { BookingScheduleSummary } from '../../components/BookingScheduleSummary';
import { useAuth } from '../../contexts/AuthContext';
import { getRecentBookings } from '../../lib/basicBookingHistory';
import { getBasicPouchSize } from '../../lib/basicPouchSizes';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
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
 * payment-state messaging — see `lib/basicBookingHistory.ts`. This demo
 * entry never becomes a real Transaction (no backend order API yet — see
 * `docs/roadmap.md`), so post-booking actions deliberately never offer a
 * "Go to Transactions" link that would imply this booking can be found
 * there.
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

  // A direct/refreshed visit with no confirmed booking to show (e.g. empty
  // history, or a cleared localStorage) must never claim "Booking
  // confirmed!" — that would misrepresent a booking that doesn't exist.
  if (!entry) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4 lg:p-6 text-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-900">No booking to show</h1>
          <p className="mt-1 text-sm text-gray-500">
            We couldn't find a confirmed booking here. Start a new delivery or head back home.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button className="w-full" onClick={() => navigate('/dashboard/book-delivery')}>Book a delivery</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/dashboard')}>
              <IconHome className="w-4 h-4" /> Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const paymentState = derivePaymentState(entry.feePayer, entry.senderPaymentMethod);
  // Legacy history records (saved before `pouchSize` existed) have no key to
  // resolve a real illustration for — `getBasicPouchSize` would otherwise
  // silently fall back to Small Pouch, showing the wrong parcel size.
  const pouch = entry.pouchSize ? getBasicPouchSize(entry.pouchSize) : null;
  const DeliveryMethodIcon = entry.firstMile === 'pickup' ? IconTruckDelivery : IconBuildingStore;
  const deliveryMethodLabel = entry.firstMile === 'pickup' ? 'Rider Pickup' : 'Drop-off';

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

        <div className="mt-5 space-y-3">
          {/* Tracking number — prominent, copyable; the demo disclaimer is
              a small caption, not a second callout competing with it. */}
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
            <p className="mt-1 text-[11px] text-gray-500">
              Demo booking — not a real GGX shipment, won't appear in Transactions.
            </p>
          </div>

          {/* Reused verbatim from the Review step, so the schedule reads
              identically wherever it appears in the flow. */}
          <BookingScheduleSummary
            draft={{ firstMile: entry.firstMile, serviceType: entry.serviceType, pickupDate: entry.pickupDate }}
            deliveryEstimateLabel={entry.deliveryEstimateLabel}
          />

          {/* Compact booking summary — only what's needed right after booking. */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <IconUserCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Recipient</p>
                <p className="text-sm font-medium text-gray-900 break-words">{entry.recipientName ?? 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-50">
                {pouch ? (
                  <img src={pouch.iconUrl} alt={pouch.label} className="h-7 w-7 object-contain" />
                ) : (
                  <IconPackage className="h-5 w-5 text-gray-400" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Item</p>
                <p className="text-sm font-medium text-gray-900 break-words">{entry.itemDescription} · {entry.pouchLabel}</p>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Pickup or drop-off</p>
              <Badge variant="outline" className="inline-flex items-center gap-1.5 border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                <DeliveryMethodIcon className="w-3.5 h-3.5" />
                {deliveryMethodLabel}
              </Badge>
            </div>
          </div>

          {/* Conditional shipping-fee payment state — see `derivePaymentState`
              above. Amount and status badge lead each card so the payment
              state scans at a glance; "Sender/Recipient pays" only applies
              while payment is still due (an already-paid card says "Paid"). */}
          {paymentState?.kind === 'due_pickup' && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Shipping fee</p>
                <Badge variant="warning">Due at pickup</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmtPHP(entry.total)}</p>
              <p className="text-xs text-gray-500">Cash · Sender pays</p>
              <Alert variant="warning">
                Please prepare {fmtPHP(entry.total)} in cash. Our rider will collect the shipping fee upon pickup.
              </Alert>
            </div>
          )}
          {paymentState?.kind === 'due_delivery' && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Shipping fee</p>
                <Badge variant="warning">Due at delivery</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmtPHP(entry.total)}</p>
              <p className="text-xs text-gray-500">Cash · Recipient pays</p>
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
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Shipping fee</p>
                <Badge variant="success">Paid</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmtPHP(entry.total)}</p>
              <p className="text-xs text-gray-500">GCash (simulated for this demo)</p>
              <Alert variant="success">
                Your shipping fee has been paid. No additional shipping payment is required upon pickup or delivery.
              </Alert>
            </div>
          )}
        </div>

        {/* No "Go to Transactions" CTA — this demo booking never appears
            there (no backend order API yet), so offering that link would
            imply the user could find it, which isn't true. */}
        <div className="mt-6 flex flex-col gap-2">
          <Button className="w-full" onClick={() => navigate('/dashboard/book-delivery')}>Book another delivery</Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/dashboard')}>
            <IconHome className="w-4 h-4" /> Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
