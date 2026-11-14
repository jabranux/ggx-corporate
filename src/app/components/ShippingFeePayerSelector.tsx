/**
 * ShippingFeePayerSelector — who pays the shipping fee on a GGX Basic single
 * booking, and how. Used only in the Basic single-booking Review & Payment
 * panel — never on buyer-facing checkout, which has no fee-payer control
 * (see `components/CheckoutPaymentOptions.tsx`).
 *
 * Deliberately independent of:
 *  - merchandise COD (a receiver-collected item value — see
 *    `components/BookingItemDetailsSection.tsx`)
 *  - declared value / item protection (drives its own fee line only)
 * This component only ever reads/writes `feePayer` and `senderPaymentMethod`.
 *
 * GCash options are SIMULATED for this phase — no real payment is processed.
 *
 * The drop-off/Cash-on-Pickup reconciliation (no rider to hand cash to at a
 * drop-off) is owned by the always-mounted `BookDelivery.tsx`, not here —
 * this component only renders while the Review panel's payment section is
 * expanded (progressive disclosure), so an effect living here would miss
 * reconciling the draft while it's collapsed.
 */
import { IconCash, IconQrcode, IconWallet } from '@tabler/icons-react';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { cn } from '../lib/utils';
import type { FeePayer, FirstMile, SenderPaymentMethod } from '../lib/basicBookingDraft';

const SENDER_METHODS: { key: SenderPaymentMethod; label: string; icon: typeof IconCash; simulated?: boolean }[] = [
  { key: 'cash_pickup', label: 'Cash on Pickup', icon: IconCash },
  { key: 'gcash_qr', label: 'GCash Scan QR', icon: IconQrcode, simulated: true },
  { key: 'gcash_wallet', label: 'GCash Wallet', icon: IconWallet, simulated: true },
];

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface ShippingFeePayerSelectorProps {
  feePayer: FeePayer;
  onFeePayerChange: (v: FeePayer) => void;
  senderMethod: SenderPaymentMethod;
  onSenderMethodChange: (v: SenderPaymentMethod) => void;
  /** No rider pickup exists for a drop-off booking — "Cash on Pickup" is excluded and reconciled when this is 'dropoff'. */
  firstMile: FirstMile;
  /** Total shipping charge the contextual line quotes. */
  amount: number;
  disabled?: boolean;
}

export function ShippingFeePayerSelector({
  feePayer,
  onFeePayerChange,
  senderMethod,
  onSenderMethodChange,
  firstMile,
  amount,
  disabled = false,
}: ShippingFeePayerSelectorProps) {
  const availableSenderMethods = firstMile === 'dropoff'
    ? SENDER_METHODS.filter((m) => m.key !== 'cash_pickup')
    : SENDER_METHODS;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">Who pays the shipping fee?</p>

      <div className="grid grid-cols-2 gap-2">
        {([
          { key: 'sender' as FeePayer, label: 'Sender pays' },
          { key: 'receiver' as FeePayer, label: 'Receiver pays' },
        ]).map(({ key, label }) => {
          const selected = feePayer === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onFeePayerChange(key)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {feePayer === 'sender' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {availableSenderMethods.map(({ key, label, icon: Icon, simulated }) => {
            const selected = senderMethod === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onSenderMethodChange(key)}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
                  disabled && 'opacity-60 cursor-not-allowed',
                )}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', selected ? 'text-blue-600' : 'text-gray-400')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium truncate', selected ? 'text-blue-900' : 'text-gray-800')}>
                    {label}
                  </span>
                  {simulated && (
                    <Badge variant="warning" className="mt-1 text-[10px]">
                      Simulated — no real payment is processed
                    </Badge>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <IconCash className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <p className="text-sm font-medium text-gray-800">Cash on Delivery (shipping fee)</p>
          </div>
          {/* NEEDS PRODUCT/LEGAL SIGN-OFF — wording supplied by product for this
              task; not sourced from an existing, published GGX Returns Policy
              document. Confirm final copy before this ships to real users. */}
          <Alert variant="warning" title="If delivery fails">
            Per the GGX Returns Policy, if delivery fails and the parcel is returned, the sender may become
            responsible for the shipping fee.
          </Alert>
        </div>
      )}

      <p className="text-sm text-gray-600">
        {feePayer === 'sender'
          ? firstMile === 'dropoff'
            ? `You pay ${fmtPHP(amount)} before drop-off.`
            : `You pay ${fmtPHP(amount)} when the rider picks up your parcel.`
          : `The receiver pays ${fmtPHP(amount)} upon delivery.`}
      </p>
    </div>
  );
}
