import { useMemo, useState } from 'react';
import { IconMinus, IconPlus, IconPackage } from '@tabler/icons-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { SearchInput } from './SearchInput';
import { cn } from '../lib/utils';
import { isLowStock, type InventoryProduct } from '../services/inventoryService';
import { attachmentSubtotal, attachmentTotalQty, type AttachedProduct } from '../lib/bookingValidation';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Effective stock cap for clamping. A variant-carrying product's OWN
 * `stockQuantity` doesn't track real availability — stock lives per-variant
 * (`commerce_product_variants.stock_quantity`), and this dialog has no
 * variant picker of its own (bulk booking predates Commerce's variant model
 * and attaches by product, not by exact SKU) — treated like unlimited stock,
 * same as the dialog's own "checked but not reserved" disclaimer already
 * covers for the base-product case.
 */
const stockCap = (p: InventoryProduct): number => (p.unlimitedStock || p.hasVariants ? 9999 : p.stockQuantity);

/** Selectable = active, and either has stock or is a variant-carrying
 * product (see `stockCap` — the base row's own zero/low stock doesn't mean
 * every variant is unavailable, so it must never block attachment outright). */
function isSelectable(p: InventoryProduct): boolean {
  return p.status === 'active' && (p.hasVariants || p.unlimitedStock || p.stockQuantity > 0);
}

function stockBadge(p: InventoryProduct) {
  if (p.status !== 'active') return <Badge variant="default">Inactive</Badge>;
  if (p.hasVariants) return <Badge variant="outline">Has options</Badge>;
  if (p.unlimitedStock) return <Badge variant="success">In stock</Badge>;
  if (p.stockQuantity === 0) return <Badge variant="danger">Out of stock</Badge>;
  if (isLowStock(p)) return <Badge variant="warning">Low · {p.stockQuantity} left</Badge>;
  return <Badge variant="success">{p.stockQuantity} in stock</Badge>;
}

/**
 * Product attachment dialog — pick one or more Inventory products for a single
 * booking row. Each selected product carries its own quantity (clamped to
 * available stock); the row's Qty + Declared value are derived from the
 * selection by the caller. No stock is deducted here (draft stage) — availability
 * is validated only. See docs/spreadsheet_booking_rules.md.
 */
export function ProductAttachDialog({
  open,
  onClose,
  products,
  initial,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  products: InventoryProduct[];
  initial: AttachedProduct[];
  onConfirm: (selected: AttachedProduct[]) => void;
}) {
  const [query, setQuery] = useState('');
  // productId → chosen quantity (0 / absent = not selected). Seeded from initial.
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.map((p) => [p.productId, p.quantity])),
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          q.length < 1 ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      ),
    [products, q],
  );

  const setQuantity = (p: InventoryProduct, next: number) => {
    const clamped = Math.max(0, Math.min(next, stockCap(p)));
    setQty((prev) => {
      const copy = { ...prev };
      if (clamped <= 0) delete copy[p.id];
      else copy[p.id] = clamped;
      return copy;
    });
  };

  // Build the current selection as AttachedProduct[] (snapshot for display/payload).
  const selected: AttachedProduct[] = useMemo(
    () =>
      products
        .filter((p) => (qty[p.id] ?? 0) > 0)
        .map((p) => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          quantity: qty[p.id],
          unitPrice: p.unitPrice,
          weight: p.weight,
        })),
    [products, qty],
  );

  const totalItems = attachmentTotalQty(selected);
  const subtotal = attachmentSubtotal(selected);

  return (
    <Dialog open={open} onClose={onClose} title="Attach products" size="lg">
      <p className="text-sm text-gray-500 mb-3">
        Select products from your inventory and set a quantity for each. Stock is checked but not
        reserved — it's deducted only after the booking is confirmed.
      </p>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search products by name, SKU, or category..."
        className="mb-3"
      />

      <div className="max-h-[42vh] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <IconPackage className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {products.length === 0 ? 'No products in this account yet.' : 'No products match your search.'}
            </p>
          </div>
        ) : (
          filtered.map((p) => {
            const selectable = isSelectable(p);
            const current = qty[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className={cn('flex items-center gap-3 px-3 py-2.5', !selectable && 'opacity-60')}
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <IconPackage className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    {stockBadge(p)}
                  </div>
                  <p className="text-xs text-gray-500">
                    {p.sku} · {peso(p.unitPrice)}
                  </p>
                </div>
                {/* Quantity stepper — disabled for inactive / out-of-stock products. */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    disabled={!selectable || current <= 0}
                    onClick={() => setQuantity(p, current - 1)}
                    className="w-7 h-7 rounded border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label={`Decrease ${p.name}`}
                  >
                    <IconMinus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={current === 0 ? '' : String(current)}
                    disabled={!selectable}
                    placeholder="0"
                    onChange={(e) => setQuantity(p, Number(e.target.value.replace(/\D/g, '')) || 0)}
                    className="w-12 h-7 text-center text-sm rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={!selectable || current >= stockCap(p)}
                    onClick={() => setQuantity(p, current + 1)}
                    className="w-7 h-7 rounded border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label={`Increase ${p.name}`}
                  >
                    <IconPlus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: running totals + actions */}
      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{selected.length}</span> product
          {selected.length === 1 ? '' : 's'} ·{' '}
          <span className="font-medium text-gray-900">{totalItems}</span> item
          {totalItems === 1 ? '' : 's'} · Subtotal{' '}
          <span className="font-medium text-gray-900">{peso(subtotal)}</span>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(selected)}>
            {selected.length > 0 ? `Attach ${selected.length} product${selected.length === 1 ? '' : 's'}` : 'Clear selection'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
