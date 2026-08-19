import { useEffect, useState } from 'react';
import { IconX, IconEdit, IconCircleCheck } from '@tabler/icons-react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { RECEPTACLE_SIZES } from '../../data/bulkTemplate';
import { computeProposedAmount } from '../../lib/journeyPricing';
import type { Transaction } from '../../services/transactionService';
import type { JourneyEditDeliveryDraft } from '../../data/journeyTransactionFixture';

interface EditDeliveryDrawerProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  onConfirm: (draft: JourneyEditDeliveryDraft) => void;
}

/**
 * Journey-only "Edit Delivery Details" drawer (P3). Saves into UX Journey
 * state only — it never calls transactionService or any booking/payment API.
 */
export function EditDeliveryDrawer({ open, onClose, transaction, onConfirm }: EditDeliveryDrawerProps) {
  const [senderAddress, setSenderAddress] = useState(transaction.sender.address);
  const [pickupDate, setPickupDate] = useState(transaction.pickupDate);
  const [itemName, setItemName] = useState(transaction.items[0]?.name ?? '');
  const [pouchSize, setPouchSize] = useState(transaction.packaging.size);
  const isCod = transaction.payment.method.toLowerCase().includes('cash on delivery');
  const [codAmount, setCodAmount] = useState(String(transaction.payment.codAmount));
  const [itemProtection, setItemProtection] = useState(transaction.fees.protectionFee > 0);
  const [confirmed, setConfirmed] = useState(false);

  // Re-seed the form only when the drawer transitions to open — NOT on every
  // `transaction` reference change while it stays open. Confirming an edit
  // updates the journey-scenario transaction (new object each time), which
  // would otherwise flip the just-shown success state back to the form.
  useEffect(() => {
    if (!open) return;
    setSenderAddress(transaction.sender.address);
    setPickupDate(transaction.pickupDate);
    setItemName(transaction.items[0]?.name ?? '');
    setPouchSize(transaction.packaging.size);
    setCodAmount(String(transaction.payment.codAmount));
    setItemProtection(transaction.fees.protectionFee > 0);
    setConfirmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const declaredValue = transaction.items[0]?.price ?? 0;
  const currentAmount = transaction.fees.shippingFee + transaction.fees.protectionFee;
  const proposedAmount = computeProposedAmount({ pouchSize, declaredValue, itemProtection });
  const amountChanged = Math.abs(proposedAmount - currentAmount) > 0.001;

  const close = () => { setConfirmed(false); onClose(); };

  const handleConfirm = () => {
    onConfirm({
      senderAddress,
      pickupDate,
      itemName,
      pouchSize,
      codAmount: isCod ? Number(codAmount) || 0 : transaction.payment.codAmount,
      itemProtection,
    });
    setConfirmed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit delivery details">
      <div className="absolute inset-0 bg-gray-900/50" onClick={close} />
      <div className="relative w-full max-w-md h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <IconEdit className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Edit delivery details</h2>
              <p className="text-xs text-gray-500">UX Journey preview — saved to this session only.</p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer" onClick={close} aria-label="Close">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {confirmed ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
              <IconCircleCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Delivery details updated</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              The revised details now show on this transaction for the rest of this UX Journey preview.
            </p>
            <Button className="mt-6" onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sender pickup address</label>
                <textarea
                  className="w-full h-20 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pickup date</label>
                <input
                  type="date"
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Item name / details</label>
                <input
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pouch / box size</label>
                <Select value={pouchSize} onChange={(e) => setPouchSize(e.target.value)}>
                  {RECEPTACLE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>

              {isCod && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">COD amount</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Item protection</label>
                <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
                  {(['Full', 'Free'] as const).map((opt) => {
                    const selected = (opt === 'Full') === itemProtection;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setItemProtection(opt === 'Full')}
                        className={`px-4 h-9 text-sm font-medium transition-colors ${
                          selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-medium text-blue-800 uppercase tracking-wide mb-2">Proposed amount</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-800">Current</span>
                  <span className={amountChanged ? 'text-blue-700 line-through' : 'text-blue-900 font-semibold'}>
                    ₱{currentAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {amountChanged && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-blue-800">Revised</span>
                    <span className="text-blue-900 font-semibold">
                      ₱{proposedAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <p className="text-xs text-blue-700 mt-2">
                  Shipping fee by pouch size + Item Protection (declared value − ₱500) × 1%, when enabled. Estimate only.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={handleConfirm}>Confirm</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
