import { useRef, useState } from 'react';
import { IconCash, IconWallet, IconCreditCard, IconBuildingBank, IconReceipt2 } from '@tabler/icons-react';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Separator } from './ui/Separator';

type Tab = 'cash' | 'ewallet' | 'card' | 'banking';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'cash',    label: 'Cash',           icon: <IconCash className="w-4 h-4" /> },
  { id: 'ewallet', label: 'E-wallets',      icon: <IconWallet className="w-4 h-4" /> },
  { id: 'card',    label: 'Card',           icon: <IconCreditCard className="w-4 h-4" /> },
  { id: 'banking', label: 'Online banking', icon: <IconBuildingBank className="w-4 h-4" /> },
];

const BANKS = ['BDO', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'PNB', 'Security Bank'];

// Brand logo slots. Drop a real asset path into `src` to swap the fallback for
// an image later — no other change needed. Fallback is a colored initial box.
const BRAND_LOGOS: Record<string, { src?: string; bg: string; short: string }> = {
  GCash:      { bg: 'bg-blue-600',    short: 'G'  },
  Maya:       { bg: 'bg-green-600',   short: 'M'  },
  GrabPay:    { bg: 'bg-emerald-600', short: 'Gp' },
  'coins.ph': { bg: 'bg-yellow-500',  short: 'c'  },
  Visa:       { bg: 'bg-blue-700',    short: 'V'  },
  Mastercard: { bg: 'bg-orange-500',  short: 'MC' },
};

function BrandLogo({ name, className = 'w-6 h-6' }: { name: string; className?: string }) {
  const logo = BRAND_LOGOS[name];
  if (logo?.src) {
    return <img src={logo.src} alt={name} className={`${className} rounded object-contain`} />;
  }
  return (
    <span className={`${className} ${logo?.bg ?? 'bg-gray-400'} rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
      {logo?.short ?? name.charAt(0)}
    </span>
  );
}

const WALLETS = [
  { name: 'GCash',      available: true  },
  { name: 'Maya',       available: false },
  { name: 'GrabPay',    available: false },
  { name: 'coins.ph',   available: false },
];

// ---------------------------------------------------------------------------
// Selected payment method shape — exported so callers can type the callback.
// ---------------------------------------------------------------------------

export type SelectedPaymentMethod =
  | { type: 'billing' }
  | { type: 'cash';    cashOption: 'pickup' | 'deduct' }
  | { type: 'ewallet'; wallet: string }
  | { type: 'card' }
  | { type: 'banking'; bank: string };

// ---------------------------------------------------------------------------
// NormalPaymentCard — the tabbed card for cash / e-wallet / card / banking.
// ---------------------------------------------------------------------------

interface NormalPaymentCardProps {
  disabled?: boolean;
  /** Called whenever the user changes their payment selection. */
  onChange?: (method: SelectedPaymentMethod) => void;
  /**
   * When true, this card is nested inside a parent card that already
   * provides the outer border/rounding (the unified "Other payment options"
   * card) — skip its own outer border and corner rounding.
   */
  embedded?: boolean;
}

function NormalPaymentCard({ disabled = false, onChange, embedded = false }: NormalPaymentCardProps) {
  const [active,     setActive]     = useState<Tab>('cash');
  const [cashOption, setCashOption] = useState<'pickup' | 'deduct'>('pickup');
  const [wallet,     setWallet]     = useState('GCash');
  const [bank,       setBank]       = useState('');
  const [card,       setCard]       = useState({ name: '', number: '', expiry: '', cvv: '' });

  // Keep a stable ref so callbacks inside handlers always have the latest onChange.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emit = (method: SelectedPaymentMethod) => onChangeRef.current?.(method);

  const handleTabChange = (tab: Tab) => {
    if (disabled) return;
    setActive(tab);
    // Emit the current selection for the newly active tab.
    if (tab === 'cash')    emit({ type: 'cash',    cashOption });
    if (tab === 'ewallet') emit({ type: 'ewallet', wallet });
    if (tab === 'card')    emit({ type: 'card' });
    if (tab === 'banking') emit({ type: 'banking', bank });
  };

  const handleCashOption = (opt: 'pickup' | 'deduct') => {
    if (disabled) return;
    setCashOption(opt);
    emit({ type: 'cash', cashOption: opt });
  };

  const handleWallet = (name: string) => {
    if (disabled) return;
    setWallet(name);
    emit({ type: 'ewallet', wallet: name });
  };

  const handleBank = (b: string) => {
    if (disabled) return;
    setBank(b);
    emit({ type: 'banking', bank: b });
  };

  return (
    <div
      aria-disabled={disabled}
      className={`${embedded ? '' : 'rounded-lg border border-gray-200'} ${disabled ? 'opacity-60 pointer-events-none select-none' : ''}`}
    >
      {/* Tab row */}
      <div className={`flex bg-gray-50 border-b border-gray-200 overflow-x-auto ${embedded ? '' : 'rounded-t-lg overflow-hidden'}`}>
        {TABS.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => handleTabChange(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                selected ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {active === 'cash' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              { id: 'pickup', title: 'Pay upon pick-up',       help: 'Hand cash to the rider at pick-up.' },
              { id: 'deduct', title: 'Deduct from order total', help: 'Fees deducted from your COD collections.' },
            ] as const).map((opt) => {
              const selected = cashOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleCashOption(opt.id)}
                  className={`h-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                    selected ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${selected ? 'border-blue-600' : 'border-gray-300'}`}>
                    {selected && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{opt.title}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{opt.help}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {active === 'ewallet' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {WALLETS.map((w) => {
              const selected = w.available && wallet === w.name;
              return (
                <button
                  key={w.name}
                  type="button"
                  disabled={disabled || !w.available}
                  onClick={() => { if (w.available) handleWallet(w.name); }}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-center transition-colors ${
                    selected ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200'
                  } ${w.available ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <BrandLogo name={w.name} className="w-7 h-7" />
                  <span className="text-xs font-medium text-gray-900">{w.name}</span>
                  {w.available ? (
                    <Badge variant="success" className="text-[9px]">Available</Badge>
                  ) : (
                    <Badge variant="default" className="text-[9px]">Coming soon</Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {active === 'card' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BrandLogo name="Visa"       className="w-8 h-5" />
              <BrandLogo name="Mastercard" className="w-8 h-5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cardholder name</label>
              <Input disabled={disabled} value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Card number</label>
              <Input disabled={disabled} value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="1234 5678 9012 3456" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expiration date</label>
                <Input disabled={disabled} value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} placeholder="MM/YY" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CVV</label>
                <Input disabled={disabled} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} placeholder="123" />
              </div>
            </div>
          </div>
        )}

        {active === 'banking' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bank</label>
            <Select
              disabled={disabled}
              value={bank}
              onChange={(e) => handleBank(e.target.value)}
            >
              <option value="">Select preferred bank</option>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface PaymentMethodTabsProps {
  /**
   * Driven by the selected account/subaccount contract. When true, "Pay via
   * billing" is the primary/default option; the normal tabs are secondary and
   * only become usable after the user explicitly selects "Other payment options".
   */
  billingAvailable?: boolean;
  /** Called whenever the effective payment method selection changes. */
  onPaymentMethodChange?: (method: SelectedPaymentMethod) => void;
}

export function PaymentMethodTabs({ billingAvailable = false, onPaymentMethodChange }: PaymentMethodTabsProps) {
  const [payVia, setPayVia] = useState<'billing' | 'other'>(billingAvailable ? 'billing' : 'other');

  // Track NormalPaymentCard's last emitted method so we can re-emit it when
  // the user switches from billing → other without touching the card.
  const normalMethodRef = useRef<SelectedPaymentMethod>({ type: 'cash', cashOption: 'pickup' });

  const handleBillingClick = () => {
    setPayVia('billing');
    onPaymentMethodChange?.({ type: 'billing' });
  };

  const handleOtherClick = () => {
    setPayVia('other');
    // Emit the card's current selection (defaults to cash/pickup on first switch).
    onPaymentMethodChange?.(normalMethodRef.current);
  };

  const handleNormalChange = (method: SelectedPaymentMethod) => {
    normalMethodRef.current = method;
    onPaymentMethodChange?.(method);
  };

  // Non-billing accounts: only the normal card, fully enabled.
  if (!billingAvailable) {
    return <NormalPaymentCard onChange={onPaymentMethodChange} />;
  }

  const otherSelected = payVia === 'other';

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleBillingClick}
        className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
          payVia === 'billing' ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200 hover:bg-gray-50'
        }`}
      >
        <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${payVia === 'billing' ? 'border-blue-600' : 'border-gray-300'}`}>
          {payVia === 'billing' && <span className="w-2 h-2 rounded-full bg-blue-600" />}
        </span>
        <IconReceipt2 className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <span className="flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">Pay via billing</span>
            <Badge variant="info" className="text-xs">Default</Badge>
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">You&apos;ll receive an invoice after the service.</span>
        </span>
      </button>

      {/* "Other payment options" — one unified bordered card: header, tabs, and
          active tab content share a single outer border with internal dividers. */}
      <div
        className={`rounded-lg border overflow-hidden transition-colors ${
          otherSelected ? 'border-blue-500' : 'border-gray-200'
        }`}
      >
        <button
          type="button"
          onClick={handleOtherClick}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
            otherSelected ? 'bg-blue-50/40' : 'hover:bg-gray-50'
          }`}
        >
          <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${otherSelected ? 'border-blue-600' : 'border-gray-300'}`}>
            {otherSelected && <span className="w-2 h-2 rounded-full bg-blue-600" />}
          </span>
          <span className="flex-1">
            <span className="text-sm font-medium text-gray-900">Other payment options</span>
            <span className="block text-xs text-gray-500 mt-0.5">Cash, e-wallets, card, or online banking.</span>
          </span>
        </button>

        <Separator />

        {/* Tabs are disabled (visually + functionally) until "Other payment options" is selected. */}
        <NormalPaymentCard
          embedded
          disabled={!otherSelected}
          onChange={otherSelected ? handleNormalChange : undefined}
        />
      </div>
    </div>
  );
}
