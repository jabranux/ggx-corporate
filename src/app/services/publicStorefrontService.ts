/**
 * Public storefront service facade — the HTTP client behind the anonymous
 * buyer-facing `/shop/:slug` and `/shop/:slug/product/:productSlug` pages.
 *
 * Backed by GGX Corporate's real, unauthenticated Commerce BFF routes:
 * `GET /api/commerce/public/store/:slug`, `GET /api/commerce/public/store/:slug/products`,
 * `GET /api/commerce/public/store/:slug/product/:productSlug`
 * (implemented under `api/commerce/router.ts` + `api/_lib/commerceStorefront.ts` /
 * `commerceProducts.ts`). These routes take **no session/auth at all** — a
 * signed-out buyer with zero cookies gets the same response as a logged-in
 * merchant previewing their own store. Deliberately NOT built on the same
 * `request()` helper as `inventoryService.ts`/`storefrontService.ts`: those
 * dispatch `SESSION_EXPIRED_EVENT` on a 401 and are meant for authenticated
 * merchant-side calls. Nothing here ever fires that event — a 404 from these
 * routes just means "store not found" or "product not found" (the backend
 * 404s an unpublished/draft store or an inactive/unknown product the exact
 * same way, so existence is never leaked either way), handled as page-level
 * not-found state, not a session problem.
 *
 * Every function fails closed (null / empty array) on any network or server
 * error — never throws into a public page a signed-out buyer is looking at.
 *
 * A 4th public route, `GET /api/commerce/public/store/:slug/homepage`, backs
 * merchant-curated homepage sections and hero banners (`getPublicStoreHomepage`
 * below). It was added alongside this service to close a gap the original
 * checkpoint doc didn't anticipate: `commerce_collections`/`_homepage_sections`/
 * `_hero_banners` had no public-read path at all before this, only
 * session-authenticated merchant routes. The new route
 * (`getPublicStorefrontHomepage` in `api/_lib/commerceStorefront.ts`) only
 * ever returns `enabled` sections/banners for an already-published store,
 * drops a `collection` section whose target collection is missing or not
 * `visible`, and filters banners to their own start/end date window
 * server-side. "New Arrivals" sections still resolve with no product list of
 * their own (`collection: null`) — that type is a pure client-side
 * computation over the public product list (newest-first slice), not a
 * merchant-curated row — see `StorefrontPreview.tsx`.
 */

import type { ProductStatus, StockStatus, VariantStatus } from './inventoryService';

const COMMERCE_BASE = '/api/commerce';

// ─── Types (mirrors api/_lib/commerceStorefront.ts's public payload +
// api/_lib/commerceProducts.ts's ProductSummary/ProductDetail) ─────────────

export interface PublicStorefront {
  storeName: string;
  description: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
  deliveryOptions: string[];
  social: {
    facebook: string | null;
    instagram: string | null;
    tiktok: string | null;
    website: string | null;
  };
}

export interface PublicProductSummary {
  id: string;
  accountId: string;
  name: string;
  slug: string;
  category: string;
  status: ProductStatus;
  sku: string;
  hasVariants: boolean;
  unitPrice: number;
  compareAtPrice: number | null;
  priceRange: { min: number; max: number } | null;
  stockQuantity: number;
  lowStockThreshold: number;
  unlimitedStock: boolean;
  stockStatus: StockStatus;
  coverImageUrl: string | null;
}

export interface PublicProductImage {
  id: string;
  url: string;
  displayOrder: number;
  isCover: boolean;
}

export interface PublicOptionValue {
  id: string;
  value: string;
  skuFragment: string;
  displayOrder: number;
}

export interface PublicProductOption {
  id: string;
  name: string;
  displayOrder: number;
  values: PublicOptionValue[];
}

export interface PublicProductVariant {
  id: string;
  sku: string;
  priceOverride: number | null;
  compareAtPriceOverride: number | null;
  stockQuantity: number;
  unlimitedStock: boolean;
  status: VariantStatus;
  imageId: string | null;
  optionValueIds: string[];
  stockStatus: StockStatus;
}

export interface PublicProductDetail extends PublicProductSummary {
  description: string;
  weight: number | null;
  dimensions: { length: number | null; width: number | null; height: number | null };
  images: PublicProductImage[];
  options: PublicProductOption[];
  variants: PublicProductVariant[];
}

export type PublicProductSort = 'featured' | 'newest' | 'price_asc' | 'price_desc';
export type PublicAvailability = 'in_stock' | 'out_of_stock' | 'all';

export interface PublicHomepageSection {
  id: string;
  title: string;
  sectionType: 'collection' | 'new_arrivals';
  collection: { id: string; name: string; slug: string; type: 'custom' | 'featured' | 'sale'; productIds: string[] } | null;
}

export interface PublicHeroBanner {
  id: string;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  headline: string;
  supportingText: string | null;
  ctaLabel: string | null;
  ctaType: 'product' | 'category' | 'collection' | 'promotion' | 'external_url' | null;
  ctaTargetId: string | null;
  ctaExternalUrl: string | null;
}

export interface PublicProductFilters {
  search?: string;
  category?: string;
  sort?: PublicProductSort;
  minPrice?: number;
  maxPrice?: number;
  availability?: PublicAvailability;
}

// ─── HTTP client (deliberately NOT the shared session-aware `request()`
// helper other services use — see module docblock) ─────────────────────────

async function publicGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${COMMERCE_BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null; // 404 = not found/unpublished/inactive; any other error also fails closed
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function buildQuery(filters: PublicProductFilters): string {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.minPrice != null && Number.isFinite(filters.minPrice)) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice != null && Number.isFinite(filters.maxPrice)) params.set('maxPrice', String(filters.maxPrice));
  if (filters.availability && filters.availability !== 'all') params.set('availability', filters.availability);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Resolve a published storefront's public branding by slug. Returns null for
 * an unpublished/unknown slug or on network failure — the page renders a
 * "store not available" state either way, matching the backend's own
 * behavior of never distinguishing "doesn't exist" from "not published". */
export async function getPublicStore(slug: string): Promise<PublicStorefront | null> {
  if (!slug) return null;
  return publicGet<PublicStorefront>(`/public/store/${encodeURIComponent(slug)}`);
}

/** List a published store's active products, with server-side
 * search/category/sort/price/availability filters — never client-computed
 * business rules, just query params the real backend already implements
 * (`listPublicStorefrontProducts`). Returns [] on failure (empty catalog and
 * "can't load" render the same way on this page). */
export async function getPublicStoreProducts(
  slug: string,
  filters: PublicProductFilters = {},
): Promise<PublicProductSummary[]> {
  if (!slug) return [];
  const res = await publicGet<{ products: PublicProductSummary[] }>(
    `/public/store/${encodeURIComponent(slug)}/products${buildQuery(filters)}`,
  );
  return res?.products ?? [];
}

/** Full public product detail (gallery, options, variants) for the
 * product-detail page. Only ever resolves an `active` product — draft/
 * archived/unknown all 404 the same way. Returns null on failure. */
export async function getPublicStoreProduct(slug: string, productSlug: string): Promise<PublicProductDetail | null> {
  if (!slug || !productSlug) return null;
  const res = await publicGet<{ product: PublicProductDetail }>(
    `/public/store/${encodeURIComponent(slug)}/product/${encodeURIComponent(productSlug)}`,
  );
  return res?.product ?? null;
}

/** Legacy direct "share this product" link (`/buy/:productId`) — looks a
 * product up by its own id, independent of any storefront slug/publish
 * state (see `getPublicProductById`'s backend docblock). Returns null for an
 * unknown/inactive product id or on failure. */
export async function getPublicProductById(productId: string): Promise<PublicProductDetail | null> {
  if (!productId) return null;
  const res = await publicGet<{ product: PublicProductDetail }>(`/public/product/${encodeURIComponent(productId)}`);
  return res?.product ?? null;
}

/** Merchant-curated homepage sections (collections + new-arrivals markers)
 * and hero banners for a published store. Returns empty arrays on failure —
 * the homepage still renders (branding + product grid) without them. */
export async function getPublicStoreHomepage(slug: string): Promise<{ sections: PublicHomepageSection[]; banners: PublicHeroBanner[] }> {
  if (!slug) return { sections: [], banners: [] };
  const res = await publicGet<{ sections: PublicHomepageSection[]; banners: PublicHeroBanner[] }>(
    `/public/store/${encodeURIComponent(slug)}/homepage`,
  );
  return res ?? { sections: [], banners: [] };
}
