/**
 * Review & Payment panel for the GGX Basic single-booking flow. Desktop: the
 * sticky right rail. Mobile: the content of the Review step. Both read/write
 * the same `BookingDraft` via props — no separate logic per breakpoint, and
 * both collapse the fee breakdown / voucher / payment-method sections by
 * default (progressive disclosure), expanding only when the viewer opens
 * them, so the Total and Confirm Booking stay the prominent, always-visible
 * elements on either layout.
 */
import { useState } from 'react';
import { IconTag, IconX, IconLoader2, IconChevronDown, IconCash, IconQrcode, IconWallet } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Drawer } from './ui/Dialog';
import { Input } from './ui/Input';
import { ShippingFeePayerSelector } from './ShippingFeePayerSelector';
import { estimateBasicBookingFee } from '../lib/bookingFees';
import { validateBookingVoucher, computeVoucherDiscount } from '../services/bookingVoucherService';
import { cn } from '../lib/utils';
import type { BookingDraft, SenderPaymentMethod } from '../lib/basicBookingDraft';

const SENDER_METHOD_LABEL: Record<SenderPaymentMethod, { label: string; icon: typeof IconCash }> = {
  cash_pickup: { label: 'Cash', icon: IconCash },
  gcash_qr: { label: 'GCash (Scan QR)', icon: IconQrcode },
  gcash_wallet: { label: 'GCash (Wallet)', icon: IconWallet },
};

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface BookingReviewPaymentPanelProps {
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** Human-readable reason Confirm Booking is disabled, shown above the CTA. */
  blockingReason?: string;
}

export function BookingReviewPaymentPanel({ draft, onChange, onConfirm, confirmDisabled, blockingReason }: BookingReviewPaymentPanelProps) {
  const [voucherInput, setVoucherInput] = useState(draft.voucherCode);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const declaredValue = Number(draft.declaredValue) || 0;
  const fee = estimateBasicBookingFee({
    pouchSize: draft.pouchSize,
    serviceType: draft.serviceType,
    declaredValue,
  });

  const shipping = fee.baseFee + fee.serviceSurcharge;
  const discount = draft.voucherDiscount;
  const total = Math.max(shipping + fee.itemProtection - discount, 0);

  const handleApplyVoucher = async () => {
    const code = voucherInput.trim();
    if (!code) return;
    setValidating(true);
    setVoucherError(null);
    const result = await validateBookingVoucher(code);
    setValidating(false);
    if (!result.valid) {
      setVoucherError(result.message ?? 'Invalid voucher code.');
      onChange({ voucherCode: '', voucherDiscount: 0 });
      return;
    }
    onChange({ voucherCode: result.code, voucherDiscount: computeVoucherDiscount(result, shipping) });
    setVoucherOpen(false);
  };

  const handleRemoveVoucher = () => {
    onChange({ voucherCode: '', voucherDiscount: 0 });
    setVoucherInput('');
    setVoucherError(null);
  };

  const paymentSummaryLabel = draft.feePayer === 'receiver'
    ? 'Cash | Paid by receiver'
    : `${SENDER_METHOD_LABEL[draft.senderPaymentMethod].label} | Paid by sender`;
  const PaymentSummaryIcon = draft.feePayer === 'receiver' ? IconCash : SENDER_METHOD_LABEL[draft.senderPaymentMethod].icon;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Review &amp; Payment</h2>

        {/* Fee breakdown — Total stays visible; line items collapse. */}
        <div className="space-y-1.5 text-sm">
          <button
            type="button"
            onClick={() => setBreakdownOpen((o) => !o)}
            aria-expanded={breakdownOpen}
            className="flex w-full items-center justify-between"
          >
            <span className="flex items-center gap-1 font-semibold text-gray-900">
              Total shipping charge
              <IconChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', breakdownOpen && 'rotate-180')} />
            </span>
            <span className="font-bold text-gray-900">{fmtPHP(total)}</span>
          </button>
          {breakdownOpen && (
            <div className="space-y-1.5 pt-1 border-t border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping fee</span>
                <span className="font-medium text-gray-900">{fmtPHP(shipping)}</span>
              </div>
              {fee.itemProtection > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Item protection</span>
                  <span className="font-medium text-gray-900">{fmtPHP(fee.itemProtection)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Voucher ({draft.voucherCode})</span>
                  <span className="font-medium">−{fmtPHP(discount)}</span>
                </div>
              )}
            </div>
          )}
          {draft.merchandiseCod.enabled && (
            <p className="text-xs text-gray-400 pt-1">
              Plus {fmtPHP(Number(draft.merchandiseCod.amount) || 0)} merchandise COD, collected separately from the receiver.
            </p>
          )}
        </div>

        {/* Voucher — demo only, never a real transaction. */}
        <div className="space-y-2">
          {draft.voucherCode ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm text-green-800 min-w-0">
                <IconTag className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium truncate">{draft.voucherCode}</span>
                <span className="text-xs text-green-700 flex-shrink-0">applied</span>
              </div>
              <button type="button" onClick={handleRemoveVoucher} className="text-green-700 hover:text-green-900 flex-shrink-0" aria-label="Remove voucher">
                <IconX className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setVoucherOpen(true)} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
              <IconTag className="w-3.5 h-3.5" /> View vouchers
            </button>
          )}
        </div>

        <Drawer open={voucherOpen} onClose={() => setVoucherOpen(false)} title="Vouchers">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={voucherInput}
                onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyVoucher(); } }}
                placeholder="Voucher code"
                className="uppercase"
              />
              <Button size="sm" variant="outline" disabled={!voucherInput.trim() || validating} onClick={handleApplyVoucher}>
                {validating ? <IconLoader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
              </Button>
            </div>
            {voucherError && <p className="text-xs text-red-600">{voucherError}</p>}
            <p className="text-[11px] text-gray-400">Demo voucher only — not a real discount or transaction.</p>
          </div>
        </Drawer>

        {/* Payment — compact summary, opens the full payer/method selector in a drawer. */}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-800 min-w-0">
              <PaymentSummaryIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="truncate">{paymentSummaryLabel}</span>
            </span>
            <IconChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 -rotate-90" />
          </button>
        </div>

        <Drawer open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Payment">
          <div className="space-y-4">
            <ShippingFeePayerSelector
              feePayer={draft.feePayer}
              onFeePayerChange={(v) => onChange({ feePayer: v })}
              firstMile={draft.firstMile}
              senderMethod={draft.senderPaymentMethod}
              onSenderMethodChange={(v) => onChange({ senderPaymentMethod: v })}
              amount={total}
            />
            <Button variant="outline" className="w-full" onClick={() => setPaymentOpen(false)}>Done</Button>
          </div>
        </Drawer>

        {confirmDisabled && blockingReason && (
          <p className="text-xs text-red-600">{blockingReason}</p>
        )}
        <Button className="w-full" onClick={onConfirm} disabled={confirmDisabled}>
          Confirm Booking
        </Button>
      </CardContent>
    </Card>
  );
}
