import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IconPackage, IconPlus, IconPencil, IconTrash, IconUpload, IconDownload, IconInfoCircle, IconShare2,
  IconBuildingStore, IconAlertTriangle, IconSettings, IconRefresh,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { EnablementGate } from '../components/EnablementGate';
import { ProductFormDialog } from '../components/ProductFormDialog';
import { SkuSettingsPanel } from '../components/SkuSettingsPanel';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { isFeatureUsable, getFeatureStateSync } from '../services/featureEnablementService';
import {
  getInventoryProducts, deleteInventoryProduct, importInventoryProducts, productsToCsv, parseProductsCsv,
  isLowStock, InventoryUnavailableError, type InventoryProduct, type ProductStatus,
} from '../services/inventoryService';
import { getStorefrontProfile } from '../services/storefrontService';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const STATUS_META: Record<ProductStatus, { label: string; variant: 'success' | 'default' | 'warning' }> = {
  active: { label: 'Active', variant: 'success' },
  draft: { label: 'Draft', variant: 'warning' },
  archived: { label: 'Archived', variant: 'default' },
};

/** Trigger a client-side CSV download (export is a presentation helper). */
function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Inventory — product list + create / edit / delete / import / export, scoped to
 * the current account/subaccount and gated by role permissions. Renders the
 * EnablementGate when Inventory isn't usable for the scope. See
 * docs/inventory_rules.md. Backed by the real Commerce backend
 * (`services/inventoryService.ts`) — stock/price/SKU allocation are all
 * server-authoritative; this page only renders and forwards user intent.
 */
export function Inventory() {
  const navigate = useNavigate();
  const ctx = useModuleAccessContext();
  const scopeId = ctx.scopeAccountId;
  const can = (key: Parameters<typeof ctx.permissions.includes>[0]) => ctx.permissions.includes(key);
  // Mutations need a concrete scope (a subaccount/standard scope, not the
  // consolidated Main Account view).
  const canMutate = !!scopeId;

  const [usable, setUsable] = useState<boolean | null>(null);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = () => {
    setLoadingProducts(true);
    setLoadError(null);
    getInventoryProducts(scopeId)
      .then((p) => setProducts(p))
      .catch((err) => setLoadError(err instanceof InventoryUnavailableError ? err.message : 'Inventory could not be loaded.'))
      .finally(() => setLoadingProducts(false));
  };

  useEffect(() => {
    let active = true;
    isFeatureUsable('inventory', scopeId).then((ok) => {
      if (!active) return;
      setUsable(ok);
      if (!ok) return;
      setLoadingProducts(true);
      getInventoryProducts(scopeId)
        .then((p) => { if (active) setProducts(p); })
        .catch((err) => { if (active) setLoadError(err instanceof InventoryUnavailableError ? err.message : 'Inventory could not be loaded.'); })
        .finally(() => { if (active) setLoadingProducts(false); });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<InventoryProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ created: number; failed: number } | null>(null);
  const [skuSettingsOpen, setSkuSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Copy a product's public storefront link (shareable to customers). Links
  // to the real public product-detail page (`/shop/:slug/product/:slug`,
  // Commerce Phase 3), not the legacy `/buy/:productId` route — that route's
  // backing service now requires a merchant session and 401s for the
  // anonymous buyers this link is meant for. Requires the storefront to be
  // published (the public route 404s otherwise, same as browsing the store
  // itself would).
  const shareProduct = async (p: InventoryProduct) => {
    if (!scopeId) return;
    const profile = await getStorefrontProfile(scopeId).catch(() => null);
    if (!profile || profile.publishStatus !== 'published') {
      setToast('Publish your storefront first to share a product link');
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    const url = `${window.location.origin}/shop/${profile.slug}/product/${p.slug}`;
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be blocked */ }
    setToast('Product link copied to clipboard');
    window.setTimeout(() => setToast(null), 3000);
  };

  const importPreview = useMemo(
    () => (importText.trim() ? parseProductsCsv(importText) : null),
    [importText],
  );

  if (usable === null) return null;
  if (!usable) return <EnablementGate moduleId="inventory" />;

  const openCreate = () => { setEditingId(null); setFormOpen(true); };
  const openEdit = (p: InventoryProduct) => { setEditingId(p.id); setFormOpen(true); };

  const handleDelete = async () => {
    if (deleting) await deleteInventoryProduct(deleting.id, scopeId);
    setDeleting(null);
    reload();
  };

  const handleImport = async () => {
    if (!scopeId || !importPreview || importPreview.products.length === 0) return;
    const { created, failed } = await importInventoryProducts(scopeId, importPreview.products);
    setImportResult({ created: created.length, failed });
    setImportText('');
    if (failed === 0) setImportOpen(false);
    reload();
  };

  const handleExport = () => {
    downloadCsv(`inventory-${scopeId ?? 'products'}.csv`, productsToCsv(products));
  };

  const priceDisplay = (p: InventoryProduct) => {
    if (p.hasVariants && p.priceRange) {
      return p.priceRange.min === p.priceRange.max ? peso(p.priceRange.min) : `${peso(p.priceRange.min)} – ${peso(p.priceRange.max)}`;
    }
    return peso(p.unitPrice);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600 mt-1">
            Products available to attach to bookings and storefront listings for this account.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canMutate && (
            <Button variant="outline" onClick={() => setSkuSettingsOpen(true)}>
              <IconSettings className="w-4 h-4" /> SKU settings
            </Button>
          )}
          {can('inventory.import') && canMutate && (
            <Button variant="outline" onClick={() => { setImportResult(null); setImportOpen(true); }}>
              <IconUpload className="w-4 h-4" /> Import
            </Button>
          )}
          {can('inventory.export') && (
            <Button variant="outline" onClick={handleExport} disabled={products.length === 0}>
              <IconDownload className="w-4 h-4" /> Export
            </Button>
          )}
          {can('inventory.create') && canMutate && (
            <Button onClick={openCreate}>
              <IconPlus className="w-4 h-4" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Storefront upsell — compact banner, never louder than the Add Product CTA */}
      <StorefrontUpsell scopeId={scopeId} navigate={navigate} />

      {loadError ? (
        <Card>
          <CardContent className="py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <IconAlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Inventory could not be loaded</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{loadError}</p>
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={reload}><IconRefresh className="w-4 h-4" /> Retry</Button>
            </div>
          </CardContent>
        </Card>
      ) : loadingProducts ? (
        <Card>
          <CardContent className="py-16 px-6 text-center text-sm text-gray-500">Loading products…</CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <IconPackage className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No products yet</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Add your first product to start attaching items to bulk bookings and storefront listings.
            </p>
            {can('inventory.create') && canMutate && (
              <div className="flex justify-center mt-6">
                <Button onClick={openCreate}><IconPlus className="w-4 h-4" /> Add Product</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const statusMeta = STATUS_META[p.status];
                return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {p.coverImageUrl
                          ? <img src={p.coverImageUrl} alt="" className="w-full h-full object-cover" />
                          : <IconPackage className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 block truncate">{p.name}</span>
                        {p.hasVariants && <span className="text-xs text-gray-400">Has variants</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500">{p.sku}</TableCell>
                  <TableCell className="text-gray-500">{p.category}</TableCell>
                  <TableCell className="text-gray-700">{priceDisplay(p)}</TableCell>
                  <TableCell>
                    {p.unlimitedStock ? (
                      <span className="text-gray-700">Unlimited</span>
                    ) : (
                      <>
                        <span className="text-gray-700">{p.stockQuantity}</span>
                        {isLowStock(p) && <Badge variant="warning" className="ml-2">Low</Badge>}
                        {p.stockStatus === 'out_of_stock' && <Badge variant="danger" className="ml-2">Out</Badge>}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {p.status === 'active' && (
                        <button
                          onClick={() => shareProduct(p)}
                          title="Copy checkout link"
                          aria-label={`Share ${p.name}`}
                          className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                        >
                          <IconShare2 className="w-4 h-4" />
                        </button>
                      )}
                      {can('inventory.edit') && canMutate && (
                        <button
                          onClick={() => openEdit(p)}
                          title="Edit product"
                          aria-label={`Edit ${p.name}`}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          <IconPencil className="w-4 h-4" />
                        </button>
                      )}
                      {can('inventory.delete') && canMutate && (
                        <button
                          onClick={() => setDeleting(p)}
                          title="Delete product"
                          aria-label={`Delete ${p.name}`}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create / edit dialog — keyed so it resets per open. */}
      {formOpen && scopeId && (
        <ProductFormDialog
          key={editingId ?? 'new'}
          open={formOpen}
          mode={editingId ? 'edit' : 'create'}
          productId={editingId ?? undefined}
          scopeId={scopeId}
          onClose={() => { setFormOpen(false); setEditingId(null); }}
          onSaved={reload}
        />
      )}

      {/* SKU settings dialog */}
      {scopeId && (
        <Dialog open={skuSettingsOpen} onClose={() => setSkuSettingsOpen(false)} title="SKU settings" size="md">
          <SkuSettingsPanel scopeId={scopeId} onSaved={() => setSkuSettingsOpen(false)} />
        </Dialog>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete product?"
        description={deleting ? `"${deleting.name}" (${deleting.sku}) will be removed from this account's inventory.` : ''}
        confirmLabel="Delete"
        variant="destructive"
      />

      {/* Import dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import products" size="lg">
        <p className="text-sm text-gray-500 mb-3">
          Paste CSV or tab-separated rows. The first line is a header; <strong>name</strong> and
          <strong> sku</strong> are required. Optional columns: category, description, unitPrice, weight,
          length, width, height, stockQuantity, lowStockThreshold, status.
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={7}
          placeholder={'name,sku,category,unitPrice,stockQuantity,status\nDesk Lamp,LAMP-001,Home,750,40,active'}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {importPreview && (
          <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm">
            <p className="text-gray-700">
              <span className="font-semibold text-gray-900">{importPreview.products.length}</span> product
              {importPreview.products.length === 1 ? '' : 's'} ready to import.
            </p>
            {importPreview.errors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {importPreview.errors.map((err, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                    <IconInfoCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{err}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {importResult && (
          <p className={`mt-2 text-xs ${importResult.failed > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            Imported {importResult.created} product{importResult.created === 1 ? '' : 's'}.
            {importResult.failed > 0 && ` ${importResult.failed} row${importResult.failed === 1 ? '' : 's'} failed (e.g. a duplicate SKU) — fix and re-paste them to retry.`}
          </p>
        )}
        <div className="flex gap-2.5 justify-end pt-4 mt-3 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!importPreview || importPreview.products.length === 0}
            onClick={handleImport}
          >
            Import {importPreview && importPreview.products.length > 0 ? `${importPreview.products.length} ` : ''}products
          </Button>
        </div>
      </Dialog>

      {/* Share-link toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] max-w-sm">
          <div className="flex items-start gap-2.5 rounded-xl bg-gray-900 text-white shadow-xl px-4 py-3">
            <IconShare2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StorefrontUpsell({
  scopeId,
  navigate,
}: {
  scopeId: string | undefined;
  navigate: (path: string) => void;
}) {
  const sf = getFeatureStateSync('storefront', scopeId);
  if (sf.enabled && sf.configured) {
    // Already set up — compact link to manage.
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm">
        <IconBuildingStore className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="text-blue-900 flex-1">Your inventory products can be published to your storefront.</span>
        <button
          type="button"
          onClick={() => navigate('/dashboard/storefront')}
          className="font-medium text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
        >
          Manage storefront →
        </button>
      </div>
    );
  }
  if (sf.enabled) {
    // Enabled but not yet configured.
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm">
        <IconBuildingStore className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="text-blue-900 flex-1">Storefront is enabled — finish setup to list your inventory products publicly.</span>
        <button
          type="button"
          onClick={() => navigate('/dashboard/storefront')}
          className="font-medium text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
        >
          Set up storefront →
        </button>
      </div>
    );
  }
  // Not enabled — teaser.
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm">
      <IconBuildingStore className="w-4 h-4 text-blue-500 flex-shrink-0" />
      <span className="text-blue-900 flex-1">Publish your inventory to a customer-facing storefront with Cash on Delivery.</span>
      <button
        type="button"
        onClick={() => navigate('/dashboard/account-add-ons')}
        className="font-medium text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
      >
        Enable Storefront →
      </button>
    </div>
  );
}
