import { useMemo, useState } from 'react';
import { IconPackage, IconLayoutGrid } from '@tabler/icons-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Switch } from './ui/Switch';
import { Checkbox } from './ui/Checkbox';
import { ProductPickerDialog } from './ProductPickerDialog';
import type { InventoryProduct } from '../services/inventoryService';
import type { Collection } from '../services/storefrontService';
import type { Promotion, PromotionInput, DiscountType, PromotionStatus } from '../services/promotionsService';

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
);

const DISCOUNT_TYPE_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'percentage', label: 'Percentage off' },
  { value: 'fixed', label: 'Fixed amount off' },
];

/**
 * Create or edit a promotion. Eligibility (`productIds`/`collectionIds`) is
 * additive/independent, mirroring the backend's own OR semantics
 * (`api/_lib/commercePromotions.ts`'s `computeDiscount`: eligible if the
 * cart has ANY selected product OR ANY product from a selected collection) —
 * both empty means store-wide, not an exclusive three-way choice. Reuses
 * `ProductPickerDialog` for product scoping (per the Commerce checkpoint's
 * "don't duplicate that pattern"); collections are few enough to pick inline.
 *
 * Never computes a discount here — this dialog only shapes the promotion's
 * OWN rules; the actual discount math always happens server-side at
 * validate/redeem time (see `promotionsService.ts`).
 */
export function PromotionDialog({
  open,
  promotion,
  products,
  collections,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Omit to create a new promotion. */
  promotion?: Promotion;
  products: InventoryProduct[];
  collections: Collection[];
  onClose: () => void;
  onSubmit: (input: PromotionInput) => void;
}) {
  const isEdit = !!promotion;
  const [name, setName] = useState(promotion?.name ?? '');
  const [code, setCode] = useState(promotion?.code ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(promotion?.discountType ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(promotion ? String(promotion.discountValue) : '');
  const [startDate, setStartDate] = useState(promotion?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(promotion?.endDate?.slice(0, 10) ?? '');
  const [minOrderAmount, setMinOrderAmount] = useState(promotion ? String(promotion.minOrderAmount) : '0');
  const [usageLimit, setUsageLimit] = useState(promotion?.usageLimit != null ? String(promotion.usageLimit) : '');
  const [status, setStatus] = useState<PromotionStatus>(promotion?.status ?? 'active');
  const [productIds, setProductIds] = useState<string[]>(promotion?.productIds ?? []);
  const [collectionIds, setCollectionIds] = useState<string[]>(promotion?.collectionIds ?? []);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const selectedProducts = useMemo(
    () => products.filter((p) => productIds.includes(p.id)),
    [products, productIds],
  );

  const toggleCollection = (id: string) => {
    setCollectionIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const discountNum = Number(discountValue);
  const minOrderNum = minOrderAmount.trim() === '' ? 0 : Number(minOrderAmount);
  const usageLimitNum = usageLimit.trim() === '' ? null : Number(usageLimit);

  const canSubmit =
    !!name.trim() &&
    !!code.trim() &&
    Number.isFinite(discountNum) && discountNum > 0 &&
    (discountType !== 'percentage' || discountNum <= 100) &&
    !!startDate && !!endDate &&
    new Date(endDate) > new Date(startDate) &&
    Number.isFinite(minOrderNum) && minOrderNum >= 0 &&
    (usageLimitNum === null || (Number.isFinite(usageLimitNum) && usageLimitNum >= 0));

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: discountNum,
      startDate,
      endDate,
      minOrderAmount: minOrderNum,
      usageLimit: usageLimitNum,
      status,
      productIds,
      collectionIds,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? 'Edit promotion' : 'New promotion'} size="lg">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Promotion name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend Sale" />
          </div>
          <div>
            <Label>Promo code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. WEEKEND20"
              className="uppercase"
            />
            <p className="text-xs text-gray-400 mt-1">Codes are case-insensitive; shown here in uppercase.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Discount type</Label>
            <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
              {DISCOUNT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>{discountType === 'percentage' ? 'Percentage (%)' : 'Amount off (₱)'}</Label>
            <Input
              type="number"
              min={0}
              max={discountType === 'percentage' ? 100 : undefined}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percentage' ? 'e.g. 20' : 'e.g. 100'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {startDate && endDate && new Date(endDate) <= new Date(startDate) && (
          <p className="text-xs text-red-600 -mt-2">End date must be after the start date.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Minimum order amount (₱)</Label>
            <Input type="number" min={0} value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Usage limit (optional)</Label>
            <Input type="number" min={0} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" />
            {isEdit && promotion.usageCount > 0 && (
              <p className="text-xs text-gray-400 mt-1">Already used {promotion.usageCount} time{promotion.usageCount === 1 ? '' : 's'}.</p>
            )}
          </div>
        </div>

        <div>
          <Label>Eligibility</Label>
          <p className="text-xs text-gray-500 mb-2">
            Leave both empty for a store-wide code, or scope it to specific products and/or collections.
          </p>
          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <IconPackage className="w-3.5 h-3.5 text-gray-400" /> Specific products
                </p>
                <Button size="sm" variant="outline" onClick={() => setProductPickerOpen(true)}>
                  {productIds.length > 0 ? `${productIds.length} selected` : 'Choose products'}
                </Button>
              </div>
              {selectedProducts.length > 0 && (
                <p className="text-xs text-gray-500 truncate">
                  {selectedProducts.map((p) => p.name).join(', ')}
                </p>
              )}
            </div>

            {collections.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
                  <IconLayoutGrid className="w-3.5 h-3.5 text-gray-400" /> Specific collections
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1.5">
                  {collections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <Checkbox checked={collectionIds.includes(c.id)} onChange={() => toggleCollection(c.id)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">Active</p>
            <p className="text-xs text-gray-500">Inactive codes are rejected at checkout without deleting the promotion.</p>
          </div>
          <Switch checked={status === 'active'} onCheckedChange={(v) => setStatus(v ? 'active' : 'inactive')} />
        </div>
      </div>

      <div className="flex gap-2.5 justify-end pt-4 mt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>{isEdit ? 'Save changes' : 'Create promotion'}</Button>
      </div>

      {productPickerOpen && (
        <ProductPickerDialog
          open={productPickerOpen}
          title="Products eligible for this promotion"
          description="Choose which inventory products this promo code applies to. Leave empty for store-wide."
          products={products}
          selectedIds={productIds}
          onClose={() => setProductPickerOpen(false)}
          onConfirm={(ids) => { setProductIds(ids); setProductPickerOpen(false); }}
        />
      )}
    </Dialog>
  );
}
