import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  IconBuildingStore, IconShoppingCart, IconPackage, IconCheck, IconAdjustmentsHorizontal,
  IconX, IconBrandFacebook, IconBrandInstagram, IconBrandTiktok, IconWorld, IconSparkles, IconEye,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { PriceRangeSlider } from '../components/ui/PriceRangeSlider';
import { SearchInput } from '../components/SearchInput';
import {
  getPublicStore, getPublicStoreProducts, getPublicStoreHomepage,
  type PublicStorefront, type PublicProductSummary, type PublicProductSort,
  type PublicHomepageSection, type PublicHeroBanner,
} from '../services/publicStorefrontService';
import { getServiceTypeLabel, type ServiceTypeKey } from '../data/serviceTypes';
import { addToCart, useCartItems, setCartSeller } from '../lib/cartStore';
import { getSaleInfo } from '../lib/salePricing';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SORT_OPTIONS: { value: PublicProductSort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

interface Filters {
  search: string;
  category: string; // '' = all
  sort: PublicProductSort;
  minPrice: string;
  maxPrice: string;
}

const DEFAULT_FILTERS: Filters = { search: '', category: '', sort: 'featured', minPrice: '', maxPrice: '' };

function hasActiveFilters(f: Filters): boolean {
  return !!f.search || !!f.category || f.sort !== 'featured' || !!f.minPrice || !!f.maxPrice;
}

/** A product's own `unitPrice` for a base product, or its variant range's
 * bounds — used both for the price-slider's min/max and per-product sorting
 * elsewhere; never a fabricated single number for a ranged product. */
function priceBoundsOf(p: PublicProductSummary): [number, number] {
  return p.hasVariants && p.priceRange ? [p.priceRange.min, p.priceRange.max] : [p.unitPrice, p.unitPrice];
}

/** Grid/New-Arrivals price label — a variant-carrying product shows its real
 * price range (or a single price when every variant happens to cost the
 * same), never a fabricated "from" price for a single-price product. */
function priceLabel(p: PublicProductSummary): string {
  if (p.hasVariants && p.priceRange) {
    return p.priceRange.min === p.priceRange.max ? peso(p.priceRange.min) : `From ${peso(p.priceRange.min)}`;
  }
  return peso(p.unitPrice);
}

const SOCIAL_LINKS: { key: 'facebook' | 'instagram' | 'tiktok' | 'website'; icon: typeof IconWorld; label: string }[] = [
  { key: 'facebook', icon: IconBrandFacebook, label: 'Facebook' },
  { key: 'instagram', icon: IconBrandInstagram, label: 'Instagram' },
  { key: 'tiktok', icon: IconBrandTiktok, label: 'TikTok' },
  { key: 'website', icon: IconWorld, label: 'Website' },
];

/**
 * Public customer-facing storefront at /shop/:slug. Renders real merchant
 * branding, a searchable/filterable product grid, and a computed "New
 * Arrivals" row — all backed by the real, unauthenticated Commerce BFF
 * (`publicStorefrontService.ts`). This same page also serves as the
 * merchant's own unpublished-store preview (an amber banner appears when
 * `publishStatus !== 'published'` — though the public routes themselves only
 * ever resolve a published store, so an unpublished preview is only reachable
 * by a merchant who reaches this page with a still-cached/prior successful
 * load; a genuinely unpublished/unknown slug 404s exactly like the backend).
 *
 * Merchant-curated homepage sections (a `collection` section renders that
 * collection's own products; a `new_arrivals` section renders the
 * client-computed newest-first slice) and hero banners render in the exact
 * order/enabled-state the merchant configured in Storefront admin, via
 * `getPublicStoreHomepage` — see that function's docblock for what the
 * backend already filters out (disabled, invisible-collection, expired).
 */
export function StorefrontPreview() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [storeLoading, setStoreLoading] = useState(true);
  const [store, setStore] = useState<PublicStorefront | null>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [products, setProducts] = useState<PublicProductSummary[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [allProducts, setAllProducts] = useState<PublicProductSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [catalogEmpty, setCatalogEmpty] = useState(false);

  const [homepageSections, setHomepageSections] = useState<PublicHomepageSection[]>([]);
  const [heroBanners, setHeroBanners] = useState<PublicHeroBanner[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const cartItems = useCartItems();
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  // Branding.
  useEffect(() => {
    let active = true;
    setStoreLoading(true);
    getPublicStore(slug ?? '')
      .then((s) => { if (active) setStore(s); })
      .finally(() => { if (active) setStoreLoading(false); });
    return () => { active = false; };
  }, [slug]);

  // Unfiltered baseline: powers homepage sections (a "new_arrivals" section
  // computes its own newest-first slice client-side, no dedicated endpoint —
  // per docs/commerce/COMMERCE_IMPLEMENTATION_CHECKPOINT.md; a "collection"
  // section resolves its productIds against this same list), the category
  // filter's option list, and real cart-seller attribution (the public
  // branding read never exposes accountId, but every product row does — see
  // publicStorefrontService.ts).
  useEffect(() => {
    if (!store || !slug) return;
    let active = true;
    Promise.all([
      getPublicStoreProducts(slug, { sort: 'newest' }),
      getPublicStoreHomepage(slug),
    ]).then(([all, homepage]) => {
      if (!active) return;
      setAllProducts(all);
      setCategories(Array.from(new Set(all.map((p) => p.category))).filter(Boolean).sort());
      setCatalogEmpty(all.length === 0);
      setHomepageSections(homepage.sections);
      setHeroBanners(homepage.banners);
      setBannerIndex(0);
      if (all[0]) setCartSeller({ scopeId: all[0].accountId, storeName: store.storeName, slug: store.slug });
    });
    return () => { active = false; };
  }, [store, slug]);

  // Simple auto-advance for the hero banner carousel — pauses itself when
  // there's only 0 or 1 banner (nothing to advance to).
  useEffect(() => {
    if (heroBanners.length < 2) return;
    const t = window.setInterval(() => setBannerIndex((i) => (i + 1) % heroBanners.length), 6000);
    return () => window.clearInterval(t);
  }, [heroBanners.length]);

  // Filtered grid — every filter is a real server-side query param
  // (`listPublicStorefrontProducts`), never client-computed.
  useEffect(() => {
    if (!store || !slug) return;
    let active = true;
    setProductsLoading(true);
    const t = window.setTimeout(() => {
      getPublicStoreProducts(slug, {
        search: filters.search,
        category: filters.category || undefined,
        sort: filters.sort,
        minPrice: filters.minPrice.trim() ? Number(filters.minPrice) : undefined,
        maxPrice: filters.maxPrice.trim() ? Number(filters.maxPrice) : undefined,
      })
        .then((list) => { if (active) setProducts(list); })
        .finally(() => { if (active) setProductsLoading(false); });
    }, filters.search ? 300 : 0);
    return () => { active = false; window.clearTimeout(t); };
  }, [store, slug, filters.search, filters.category, filters.sort, filters.minPrice, filters.maxPrice]);

  // Price-slider bounds, derived from the real (unfiltered) catalog — never a
  // fabricated/static range. A slider needs a stable [min, max] to render
  // meaningfully, so this is computed once per catalog load, not per filter
  // change (the slider's own selected range lives in `filters`).
  const priceBounds = (() => {
    if (allProducts.length === 0) return { min: 0, max: 0 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of allProducts) {
      const [pLo, pHi] = priceBoundsOf(p);
      if (pLo < lo) lo = pLo;
      if (pHi > hi) hi = pHi;
    }
    return { min: Math.floor(lo), max: Math.ceil(hi) };
  })();
  const [draftPriceRange, setDraftPriceRange] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    setDraftPriceRange([
      filters.minPrice.trim() ? Number(filters.minPrice) : priceBounds.min,
      filters.maxPrice.trim() ? Number(filters.maxPrice) : priceBounds.max,
    ]);
    // Re-sync whenever the catalog's bounds resolve or a filter is cleared —
    // deliberately NOT on every keystroke of a drag (that's `onChange` below,
    // which only updates the live label until the drag commits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.minPrice, filters.maxPrice, priceBounds.min, priceBounds.max]);

  if (storeLoading) return null;

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <IconBuildingStore className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Store not available</h1>
          <p className="text-sm text-gray-500 mt-1">This storefront link is invalid or no longer active.</p>
        </div>
      </div>
    );
  }

  const accentStyle = store.accentColor ? { backgroundColor: store.accentColor } : undefined;
  const socialEntries = SOCIAL_LINKS.filter((s) => !!store.social[s.key]);

  const productsById = new Map(allProducts.map((p) => [p.id, p]));
  const resolvedSections = homepageSections
    .map((s) => ({
      id: s.id,
      anchorId: s.sectionType === 'collection' && s.collection ? `section-collection-${s.collection.id}` : `section-${s.id}`,
      title: s.title,
      products: s.sectionType === 'new_arrivals'
        ? allProducts.slice(0, 8)
        : (s.collection?.productIds ?? []).map((id) => productsById.get(id)).filter((p): p is PublicProductSummary => !!p),
    }))
    .filter((s) => s.products.length > 0);

  const activeBanner = heroBanners[bannerIndex];
  function resolveBannerHref(banner: PublicHeroBanner): string | null {
    if (banner.ctaType === 'external_url') return banner.ctaExternalUrl;
    if (banner.ctaType === 'product' && banner.ctaTargetId) {
      const product = productsById.get(banner.ctaTargetId);
      return product ? `/shop/${slug}/product/${product.slug}` : null;
    }
    if (banner.ctaType === 'collection' && banner.ctaTargetId) return `#section-collection-${banner.ctaTargetId}`;
    // 'category' has its own click handler below (filters the grid, no URL
    // to link to). 'promotion' has no public landing page yet — the CTA is
    // shown as inert text rather than a dead link.
    return null;
  }
  // A 'category' CTA has no page of its own to link to — it filters the
  // existing "All products" grid and scrolls the buyer to it, the same
  // outcome a manual category-filter selection produces.
  function activateCategoryBanner(banner: PublicHeroBanner) {
    if (banner.ctaType !== 'category' || !banner.ctaTargetId) return;
    setFilters((f) => ({ ...f, category: banner.ctaTargetId ?? '' }));
    document.getElementById('all-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const filterPanel = (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1.5 block">Category</label>
        <Select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1.5 block">Price range</label>
        <PriceRangeSlider
          min={priceBounds.min}
          max={priceBounds.max}
          value={draftPriceRange}
          onChange={setDraftPriceRange}
          onCommit={([lo, hi]) => setFilters((f) => ({ ...f, minPrice: String(lo), maxPrice: String(hi) }))}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1.5 block">Sort by</label>
        <Select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as PublicProductSort }))}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>
      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters(DEFAULT_FILTERS)}>
          <IconX className="w-3.5 h-3.5" /> Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Store header */}
      <header className="bg-white border-b border-gray-200">
        {accentStyle && <div className="h-1 w-full" style={accentStyle} />}
        <div className="max-w-6xl mx-auto px-6 py-8">
          {cartCount > 0 && (
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => navigate(`/shop/${slug}/cart`)}
                className="relative inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <IconShoppingCart className="w-4 h-4" />
                View cart
                <span
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={accentStyle ?? { backgroundColor: '#2563eb' }}
                >
                  {cartCount}
                </span>
              </button>
            </div>
          )}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={accentStyle ?? { backgroundColor: '#2563eb' }}>
              {store.logoUrl
                ? <img src={store.logoUrl} alt={store.storeName} className="w-full h-full object-cover" />
                : <IconBuildingStore className="w-7 h-7 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{store.storeName}</h1>
              {store.description && <p className="text-gray-600 mt-1 max-w-2xl">{store.description}</p>}
              {store.deliveryOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-1">Delivery</span>
                  {store.deliveryOptions.map((o) => (
                    <Badge key={o} variant="outline">{getServiceTypeLabel(o as ServiceTypeKey)}</Badge>
                  ))}
                </div>
              )}
              {socialEntries.length > 0 && (
                <div className="flex items-center gap-3 mt-3">
                  {socialEntries.map(({ key, icon: Icon, label }) => (
                    <a
                      key={key}
                      href={store.social[key] ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Hero banners — merchant-configured, enabled + in-date-window only
            (already filtered server-side). Auto-advances every 6s when there's
            more than one; dots let a visitor jump directly. */}
        {activeBanner && (
          <section className="relative rounded-2xl overflow-hidden bg-gray-100">
            <BannerSlide
              banner={activeBanner}
              href={resolveBannerHref(activeBanner)}
              onActivate={activeBanner.ctaType === 'category' ? () => activateCategoryBanner(activeBanner) : undefined}
              accentStyle={accentStyle}
            />
            {heroBanners.length > 1 && (
              <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5">
                {heroBanners.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-label={`Show banner ${i + 1}`}
                    onClick={() => setBannerIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${i === bannerIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Merchant-curated homepage sections — "collection" renders that
            collection's products, "new_arrivals" is client-computed. Rendered
            in exactly the order/title the merchant configured. */}
        {resolvedSections.map((section) => (
          <section key={section.id} id={section.anchorId}>
            <div className="flex items-center gap-2 mb-3">
              <IconSparkles className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {section.products.map((p) => (
                <Link
                  key={p.id}
                  to={`/shop/${slug}/product/${p.slug}`}
                  className="flex-shrink-0 w-40"
                >
                  <div className="h-28 w-40 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
                    {p.coverImageUrl
                      ? <img src={p.coverImageUrl} alt={p.name} className="w-full h-full object-cover" />
                      : <IconPackage className="w-8 h-8 text-gray-300" />}
                  </div>
                  <p className="text-xs font-medium text-gray-900 mt-1.5 leading-snug line-clamp-2">{p.name}</p>
                  <p className="text-xs font-semibold text-gray-700">{priceLabel(p)}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {/* Browse + filter */}
        <section id="all-products">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">All products</h2>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <IconAdjustmentsHorizontal className="w-4 h-4" />
              Filters
              {hasActiveFilters(filters) && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
            {/* Desktop filter panel */}
            <aside className="hidden lg:block">
              <Card>
                <CardContent className="p-4">
                  <div className="mb-3">
                    <SearchInput value={filters.search} onChange={(v) => setFilters((f) => ({ ...f, search: v }))} placeholder="Search products…" />
                  </div>
                  {filterPanel}
                </CardContent>
              </Card>
            </aside>

            <div>
              <div className="lg:hidden mb-4">
                <SearchInput value={filters.search} onChange={(v) => setFilters((f) => ({ ...f, search: v }))} placeholder="Search products…" />
              </div>

              {productsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-64 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <IconPackage className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      {catalogEmpty ? 'No products are listed in this store yet.' : 'No products match your filters.'}
                    </p>
                    {!catalogEmpty && hasActiveFilters(filters) && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilters(DEFAULT_FILTERS)}>
                        Clear filters
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                (() => {
                  // Available-first grouping (no separate Availability filter
                  // any more — unavailable products stay discoverable, just
                  // never compete with purchasable inventory, regardless of
                  // the selected sort). Each group keeps the server's own
                  // sort order; only the grouping itself is client-side.
                  const availableProducts = products.filter((p) => p.stockStatus !== 'out_of_stock');
                  const unavailableProducts = products.filter((p) => p.stockStatus === 'out_of_stock');
                  const renderCard = (p: PublicProductSummary) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      slug={slug ?? ''}
                      justAdded={justAddedId === p.id}
                      accentStyle={accentStyle}
                      onAdd={() => {
                        addToCart({
                          productId: p.id,
                          quantity: 1,
                          productSnapshot: {
                            name: p.name, unitPrice: p.unitPrice, images: p.coverImageUrl ? [p.coverImageUrl] : [], category: p.category, sku: p.sku,
                            compareAtPrice: p.compareAtPrice,
                            stockQuantity: p.stockQuantity,
                            unlimitedStock: p.unlimitedStock,
                          },
                        });
                        setJustAddedId(p.id);
                        setTimeout(() => setJustAddedId(null), 2000);
                      }}
                    />
                  );
                  return (
                    <>
                      {availableProducts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                          {availableProducts.map(renderCard)}
                        </div>
                      )}
                      {unavailableProducts.length > 0 && (
                        <div className={availableProducts.length > 0 ? 'mt-8' : ''}>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-px flex-1 bg-gray-200" />
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Available again soon</span>
                            <div className="h-px flex-1 bg-gray-200" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {unavailableProducts.map(renderCard)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-gray-400">
          Powered by GoGo Xpress · Orders are Cash on Delivery and booked for delivery by the seller.
        </p>
      </main>

      {mobileFiltersOpen && (
        <MobileFilterDrawer onClose={() => setMobileFiltersOpen(false)}>
          {filterPanel}
        </MobileFilterDrawer>
      )}
    </div>
  );
}

function ProductCard({
  product: p, slug, onAdd, justAdded, accentStyle,
}: {
  product: PublicProductSummary;
  slug: string;
  onAdd: () => void;
  justAdded: boolean;
  accentStyle?: { backgroundColor: string };
}) {
  const outOfStock = p.stockStatus === 'out_of_stock';
  const lowStock = p.stockStatus === 'low_stock';
  // A variant-carrying product shows a price range, which doesn't map onto a
  // single before/after sale pair — sale presentation is base-product only.
  const sale = !p.hasVariants ? getSaleInfo(p.unitPrice, p.compareAtPrice) : null;
  const gridPriceLabel = p.hasVariants && p.priceRange
    ? (p.priceRange.min === p.priceRange.max ? peso(p.priceRange.min) : `${peso(p.priceRange.min)} – ${peso(p.priceRange.max)}`)
    : peso(p.unitPrice);
  const productHref = `/shop/${slug}/product/${p.slug}`;

  return (
    <Card className="flex flex-col overflow-hidden">
      <Link to={productHref} className="flex flex-col flex-1">
        <div className="h-36 bg-gray-100 flex items-center justify-center overflow-hidden">
          {p.coverImageUrl
            ? <img src={p.coverImageUrl} alt={p.name} className="w-full h-full object-cover" />
            : <IconPackage className="w-10 h-10 text-gray-300" />}
        </div>
        <CardContent className="p-4 flex-1 flex flex-col">
          <p className="text-xs text-gray-400">{p.category}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 leading-snug">{p.name}</p>
          <div className="flex items-center gap-2 mt-1">
            {outOfStock
              ? <Badge variant="danger">Out of stock</Badge>
              : lowStock
                ? <Badge variant="warning">Low stock</Badge>
                : <Badge variant="success">In stock</Badge>}
            {p.hasVariants && <Badge variant="outline">Options</Badge>}
          </div>
          <div className="mt-auto pt-3">
            {sale ? (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-base font-bold text-gray-900">{peso(p.unitPrice)}</span>
                  <span className="text-xs text-gray-400 line-through">{peso(p.compareAtPrice!)}</span>
                </div>
                <Badge variant="danger" className="mt-1">{sale.percentOff}% OFF</Badge>
              </>
            ) : (
              <p className="text-base font-bold text-gray-900">{gridPriceLabel}</p>
            )}
          </div>
        </CardContent>
      </Link>
      <div className="px-4 pb-4 flex items-center gap-2">
        <Link
          to={productHref}
          aria-label="View product"
          title="View product"
          className="inline-flex items-center justify-center w-9 h-9 flex-shrink-0 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
        >
          <IconEye className="w-4 h-4" />
        </Link>
        {p.hasVariants ? (
          <Link
            to={productHref}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium h-9 transition-colors"
          >
            View options
          </Link>
        ) : outOfStock ? (
          <button
            type="button" disabled
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-sm font-medium h-9 cursor-not-allowed"
          >
            Out of stock
          </button>
        ) : justAdded ? (
          <button
            type="button" disabled
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 text-white text-sm font-medium h-9 cursor-default"
          >
            <IconCheck className="w-4 h-4" />
            Added!
          </button>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            style={accentStyle}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium h-9 transition-colors"
          >
            <IconShoppingCart className="w-4 h-4" />
            Add to cart
          </button>
        )}
      </div>
    </Card>
  );
}

function BannerSlide({
  banner, href, onActivate, accentStyle,
}: {
  banner: PublicHeroBanner;
  href: string | null;
  /** For CTA types with no page/anchor of their own (e.g. 'category') —
   * filters + scrolls instead of navigating. */
  onActivate?: () => void;
  accentStyle?: { backgroundColor: string };
}) {
  const content = (
    <>
      <picture>
        <source media="(max-width: 640px)" srcSet={banner.mobileImageUrl ?? banner.desktopImageUrl} />
        <img src={banner.desktopImageUrl} alt={banner.headline} className="w-full h-40 sm:h-64 object-cover" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex flex-col justify-end p-5 sm:p-8">
        <h3 className="text-white text-lg sm:text-2xl font-bold max-w-lg">{banner.headline}</h3>
        {banner.supportingText && <p className="text-white/90 text-sm mt-1 max-w-lg">{banner.supportingText}</p>}
        {banner.ctaLabel && (href || onActivate) && (
          <span
            className="inline-flex items-center gap-1.5 mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white w-fit"
            style={accentStyle ?? { backgroundColor: '#2563eb' }}
          >
            {banner.ctaLabel}
          </span>
        )}
      </div>
    </>
  );
  if (onActivate) {
    return <button type="button" onClick={onActivate} className="relative block w-full text-left">{content}</button>;
  }
  if (!href) return <div className="relative">{content}</div>;
  if (/^https?:\/\//i.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="relative block">{content}</a>;
  }
  return <a href={href} className="relative block">{content}</a>;
}

function MobileFilterDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  // Focus management: remember whatever had focus (the "Filters" trigger),
  // move focus into the drawer, and restore it on close — same pattern as
  // `ReadyRowsDrawer.tsx`. Without this, opening the drawer left focus on the
  // obscured trigger button despite `aria-modal="true"`.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      if (previouslyFocusedRef.current instanceof HTMLElement) previouslyFocusedRef.current.focus();
    };
  }, []);

  // Escape closes the drawer; Tab is trapped inside it while open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />
      <div ref={panelRef} className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl p-5 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Filters</h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
        {children}
        <Button className="w-full mt-5" onClick={onClose}>Show results</Button>
      </div>
    </div>
  );
}
