/**
 * Shared fee-breakdown + voucher + payment-method content for the GGX Basic
 * single-booking Review step — embedded inside the desktop sticky Review &
 * Payment panel (`BookingReviewPaymentPanel.tsx`, behind its own collapsible
 * toggle) and inside the mobile "View breakdown" drawer
 * (`BookingPaymentSummaryBar.tsx`'s drawer) so the two surfaces never
 * duplicate this logic.
 *
 * Distinguishes merchandise COD (collected separately from the receiver)
 * from the shipping charge — COD must never be added into `totals.total`
 * (enforced by `basicBookingTotals.ts`, not here) and is always shown as its
 * own line, never blended into the fee lines above it.
 */
import { useState } from 'react';
import { IconTag, IconX, IconLoader2, IconChevronDown, IconCash, IconQrcode, IconWallet } from '@tabler/icons-react';
import { Button } from './ui/Button';
import { Drawer } from './ui/Dialog';
import { Input } from './ui/Input';
import { ShippingFeePayerSelector } from './ShippingFeePayerSelector';
import { validateBookingVoucher, computeVoucherDiscount } from '../services/bookingVoucherService';
import type { BookingDraft, SenderPaymentMethod } from '../lib/basicBookingDraft';
import type { BookingTotals } from '../lib/basicBookingTotals';

const SENDER_METHOD_LABEL: Record<SenderPaymentMethod, { label: string; icon: typeof IconCash }> = {
  cash_pickup: { label: 'Cash', icon: IconCash },
  gcash_qr: { label: 'GCash (Scan QR)', icon: IconQrcode },
  gcash_wallet: { label: 'GCash (Wallet)', icon: IconWallet },
};

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface BookingFeeBreakdownContentProps {
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  totals: BookingTotals;
  /** Shows a "Final total" line at the bottom — used in the mobile drawer, where no other total is already visible nearby. */
  showFinalTotal?: boolean;
}

export function BookingFeeBreakdownContent({ draft, onChange, totals, showFinalTotal }: BookingFeeBreakdownContentProps) {
  const [voucherInput, setVoucherInput] = useState(draft.voucherCode);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

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
    onChange({ voucherCode: result.code, voucherDiscount: computeVoucherDiscount(result, totals.shipping) });
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
    <div className="space-y-3">
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Shipping fee</span>
          <span className="font-medium text-gray-900">{fmtPHP(totals.baseFee)}</span>
        </div>
        {totals.serviceSurcharge > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Service surcharge</span>
            <span className="font-medium text-gray-900">{fmtPHP(totals.serviceSurcharge)}</span>
          </div>
        )}
        {totals.itemProtection > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Item protection</span>
            <span className="font-medium text-gray-900">{fmtPHP(totals.itemProtection)}</span>
          </div>
        )}
        {totals.discount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Voucher ({draft.voucherCode})</span>
            <span className="font-medium">−{fmtPHP(totals.discount)}</span>
          </div>
        )}
      </div>

      {draft.merchandiseCod.enabled && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-500">Merchandise COD — collected separately, not part of shipping</span>
          <span className="text-xs font-semibold text-gray-700 flex-shrink-0">{fmtPHP(totals.codAmount)}</span>
        </div>
      )}

      {/* Voucher — demo only, never a real transaction. */}
      <div>
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

      <Drawer open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Payment">
        <div className="space-y-4">
          <ShippingFeePayerSelector
            feePayer={draft.feePayer}
            onFeePayerChange={(v) => onChange({ feePayer: v })}
            firstMile={draft.firstMile}
            senderMethod={draft.senderPaymentMethod}
            onSenderMethodChange={(v) => onChange({ senderPaymentMethod: v })}
            amount={totals.total}
          />
          <Button variant="outline" className="w-full" onClick={() => setPaymentOpen(false)}>Done</Button>
        </div>
      </Drawer>

      {showFinalTotal && (
        <div className="flex justify-between border-t border-gray-100 pt-2 text-sm font-semibold text-gray-900">
          <span>Final total</span>
          <span>{fmtPHP(totals.total)}</span>
        </div>
      )}
    </div>
  );
}
