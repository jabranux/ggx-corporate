import { useMemo, useState } from 'react';
import { IconPackage, IconCircleCheck } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { SearchInput } from './SearchInput';
import { cn } from '../lib/utils';
import { isLowStock, type InventoryProduct } from '../services/inventoryService';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Generic product-selection checklist — used both for the storefront-wide
 * "Manage products" list and per-collection product membership. Deliberately
 * a picker only, never a product editor: per docs/storefront_rules.md,
 * editing a product's own fields happens in Inventory (deep link below), not
 * here (see the Commerce checkpoint's "Manage products should deep-link into
 * Inventory, not duplicate the editor").
 */
export function ProductPickerDialog({
  open,
  title = 'Manage storefront products',
  description = 'Choose which inventory products appear on your storefront. Only active products can be selected.',
  products,
  selectedIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  description?: string;
  products: InventoryProduct[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedIds));

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

  const toggle = (p: InventoryProduct) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) {
        // Always allow removing an already-selected product, even an
        // inactive one — otherwise archiving a product locks it into every
        // selection (storefront/collection/promotion) it was ever added to,
        // with no way to remove it short of reactivating it first.
        next.delete(p.id);
      } else if (p.status === 'active') {
        next.add(p.id);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} size="lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm text-gray-500">{description}</p>
        <Link to="/dashboard/inventory" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap flex-shrink-0 mt-0.5">
          Manage in Inventory →
        </Link>
      </div>

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
            const active = p.status === 'active';
            const isSelected = selected.has(p.id);
            // An inactive product stays clickable when it's already selected
            // (to allow removing it) — only blocked from being newly added.
            const clickable = active || isSelected;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p)}
                disabled={!clickable}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left',
                  clickable ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-60 cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white',
                  )}
                >
                  {isSelected && <IconCircleCheck className="w-4 h-4 text-white" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    {!active && <Badge variant="default">Inactive</Badge>}
                    {active && isLowStock(p) && <Badge variant="warning">Low stock</Badge>}
                  </div>
                  <p className="text-xs text-gray-500">{p.sku} · {peso(p.unitPrice)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <span className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{selected.size}</span> product{selected.size === 1 ? '' : 's'} selected
        </span>
        <div className="flex gap-2.5">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(Array.from(selected))}>Save selection</Button>
        </div>
      </div>
    </Dialog>
  );
}
