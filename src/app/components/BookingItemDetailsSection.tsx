/**
 * Item Details step for the GGX Basic single-booking flow: description,
 * pouch size, merchandise Cash on Delivery, and declared value (drives item
 * protection only). Deliberately independent of shipping-fee-payer state —
 * see `ShippingFeePayerSelector.tsx`'s header comment.
 *
 * Pouch-size cards use the official GGX parcel illustrations (loaded
 * directly from gogoxpress.com — see `basicPouchSizes.ts`'s `iconUrl`),
 * not real product photography of the user's actual item.
 *
 * "Protect full COD amount" is a one-time copy of the current COD amount
 * into declaredValue, fired only on click — it does not bind the two fields
 * together. Changing either field afterward never affects the other; the
 * fields stay independent exactly as before this button existed.
 */
import { useEffect, useRef, useState } from 'react';
import { IconShieldCheck, IconShieldPlus } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';
import { Button } from './ui/Button';
import { BASIC_POUCH_SIZES, type BasicPouchSizeKey } from '../lib/basicPouchSizes';
import { isFreeProtectionSelected } from '../lib/basicItemProtection';
import { cn } from '../lib/utils';

export interface BookingItemDetailsSectionProps {
  itemDescription: string;
  onItemDescriptionChange: (v: string) => void;
  pouchSize: BasicPouchSizeKey;
  onPouchSizeChange: (v: BasicPouchSizeKey) => void;
  declaredValue: string;
  onDeclaredValueChange: (v: string) => void;
  codEnabled: boolean;
  codAmount: string;
  onCodChange: (enabled: boolean, amount: string) => void;
}

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export function BookingItemDetailsSection({
  itemDescription,
  onItemDescriptionChange,
  pouchSize,
  onPouchSizeChange,
  declaredValue,
  onDeclaredValueChange,
  codEnabled,
  codAmount,
  onCodChange,
}: BookingItemDetailsSectionProps) {
  const [protectionExpanded, setProtectionExpanded] = useState(!isFreeProtectionSelected(declaredValue));
  const declaredValueInputRef = useRef<HTMLInputElement>(null);

  // This section mounts twice simultaneously (desktop + mobile dual-tree —
  // same pattern as `BookingAddressSection.tsx`'s header comment), each with
  // its own local `protectionExpanded`. If a sibling instance pushes
  // declaredValue above ₱500 (e.g. via "Protect full COD amount"), this
  // instance's own state would otherwise stay on Free Protection while the
  // shared draft is actually being charged the fee — silently contradicting
  // what the UI claims. Only forces the Increase view open when the value
  // genuinely requires it; never forces a collapse (which would fight a
  // user mid-typing a small value while Increase is deliberately selected).
  useEffect(() => {
    if (protectionExpanded) return;
    if (!isFreeProtectionSelected(declaredValue)) setProtectionExpanded(true);
  }, [declaredValue, protectionExpanded]);

  const handleIncreaseProtection = () => {
    setProtectionExpanded(true);
    declaredValueInputRef.current?.focus();
  };

  const handleSelectFreeProtection = () => {
    // Declining the paid tier — a >500 value left in place would silently
    // keep charging the fee while the UI claims "free". A value already
    // <=500 (including empty) is left untouched.
    if (!isFreeProtectionSelected(declaredValue)) {
      onDeclaredValueChange('');
    }
    setProtectionExpanded(false);
  };

  const handleProtectFullCod = () => {
    // One-time copy — fires once, on click. No subscription/binding is
    // created, so a later edit to codAmount will never touch declaredValue.
    onDeclaredValueChange(codAmount);
    setProtectionExpanded(true);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Item description</label>
          <Input value={itemDescription} onChange={(e) => onItemDescriptionChange(e.target.value)} placeholder="e.g. Clothing" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Pouch / box size</label>
          <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
            {BASIC_POUCH_SIZES.map((size) => {
              const selected = pouchSize === size.key;
              return (
                <button
                  key={size.key}
                  type="button"
                  onClick={() => onPouchSizeChange(size.key)}
                  className={cn(
                    'flex-shrink-0 w-32 snap-start rounded-lg border p-2.5 text-left transition-colors',
                    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <div className="mb-1.5 flex h-10 w-10 items-center justify-center rounded-md bg-gray-50">
                    <img src={size.iconUrl} alt={size.label} className="h-10 w-10 object-contain" />
                  </div>
                  <p className={cn('text-sm font-semibold', selected ? 'text-blue-900' : 'text-gray-900')}>{size.label}</p>
                  <p className="text-xs text-gray-500">{size.dims}</p>
                  <p className="text-xs text-gray-500">up to {size.maxWeight}</p>
                  <p className={cn('text-xs font-semibold mt-0.5', selected ? 'text-blue-700' : 'text-gray-700')}>{fmtPHP(size.price)}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-gray-900">Collect Cash on Delivery (merchandise)</p>
            <p className="text-xs text-gray-500">This is separate from who pays the shipping fee.</p>
          </div>
          <Switch checked={codEnabled} onCheckedChange={(checked) => onCodChange(checked, codAmount)} />
        </div>
        {codEnabled && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to collect from receiver</label>
            <Input type="number" min={0} value={codAmount} onChange={(e) => onCodChange(true, e.target.value)} placeholder="0.00" />
          </div>
        )}

        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <p className="text-sm font-medium text-gray-900">Item protection</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSelectFreeProtection}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                !protectionExpanded ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <IconShieldCheck className={cn('w-4 h-4 flex-shrink-0 mt-0.5', !protectionExpanded ? 'text-blue-600' : 'text-gray-400')} />
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', !protectionExpanded ? 'text-blue-900' : 'text-gray-800')}>Free Protection</span>
                <span className="block text-xs text-gray-500">Up to ₱500 coverage</span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleIncreaseProtection}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                protectionExpanded ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <IconShieldPlus className={cn('w-4 h-4 flex-shrink-0 mt-0.5', protectionExpanded ? 'text-blue-600' : 'text-gray-400')} />
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', protectionExpanded ? 'text-blue-900' : 'text-gray-800')}>Increase Protection</span>
                <span className="block text-xs text-gray-500">Protect a higher declared value</span>
              </span>
            </button>
          </div>

          {protectionExpanded && (
            <div className="space-y-1.5 pt-1">
              <Input
                ref={declaredValueInputRef}
                type="number"
                min={0}
                value={declaredValue}
                onChange={(e) => onDeclaredValueChange(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500">
                Items valued up to ₱500 are protected for free. A small fee applies above that — see the fee breakdown.
              </p>
            </div>
          )}

          {codEnabled && Number(codAmount) > 0 && (
            <Button variant="outline" size="sm" onClick={handleProtectFullCod}>
              Protect full COD amount
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
