import { useEffect, useState } from 'react';
import {
  IconDiscount2, IconPlus, IconPencil, IconTrash, IconBuildingStore,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { Switch } from '../components/ui/Switch';
import { ConfirmDialog } from '../components/ui/Dialog';
import { EnablementGate } from '../components/EnablementGate';
import { PromotionDialog } from '../components/PromotionDialog';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { isFeatureUsable } from '../services/featureEnablementService';
import {
  listPromotions, createPromotion, updatePromotion, deletePromotion,
  type Promotion, type PromotionInput,
} from '../services/promotionsService';
import { getInventoryProducts, type InventoryProduct } from '../services/inventoryService';
import { listCollections, type Collection } from '../services/storefrontService';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function discountLabel(p: Promotion): string {
  return p.discountType === 'percentage' ? `${p.discountValue}% off` : `${peso(p.discountValue)} off`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Purely a display convenience — derived from dates already returned by the
 * server, never used to compute a discount or gate checkout. Validate/redeem
 * always re-check expiry/activity server-side regardless of what this shows. */
function timeframeLabel(p: Promotion): { label: string; variant: 'success' | 'warning' | 'default' | 'danger' } {
  if (p.status !== 'active') return { label: 'Inactive', variant: 'default' };
  const now = new Date();
  if (now < new Date(p.startDate)) return { label: 'Scheduled', variant: 'warning' };
  if (now > new Date(p.endDate)) return { label: 'Expired', variant: 'danger' };
  if (p.usageLimit != null && p.usageCount >= p.usageLimit) return { label: 'Limit reached', variant: 'danger' };
  return { label: 'Active', variant: 'success' };
}

/**
 * Commerce → Promotions — merchant admin for promo codes. Backed by the real
 * Commerce BFF (`services/promotionsService.ts`) — see
 * docs/commerce/COMMERCE_IMPLEMENTATION_CHECKPOINT.md. Create/edit shapes the
 * promotion's own rules (code, discount, date range, minimum order, usage
 * limit, product/collection eligibility); the actual discount MATH always
 * happens server-side at validate/redeem time (wired into the storefront
 * cart/checkout, see `CartReview.tsx`/`CartCheckout.tsx`), never here.
 *
 * Scoped like Storefront: promotions are configured per subaccount storefront,
 * so the Main Account's consolidated view (no concrete scope) can't manage
 * them directly — same "switch to a subaccount" prompt as `Storefront.tsx`.
 */
export function Promotions() {
  const ctx = useModuleAccessContext();
  const scopeId = ctx.scopeAccountId;
  const can = (key: Parameters<typeof ctx.permissions.includes>[0]) => ctx.permissions.includes(key);
  const canManage = can('storefront.managePromotions') && !!scopeId;

  const [usable, setUsable] = useState<boolean | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<{ promotion?: Promotion } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = (id: string) => {
    setLoadError(null);
    Promise.all([listPromotions(id), getInventoryProducts(id), listCollections(id)])
      .then(([promos, prods, cols]) => {
        setPromotions(promos);
        setProducts(prods);
        setCollections(cols);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load promotions.'));
  };

  useEffect(() => {
    let active = true;
    isFeatureUsable('storefront', scopeId).then((ok) => {
      if (!active) return;
      setUsable(ok);
      if (ok && scopeId) load(scopeId);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  if (usable === null) return null;
  if (!usable) return <EnablementGate moduleId="storefront" />;

  if (!scopeId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Promotions</h1>
          <p className="text-gray-600 mt-1">Promo codes for your storefront checkout.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <IconDiscount2 className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Switch to a subaccount to manage its promotions</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Promotions are configured per subaccount storefront. Select a subaccount from the switcher above to view or manage its promo codes.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async (input: PromotionInput) => {
    if (!scopeId) return;
    try {
      if (dialog?.promotion) {
        const updated = await updatePromotion(scopeId, dialog.promotion.id, input);
        setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createPromotion(scopeId, input);
        setPromotions((prev) => [created, ...prev]);
      }
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save the promotion.');
    }
  };

  const toggleActive = async (promo: Promotion) => {
    if (!scopeId) return;
    try {
      const updated = await updatePromotion(scopeId, promo.id, { status: promo.status === 'active' ? 'inactive' : 'active' });
      setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the promotion.');
    }
  };

  const handleDelete = async () => {
    if (!scopeId || !deleteTarget) return;
    try {
      await deletePromotion(scopeId, deleteTarget.id);
      setPromotions((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the promotion.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Promotions</h1>
          <p className="text-gray-600 mt-1">Promo codes buyers can apply at your storefront checkout.</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({})}>
            <IconPlus className="w-4 h-4" /> New promotion
          </Button>
        )}
      </div>

      {loadError && <Alert variant="destructive">{loadError}</Alert>}
      {actionError && (
        <Alert variant="destructive">
          <div className="flex items-center justify-between gap-3">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="text-xs font-medium underline flex-shrink-0">Dismiss</button>
          </div>
        </Alert>
      )}

      <Card>
        <CardContent className="p-6">
          {promotions.length === 0 ? (
            <div className="py-12 text-center">
              <IconDiscount2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No promotions yet.</p>
              {canManage && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setDialog({})}>
                  <IconPlus className="w-4 h-4" /> Create your first promotion
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {promotions.map((p) => {
                const tf = timeframeLabel(p);
                const scopeSummary = p.productIds.length === 0 && p.collectionIds.length === 0
                  ? 'Store-wide'
                  : [
                      p.productIds.length > 0 ? `${p.productIds.length} product${p.productIds.length === 1 ? '' : 's'}` : null,
                      p.collectionIds.length > 0 ? `${p.collectionIds.length} collection${p.collectionIds.length === 1 ? '' : 's'}` : null,
                    ].filter(Boolean).join(' · ');
                return (
                  <div key={p.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <IconDiscount2 className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 font-mono">{p.code}</p>
                        <Badge variant={tf.variant}>{tf.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.name} · {discountLabel(p)} · {scopeSummary}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(p.startDate)} – {formatDate(p.endDate)}
                        {p.minOrderAmount > 0 && ` · Min. order ${peso(p.minOrderAmount)}`}
                        {' · '}Used {p.usageCount}{p.usageLimit != null ? ` / ${p.usageLimit}` : ''}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch checked={p.status === 'active'} onCheckedChange={() => toggleActive(p)} aria-label={`Toggle ${p.code}`} />
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ promotion: p })}><IconPencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)}><IconTrash className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!canManage && scopeId && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <IconBuildingStore className="w-3.5 h-3.5" /> You have view-only access to promotions for this account.
        </div>
      )}

      {dialog && (
        <PromotionDialog
          open={!!dialog}
          promotion={dialog.promotion}
          products={products}
          collections={collections}
          onClose={() => setDialog(null)}
          onSubmit={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete promotion"
        description={`Delete the "${deleteTarget?.code}" promo code? Buyers will no longer be able to apply it at checkout.`}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
