import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  IconTruckDelivery,
  IconBuildingStore,
  IconTag,
  IconCheck,
  IconX,
  IconCreditCard,
  IconWallet,
  IconCash,
  IconChevronDown,
  IconPencil,
} from '@tabler/icons-react';
import {
  computeFee,
  MOCK_PROMO_CODES,
  POUCH_OPTIONS,
  type BookingDraft,
  type FeePayer,
  type FirstMile,
  type ItemState,
  type PaymentMethod,
} from '../../lib/basicBookingTypes';
import { BasicGlassCard } from '../../components/basic/BasicGlassCard';
import { BasicItemDetailsDrawer } from '../../components/basic/BasicItemDetailsDrawer';
import { cn } from '../../lib/utils';

function addrLine(a: NonNullable<BookingDraft['sender']>): string {
  return [a.street, a.unit, a.barangay, a.city, a.province].filter(Boolean).join(', ');
}

function fmtPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

// ── Schedule card ─────────────────────────────────────────────────────────────

function ScheduleCard({ firstMile }: { firstMile: FirstMile }) {
  const today = new Date();
  const pickupDate = today.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  const deliveryDate = new Date(today.getTime() + 3 * 86400000).toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <BasicGlassCard className="p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Schedule
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/50 p-2.5 text-center">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
            Est. {firstMile === 'pickup' ? 'Pick-up' : 'Drop-off'}
          </p>
          <p className="text-xs font-bold text-gray-800">{pickupDate}</p>
        </div>
        <div className="rounded-xl bg-white/50 p-2.5 text-center">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
            Est. Delivery
          </p>
          <p className="text-xs font-bold text-gray-800">{deliveryDate}</p>
        </div>
      </div>
    </BasicGlassCard>
  );
}

// ── Address summary card ──────────────────────────────────────────────────────

function AddressSummaryCard({
  sender,
  receiver,
  onEditSender,
  onEditReceiver,
}: {
  sender: NonNullable<BookingDraft['sender']>;
  receiver: NonNullable<BookingDraft['receiver']>;
  onEditSender: () => void;
  onEditReceiver: () => void;
}) {
  return (
    <BasicGlassCard className="p-4">
      {/* Sender */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center flex-shrink-0 mt-1">
          <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-blue-100" />
          <div className="w-0.5 h-6 bg-gray-200/80 mt-1" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
            {sender.name} · {sender.mobile}
          </p>
          <p className="text-xs text-gray-500 truncate leading-snug">{addrLine(sender)}</p>
        </div>
        <button
          onClick={onEditSender}
          className="text-[11px] font-semibold text-blue-600 flex-shrink-0 cursor-pointer hover:text-blue-800 mt-0.5"
        >
          Edit
        </button>
      </div>
      {/* Receiver */}
      <div className="flex items-start gap-3 mt-1">
        <div className="flex flex-col items-center flex-shrink-0 mt-1">
          <div className="w-3 h-3 rounded-full border-2 border-red-400 bg-red-100" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
            {receiver.name} · {receiver.mobile}
          </p>
          <p className="text-xs text-gray-500 truncate leading-snug">{addrLine(receiver)}</p>
        </div>
        <button
          onClick={onEditReceiver}
          className="text-[11px] font-semibold text-blue-600 flex-shrink-0 cursor-pointer hover:text-blue-800 mt-0.5"
        >
          Edit
        </button>
      </div>
    </BasicGlassCard>
  );
}

// ── First mile card (inline editable) ────────────────────────────────────────

function FirstMileReviewCard({ value, onChange }: { value: FirstMile; onChange: (v: FirstMile) => void }) {
  return (
    <BasicGlassCard className="p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Pick-up or Drop-off Option
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {(
          [
            { key: 'pickup' as FirstMile, label: 'Rider Pick-up', Icon: IconTruckDelivery },
            { key: 'dropoff' as FirstMile, label: 'Drop-off', Icon: IconBuildingStore },
          ] as const
        ).map(({ key, label, Icon }) => {
          const sel = value === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cn(
                'flex items-center gap-2 rounded-2xl border p-3 text-left transition-all cursor-pointer',
                sel
                  ? 'border-blue-400 bg-white/80 ring-1 ring-blue-300'
                  : 'border-white/60 bg-white/30 hover:bg-white/50',
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', sel ? 'text-blue-600' : 'text-gray-400')} />
              <p className={cn('text-sm font-semibold leading-snug', sel ? 'text-blue-900' : 'text-gray-800')}>
                {label}
              </p>
            </button>
          );
        })}
      </div>
    </BasicGlassCard>
  );
}

// ── Item summary card ─────────────────────────────────────────────────────────

function ItemSummaryCard({
  itemState,
  protectionFee,
  onEdit,
}: {
  itemState: ItemState;
  protectionFee: number;
  onEdit: () => void;
}) {
  const pouch = POUCH_OPTIONS.find((p) => p.key === itemState.pouchSize)!;
  return (
    <BasicGlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Item Details</p>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 cursor-pointer hover:text-blue-800"
        >
          <IconPencil className="w-3 h-3" />
          EDIT
        </button>
      </div>

      {/* Item name + COD */}
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-sm font-semibold text-gray-900 flex-1 truncate">{itemState.itemName}</p>
        {itemState.cod && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
            <IconCash className="w-3 h-3" />
            {fmtPHP(Number(itemState.codAmount) || 0)}
          </span>
        )}
      </div>

      {/* Pouch */}
      <p className="text-xs text-gray-500">
        {pouch.label} · Max weight {pouch.maxWt}
      </p>

      {/* Protection */}
      <div className="mt-2.5 rounded-xl bg-white/50 px-3 py-2">
        <p className="text-[10px] text-gray-600 leading-snug">
          {itemState.itemProtection === 'full' && protectionFee > 0
            ? `Full item protection — up to ${fmtPHP(Number(itemState.codAmount) || 0)} (+${fmtPHP(protectionFee)} fee)`
            : 'Item protection — up to ₱500 for FREE'}
        </p>
      </div>
    </BasicGlassCard>
  );
}

// ── Receiver payable section ──────────────────────────────────────────────────

function ReceiverPayable({
  cod,
  codAmount,
  shippingFee,
  protectionFee,
  feePayer,
}: {
  cod: boolean;
  codAmount: string;
  shippingFee: number;
  protectionFee: number;
  feePayer: FeePayer;
}) {
  const receiverPaysShipping = feePayer === 'receiver';
  const codAmt = cod ? Number(codAmount) || 0 : 0;
  const receiverShipping = receiverPaysShipping ? shippingFee : 0;
  const receiverProtection = receiverPaysShipping ? protectionFee : 0;
  const receiverTotal = codAmt + receiverShipping + receiverProtection;

  if (!cod && !receiverPaysShipping) return null;

  return (
    <BasicGlassCard className="p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Fees and Breakdown
      </p>
      <div className="rounded-xl bg-white/50 p-3 space-y-1.5">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
          Collected from receiver upon delivery
        </p>
        {cod && (
          <div className="flex justify-between text-xs text-gray-700">
            <span>Item Value (COD)</span>
            <span className="font-semibold">{fmtPHP(codAmt)}</span>
          </div>
        )}
        {receiverPaysShipping && (
          <div className="flex justify-between text-xs text-gray-700">
            <span>Shipping Fee</span>
            <span className="font-semibold">{fmtPHP(receiverShipping)}</span>
          </div>
        )}
        {receiverProtection > 0 && (
          <div className="flex justify-between text-xs text-gray-700">
            <span>Item Protection Fee</span>
            <span className="font-semibold">{fmtPHP(receiverProtection)}</span>
          </div>
        )}
        {(receiverPaysShipping || cod) && (
          <>
            <div className="border-t border-gray-200 my-1" />
            <div className="flex justify-between text-sm font-bold text-gray-900">
              <span>Total Amount</span>
              <span>{fmtPHP(receiverTotal)}</span>
            </div>
          </>
        )}
      </div>
    </BasicGlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type NavState = { draft?: BookingDraft } | null;

export function BasicBookingScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const prevDraft = (location.state as NavState)?.draft;

  if (!prevDraft?.sender || !prevDraft?.receiver || !prevDraft?.itemName) {
    navigate('/basic/deliver', { replace: true });
    return null;
  }

  const [firstMile, setFirstMile] = useState<FirstMile>(prevDraft.firstMile ?? 'pickup');
  const [itemState, setItemState] = useState<ItemState>({
    itemName: prevDraft.itemName,
    pouchSize: prevDraft.pouchSize ?? 'small',
    cod: prevDraft.cod ?? false,
    codAmount: prevDraft.codAmount ?? '',
    itemProtection: prevDraft.itemProtection ?? 'free',
  });
  const [feePayer, setFeePayer] = useState<FeePayer>(prevDraft.feePayer ?? 'sender');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prevDraft.paymentMethod ?? 'gcash');
  const [promoInput, setPromoInput] = useState(prevDraft.promoCode ?? '');
  const [promoCode, setPromoCode] = useState(prevDraft.promoCode ?? '');
  const [promoDiscount, setPromoDiscount] = useState(prevDraft.promoDiscount ?? 0);
  const [promoStatus, setPromoStatus] = useState<'idle' | 'applied' | 'invalid'>(
    prevDraft.promoCode ? 'applied' : 'idle',
  );
  const [promoOpen, setPromoOpen] = useState(!!prevDraft.promoCode);
  const [paymentExpanded, setPaymentExpanded] = useState(false);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [itemErrors, setItemErrors] = useState<Record<string, boolean>>({});

  const fees = computeFee({
    pouchSize: itemState.pouchSize,
    cod: itemState.cod,
    codAmount: itemState.codAmount,
    itemProtection: itemState.itemProtection,
    promoDiscount,
  });

  const senderTotal = feePayer === 'sender' ? fees.total : 0;

  const currentDraft = (): BookingDraft => ({
    ...prevDraft,
    firstMile,
    ...itemState,
    feePayer,
    paymentMethod,
    promoCode,
    promoDiscount,
  });

  const handleEditSender = () =>
    navigate('/basic/deliver', {
      state: { draft: currentDraft(), editTarget: 'sender', editReturn: true },
    });

  const handleEditReceiver = () =>
    navigate('/basic/deliver/receiver', {
      state: { draft: currentDraft(), editReturn: true },
    });

  const handleSaveItemFromDrawer = () => {
    const errs: Record<string, boolean> = {};
    if (!itemState.itemName.trim()) errs.itemName = true;
    if (itemState.cod && !itemState.codAmount) errs.codAmount = true;
    if (Object.keys(errs).length) { setItemErrors(errs); return; }
    setItemErrors({});
    setItemDrawerOpen(false);
  };

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (MOCK_PROMO_CODES[code] !== undefined) {
      setPromoCode(code);
      setPromoDiscount(MOCK_PROMO_CODES[code]);
      setPromoStatus('applied');
    } else {
      setPromoStatus('invalid');
    }
  };

  const removePromo = () => {
    setPromoCode('');
    setPromoInput('');
    setPromoDiscount(0);
    setPromoStatus('idle');
    setPromoOpen(false);
  };

  const handleBook = () => {
    const errs: Record<string, boolean> = {};
    if (!itemState.itemName.trim()) errs.itemName = true;
    if (itemState.cod && !itemState.codAmount) errs.codAmount = true;
    if (Object.keys(errs).length) {
      setItemErrors(errs);
      setItemDrawerOpen(true);
      return;
    }
    navigate('/basic/deliver/success', { state: { draft: currentDraft() } });
  };

  return (
    <>
      {/* Scrollable content — extra bottom padding clears the fixed bottom bar */}
      <div className="px-4 pt-4 pb-[200px] space-y-3">
        {/* 1. Schedule */}
        <ScheduleCard firstMile={firstMile} />

        {/* 2. Addresses */}
        <AddressSummaryCard
          sender={prevDraft.sender!}
          receiver={prevDraft.receiver!}
          onEditSender={handleEditSender}
          onEditReceiver={handleEditReceiver}
        />

        {/* 3. First mile (inline editable) */}
        <FirstMileReviewCard value={firstMile} onChange={setFirstMile} />

        {/* 4. Item details summary */}
        <ItemSummaryCard
          itemState={itemState}
          protectionFee={fees.protection}
          onEdit={() => setItemDrawerOpen(true)}
        />

        {/* 5. Receiver payable breakdown */}
        <ReceiverPayable
          cod={itemState.cod}
          codAmount={itemState.codAmount}
          shippingFee={fees.shipping}
          protectionFee={fees.protection}
          feePayer={feePayer}
        />
      </div>

      {/* ── Fixed bottom payment + CTA ── */}
      <div
        className="fixed z-30 w-full max-w-[var(--basic-shell-max,none)]"
        style={{
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <div
          className="mx-3 mb-3 rounded-[26px] overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
            border: '1px solid rgba(255,255,255,0.8)',
            boxShadow: '0 -8px 32px rgba(40,70,120,0.14)',
          }}
        >
          {/* Payment Details */}
          <div className="px-4 pt-4">
            <button
              onClick={() => setPaymentExpanded((v) => !v)}
              className="w-full flex items-center justify-between cursor-pointer mb-2"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Payment Details
              </p>
              <IconChevronDown
                className={cn('w-4 h-4 text-gray-400 transition-transform', paymentExpanded && 'rotate-180')}
              />
            </button>

            {/* Compact payment summary */}
            {!paymentExpanded && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-1">
                  {feePayer === 'sender' ? (
                    paymentMethod === 'gcash' ? (
                      <IconCreditCard className="w-4 h-4 text-blue-500" />
                    ) : (
                      <IconWallet className="w-4 h-4 text-blue-500" />
                    )
                  ) : (
                    <IconCash className="w-4 h-4 text-gray-500" />
                  )}
                  <p className="text-xs font-semibold text-gray-700">
                    {feePayer === 'sender'
                      ? `${paymentMethod === 'gcash' ? 'GCash' : 'GGX Wallet'} — Paid by sender`
                      : 'Collected at delivery'}
                  </p>
                </div>
                {!promoOpen && (
                  <button
                    onClick={() => setPromoOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 cursor-pointer flex-shrink-0"
                  >
                    <IconTag className="w-3 h-3" />
                    Promo
                  </button>
                )}
              </div>
            )}

            {/* Expanded payment options */}
            {paymentExpanded && (
              <div className="space-y-3 mb-3">
                {/* Fee payer */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                    Who pays shipping fee?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'sender' as FeePayer, label: 'Sender pays', sub: 'Paid upfront' },
                        { key: 'receiver' as FeePayer, label: 'Receiver pays', sub: 'At delivery' },
                      ] as const
                    ).map(({ key, label, sub }) => {
                      const sel = feePayer === key;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setFeePayer(key);
                            if (key === 'receiver') setPaymentMethod('gcash');
                          }}
                          className={cn(
                            'flex flex-col items-start rounded-xl border p-2.5 cursor-pointer transition-all text-left',
                            sel
                              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                              : 'border-gray-200 bg-white hover:border-blue-200',
                          )}
                        >
                          <p className={cn('text-xs font-semibold', sel ? 'text-blue-900' : 'text-gray-800')}>
                            {label}
                          </p>
                          <p className="text-[9px] text-gray-500">{sub}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment method — sender only */}
                {feePayer === 'sender' && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                      Payment method
                    </p>
                    <div className="flex gap-2">
                      {(
                        [
                          { key: 'gcash' as PaymentMethod, label: 'GCash', Icon: IconCreditCard },
                          { key: 'wallet' as PaymentMethod, label: 'GGX Wallet', Icon: IconWallet },
                        ] as const
                      ).map(({ key, label, Icon }) => {
                        const sel = paymentMethod === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setPaymentMethod(key)}
                            className={cn(
                              'flex-1 flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all',
                              sel
                                ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                                : 'border-gray-200 bg-white hover:border-blue-200',
                            )}
                          >
                            <Icon className={cn('w-4 h-4 flex-shrink-0', sel ? 'text-blue-600' : 'text-gray-400')} />
                            <span className={cn('text-xs font-semibold', sel ? 'text-blue-900' : 'text-gray-700')}>
                              {label}
                            </span>
                            {sel && <IconCheck className="w-3.5 h-3.5 text-blue-500 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Receiver pays note */}
                {feePayer === 'receiver' && (
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <IconCash className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <p className="text-xs text-gray-600 leading-snug">
                      Shipping fee collected by our rider at delivery.
                    </p>
                  </div>
                )}

                {/* Promo code */}
                <div>
                  {!promoOpen ? (
                    <button
                      onClick={() => setPromoOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-violet-600 cursor-pointer"
                    >
                      <IconTag className="w-3.5 h-3.5" />
                      Got promos and discounts?
                    </button>
                  ) : promoStatus === 'applied' ? (
                    <div className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2">
                      <IconCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-green-800">{promoCode}</p>
                        <p className="text-[9px] text-green-600">₱{promoDiscount} off applied</p>
                      </div>
                      <button onClick={removePromo} className="p-1 rounded-full hover:bg-green-200 cursor-pointer">
                        <IconX className="w-3 h-3 text-green-700" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-2">
                        <input
                          className={cn(
                            'flex-1 rounded-xl border bg-white px-3 py-2 text-sm uppercase placeholder:normal-case placeholder-gray-300 outline-none focus:ring-2 focus:ring-blue-400',
                            promoStatus === 'invalid' ? 'border-red-400' : 'border-gray-200',
                          )}
                          placeholder="Enter promo code"
                          value={promoInput}
                          onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoStatus('idle'); }}
                          onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                        />
                        <button
                          onClick={applyPromo}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 cursor-pointer hover:bg-blue-50"
                        >
                          Apply
                        </button>
                      </div>
                      {promoStatus === 'invalid' && (
                        <p className="mt-1 text-[10px] text-red-500">Invalid code. Try SULIT10, GOGO20, or FIRST15.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Promo applied chip (compact mode) */}
            {!paymentExpanded && promoStatus === 'applied' && (
              <div className="flex items-center gap-1.5 mb-2">
                <IconCheck className="w-3 h-3 text-green-600" />
                <span className="text-[10px] font-semibold text-green-700">{promoCode} — ₱{promoDiscount} off</span>
                <button onClick={removePromo} className="ml-auto cursor-pointer">
                  <IconX className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            )}

            {/* Promo input in compact mode */}
            {!paymentExpanded && promoOpen && promoStatus !== 'applied' && (
              <div className="mb-2">
                <div className="flex gap-2">
                  <input
                    className={cn(
                      'flex-1 rounded-xl border bg-white px-3 py-2 text-sm uppercase placeholder:normal-case placeholder-gray-300 outline-none focus:ring-2 focus:ring-blue-400',
                      promoStatus === 'invalid' ? 'border-red-400' : 'border-gray-200',
                    )}
                    placeholder="Promo code"
                    value={promoInput}
                    onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoStatus('idle'); }}
                    onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                  />
                  <button
                    onClick={applyPromo}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 cursor-pointer hover:bg-blue-50"
                  >
                    Apply
                  </button>
                </div>
                {promoStatus === 'invalid' && (
                  <p className="mt-0.5 text-[10px] text-red-500">Invalid code.</p>
                )}
              </div>
            )}
          </div>

          {/* Total + CTA */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 mt-1"
            style={{
              background: 'rgba(30,143,214,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-blue-100 uppercase tracking-widest leading-none">
                {feePayer === 'sender' ? 'Amount to pay' : 'Upfront cost'}
              </p>
              <p className="text-2xl font-extrabold text-white leading-none mt-0.5">
                {feePayer === 'sender' ? fmtPHP(senderTotal) : '₱0'}
              </p>
              {feePayer === 'receiver' && (
                <p className="text-[9px] text-blue-200 leading-snug">Shipping collected at delivery</p>
              )}
              {fees.discount > 0 && feePayer === 'sender' && (
                <p className="text-[9px] text-blue-200">−₱{fees.discount} promo</p>
              )}
            </div>
            <button
              onClick={handleBook}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-blue-700 cursor-pointer hover:bg-blue-50 transition-colors active:scale-95 transition-transform flex-shrink-0"
            >
              Confirm Booking
            </button>
          </div>
        </div>
      </div>

      {/* Item details drawer */}
      <BasicItemDetailsDrawer
        open={itemDrawerOpen}
        state={itemState}
        onChange={(patch) => setItemState((s) => ({ ...s, ...patch }))}
        errors={itemErrors}
        onSave={handleSaveItemFromDrawer}
        onClose={() => setItemDrawerOpen(false)}
        saveLabel="Update Item Details"
      />

    </>
  );
}
