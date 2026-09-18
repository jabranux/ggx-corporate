import { useState } from 'react';
import { IconPlus, IconTrash, IconAlertTriangle, IconDeviceFloppy } from '@tabler/icons-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { cn } from '../lib/utils';
import {
  setVariantOptions, updateVariant, deleteVariant,
  type InventoryProductDetail, type InventoryVariant, type VariantStatus,
} from '../services/inventoryService';

const MAX_OPTIONS = 3;

interface OptionRow {
  name: string;
  valuesText: string;
}

function optionRowsFrom(product: InventoryProductDetail): OptionRow[] {
  if (product.options.length === 0) return [{ name: '', valuesText: '' }];
  return product.options.map((o) => ({ name: o.name, valuesText: o.values.map((v) => v.value).join(', ') }));
}

/** Resolve a variant's option-value combination to a readable label, e.g. "Black / S". */
function combinationLabel(product: InventoryProductDetail, variant: InventoryVariant): string {
  const values = product.options
    .map((o) => o.values.find((v) => variant.optionValueIds.includes(v.id))?.value)
    .filter((v): v is string => !!v);
  return values.length ? values.join(' / ') : '—';
}

interface RowDraft {
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  unlimited: boolean;
  status: VariantStatus;
}

function draftFromVariant(v: InventoryVariant): RowDraft {
  return {
    sku: v.sku,
    price: v.priceOverride == null ? '' : String(v.priceOverride),
    compareAt: v.compareAtPriceOverride == null ? '' : String(v.compareAtPriceOverride),
    stock: String(v.stockQuantity),
    unlimited: v.unlimitedStock,
    status: v.status,
  };
}

function draftsEqual(a: RowDraft, b: RowDraft): boolean {
  return a.sku === b.sku && a.price === b.price && a.compareAt === b.compareAt
    && a.stock === b.stock && a.unlimited === b.unlimited && a.status === b.status;
}

/**
 * Variant/option builder — define options (e.g. Color, Size), generate the
 * combinations as real backend variants (`PUT .../variant-options`), then
 * edit each variant's SKU / price override / stock / status in place.
 * Applies immediately against the backend (the product already exists by the
 * time this renders — see `ProductFormDialog`'s two-step create flow).
 */
export function ProductVariantBuilder({
  product,
  scopeId,
  onChanged,
}: {
  product: InventoryProductDetail;
  scopeId: string;
  onChanged: (updated: InventoryProductDetail) => void;
}) {
  const [optionRows, setOptionRows] = useState<OptionRow[]>(() => optionRowsFrom(product));
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const parsedOptions = optionRows
    .map((r) => ({ name: r.name.trim(), values: Array.from(new Set(r.valuesText.split(',').map((v) => v.trim()).filter(Boolean))) }))
    .filter((o) => o.name && o.values.length > 0);
  const previewCount = parsedOptions.length > 0 ? parsedOptions.reduce((n, o) => n * o.values.length, 1) : 0;

  const setOptionRow = (i: number, patch: Partial<OptionRow>) =>
    setOptionRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addOptionRow = () => setOptionRows((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, { name: '', valuesText: '' }]));
  const removeOptionRow = (i: number) => setOptionRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleGenerate = async () => {
    if (parsedOptions.length === 0) {
      setGenError('Add at least one option with a name and one or more values.');
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const updated = await setVariantOptions(product.id, parsedOptions, scopeId);
      onChanged(updated);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not generate variants.');
    } finally {
      setGenerating(false);
    }
  };

  const draftFor = (v: InventoryVariant): RowDraft => drafts[v.id] ?? draftFromVariant(v);
  const setDraft = (id: string, patch: Partial<RowDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? draftFromVariant(product.variants.find((v) => v.id === id)!)), ...patch } }));

  const handleSaveRow = async (v: InventoryVariant) => {
    const d = draftFor(v);
    const price = d.price.trim() === '' ? null : Number(d.price);
    const compareAt = d.compareAt.trim() === '' ? null : Number(d.compareAt);
    if (compareAt != null && price != null && compareAt <= price) {
      setRowError((prev) => ({ ...prev, [v.id]: 'Compare-at price must be greater than the selling price.' }));
      return;
    }
    setRowBusy(v.id);
    setRowError((prev) => { const next = { ...prev }; delete next[v.id]; return next; });
    try {
      const updated = await updateVariant(product.id, v.id, {
        sku: d.sku.trim() || undefined,
        priceOverride: price,
        compareAtPriceOverride: compareAt,
        stockQuantity: d.unlimited ? v.stockQuantity : (Number(d.stock) || 0),
        unlimitedStock: d.unlimited,
        status: d.status,
      }, scopeId);
      setDrafts((prev) => { const next = { ...prev }; delete next[v.id]; return next; });
      onChanged(updated);
    } catch (err) {
      setRowError((prev) => ({ ...prev, [v.id]: err instanceof Error ? err.message : 'Could not save this variant.' }));
    } finally {
      setRowBusy(null);
    }
  };

  const handleDeleteRow = async (v: InventoryVariant) => {
    setRowBusy(v.id);
    try {
      const updated = await deleteVariant(product.id, v.id, scopeId);
      onChanged(updated);
    } catch (err) {
      setRowError((prev) => ({ ...prev, [v.id]: err instanceof Error ? err.message : 'Could not delete this variant.' }));
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">Options</p>
        <p className="text-xs text-gray-500 mb-2.5">
          Define up to {MAX_OPTIONS} options (e.g. Color, Size). Comma-separate each option's values — every
          combination becomes a variant with its own SKU, price, and stock.
        </p>
        <div className="space-y-2">
          {optionRows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.name}
                onChange={(e) => setOptionRow(i, { name: e.target.value })}
                placeholder="Option name (e.g. Color)"
                className="w-40 flex-shrink-0"
              />
              <Input
                value={row.valuesText}
                onChange={(e) => setOptionRow(i, { valuesText: e.target.value })}
                placeholder="Values, comma-separated (e.g. Black, White)"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeOptionRow(i)}
                disabled={optionRows.length <= 1}
                title="Remove option"
                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              >
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <Button variant="outline" size="sm" onClick={addOptionRow} disabled={optionRows.length >= MAX_OPTIONS}>
            <IconPlus className="w-3.5 h-3.5" /> Add option
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating || parsedOptions.length === 0}>
            {generating ? 'Generating…' : `Generate${previewCount ? ` ${previewCount} variant${previewCount === 1 ? '' : 's'}` : ' variants'}`}
          </Button>
        </div>
        {genError && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700 mt-2">
            <IconAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {genError}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Removing a value here won't delete its existing variant — delete the variant row below if it's no longer sold.
        </p>
      </div>

      {product.variants.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-900 mb-2">Variants ({product.variants.length})</p>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[32vh] overflow-y-auto divide-y divide-gray-100">
              {product.variants.map((v) => {
                const d = draftFor(v);
                const dirty = !draftsEqual(d, draftFromVariant(v));
                const busy = rowBusy === v.id;
                return (
                  <div key={v.id} className={cn('p-3', busy && 'opacity-60')}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">{combinationLabel(product, v)}</span>
                      <div className="flex items-center gap-1.5">
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveRow(v)}
                            disabled={busy}
                            title="Save variant"
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                          >
                            <IconDeviceFloppy className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(v)}
                          disabled={busy}
                          title="Delete variant"
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <Input value={d.sku} onChange={(e) => setDraft(v.id, { sku: e.target.value })} placeholder="SKU" className="text-xs h-8" />
                      <Input
                        type="number" min={0} value={d.price}
                        onChange={(e) => setDraft(v.id, { price: e.target.value })}
                        placeholder={`Price (₱${product.unitPrice})`} className="text-xs h-8"
                      />
                      <Input
                        type="number" min={0} value={d.compareAt}
                        onChange={(e) => setDraft(v.id, { compareAt: e.target.value })}
                        placeholder="Compare-at" className="text-xs h-8"
                      />
                      <Input
                        type="number" min={0} value={d.unlimited ? '' : d.stock} disabled={d.unlimited}
                        onChange={(e) => setDraft(v.id, { stock: e.target.value })}
                        placeholder={d.unlimited ? 'Unlimited' : 'Stock'} className="text-xs h-8"
                      />
                      <Select value={d.status} onChange={(e) => setDraft(v.id, { status: e.target.value as VariantStatus })} className="text-xs h-8">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 mt-1.5 cursor-pointer w-fit">
                      <input
                        type="checkbox" checked={d.unlimited}
                        onChange={(e) => setDraft(v.id, { unlimited: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Unlimited stock
                    </label>
                    {rowError[v.id] && <p className="text-xs text-red-600 mt-1.5">{rowError[v.id]}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
