import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconPlus, IconSearch, IconBox, IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProductFormDialog } from '../../components/ProductFormDialog';
import { useScopedAccountId } from '../../hooks/useAccountScope';
import {
  getInventoryProducts, isLowStock, InventoryUnavailableError, type InventoryProduct,
} from '../../services/inventoryService';
import { cn } from '../../lib/utils';

function stockBadge(p: InventoryProduct) {
  if (p.unlimitedStock) return { variant: 'success' as const, label: 'In stock' };
  if (p.stockStatus === 'out_of_stock') return { variant: 'danger' as const, label: 'Out of stock' };
  if (isLowStock(p)) return { variant: 'warning' as const, label: `Low · ${p.stockQuantity}` };
  return { variant: 'success' as const, label: `${p.stockQuantity} in stock` };
}

/** Simplified mobile-style Inventory list for the Basic experience — same
 * real Commerce backend as the desktop Inventory page (`inventoryService.ts`),
 * just a leaner card list with no variant/image editing (that stays on the
 * full Inventory page for now). */
export function BasicInventory() {
  const scopeId = useScopedAccountId();
  const canMutate = !!scopeId;

  const [q, setQ] = useState('');
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    getInventoryProducts(scopeId)
      .then(setProducts)
      .catch((err) => setError(err instanceof InventoryUnavailableError ? err.message : 'Inventory could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [scopeId]);

  const list = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pb-2">
      {/* Search + add */}
      <div className="px-4 pt-3 pb-3 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-11 shadow-sm flex-1">
          <IconSearch className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="text"
            placeholder="Search products"
            className="flex-1 text-sm text-gray-700 placeholder-gray-400 bg-transparent border-none outline-none"
          />
        </div>
        <Button
          size="icon"
          className="h-11 w-11 flex-shrink-0"
          aria-label="Add product"
          disabled={!canMutate}
          onClick={() => { setEditingId(null); setFormOpen(true); }}
        >
          <IconPlus className="w-5 h-5" />
        </Button>
      </div>

      {/* Note */}
      <p className="px-4 pb-3 text-xs text-gray-500 leading-snug">
        Products you list here can be sold from your storefront. Stock is for your reference and is not
        reserved or deducted at booking.
      </p>

      {/* List */}
      <div className="px-4">
        {error ? (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-8 text-center">
            <IconAlertTriangle className="w-7 h-7 text-red-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700">{error}</p>
            <button onClick={reload} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <IconRefresh className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-10 text-center text-sm text-gray-500">Loading products…</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
            {list.map((p) => {
              const sb = stockBadge(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { if (canMutate) { setEditingId(p.id); setFormOpen(true); } }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {p.coverImageUrl
                      ? <img src={p.coverImageUrl} alt="" className="w-full h-full object-cover" />
                      : <IconBox className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 leading-snug">
                      {p.sku} · {p.hasVariants && p.priceRange
                        ? `₱${p.priceRange.min.toLocaleString()}${p.priceRange.min !== p.priceRange.max ? `–₱${p.priceRange.max.toLocaleString()}` : ''}`
                        : `₱${p.unitPrice.toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={sb.variant} className={cn('text-[10px] px-2 py-0.5 leading-none')}>{sb.label}</Badge>
                  </div>
                </button>
              );
            })}
            {list.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-semibold text-gray-700">
                  {products.length === 0 ? 'No products yet' : 'No matching products'}
                </p>
                {products.length === 0 && canMutate && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setFormOpen(true); }}
                    className="mt-3 text-xs font-semibold text-blue-600"
                  >
                    + Add your first product
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {formOpen && scopeId && (
        <ProductFormDialog
          key={editingId ?? 'new'}
          open={formOpen}
          mode={editingId ? 'edit' : 'create'}
          productId={editingId ?? undefined}
          scopeId={scopeId}
          onClose={() => { setFormOpen(false); setEditingId(null); reload(); }}
          onSaved={reload}
        />
      )}

      <div className="px-4 pt-4">
        <Link to="/basic/store" className="text-xs font-semibold text-blue-600">← Back to your store</Link>
      </div>
    </div>
  );
}
