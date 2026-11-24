/**
 * Item Details step for the GGX Basic single-booking flow: what's being
 * sent, pouch size, merchandise Cash on Delivery, and item protection.
 *
 * Pouch-size cards use the official GGX parcel illustrations (loaded
 * directly from gogoxpress.com — see `basicPouchSizes.ts`'s `iconUrl`),
 * not real product photography of the user's actual item.
 *
 * Item protection always offers two explicit, user-chosen tiers (Free vs
 * Increase coverage) — the covered value automatically follows the
 * merchandise COD amount when COD is enabled, or the declared item value
 * when it isn't (see `basicItemProtection.ts`'s `getProtectionCoveredValue`),
 * but the TIER itself is never inferred from that value. A high covered
 * value never silently switches the selection away from Free — the user
 * must tap "Increase coverage" themselves. The declared item value field
 * only renders while that tier is selected (and COD is off) — Free never
 * needs it (flat ₱500 coverage), so showing it there would just be a dead,
 * confusing input.
 *
 * Two shared-component knobs added for the Accordion booking variant
 * (2026-11-24 density pass), both no-ops when omitted so the Wizard — which
 * never passes either — renders exactly as before:
 *  - `category`/`onCategoryChange`: swaps the free-text "Item description"
 *    field for a single-select "What are you sending?" chip row, with a
 *    free-text field only for "Others". `itemDescription`/
 *    `onItemDescriptionChange` are still the single source of truth the
 *    booking draft/history/review ultimately read — the category's own
 *    label (or the typed "Others" text) IS the `itemDescription` value, kept
 *    in sync by whichever caller passes `category` (see
 *    `BookingAccordionFlow.tsx`'s `handleCategoryChange`). This component
 *    itself only renders the chips/field; it doesn't own that derivation.
 *  - `bare`: renders without this component's own `Card` wrapper, for a
 *    caller (the Accordion's own section card) that already provides one.
 */
import { useState } from 'react';
import { IconShieldCheck, IconShieldPlus, IconCash, IconCircleCheckFilled, IconInfoCircle } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Alert } from './ui/Alert';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';
import { Popover } from './ui/Popover';
import { BASIC_POUCH_SIZES, type BasicPouchSizeKey } from '../lib/basicPouchSizes';
import { BASIC_ITEM_CATEGORIES, type BasicItemCategory } from '../lib/basicItemCategories';
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
  /** Accordion-only "What are you sending?" category chips, replacing the free-text field below (see this file's module docblock). Omit for the Wizard's original text field. */
  category?: BasicItemCategory | null;
  onCategoryChange?: (v: BasicItemCategory) => void;
  /** Renders without this component's own `Card` — the caller's own container already serves that role. */
  bare?: boolean;
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
  category,
  onCategoryChange,
  bare,
}: BookingItemDetailsSectionProps) {
  const useCategoryChips = category !== undefined;
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const descriptionInvalid = !useCategoryChips && descriptionTouched && !itemDescription.trim();

  const codAmountNum = Number(codAmount);
  const codInvalid = codEnabled && (codAmount.trim() === '' || !Number.isFinite(codAmountNum) || codAmountNum < 0);

  const declaredValueNum = Number(declaredValue);
  const declaredValueInvalid = !codEnabled && declaredValue.trim() !== '' && (!Number.isFinite(declaredValueNum) || declaredValueNum < 0);

  const body = (
    <>
      {useCategoryChips ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">What are you sending?</label>
          <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
            {BASIC_ITEM_CATEGORIES.map((c) => {
              const selected = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onCategoryChange?.(c.key)}
                  className={cn(
                    'flex-shrink-0 snap-start rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors',
                    selected ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {category === 'others' && (
            <Input
              className="mt-2"
              value={itemDescription}
              onChange={(e) => onItemDescriptionChange(e.target.value)}
              placeholder="Describe your item"
            />
          )}
        </div>
      ) : (
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
      )}

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
            Your rider will bring the pouch and waybill.
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <div className="flex min-w-0 items-start gap-2.5 pr-3">
          <IconCash className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
          <div className="min-w-0">
            {/* `div`, not `<p>` — the Popover's panel is a block element. */}
            <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
              Cash on Delivery (COD)
              <Popover
                label={<IconInfoCircle className="w-3.5 h-3.5 text-gray-400" />}
                triggerClassName="flex-shrink-0"
                className="w-60 p-3"
              >
                <p className="text-xs text-gray-600">This is separate from who pays the shipping fee.</p>
              </Popover>
            </div>
            <p className="text-xs text-gray-500">Collect payment for your item.</p>
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

      <div className="space-y-2 border-t border-gray-100 pt-3">
        {/* `Popover`'s panel is a `div` — kept inside a `div` here, not a `<p>`, since a block element inside a paragraph is invalid HTML. */}
        <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
          <IconShieldCheck className="w-4 h-4 text-gray-400" />
          Item protection
          <Popover
            label={<IconInfoCircle className="w-3.5 h-3.5 text-gray-400" />}
            triggerClassName="flex-shrink-0"
            className="w-60 p-3"
          >
            <p className="text-xs text-gray-600">Items valued up to ₱500 are protected for free. A small fee applies above that — see the fee breakdown.</p>
          </Popover>
        </div>
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
              <span className="block text-xs text-gray-500">Up to ₱500</span>
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
                Increase coverage
              </span>
              <span className="block text-xs text-gray-500">Above ₱500</span>
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
      </div>
    </>
  );

  if (bare) return <div className="space-y-3">{body}</div>;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">{body}</CardContent>
    </Card>
  );
}
