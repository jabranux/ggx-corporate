/**
 * Item Details step for the GGX Basic single-booking flow: description,
 * pouch size, merchandise Cash on Delivery, and item protection.
 *
 * Pouch-size cards use the official GGX parcel illustrations (loaded
 * directly from gogoxpress.com — see `basicPouchSizes.ts`'s `iconUrl`),
 * not real product photography of the user's actual item.
 *
 * Item protection always offers two explicit, user-chosen tiers (Free vs
 * Increase item protection) — the covered value automatically follows the
 * merchandise COD amount when COD is enabled, or the declared item value
 * when it isn't (see `basicItemProtection.ts`'s `getProtectionCoveredValue`),
 * but the TIER itself is never inferred from that value. A high covered
 * value never silently switches the selection away from Free — the user
 * must tap "Increase item protection" themselves. The declared item value
 * field only renders while that tier is selected (and COD is off) — Free
 * never needs it (flat ₱500 coverage), so showing it there would just be a
 * dead, confusing input.
 */
import { useState } from 'react';
import { IconShieldCheck, IconShieldPlus, IconPackage, IconCash, IconCircleCheckFilled, IconInfoCircle } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Alert } from './ui/Alert';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';
import { BASIC_POUCH_SIZES, type BasicPouchSizeKey } from '../lib/basicPouchSizes';
import { computeItemProtectionFee } from '../lib/bookingFees';
import { getProtectionCoveredValue } from '../lib/basicItemProtection';
import type { ItemProtectionTier, FirstMile } from '../lib/basicBookingDraft';
import { cn } from '../lib/utils';

export interface BookingItemDetailsSectionProps {
  /** Gates the packaging-instructions note below — a rider only brings a pouch/waybill when there's a rider pickup to bring it on. */
  firstMile: FirstMile;
  itemDescription: string;
  onItemDescriptionChange: (v: string) => void;
  pouchSize: BasicPouchSizeKey;
  onPouchSizeChange: (v: BasicPouchSizeKey) => void;
  declaredValue: string;
  onDeclaredValueChange: (v: string) => void;
  codEnabled: boolean;
  codAmount: string;
  onCodChange: (enabled: boolean, amount: string) => void;
  itemProtectionTier: ItemProtectionTier;
  onItemProtectionTierChange: (v: ItemProtectionTier) => void;
}

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export function BookingItemDetailsSection({
  firstMile,
  itemDescription,
  onItemDescriptionChange,
  pouchSize,
  onPouchSizeChange,
  declaredValue,
  onDeclaredValueChange,
  codEnabled,
  codAmount,
  onCodChange,
  itemProtectionTier,
  onItemProtectionTierChange,
}: BookingItemDetailsSectionProps) {
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const descriptionInvalid = descriptionTouched && !itemDescription.trim();

  const codAmountNum = Number(codAmount);
  const codInvalid = codEnabled && (codAmount.trim() === '' || !Number.isFinite(codAmountNum) || codAmountNum < 0);

  const declaredValueNum = Number(declaredValue);
  const declaredValueInvalid = !codEnabled && declaredValue.trim() !== '' && (!Number.isFinite(declaredValueNum) || declaredValueNum < 0);

  const coveredValue = getProtectionCoveredValue({ merchandiseCod: { enabled: codEnabled, amount: codAmount }, declaredValue });
  const protectionFee = computeItemProtectionFee(coveredValue);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Item description</label>
          <Input
            value={itemDescription}
            onChange={(e) => onItemDescriptionChange(e.target.value)}
            onBlur={() => setDescriptionTouched(true)}
            placeholder="e.g. Clothing"
            className={descriptionInvalid ? 'border-red-500' : undefined}
            aria-invalid={descriptionInvalid}
          />
          {descriptionInvalid && <p className="mt-1 text-xs text-red-600">Item description is required.</p>}
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
                  aria-pressed={selected}
                  onClick={() => onPouchSizeChange(size.key)}
                  className={cn(
                    'relative flex-shrink-0 w-32 snap-start rounded-lg border-2 p-2.5 text-left transition-colors',
                    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  {selected && (
                    <IconCircleCheckFilled className="absolute right-1.5 top-1.5 w-4 h-4 text-blue-600" aria-hidden="true" />
                  )}
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
          {/* Packaging-instructions note only applies when a rider is actually involved in pickup. */}
          {firstMile === 'pickup' && (
            <Alert variant="info" icon={<IconInfoCircle className="w-4 h-4" />} className="mt-2">
              Our rider will bring a pouch and a printed waybill when picking up your parcel — no need to print or pack anything yourself.
            </Alert>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div className="flex min-w-0 items-start gap-2.5 pr-3">
            <IconCash className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Collect Cash on Delivery (merchandise)</p>
              <p className="text-xs text-gray-500">Our rider will collect payment from the recipient upon delivery.</p>
              <p className="text-xs text-gray-500">This is separate from who pays the shipping fee.</p>
            </div>
          </div>
          <Switch checked={codEnabled} onCheckedChange={(checked) => onCodChange(checked, codAmount)} />
        </div>
        {codEnabled && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to collect from receiver</label>
            <Input
              type="number"
              min={0}
              value={codAmount}
              onChange={(e) => onCodChange(true, e.target.value)}
              placeholder="0.00"
              className={codInvalid ? 'border-red-500' : undefined}
              aria-invalid={codInvalid}
            />
            {codInvalid && <p className="mt-1 text-xs text-red-600">Enter a valid Cash on Delivery amount (0 or greater).</p>}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <IconShieldCheck className="w-4 h-4 text-gray-400" />
            Item protection
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={itemProtectionTier === 'free'}
              onClick={() => onItemProtectionTierChange('free')}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                itemProtectionTier === 'free' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <IconShieldCheck className={cn('w-4 h-4 flex-shrink-0 mt-0.5', itemProtectionTier === 'free' ? 'text-blue-600' : 'text-gray-400')} />
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', itemProtectionTier === 'free' ? 'text-blue-900' : 'text-gray-800')}>Free</span>
                <span className="block text-xs text-gray-500">Coverage up to ₱500</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={itemProtectionTier === 'paid'}
              onClick={() => onItemProtectionTierChange('paid')}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                itemProtectionTier === 'paid' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <IconShieldPlus className={cn('w-4 h-4 flex-shrink-0 mt-0.5', itemProtectionTier === 'paid' ? 'text-blue-600' : 'text-gray-400')} />
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', itemProtectionTier === 'paid' ? 'text-blue-900' : 'text-gray-800')}>
                  Increase item protection
                </span>
                <span className="block text-xs text-gray-500">
                  {coveredValue > 0 ? `Protect up to ${fmtPHP(coveredValue)} · ${fmtPHP(protectionFee)} fee` : 'Protect a higher declared value'}
                </span>
              </span>
            </button>
          </div>

          {!codEnabled && itemProtectionTier === 'paid' && (
            <div className="pt-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Declared item value</label>
              <Input
                type="number"
                min={0}
                value={declaredValue}
                onChange={(e) => onDeclaredValueChange(e.target.value)}
                placeholder="0.00"
                className={declaredValueInvalid ? 'border-red-500' : undefined}
                aria-invalid={declaredValueInvalid}
              />
              {declaredValueInvalid && <p className="mt-1 text-xs text-red-600">Declared value must be 0 or greater.</p>}
            </div>
          )}
          {codEnabled && itemProtectionTier === 'paid' && (
            <p className="text-xs text-gray-500">
              Using your Cash on Delivery amount ({fmtPHP(codAmountNum || 0)}) as the covered value.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Items valued up to ₱500 are protected for free. A small fee applies above that — see the fee breakdown.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
