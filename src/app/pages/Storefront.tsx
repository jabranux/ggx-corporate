import { useEffect, useState } from 'react';
import {
  IconBuildingStore, IconWorld, IconMail, IconPhone, IconAlertTriangle,
  IconPencil, IconPackage, IconExternalLink, IconPlus, IconTrash,
  IconChevronUp, IconChevronDown, IconLayoutGrid, IconStack2, IconPhoto,
  IconBrandFacebook, IconBrandInstagram, IconBrandTiktok, IconLink,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { Switch } from '../components/ui/Switch';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { EnablementGate } from '../components/EnablementGate';
import { StorefrontProfileDialog } from '../components/StorefrontProfileDialog';
import { StorefrontProductsDialog } from '../components/StorefrontProductsDialog';
import { ProductPickerDialog } from '../components/ProductPickerDialog';
import { StorefrontCollectionDialog } from '../components/StorefrontCollectionDialog';
import { StorefrontHomepageSectionDialog } from '../components/StorefrontHomepageSectionDialog';
import { StorefrontBannerDialog } from '../components/StorefrontBannerDialog';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { isFeatureUsable } from '../services/featureEnablementService';
import {
  getStorefrontProfile, ensureStorefrontProfile, getPendingOrderImpact,
  updateStorefrontProfile, setStorefrontStatus,
  getStorefrontProductIds, setStorefrontProducts,
  listCollections, createCollection, updateCollection, deleteCollection, setCollectionProducts,
  listHomepageSections, createHomepageSection, updateHomepageSection, deleteHomepageSection, reorderHomepageSections,
  listHeroBanners, createHeroBanner, updateHeroBanner, deleteHeroBanner, reorderHeroBanners,
  STOREFRONT_PUBLISH_META, UNPUBLISH_MESSAGE,
  type StorefrontProfile, type PublishStatus, type OrderImpact, type StorefrontProfileInput,
  type Collection, type HomepageSection, type HeroBanner, type HeroBannerInput, type HeroBannerPatch,
} from '../services/storefrontService';
import { getInventoryProducts, getInventoryProductsByIds, isLowStock, type InventoryProduct } from '../services/inventoryService';
import { getServiceTypeLabel, type ServiceTypeKey } from '../data/serviceTypes';
import { getAccountNameById } from '../data/accounts';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Storefront — branding, publish lifecycle, product selection, collections,
 * homepage sections, and hero banners, scoped to the current account/
 * subaccount. Backed by the real Commerce BFF (`services/storefrontService.ts`)
 * — see docs/commerce/COMMERCE_IMPLEMENTATION_CHECKPOINT.md. Renders the
 * EnablementGate when Storefront isn't usable (disabled, needs setup,
 * requires Inventory first, or role-blocked).
 *
 * Unpublish never auto-cancels existing transactions; pending unpaid orders
 * / active deliveries trigger a warning + explicit confirmation. The public
 * customer-facing surface lives at /shop/:slug — real search/filter/collection/
 * banner rendering there is Phase 3 (out of scope for this page). See
 * docs/storefront_rules.md.
 */
export function Storefront() {
  const ctx = useModuleAccessContext();
  const scopeId = ctx.scopeAccountId;
  const can = (key: Parameters<typeof ctx.permissions.includes>[0]) => ctx.permissions.includes(key);
  const canMutate = !!scopeId;

  const [usable, setUsable] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<StorefrontProfile | null>(null);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [productIds, setProductIdsState] = useState<string[]>([]);
  const [listed, setListed] = useState<InventoryProduct[]>([]);
  const [impact, setImpact] = useState<OrderImpact>({ pendingUnpaidOrders: 0, activeDeliveries: 0 });
  const [status, setStatus] = useState<PublishStatus>('draft');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [bannersError, setBannersError] = useState<string | null>(null);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  const [confirmKind, setConfirmKind] = useState<'publish' | 'unpublish' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  const [collectionDialog, setCollectionDialog] = useState<{ collection?: Collection } | null>(null);
  const [collectionProductsFor, setCollectionProductsFor] = useState<Collection | null>(null);
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState<Collection | null>(null);

  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<HomepageSection | null>(null);

  const [bannerDialog, setBannerDialog] = useState<{ banner?: HeroBanner } | null>(null);
  const [deleteBannerTarget, setDeleteBannerTarget] = useState<HeroBanner | null>(null);

  // Resolve listed products from the selected product ids.
  const refreshListed = (ids: string[]) => {
    if (ids.length === 0) { setListed([]); return; }
    getInventoryProductsByIds(ids).then(setListed);
  };

  const loadCollections = (id: string) => {
    listCollections(id).then(setCollections).catch((err) => setCollectionsError(err instanceof Error ? err.message : 'Could not load collections.'));
  };
  const loadSections = (id: string) => {
    listHomepageSections(id).then(setSections).catch((err) => setSectionsError(err instanceof Error ? err.message : 'Could not load homepage sections.'));
  };
  const loadBanners = (id: string) => {
    listHeroBanners(id).then(setBanners).catch((err) => setBannersError(err instanceof Error ? err.message : 'Could not load hero banners.'));
  };

  useEffect(() => {
    let active = true;
    setInitError(null);
    isFeatureUsable('storefront', scopeId).then((ok) => {
      if (!active) return;
      setUsable(ok);
      if (!ok) return;
      Promise.all([
        getStorefrontProfile(scopeId),
        getPendingOrderImpact(scopeId),
        getInventoryProducts(scopeId),
        getStorefrontProductIds(scopeId),
      ]).then(async ([p, imp, inv, ids]) => {
        if (!active) return;
        let prof = p;
        if (!prof && scopeId) {
          prof = await ensureStorefrontProfile(scopeId, getAccountNameById(scopeId) ?? 'My Store');
        }
        if (!active) return;
        setProfile(prof);
        if (prof) setStatus(prof.publishStatus);
        setImpact(imp);
        setInventory(inv);
        setProductIdsState(ids);
        refreshListed(ids);
        if (scopeId) { loadCollections(scopeId); loadSections(scopeId); loadBanners(scopeId); }
      }).catch((err) => {
        // A failure here (e.g. Inventory's API erroring) previously left the
        // page silently stuck showing "Switch to a subaccount" — indistinguishable
        // from the legitimate consolidated-view state — with no error or retry.
        if (!active) return;
        setInitError(err instanceof Error ? err.message : 'Could not load this storefront. Please try again.');
      });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, initAttempt]);

  if (usable === null) return null;
  if (!usable) return <EnablementGate moduleId="storefront" />;

  if (initError) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storefront</h1>
          <p className="text-gray-600 mt-1">A simple storefront built from your inventory products.</p>
        </div>
        <Alert variant="destructive">
          {initError}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setInitAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Alert>
      </div>
    );
  }

  // profile can be null in the main-account consolidated view (scopeId=undefined):
  // storefront is a subaccount-level module and profiles are scoped per-subaccount.
  if (!profile) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storefront</h1>
          <p className="text-gray-600 mt-1">A simple storefront built from your inventory products.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <IconBuildingStore className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Switch to a subaccount to manage its storefront</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Storefronts are configured per subaccount. Select a subaccount from the switcher above to view or manage its storefront.
          </p>
        </div>
      </div>
    );
  }

  const meta = STOREFRONT_PUBLISH_META[status];
  const isPublished = status === 'published';
  const hasPendingImpact = impact.pendingUnpaidOrders > 0 || impact.activeDeliveries > 0;
  const hasNewArrivals = sections.some((s) => s.sectionType === 'new_arrivals');

  const onConfirmPublish = async () => {
    const next: PublishStatus = confirmKind === 'publish' ? 'published' : 'unpublished';
    if (scopeId) {
      try {
        const updated = await setStorefrontStatus(scopeId, next);
        setStatus(updated.publishStatus);
        setProfile(updated);
      } catch { /* keep prior status on failure */ }
    }
    setConfirmKind(null);
  };

  const handleSaveProfile = async (patch: StorefrontProfileInput) => {
    if (scopeId) {
      try {
        const updated = await updateStorefrontProfile(scopeId, patch);
        setProfile(updated);
        setEditOpen(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not save the profile.');
      }
    } else {
      setEditOpen(false);
    }
  };

  const handleSaveProducts = async (ids: string[]) => {
    if (scopeId) {
      try {
        const updated = await setStorefrontProducts(scopeId, ids);
        setProductIdsState(updated);
        refreshListed(updated);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not save the product selection.');
      }
    }
    setProductsOpen(false);
  };

  // ─── Collections ─────────────────────────────────────────────────────────

  const handleSaveCollection = async (input: Parameters<typeof createCollection>[1]) => {
    if (!scopeId) return;
    try {
      if (collectionDialog?.collection) {
        const updated = await updateCollection(scopeId, collectionDialog.collection.id, input);
        setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCollection(scopeId, input);
        setCollections((prev) => [...prev, created]);
      }
      setCollectionDialog(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the collection.');
    }
  };

  const handleDeleteCollection = async () => {
    if (!scopeId || !deleteCollectionTarget) return;
    try {
      await deleteCollection(scopeId, deleteCollectionTarget.id);
      setCollections((prev) => prev.filter((c) => c.id !== deleteCollectionTarget.id));
      setSections((prev) => prev.filter((s) => s.collectionId !== deleteCollectionTarget.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete the collection.');
    } finally {
      setDeleteCollectionTarget(null);
    }
  };

  const handleSaveCollectionProducts = async (ids: string[]) => {
    if (!scopeId || !collectionProductsFor) return;
    try {
      const updated = await setCollectionProducts(scopeId, collectionProductsFor.id, ids);
      setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the collection’s products.');
    } finally {
      setCollectionProductsFor(null);
    }
  };

  // ─── Homepage sections ───────────────────────────────────────────────────

  const handleAddSection = async (input: Parameters<typeof createHomepageSection>[1]) => {
    if (!scopeId) return;
    try {
      const created = await createHomepageSection(scopeId, input);
      setSections((prev) => [...prev, created]);
      setSectionDialogOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not add the section.');
    }
  };

  const toggleSectionEnabled = async (section: HomepageSection) => {
    if (!scopeId) return;
    try {
      const updated = await updateHomepageSection(scopeId, section.id, { enabled: !section.enabled });
      setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the section.');
    }
  };

  const handleDeleteSection = async () => {
    if (!scopeId || !deleteSectionTarget) return;
    try {
      await deleteHomepageSection(scopeId, deleteSectionTarget.id);
      setSections((prev) => prev.filter((s) => s.id !== deleteSectionTarget.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete the section.');
    } finally {
      setDeleteSectionTarget(null);
    }
  };

  const moveSection = async (index: number, delta: -1 | 1) => {
    if (!scopeId) return;
    const next = index + delta;
    if (next < 0 || next >= sections.length) return;
    const reordered = [...sections];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    setSections(reordered);
    try {
      const updated = await reorderHomepageSections(scopeId, reordered.map((s) => s.id));
      setSections(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not reorder sections.');
      loadSections(scopeId);
    }
  };

  // ─── Hero banners ────────────────────────────────────────────────────────

  const handleCreateBanner = async (input: HeroBannerInput) => {
    if (!scopeId) return;
    try {
      const created = await createHeroBanner(scopeId, input);
      setBanners((prev) => [...prev, created]);
      setBannerDialog(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create the banner.');
    }
  };

  const handleUpdateBanner = async (patch: HeroBannerPatch) => {
    if (!scopeId || !bannerDialog?.banner) return;
    try {
      const updated = await updateHeroBanner(scopeId, bannerDialog.banner.id, patch);
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setBannerDialog(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the banner.');
    }
  };

  const toggleBannerEnabled = async (banner: HeroBanner) => {
    if (!scopeId) return;
    try {
      const updated = await updateHeroBanner(scopeId, banner.id, { enabled: !banner.enabled });
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the banner.');
    }
  };

  const handleDeleteBanner = async () => {
    if (!scopeId || !deleteBannerTarget) return;
    try {
      await deleteHeroBanner(scopeId, deleteBannerTarget.id);
      setBanners((prev) => prev.filter((b) => b.id !== deleteBannerTarget.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete the banner.');
    } finally {
      setDeleteBannerTarget(null);
    }
  };

  const moveBanner = async (index: number, delta: -1 | 1) => {
    if (!scopeId) return;
    const next = index + delta;
    if (next < 0 || next >= banners.length) return;
    const reordered = [...banners];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    setBanners(reordered);
    try {
      const updated = await reorderHeroBanners(scopeId, reordered.map((b) => b.id));
      setBanners(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not reorder banners.');
      loadBanners(scopeId);
    }
  };

  const canConfigure = can('storefront.configure') && canMutate;
  const canManageProducts = can('storefront.manageProducts') && canMutate;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storefront</h1>
          <p className="text-gray-600 mt-1">
            A simple storefront built from your inventory products.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <a href={`/shop/${profile.slug}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">
              <IconExternalLink className="w-4 h-4" /> View storefront
            </Button>
          </a>
          {isPublished
            ? can('storefront.unpublish') && canMutate && (
                <Button size="sm" variant="outline" onClick={() => setConfirmKind('unpublish')}>Unpublish</Button>
              )
            : can('storefront.publish') && canMutate && (
                <Button size="sm" onClick={() => setConfirmKind('publish')}>Publish</Button>
              )}
        </div>
      </div>

      {/* Store profile */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {profile.logoUrl
                  ? <img src={profile.logoUrl} alt="" className="w-full h-full object-cover" />
                  : <IconBuildingStore className="w-5 h-5 text-gray-300" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">{profile.storeName}</h2>
                  {profile.accentColor && (
                    <span
                      title={profile.accentColor}
                      className="w-3.5 h-3.5 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: profile.accentColor }}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{profile.description}</p>
              </div>
            </div>
            {can('storefront.configure') && canMutate && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <IconPencil className="w-4 h-4" /> Edit profile
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field icon={IconWorld} label="Store URL">{`gogoxpress.shop/${profile.slug}`}</Field>
            <Field icon={IconMail} label="Contact email">{profile.contactEmail || '—'}</Field>
            <Field icon={IconPhone} label="Contact number">{profile.contactNumber || '—'}</Field>
            <Field icon={IconBuildingStore} label="Products listed">{`${productIds.length} from inventory`}</Field>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Delivery options</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.deliveryOptions.length === 0
                  ? <span className="text-sm text-gray-400">None selected</span>
                  : profile.deliveryOptions.map((o) => (
                      <Badge key={o} variant="outline">{getServiceTypeLabel(o as ServiceTypeKey)}</Badge>
                    ))}
              </div>
            </div>
            {(profile.social.facebook || profile.social.instagram || profile.social.tiktok || profile.social.website) && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Social</p>
                <div className="flex items-center gap-2.5">
                  {profile.social.facebook && <a href={profile.social.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600"><IconBrandFacebook className="w-4 h-4" /></a>}
                  {profile.social.instagram && <a href={profile.social.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600"><IconBrandInstagram className="w-4 h-4" /></a>}
                  {profile.social.tiktok && <a href={profile.social.tiktok} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600"><IconBrandTiktok className="w-4 h-4" /></a>}
                  {profile.social.website && <a href={profile.social.website} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600"><IconLink className="w-4 h-4" /></a>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="homepage">Homepage</TabsTrigger>
          <TabsTrigger value="banners">Hero banners</TabsTrigger>
        </TabsList>

        {/* ── Products ── */}
        <TabsContent value="products">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Listed products</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Products from your inventory shown on the storefront.</p>
                </div>
                {canManageProducts && (
                  <Button size="sm" variant="outline" onClick={() => setProductsOpen(true)}>
                    <IconPlus className="w-4 h-4" /> Manage products
                  </Button>
                )}
              </div>

              {listed.length === 0 ? (
                <div className="py-8 text-center">
                  <IconPackage className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No products listed yet.</p>
                  {canManageProducts && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setProductsOpen(true)}>
                      <IconPlus className="w-4 h-4" /> Add products
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {listed.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {p.coverImageUrl
                          ? <img src={p.coverImageUrl} alt="" className="w-full h-full object-cover" />
                          : <IconPackage className="w-4 h-4 text-gray-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          {p.status !== 'active' && <Badge variant="default">Inactive</Badge>}
                          {p.status === 'active' && isLowStock(p) && <Badge variant="warning">Low stock</Badge>}
                        </div>
                        <p className="text-xs text-gray-500">{p.sku}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{peso(p.unitPrice)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Collections ── */}
        <TabsContent value="collections">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Collections</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Group products for merchandising — custom, featured, or sale.</p>
                </div>
                {canConfigure && (
                  <Button size="sm" variant="outline" onClick={() => setCollectionDialog({})}>
                    <IconPlus className="w-4 h-4" /> New collection
                  </Button>
                )}
              </div>

              {collectionsError && <Alert variant="destructive" className="mb-3">{collectionsError}</Alert>}

              {collections.length === 0 ? (
                <div className="py-8 text-center">
                  <IconLayoutGrid className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No collections yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {collections.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <IconLayoutGrid className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                          <Badge variant="outline">{c.type}</Badge>
                          {!c.visible && <Badge variant="default">Hidden</Badge>}
                        </div>
                        <p className="text-xs text-gray-500">{c.productIds.length} product{c.productIds.length === 1 ? '' : 's'}</p>
                      </div>
                      {canConfigure && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Button size="sm" variant="outline" onClick={() => setCollectionProductsFor(c)}>Products</Button>
                          <Button size="sm" variant="ghost" onClick={() => setCollectionDialog({ collection: c })}><IconPencil className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteCollectionTarget(c)}><IconTrash className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Homepage sections ── */}
        <TabsContent value="homepage">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Homepage sections</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Order what shows on your storefront's home page.</p>
                </div>
                {canConfigure && (
                  <Button size="sm" variant="outline" onClick={() => setSectionDialogOpen(true)}>
                    <IconPlus className="w-4 h-4" /> Add section
                  </Button>
                )}
              </div>

              {sectionsError && <Alert variant="destructive" className="mb-3">{sectionsError}</Alert>}

              {sections.length === 0 ? (
                <div className="py-8 text-center">
                  <IconStack2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No homepage sections yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sections.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-col flex-shrink-0">
                        <button type="button" disabled={i === 0 || !canConfigure} onClick={() => moveSection(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                          <IconChevronUp className="w-4 h-4" />
                        </button>
                        <button type="button" disabled={i === sections.length - 1 || !canConfigure} onClick={() => moveSection(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                          <IconChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <IconStack2 className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                          <Badge variant="outline">{s.sectionType === 'new_arrivals' ? 'New Arrivals' : 'Collection'}</Badge>
                        </div>
                      </div>
                      {canConfigure && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Switch checked={s.enabled} onCheckedChange={() => toggleSectionEnabled(s)} aria-label={`Toggle ${s.title}`} />
                          <Button size="sm" variant="ghost" onClick={() => setDeleteSectionTarget(s)}><IconTrash className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Hero banners ── */}
        <TabsContent value="banners">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Hero banners</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Rotating banners shown at the top of your storefront home page.</p>
                </div>
                {canConfigure && (
                  <Button size="sm" variant="outline" onClick={() => setBannerDialog({})}>
                    <IconPlus className="w-4 h-4" /> New banner
                  </Button>
                )}
              </div>

              {bannersError && <Alert variant="destructive" className="mb-3">{bannersError}</Alert>}

              {banners.length === 0 ? (
                <div className="py-8 text-center">
                  <IconPhoto className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No hero banners yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {banners.map((b, i) => (
                    <div key={b.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-col flex-shrink-0">
                        <button type="button" disabled={i === 0 || !canConfigure} onClick={() => moveBanner(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                          <IconChevronUp className="w-4 h-4" />
                        </button>
                        <button type="button" disabled={i === banners.length - 1 || !canConfigure} onClick={() => moveBanner(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                          <IconChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="w-16 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        <img src={b.desktopImageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{b.headline}</p>
                        <p className="text-xs text-gray-500 truncate">{b.supportingText || (b.ctaType ? `CTA: ${b.ctaType}` : 'No call to action')}</p>
                      </div>
                      {canConfigure && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Switch checked={b.enabled} onCheckedChange={() => toggleBannerEnabled(b)} aria-label={`Toggle ${b.headline}`} />
                          <Button size="sm" variant="ghost" onClick={() => setBannerDialog({ banner: b })}><IconPencil className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteBannerTarget(b)}><IconTrash className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit profile dialog */}
      {editOpen && scopeId && (
        <StorefrontProfileDialog
          open={editOpen}
          profile={profile}
          scopeId={scopeId}
          onClose={() => setEditOpen(false)}
          onSubmit={handleSaveProfile}
        />
      )}

      {/* Manage products dialog */}
      {productsOpen && (
        <StorefrontProductsDialog
          open={productsOpen}
          products={inventory}
          selectedIds={productIds}
          onClose={() => setProductsOpen(false)}
          onConfirm={handleSaveProducts}
        />
      )}

      {/* Collection dialogs */}
      {collectionDialog && (
        <StorefrontCollectionDialog
          open={!!collectionDialog}
          collection={collectionDialog.collection}
          onClose={() => setCollectionDialog(null)}
          onSubmit={handleSaveCollection}
        />
      )}
      {collectionProductsFor && (
        <ProductPickerDialog
          open={!!collectionProductsFor}
          title={`Manage products — ${collectionProductsFor.name}`}
          description="Choose which storefront products belong to this collection."
          products={inventory}
          selectedIds={collectionProductsFor.productIds}
          onClose={() => setCollectionProductsFor(null)}
          onConfirm={handleSaveCollectionProducts}
        />
      )}

      {/* Homepage section dialog */}
      {sectionDialogOpen && (
        <StorefrontHomepageSectionDialog
          open={sectionDialogOpen}
          collections={collections}
          hasNewArrivals={hasNewArrivals}
          onClose={() => setSectionDialogOpen(false)}
          onSubmit={handleAddSection}
        />
      )}

      {/* Hero banner dialog */}
      {bannerDialog && scopeId && (
        <StorefrontBannerDialog
          open={!!bannerDialog}
          banner={bannerDialog.banner}
          scopeId={scopeId}
          products={inventory}
          collections={collections}
          onClose={() => setBannerDialog(null)}
          onCreate={handleCreateBanner}
          onUpdate={handleUpdateBanner}
        />
      )}

      <ConfirmDialog
        open={confirmKind === 'publish'}
        onClose={() => setConfirmKind(null)}
        onConfirm={onConfirmPublish}
        title="Publish storefront"
        description="Your storefront will become visible to customers and accept new orders."
        confirmLabel="Publish"
      />

      <ConfirmDialog
        open={confirmKind === 'unpublish'}
        onClose={() => setConfirmKind(null)}
        onConfirm={onConfirmPublish}
        title="Unpublish storefront"
        description={UNPUBLISH_MESSAGE}
        confirmLabel="Unpublish"
        variant="destructive"
      >
        {hasPendingImpact && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <IconAlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">This storefront has transactions in progress.</p>
              <p className="mt-0.5">
                {impact.pendingUnpaidOrders} pending unpaid order{impact.pendingUnpaidOrders === 1 ? '' : 's'} ·{' '}
                {impact.activeDeliveries} active deliver{impact.activeDeliveries === 1 ? 'y' : 'ies'}. These will
                continue until completed.
              </p>
            </div>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteCollectionTarget}
        onClose={() => setDeleteCollectionTarget(null)}
        onConfirm={handleDeleteCollection}
        title="Delete collection"
        description={`Delete "${deleteCollectionTarget?.name}"? Any homepage section referencing it will be removed too.`}
        confirmLabel="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!deleteSectionTarget}
        onClose={() => setDeleteSectionTarget(null)}
        onConfirm={handleDeleteSection}
        title="Delete homepage section"
        description={`Remove "${deleteSectionTarget?.title}" from your storefront home page?`}
        confirmLabel="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!deleteBannerTarget}
        onClose={() => setDeleteBannerTarget(null)}
        onConfirm={handleDeleteBanner}
        title="Delete hero banner"
        description={`Remove the "${deleteBannerTarget?.headline}" banner from your storefront?`}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}

function Field({
  icon: Icon, label, children,
}: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-1.5 text-gray-900 mt-1">
        <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span>{children}</span>
      </div>
    </div>
  );
}
