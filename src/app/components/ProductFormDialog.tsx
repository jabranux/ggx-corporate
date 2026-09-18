import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconCircleCheck, IconLock } from '@tabler/icons-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';
import { ProductImageGallery } from './ProductImageGallery';
import { ProductVariantBuilder } from './ProductVariantBuilder';
import {
  PRODUCT_CATEGORIES, getInventoryProduct, createInventoryProduct, updateInventoryProduct, getSkuSettings,
  type InventoryProductDetail, type ProductInput, type ProductStatus, type SkuSettings,
} from '../services/inventoryService';

interface FormState {
  name: string;
  sku: string;
  category: string;
  description: string;
  status: ProductStatus;
  unitPrice: string;
  compareAtPrice: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  stockQuantity: string;
  lowStockThreshold: string;
  unlimited: boolean;
}

function blankForm(): FormState {
  return {
    name: '', sku: '', category: '', description: '', status: 'active',
    unitPrice: '', compareAtPrice: '', weight: '', length: '', width: '', height: '',
    stockQuantity: '', lowStockThreshold: '10', unlimited: false,
  };
}

function formFrom(p: InventoryProductDetail): FormState {
  return {
    name: p.name, sku: p.sku, category: p.category, description: p.description, status: p.status,
    unitPrice: String(p.unitPrice), compareAtPrice: p.compareAtPrice == null ? '' : String(p.compareAtPrice),
    weight: String(p.weight), length: String(p.dimensions.length ?? ''), width: String(p.dimensions.width ?? ''), height: String(p.dimensions.height ?? ''),
    stockQuantity: String(p.stockQuantity), lowStockThreshold: String(p.lowStockThreshold), unlimited: p.unlimitedStock,
  };
}

const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-xs font-medium text-gray-600 mb-1">
    {children}{required && <span className="text-red-500"> *</span>}
  </label>
);

type Tab = 'details' | 'images' | 'variants';

/**
 * Create / edit an Inventory product against the real Commerce backend.
 * Details (name/price/stock/etc.) save explicitly; the Photos and Variants
 * tabs apply each action immediately (upload, reorder, cover, variant
 * generate/edit) since both need a real product id to attach to — so a
 * brand-new product saves its Details first (unlocking those tabs), then the
 * dialog stays open for photos/variants instead of closing. Editing an
 * existing product opens straight into all three tabs.
 */
export function ProductFormDialog({
  open,
  mode,
  productId,
  scopeId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  /** Required for `mode: 'edit'`. */
  productId?: string;
  /** Concrete account/subaccount id — callers only render this dialog when
   * `canMutate` (a concrete scope) is true. */
  scopeId: string;
  onClose: () => void;
  /** Called after any successful create/update/image/variant change, so the
   * Inventory list can refresh without waiting for the dialog to close. */
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [product, setProduct] = useState<InventoryProductDetail | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [skuSettings, setSkuSettings] = useState<SkuSettings | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const set = (k: keyof FormState, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    let active = true;
    getSkuSettings(scopeId).then((s) => { if (active) setSkuSettings(s); }).catch(() => {});
    if (mode === 'edit' && productId) {
      setLoading(true);
      getInventoryProduct(productId, scopeId)
        .then((p) => {
          if (!active) return;
          if (!p) { setLoadError('This product could not be loaded — it may have been removed.'); return; }
          setProduct(p);
          setForm(formFrom(p));
        })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, productId, scopeId]);

  const applyProduct = (updated: InventoryProductDetail) => {
    setProduct(updated);
    onSaved();
  };

  const canSubmit = form.name.trim().length > 0 && num(form.unitPrice) !== undefined;

  const buildInput = (): ProductInput => ({
    name: form.name.trim(),
    category: form.category.trim() || 'Uncategorized',
    description: form.description.trim(),
    status: form.status,
    sku: product ? undefined : (form.sku.trim() || undefined), // SKU is immutable after creation
    unitPrice: num(form.unitPrice) ?? 0,
    compareAtPrice: form.compareAtPrice.trim() === '' ? null : num(form.compareAtPrice) ?? null,
    weight: form.weight.trim() === '' ? null : num(form.weight) ?? null,
    dimensions: {
      length: form.length.trim() === '' ? null : num(form.length) ?? null,
      width: form.width.trim() === '' ? null : num(form.width) ?? null,
      height: form.height.trim() === '' ? null : num(form.height) ?? null,
    },
    stockQuantity: form.unlimited ? 0 : (num(form.stockQuantity) ?? 0),
    lowStockThreshold: form.unlimited ? 0 : (num(form.lowStockThreshold) ?? 0),
    unlimitedStock: form.unlimited,
  });

  const handleSaveDetails = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      if (!product) {
        const created = await createInventoryProduct(scopeId, buildInput());
        setProduct(created);
        setForm(formFrom(created));
        onSaved();
        setTab('images');
      } else {
        const updated = await updateInventoryProduct(product.id, buildInput(), scopeId);
        setProduct(updated);
        setForm(formFrom(updated));
        onSaved();
      }
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this product.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => { onClose(); };

  const skuHint = skuSettings
    ? (skuSettings.autoGenerate
        ? `Leave blank to auto-generate (${skuSettings.prefix}-${String(skuSettings.nextSequence).padStart(6, '0')}).`
        : 'Auto-generate is off for this account — a SKU is required.')
    : undefined;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={mode === 'create' ? 'Add product' : 'Edit product'}
      size="lg"
    >
      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading product…</p>
      ) : loadError ? (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
          <IconAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {loadError}
        </div>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="images" disabled={!product}>
                {!product && <IconLock className="w-3 h-3 mr-1" />}Photos
              </TabsTrigger>
              <TabsTrigger value="variants" disabled={!product}>
                {!product && <IconLock className="w-3 h-3 mr-1" />}Variants{product && product.hasVariants ? ` (${product.variants.length})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
                {!product && (
                  <p className="text-xs text-gray-500 -mt-1">
                    Save the product's details first — photos and variants unlock right after.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label required>Product name</Label>
                    <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Premium Coffee Beans 1kg" />
                  </div>
                  <div>
                    <Label>SKU</Label>
                    <Input
                      value={form.sku}
                      onChange={(e) => set('sku', e.target.value)}
                      placeholder={skuHint ?? 'Optional — e.g. COF-1KG-001'}
                      disabled={!!product}
                    />
                    {product
                      ? <p className="text-[11px] text-gray-400 mt-1">SKU can't be changed after the product is created.</p>
                      : skuHint && <p className="text-[11px] text-gray-400 mt-1">{skuHint}</p>}
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                      <option value="">Select a category</option>
                      {!PRODUCT_CATEGORIES.includes(form.category as (typeof PRODUCT_CATEGORIES)[number]) && form.category && (
                        <option value={form.category}>{form.category}</option>
                      )}
                      {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Short product description" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Pricing &amp; stock</Label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={form.unlimited} onChange={(e) => setForm((p) => ({ ...p, unlimited: e.target.checked }))} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Unlimited stock
                    </label>
                  </div>
                  {product?.hasVariants && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-2">
                      This product has variants — the values below are the base/fallback price and stock.
                      Manage per-variant pricing and stock in the Variants tab.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label required>Unit price (₱)</Label>
                      <Input type="number" min={0} value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <Label>Compare-at price (₱)</Label>
                      <Input type="number" min={0} value={form.compareAtPrice} onChange={(e) => set('compareAtPrice', e.target.value)} placeholder="Optional" />
                    </div>
                    <div>
                      <Label>Low-stock at</Label>
                      <Input
                        type="number" min={0}
                        value={form.unlimited ? '' : form.lowStockThreshold}
                        disabled={form.unlimited}
                        onChange={(e) => set('lowStockThreshold', e.target.value)}
                        placeholder={form.unlimited ? '—' : '10'}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <div>
                      <Label>Stock qty</Label>
                      <Input
                        type="number" min={0}
                        value={form.unlimited ? '' : form.stockQuantity}
                        disabled={form.unlimited}
                        onChange={(e) => set('stockQuantity', e.target.value)}
                        placeholder={form.unlimited ? 'Unlimited' : '0'}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Weight &amp; dimensions</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Input type="number" min={0} step="0.01" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="Weight (kg)" />
                    <Input type="number" min={0} value={form.length} onChange={(e) => set('length', e.target.value)} placeholder="L (cm)" />
                    <Input type="number" min={0} value={form.width} onChange={(e) => set('width', e.target.value)} placeholder="W (cm)" />
                    <Input type="number" min={0} value={form.height} onChange={(e) => set('height', e.target.value)} placeholder="H (cm)" />
                  </div>
                </div>

                {saveError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
                    <IconAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {saveError}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="images">
              <div className="max-h-[52vh] overflow-y-auto pr-1">
                {product
                  ? <ProductImageGallery product={product} scopeId={scopeId} onChanged={applyProduct} />
                  : <p className="text-sm text-gray-500 py-8 text-center">Save the product's details first.</p>}
              </div>
            </TabsContent>

            <TabsContent value="variants">
              <div className="max-h-[52vh] overflow-y-auto pr-1">
                {product
                  ? <ProductVariantBuilder product={product} scopeId={scopeId} onChanged={applyProduct} />
                  : <p className="text-sm text-gray-500 py-8 text-center">Save the product's details first.</p>}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between gap-2.5 pt-4 mt-2 border-t border-gray-100">
            <div className="text-xs text-emerald-600 flex items-center gap-1">
              {justSaved && <><IconCircleCheck className="w-3.5 h-3.5" /> Saved</>}
            </div>
            <div className="flex gap-2.5">
              <Button variant="outline" size="sm" onClick={handleClose}>{product ? 'Close' : 'Cancel'}</Button>
              {tab === 'details' && (
                <Button size="sm" disabled={!canSubmit || saving} onClick={handleSaveDetails}>
                  {saving ? 'Saving…' : product ? 'Save details' : 'Create product'}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
