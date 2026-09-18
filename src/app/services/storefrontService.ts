/**
 * Storefront service facade — the HTTP client behind the Storefront admin
 * page (branding, publish, product selection, collections, homepage
 * sections, hero banners).
 *
 * Backed by GGX Corporate's own real Commerce BFF (`/api/commerce/storefront*`,
 * `/collections*`, `/homepage-sections*`, `/hero-banners*`, `/uploads` —
 * implemented under `api/commerce/router.ts` + `api/_lib/commerceStorefront.ts`),
 * a dedicated Postgres database — never a mock/localStorage model anymore.
 * Same `getJson`/`postJson`/session-expired convention every other
 * same-origin BFF proxy in this app uses (`inventoryService.ts`,
 * `opsRequestsService.ts`, `claimBridgeService.ts`).
 *
 * Scoping: every call that reads/writes a concrete account's storefront
 * passes `accountId` only when the caller has a concrete scope (`scopeId`,
 * resolved by `useScopedAccountId()` — undefined means the Main Account
 * admin's consolidated view, which the storefront/collections/etc. routes
 * resolve down to the admin's own session account — see
 * `api/commerce/router.ts`'s `targetAccountId`). The BFF is the actual
 * enforcement point (a manager's `accountId` is always forced from their
 * verified session, never trusted from here). See `api/_lib/commerceAuth.ts`.
 *
 * Known phase-2 gap (mirrors inventoryService.ts's documented phase-1 gap):
 * `getStorefrontProfileBySlug` backs the PUBLIC `/shop/:slug` page
 * (`StorefrontPreview.tsx`), which is out of scope for this pass (Phase 3
 * rewires it onto `/api/commerce/public/store/:slug/*`). It calls the real
 * public (no-session) branding read, but that read intentionally omits
 * `accountId`/contact info/product ids (privacy — a public visitor gets
 * branding only), so this adapter fills those with safe empty defaults.
 * Product listing on that page will show empty until Phase 3 wires the real
 * `/public/store/:slug/products` endpoint in. Fails closed (null), never
 * throws into the page.
 */

import { SESSION_EXPIRED_EVENT } from './heyqCustomerApi';
import { getOrders } from './storefrontOrdersService';

const COMMERCE_BASE = '/api/commerce';

// ─── Types (mirrors api/_lib/commerceStorefront.ts) ────────────────────────

export type PublishStatus = 'draft' | 'published' | 'unpublished';
/** Back-compat alias — some call sites still spell this out. */
export type StorefrontPublishStatus = PublishStatus;

export interface StorefrontSocialLinks {
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
}

export interface StorefrontProfile {
  accountId: string;
  storeName: string;
  description: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
  contactEmail: string;
  contactNumber: string;
  deliveryOptions: string[];
  social: StorefrontSocialLinks;
  publishStatus: PublishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StorefrontProfileInput {
  storeName?: string;
  description?: string;
  slug?: string;
  contactEmail?: string;
  contactNumber?: string;
  deliveryOptions?: string[];
  accentColor?: string | null;
  social?: Partial<StorefrontSocialLinks>;
}

export interface PresignedStorefrontUpload {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresInSeconds: number;
}

export type CollectionType = 'custom' | 'featured' | 'sale';

export interface Collection {
  id: string;
  accountId: string;
  name: string;
  slug: string;
  description: string;
  type: CollectionType;
  visible: boolean;
  productIds: string[];
}

export interface CollectionInput {
  name: string;
  description?: string;
  type?: CollectionType;
  visible?: boolean;
}

export type HomepageSectionType = 'collection' | 'new_arrivals';

export interface HomepageSection {
  id: string;
  title: string;
  sectionType: HomepageSectionType;
  collectionId: string | null;
  displayOrder: number;
  enabled: boolean;
}

export interface HomepageSectionInput {
  title: string;
  sectionType: HomepageSectionType;
  collectionId?: string | null;
  enabled?: boolean;
}

export type HeroBannerCtaType = 'product' | 'category' | 'collection' | 'promotion' | 'external_url';

export interface HeroBanner {
  id: string;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  headline: string;
  supportingText: string | null;
  ctaLabel: string | null;
  ctaType: HeroBannerCtaType | null;
  ctaTargetId: string | null;
  ctaExternalUrl: string | null;
  enabled: boolean;
  displayOrder: number;
  startDate: string | null;
  endDate: string | null;
}

export interface HeroBannerInput {
  desktopImage: { r2ObjectKey: string; url: string };
  mobileImage?: { r2ObjectKey: string; url: string } | null;
  headline: string;
  supportingText?: string | null;
  ctaLabel?: string | null;
  ctaType?: HeroBannerCtaType | null;
  ctaTargetId?: string | null;
  ctaExternalUrl?: string | null;
  enabled?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export type HeroBannerPatch = Partial<Omit<HeroBannerInput, 'desktopImage' | 'mobileImage'>> & {
  desktopImage?: { r2ObjectKey: string; url: string };
  mobileImage?: { r2ObjectKey: string; url: string } | null;
};

/**
 * Pending-transaction impact for the unpublish warning. Derived from the
 * real (mock/demo, per docs/storefront_rules.md's settled scope boundary)
 * Storefront Orders list — never auto-cancelled, only presented.
 */
export interface OrderImpact {
  pendingUnpaidOrders: number;
  activeDeliveries: number;
}

export const STOREFRONT_PUBLISH_META: Record<PublishStatus, {
  label: string;
  variant: 'success' | 'warning' | 'default';
}> = {
  published:   { label: 'Published',   variant: 'success' },
  draft:       { label: 'Draft',       variant: 'warning' },
  unpublished: { label: 'Unpublished', variant: 'default' },
};

/** The unpublish confirmation copy (product-approved wording). */
export const UNPUBLISH_MESSAGE =
  'Unpublishing will hide your storefront from new customers. Existing orders and active deliveries will continue until completed.';

// ─── HTTP client (same convention as inventoryService.ts) ─────────────────

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function notifySessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch { /* non-JSON error body */ }
  return `Request failed (${res.status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${COMMERCE_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    if (!res.ok) {
      if (res.status === 401) notifySessionExpired();
      return { ok: false, status: res.status, message: await parseErrorMessage(res) };
    }
    if (res.status === 204) return { ok: true, data: undefined as T };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, message: 'Network error. Please try again.' };
  }
}

const getJson = <T>(path: string) => request<T>(path, { method: 'GET' });
const postJson = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const putJson = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
const patchJson = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
const deleteReq = <T>(path: string) => request<T>(path, { method: 'DELETE' });

function accountQuery(scopeId: string | undefined): string {
  return scopeId ? `?accountId=${encodeURIComponent(scopeId)}` : '';
}

// ─── Profile / branding ─────────────────────────────────────────────────────

/** Return the scope's storefront profile, or null on failure/no session.
 * The server creates a default draft profile on first read, so this never
 * legitimately returns null for a real scope with a reachable backend. */
export async function getStorefrontProfile(scopeId: string | undefined): Promise<StorefrontProfile | null> {
  const res = await getJson<{ storefront: StorefrontProfile }>(`/storefront${accountQuery(scopeId)}`);
  if (!res.ok) return null;
  return res.data.storefront;
}

export async function getStorefrontStatus(scopeId: string | undefined): Promise<PublishStatus | null> {
  const profile = await getStorefrontProfile(scopeId);
  return profile?.publishStatus ?? null;
}

/** Return the scope's storefront, creating a default draft if none exists
 * yet (the server does this automatically on GET — `storeName` hint is
 * accepted for API back-compat but unused). Throws on genuine failure. */
export async function ensureStorefrontProfile(scopeId: string, _storeNameHint?: string): Promise<StorefrontProfile> {
  const res = await getJson<{ storefront: StorefrontProfile }>(`/storefront${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.storefront;
}

/** Update the store profile (name/description/slug/contact/delivery
 * options/accent color/social links). Throws a human-readable message on
 * validation/conflict failures (e.g. taken slug, invalid accent hex). */
export async function updateStorefrontProfile(
  scopeId: string,
  patch: StorefrontProfileInput,
): Promise<StorefrontProfile> {
  const res = await patchJson<{ storefront: StorefrontProfile }>(`/storefront${accountQuery(scopeId)}`, patch);
  if (!res.ok) throw new Error(res.message);
  return res.data.storefront;
}

/** Set publish status (draft / published / unpublished). Never touches
 * existing transactions — see docs/storefront_rules.md. */
export async function setStorefrontStatus(scopeId: string, status: PublishStatus): Promise<StorefrontProfile> {
  const res = await postJson<{ storefront: StorefrontProfile }>(`/storefront/publish${accountQuery(scopeId)}`, { status });
  if (!res.ok) throw new Error(res.message);
  return res.data.storefront;
}

/** Resolve a published storefront by its public slug — the customer-facing
 * `/shop/:slug` surface. See the module docblock's Phase-2 gap note:
 * `accountId`/contact/product ids are not part of the public branding read
 * and come back blank here. Returns null for an unpublished/unknown slug or
 * on network failure — never throws into the page. */
export async function getStorefrontProfileBySlug(slug: string): Promise<StorefrontProfile | null> {
  if (!slug) return null;
  try {
    const res = await fetch(`${COMMERCE_BASE}/public/store/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      accountId: '',
      storeName: data.storeName ?? '',
      description: data.description ?? '',
      slug: data.slug ?? slug,
      logoUrl: data.logoUrl ?? null,
      accentColor: data.accentColor ?? null,
      contactEmail: '',
      contactNumber: '',
      deliveryOptions: Array.isArray(data.deliveryOptions) ? data.deliveryOptions : [],
      social: data.social ?? { facebook: null, instagram: null, tiktok: null, website: null },
      publishStatus: 'published',
      createdAt: '',
      updatedAt: '',
    };
  } catch {
    return null;
  }
}

// ─── Logo upload ────────────────────────────────────────────────────────────

/** Mint a presigned R2 upload URL for the storefront logo — same
 * presign→upload→attach flow as product images (see
 * `inventoryService.ts`/`ProductImageGallery.tsx`), just a different `kind`. */
export async function requestStorefrontLogoUpload(scopeId: string, contentType: string): Promise<PresignedStorefrontUpload> {
  const res = await postJson<PresignedStorefrontUpload>('/uploads', { accountId: scopeId, kind: 'storefront-logo', contentType });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

/** Upload raw image bytes directly to R2 via the presigned PUT URL — the
 * bytes never pass through GGX Corporate's own server. */
export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!res.ok) throw new Error('Photo upload failed. Please try again.');
}

export async function setStorefrontLogo(scopeId: string, image: { r2ObjectKey: string; url: string }): Promise<StorefrontProfile> {
  const res = await request<{ storefront: StorefrontProfile }>(`/storefront/logo${accountQuery(scopeId)}`, {
    method: 'PUT', body: JSON.stringify(image),
  });
  if (!res.ok) throw new Error(res.message);
  return res.data.storefront;
}

export async function removeStorefrontLogo(scopeId: string): Promise<StorefrontProfile> {
  const res = await deleteReq<{ storefront: StorefrontProfile }>(`/storefront/logo${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.storefront;
}

// ─── Storefront product selection ──────────────────────────────────────────

/** Selected Inventory product ids listed on the storefront, in display
 * order. Returns [] on failure (matches the old mock's "just empty" shape —
 * the page shows "No products listed yet" either way). */
export async function getStorefrontProductIds(scopeId: string | undefined): Promise<string[]> {
  const res = await getJson<{ productIds: string[] }>(`/storefront/products${accountQuery(scopeId)}`);
  if (!res.ok) return [];
  return res.data.productIds;
}

/** Replace the storefront's selected Inventory product ids (order preserved). */
export async function setStorefrontProducts(scopeId: string, ids: string[]): Promise<string[]> {
  const res = await putJson<{ productIds: string[] }>(`/storefront/products${accountQuery(scopeId)}`, { productIds: ids });
  if (!res.ok) throw new Error(res.message);
  return res.data.productIds;
}

// ─── Collections ────────────────────────────────────────────────────────────

export async function listCollections(scopeId: string | undefined): Promise<Collection[]> {
  const res = await getJson<{ collections: Collection[] }>(`/collections${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.collections;
}

export async function createCollection(scopeId: string, input: CollectionInput): Promise<Collection> {
  const res = await postJson<{ collection: Collection }>(`/collections${accountQuery(scopeId)}`, input);
  if (!res.ok) throw new Error(res.message);
  return res.data.collection;
}

export async function updateCollection(
  scopeId: string | undefined,
  id: string,
  patch: Partial<CollectionInput>,
): Promise<Collection> {
  const res = await patchJson<{ collection: Collection }>(`/collections/${encodeURIComponent(id)}${accountQuery(scopeId)}`, patch);
  if (!res.ok) throw new Error(res.message);
  return res.data.collection;
}

export async function deleteCollection(scopeId: string | undefined, id: string): Promise<void> {
  const res = await deleteReq<undefined>(`/collections/${encodeURIComponent(id)}${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
}

/** Replace a collection's member products (order preserved). */
export async function setCollectionProducts(
  scopeId: string | undefined,
  id: string,
  productIds: string[],
): Promise<Collection> {
  const res = await putJson<{ collection: Collection }>(
    `/collections/${encodeURIComponent(id)}/products${accountQuery(scopeId)}`,
    { productIds },
  );
  if (!res.ok) throw new Error(res.message);
  return res.data.collection;
}

// ─── Homepage sections ──────────────────────────────────────────────────────

export async function listHomepageSections(scopeId: string | undefined): Promise<HomepageSection[]> {
  const res = await getJson<{ sections: HomepageSection[] }>(`/homepage-sections${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.sections;
}

/** "New Arrivals" is a computed section (newest active products) — never
 * merchant-curated, never references a collection. Create it with
 * `sectionType: 'new_arrivals'` and no `collectionId`; the server rejects a
 * `collectionId` on that type. See docs/commerce/COMMERCE_IMPLEMENTATION_CHECKPOINT.md. */
export async function createHomepageSection(scopeId: string, input: HomepageSectionInput): Promise<HomepageSection> {
  const res = await postJson<{ section: HomepageSection }>(`/homepage-sections${accountQuery(scopeId)}`, input);
  if (!res.ok) throw new Error(res.message);
  return res.data.section;
}

export async function updateHomepageSection(
  scopeId: string | undefined,
  id: string,
  patch: { title?: string; enabled?: boolean },
): Promise<HomepageSection> {
  const res = await patchJson<{ section: HomepageSection }>(`/homepage-sections/${encodeURIComponent(id)}${accountQuery(scopeId)}`, patch);
  if (!res.ok) throw new Error(res.message);
  return res.data.section;
}

export async function deleteHomepageSection(scopeId: string | undefined, id: string): Promise<void> {
  const res = await deleteReq<undefined>(`/homepage-sections/${encodeURIComponent(id)}${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
}

export async function reorderHomepageSections(scopeId: string | undefined, orderedSectionIds: string[]): Promise<HomepageSection[]> {
  const res = await postJson<{ sections: HomepageSection[] }>(
    `/homepage-sections/reorder${accountQuery(scopeId)}`,
    { orderedSectionIds },
  );
  if (!res.ok) throw new Error(res.message);
  return res.data.sections;
}

// ─── Hero banners ───────────────────────────────────────────────────────────

export async function listHeroBanners(scopeId: string | undefined): Promise<HeroBanner[]> {
  const res = await getJson<{ banners: HeroBanner[] }>(`/hero-banners${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.banners;
}

/** Mint a presigned R2 upload URL for a hero banner image (desktop or
 * mobile — same `kind`, the distinction is only which field the caller
 * attaches the result to). */
export async function requestStorefrontBannerUpload(scopeId: string, contentType: string): Promise<PresignedStorefrontUpload> {
  const res = await postJson<PresignedStorefrontUpload>('/uploads', { accountId: scopeId, kind: 'storefront-banner', contentType });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function createHeroBanner(scopeId: string, input: HeroBannerInput): Promise<HeroBanner> {
  const res = await postJson<{ banner: HeroBanner }>(`/hero-banners${accountQuery(scopeId)}`, input);
  if (!res.ok) throw new Error(res.message);
  return res.data.banner;
}

export async function updateHeroBanner(scopeId: string | undefined, id: string, patch: HeroBannerPatch): Promise<HeroBanner> {
  const res = await patchJson<{ banner: HeroBanner }>(`/hero-banners/${encodeURIComponent(id)}${accountQuery(scopeId)}`, patch);
  if (!res.ok) throw new Error(res.message);
  return res.data.banner;
}

export async function deleteHeroBanner(scopeId: string | undefined, id: string): Promise<void> {
  const res = await deleteReq<undefined>(`/hero-banners/${encodeURIComponent(id)}${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
}

export async function reorderHeroBanners(scopeId: string | undefined, orderedBannerIds: string[]): Promise<HeroBanner[]> {
  const res = await postJson<{ banners: HeroBanner[] }>(`/hero-banners/reorder${accountQuery(scopeId)}`, { orderedBannerIds });
  if (!res.ok) throw new Error(res.message);
  return res.data.banners;
}

// ─── Order impact (unpublish warning) ──────────────────────────────────────

/** Pending-transaction impact for the unpublish warning, derived from the
 * real (demo/mock, per docs/storefront_rules.md) Storefront Orders list —
 * never a static placeholder. Publish/unpublish never auto-cancels these;
 * the impact is only presented. */
export async function getPendingOrderImpact(scopeId: string | undefined): Promise<OrderImpact> {
  if (!scopeId) return { pendingUnpaidOrders: 0, activeDeliveries: 0 };
  const orders = await getOrders(scopeId);
  const pendingUnpaidOrders = orders.filter((o) => o.status === 'awaiting_acceptance').length;
  const activeDeliveries = orders.filter(
    (o) => o.status === 'accepted' && !!o.deliveryStage && o.deliveryStage !== 'delivered' && o.deliveryStage !== 'cancelled',
  ).length;
  return { pendingUnpaidOrders, activeDeliveries };
}
