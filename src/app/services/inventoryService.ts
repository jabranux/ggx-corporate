/**
 * Inventory service facade — the HTTP client behind the Inventory pages and
 * every other module that reads Inventory products (bulk booking product
 * attachment, Storefront product selection, buyer checkout).
 *
 * Backed by GGX Corporate's own real Commerce BFF (`/api/commerce/products*`,
 * `/api/commerce/products/:id/variant-options`, `/api/commerce/products/:id/
 * images*`, `/api/commerce/sku-settings`, `/api/commerce/uploads` —
 * implemented under `api/commerce/router.ts` + `api/_lib/commerce*.ts`), a
 * dedicated Postgres database — never a mock/localStorage model anymore. Same
 * `getJson`/`postJson`/session-expired convention every other same-origin BFF
 * proxy in this app uses (`opsRequestsService.ts`, `claimBridgeService.ts`).
 *
 * Scoping: every call that reads/writes a concrete account's products passes
 * `accountId` only when the caller has a concrete scope (`scopeId`, resolved
 * by `useScopedAccountId()` — undefined means the Main Account admin's
 * consolidated view). The BFF is the actual enforcement point (a manager's
 * `accountId` is always forced from their verified session, never trusted
 * from here) — this module never lets the UI offer an account switcher for a
 * non-admin, it just forwards whatever concrete scope the caller already
 * resolved. See `api/_lib/commerceAuth.ts`.
 *
 * `getInventoryProduct`/`getInventoryProductsByIds` call the
 * SESSION-AUTHENTICATED `/api/commerce/products*` routes — correct for every
 * authenticated caller in this app (Inventory, Storefront admin, bulk
 * booking). Both fail closed (null / empty list), never throw into the page.
 * The truly public/anonymous pages (`StorefrontPreview.tsx`,
 * `StorefrontProductDetail.tsx`, `BuyerCheckout.tsx`) do NOT call through
 * this service for their product reads — they use the separate no-session
 * `publicStorefrontService.ts` instead, which never requires a session and
 * never dispatches `SESSION_EXPIRED_EVENT`.
 */

import { SESSION_EXPIRED_EVENT } from './heyqCustomerApi';

const COMMERCE_BASE = '/api/commerce';

// ─── Types (mirrors api/_lib/commerceProducts.ts) ──────────────────────────

export type ProductStatus = 'draft' | 'active' | 'archived';
export type StockStatus = 'unlimited' | 'out_of_stock' | 'low_stock' | 'in_stock';
export type VariantStatus = 'active' | 'inactive';

export interface ProductDimensions {
  length: number | null;
  width: number | null;
  height: number | null;
}

export interface InventoryProductImage {
  id: string;
  url: string;
  displayOrder: number;
  isCover: boolean;
}

export interface InventoryOptionValue {
  id: string;
  value: string;
  skuFragment: string;
  displayOrder: number;
}

export interface InventoryProductOption {
  id: string;
  name: string;
  displayOrder: number;
  values: InventoryOptionValue[];
}

export interface InventoryVariant {
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

/** List-shaped product (`GET /products`) — what Inventory's table, Storefront's
 * product picker, and bulk-booking attachment all render. Does not carry the
 * full image gallery/options/variants (see `InventoryProductDetail`). */
export interface InventoryProduct {
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
  /** Back-compat convenience for callers that just want an image URL array
   * (e.g. the storefront cart snapshot thumbnail) — just the cover image when
   * known, since the list endpoint doesn't return the full gallery. */
  images: string[];
  /** Only ever populated when this came from a full detail read — the list
   * endpoint doesn't select it (kept optional rather than always-empty so
   * nothing accidentally treats "unknown" as "zero"). */
  weight?: number;
  createdAt: string;
  updatedAt: string;
}

/** Full product detail (`GET/PATCH /products/:id`, and the result of any
 * variant/image mutation) — what `ProductFormDialog` edits. */
export interface InventoryProductDetail extends InventoryProduct {
  description: string;
  weight: number;
  dimensions: ProductDimensions;
  gallery: InventoryProductImage[];
  options: InventoryProductOption[];
  variants: InventoryVariant[];
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ProductInput {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  status?: ProductStatus;
  /** Omit (or leave blank) to auto-generate per the account's SKU settings. */
  sku?: string;
  unitPrice: number;
  compareAtPrice?: number | null;
  weight?: number | null;
  dimensions?: Partial<ProductDimensions>;
  stockQuantity?: number;
  lowStockThreshold?: number;
  unlimitedStock?: boolean;
}

export interface SkuSettings {
  accountId: string;
  autoGenerate: boolean;
  prefix: string;
  nextSequence: number;
}

export interface SkuSettingsInput {
  autoGenerate: boolean;
  prefix: string;
}

export interface VariantOptionInput {
  name: string;
  values: string[];
}

export interface VariantPatch {
  sku?: string;
  priceOverride?: number | null;
  compareAtPriceOverride?: number | null;
  stockQuantity?: number;
  unlimitedStock?: boolean;
  status?: VariantStatus;
  imageId?: string | null;
}

export interface PresignedProductImageUpload {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresInSeconds: number;
}

/** High-level product categories (kept intentionally broad for the demo). */
export const PRODUCT_CATEGORIES = [
  'Apparel',
  'Beauty & Personal Care',
  'Food & Beverages',
  'Gadgets & Electronics',
  'Home & Living',
  'Health & Wellness',
  'Books & Stationery',
  'Toys & Hobbies',
  'Other',
] as const;

/** Thrown by `getInventoryProducts` when the list genuinely could not be
 * loaded (session expired, backend unreachable/misconfigured) — distinct
 * from a real empty result, so the page can show a retryable failure state
 * instead of silently rendering "No products yet" (same discipline as
 * `OpsRequestsUnavailableError`). */
export class InventoryUnavailableError extends Error {
  constructor(message = 'Inventory could not be loaded.') { super(message); }
}

// ─── HTTP client ────────────────────────────────────────────────────────────

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

// ─── Mapping (server shape -> frontend shape) ──────────────────────────────

interface RawProductSummary {
  id: string; accountId: string; name: string; slug: string; category: string; status: ProductStatus;
  sku: string; hasVariants: boolean; unitPrice: number; compareAtPrice: number | null;
  priceRange: { min: number; max: number } | null; stockQuantity: number; lowStockThreshold: number;
  unlimitedStock: boolean; stockStatus: StockStatus; coverImageUrl: string | null;
  createdAt: string; updatedAt: string;
}

interface RawProductDetail extends RawProductSummary {
  description: string; weight: number | null; dimensions: ProductDimensions;
  images: InventoryProductImage[]; options: InventoryProductOption[]; variants: InventoryVariant[];
  createdBy: string | null; updatedBy: string | null;
}

function toInventoryProduct(row: RawProductSummary): InventoryProduct {
  return {
    id: row.id, accountId: row.accountId, name: row.name, slug: row.slug, category: row.category,
    status: row.status, sku: row.sku, hasVariants: row.hasVariants, unitPrice: row.unitPrice,
    compareAtPrice: row.compareAtPrice, priceRange: row.priceRange, stockQuantity: row.stockQuantity,
    lowStockThreshold: row.lowStockThreshold, unlimitedStock: row.unlimitedStock, stockStatus: row.stockStatus,
    coverImageUrl: row.coverImageUrl, images: row.coverImageUrl ? [row.coverImageUrl] : [],
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function toInventoryProductDetail(row: RawProductDetail): InventoryProductDetail {
  const gallery = row.images ?? [];
  return {
    ...toInventoryProduct(row),
    images: gallery.map((i) => i.url),
    description: row.description, weight: row.weight ?? 0, dimensions: row.dimensions,
    gallery, options: row.options ?? [], variants: row.variants ?? [],
    createdBy: row.createdBy, updatedBy: row.updatedBy,
  };
}

// ─── Products ───────────────────────────────────────────────────────────────

/** Return inventory products for a scope. `undefined` means the Main
 * Account's consolidated view (every subaccount's products). Throws
 * `InventoryUnavailableError` on failure — never silently returns []. */
export async function getInventoryProducts(scopeId: string | undefined): Promise<InventoryProduct[]> {
  const res = await getJson<{ products: RawProductSummary[] }>(`/products${accountQuery(scopeId)}`);
  if (!res.ok) throw new InventoryUnavailableError(res.message);
  return res.data.products.map(toInventoryProduct);
}

/** Return a single product's full detail (or null if missing/inaccessible —
 * see the module docblock's public-page caveat). */
export async function getInventoryProduct(id: string, scopeId?: string): Promise<InventoryProductDetail | null> {
  const res = await getJson<{ product: RawProductDetail }>(`/products/${encodeURIComponent(id)}${accountQuery(scopeId)}`);
  if (!res.ok) return null;
  return toInventoryProductDetail(res.data.product);
}

/** Resolve products by id, preserving the given id order (unknown ids
 * skipped). Backed by the authenticated list endpoint (no batch-by-id route
 * exists) — see the module docblock's public-page caveat. Returns [] rather
 * than throwing on failure, since every current caller treats "can't load"
 * the same as "nothing listed". */
export async function getInventoryProductsByIds(ids: string[]): Promise<InventoryProduct[]> {
  if (ids.length === 0) return [];
  let all: InventoryProduct[];
  try {
    all = await getInventoryProducts(undefined);
  } catch {
    return [];
  }
  const byId = new Map(all.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is InventoryProduct => !!p);
}

/** Create a product in the given (concrete) scope. Throws with a
 * human-readable message on validation/conflict failures so the dialog can
 * show it inline. */
export async function createInventoryProduct(scopeId: string, input: ProductInput): Promise<InventoryProductDetail> {
  const res = await postJson<{ product: RawProductDetail }>('/products', { ...input, accountId: scopeId });
  if (!res.ok) throw new Error(res.message);
  return toInventoryProductDetail(res.data.product);
}

/** Patch an existing product's editable fields. Throws on failure. */
export async function updateInventoryProduct(
  id: string,
  patch: Partial<ProductInput>,
  scopeId?: string,
): Promise<InventoryProductDetail> {
  const res = await patchJson<{ product: RawProductDetail }>(`/products/${encodeURIComponent(id)}${accountQuery(scopeId)}`, patch);
  if (!res.ok) throw new Error(res.message);
  return toInventoryProductDetail(res.data.product);
}

/** Delete a product. Returns true when removed. */
export async function deleteInventoryProduct(id: string, scopeId?: string): Promise<boolean> {
  const res = await deleteReq<undefined>(`/products/${encodeURIComponent(id)}${accountQuery(scopeId)}`);
  return res.ok;
}

/** Bulk-import products into a scope — the BFF has no batch-create route, so
 * this posts them one at a time (sequentially, to keep auto-generated SKU
 * ordering predictable). Returns both the created products and a count of
 * rows that failed (e.g. a duplicate manual SKU) so the caller can report
 * partial success instead of assuming all-or-nothing. */
export async function importInventoryProducts(
  scopeId: string,
  inputs: ProductInput[],
): Promise<{ created: InventoryProductDetail[]; failed: number }> {
  const created: InventoryProductDetail[] = [];
  let failed = 0;
  for (const input of inputs) {
    try {
      created.push(await createInventoryProduct(scopeId, input));
    } catch {
      failed += 1;
    }
  }
  return { created, failed };
}

/** True when stock is at/under the low-stock threshold — reads the
 * backend-computed `stockStatus` rather than re-deriving the threshold rule
 * client-side (works for both products and variants, both of which carry
 * `stockStatus`). Unlimited stock is never low. */
export function isLowStock(p: { stockStatus: StockStatus }): boolean {
  return p.stockStatus === 'low_stock';
}

/** Resolve a product's cover photo URL, if any. */
export function productCover(p: { coverImageUrl: string | null }): string | undefined {
  return p.coverImageUrl ?? undefined;
}

// ─── SKU settings ───────────────────────────────────────────────────────────

export async function getSkuSettings(scopeId: string | undefined): Promise<SkuSettings> {
  const res = await getJson<{ settings: SkuSettings }>(`/sku-settings${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.settings;
}

export async function updateSkuSettings(scopeId: string, input: SkuSettingsInput): Promise<SkuSettings> {
  const res = await putJson<{ settings: SkuSettings }>('/sku-settings', { ...input, accountId: scopeId });
  if (!res.ok) throw new Error(res.message);
  return res.data.settings;
}

// ─── Images ─────────────────────────────────────────────────────────────────

/** Mint a presigned R2 upload URL for a product photo. Pass `productId` when
 * editing an existing product (attaches immediately after upload); omit it
 * while still composing a brand-new product (lands in R2's `pending`
 * namespace — see `commerceStorage.ts` — until the product is saved and a
 * separate `attachProductImage` call links it). */
export async function requestProductImageUpload(
  scopeId: string,
  contentType: string,
  productId?: string,
): Promise<PresignedProductImageUpload> {
  const res = await postJson<PresignedProductImageUpload>('/uploads', {
    accountId: scopeId, kind: 'product-image', productId, contentType,
  });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

/** Upload raw image bytes directly to R2 via the presigned PUT URL — the
 * bytes never pass through GGX Corporate's own server. */
export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!res.ok) throw new Error('Photo upload failed. Please try again.');
}

/** Attach an already-uploaded image (see `requestProductImageUpload` +
 * `uploadToPresignedUrl`) to a product. Returns the product's full image
 * gallery (server-ordered). */
export async function attachProductImage(
  productId: string,
  image: { r2ObjectKey: string; url: string },
  scopeId?: string,
): Promise<InventoryProductImage[]> {
  const res = await postJson<{ images: InventoryProductImage[] }>(`/products/${encodeURIComponent(productId)}/images${accountQuery(scopeId)}`, image);
  if (!res.ok) throw new Error(res.message);
  return res.data.images;
}

export async function removeProductImage(productId: string, imageId: string, scopeId?: string): Promise<void> {
  const res = await deleteReq<undefined>(`/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
}

export async function reorderProductImages(
  productId: string,
  orderedImageIds: string[],
  scopeId?: string,
): Promise<InventoryProductImage[]> {
  const res = await postJson<{ images: InventoryProductImage[] }>(
    `/products/${encodeURIComponent(productId)}/images/reorder${accountQuery(scopeId)}`,
    { orderedImageIds },
  );
  if (!res.ok) throw new Error(res.message);
  return res.data.images;
}

export async function setCoverImage(productId: string, imageId: string, scopeId?: string): Promise<InventoryProductImage[]> {
  const res = await postJson<{ images: InventoryProductImage[] }>(
    `/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/cover${accountQuery(scopeId)}`,
    {},
  );
  if (!res.ok) throw new Error(res.message);
  return res.data.images;
}

// ─── Variants / options ─────────────────────────────────────────────────────

/** Define/replace a product's variant options (e.g. Color: Black, White) and
 * generate any missing combinations as variants. Returns the full updated
 * product detail. */
export async function setVariantOptions(
  productId: string,
  options: VariantOptionInput[],
  scopeId?: string,
): Promise<InventoryProductDetail> {
  const res = await putJson<{ product: RawProductDetail }>(`/products/${encodeURIComponent(productId)}/variant-options${accountQuery(scopeId)}`, { options });
  if (!res.ok) throw new Error(res.message);
  return toInventoryProductDetail(res.data.product);
}

export async function updateVariant(
  productId: string,
  variantId: string,
  patch: VariantPatch,
  scopeId?: string,
): Promise<InventoryProductDetail> {
  const res = await patchJson<{ product: RawProductDetail }>(
    `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}${accountQuery(scopeId)}`,
    patch,
  );
  if (!res.ok) throw new Error(res.message);
  return toInventoryProductDetail(res.data.product);
}

export async function deleteVariant(productId: string, variantId: string, scopeId?: string): Promise<InventoryProductDetail> {
  const res = await deleteReq<{ product: RawProductDetail }>(
    `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}${accountQuery(scopeId)}`,
  );
  if (!res.ok) throw new Error(res.message);
  return toInventoryProductDetail(res.data.product);
}

// ─── CSV import / export (presentation helpers) ────────────────────────────

const CSV_COLUMNS = [
  'name', 'sku', 'category', 'description', 'unitPrice', 'weight',
  'length', 'width', 'height', 'stockQuantity', 'lowStockThreshold', 'status',
] as const;

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize products to a CSV string (header + one row per product). Base
 * (non-variant) fields only — variants/images are managed in the dialog, not
 * round-tripped through CSV. */
export function productsToCsv(products: InventoryProduct[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = products.map((p) =>
    [
      p.name, p.sku, p.category, '', p.unitPrice, p.weight ?? '',
      '', '', '', p.stockQuantity, p.lowStockThreshold, p.status,
    ].map(csvCell).join(','),
  );
  return [header, ...rows].join('\n');
}

export interface CsvParseResult {
  products: ProductInput[];
  errors: string[];
}

/**
 * Parse a pasted CSV/TSV block into ProductInput rows. The first line is a
 * header mapped by column name (order-independent); `name` and `sku` are
 * required (a blank SKU per row would silently fall back to whatever the
 * account's auto-generate setting happens to be, which is more surprising
 * than just requiring it for a bulk import). Basic split (no quoted-field
 * handling) — sufficient for the demo import.
 */
export function parseProductsCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    errors.push('Provide a header row and at least one product row.');
    return { products: [], errors };
  }

  const delim = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const iName = idx('name');
  const iSku = idx('sku');
  if (iName === -1 || iSku === -1) {
    errors.push('Header must include at least "name" and "sku".');
    return { products: [], errors };
  }

  const iCat = idx('category'), iDesc = idx('description'), iPrice = idx('unitPrice'),
    iWeight = idx('weight'), iL = idx('length'), iW = idx('width'), iH = idx('height'),
    iStock = idx('stockQuantity'), iLow = idx('lowStockThreshold'), iStatus = idx('status');

  const products: ProductInput[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(delim).map((c) => c.trim());
    const name = cells[iName] ?? '';
    const sku = cells[iSku] ?? '';
    if (!name || !sku) {
      errors.push(`Row ${r + 1}: name and SKU are required — skipped.`);
      continue;
    }
    const num = (i: number, d = 0) => {
      if (i === -1) return d;
      const n = Number(cells[i]);
      return Number.isFinite(n) ? n : d;
    };
    const statusRaw = (iStatus !== -1 ? cells[iStatus] : '').toLowerCase();
    const status: ProductStatus = statusRaw === 'draft' ? 'draft' : statusRaw === 'archived' ? 'archived' : 'active';
    products.push({
      name,
      sku,
      category: iCat !== -1 && cells[iCat] ? cells[iCat] : 'Uncategorized',
      description: iDesc !== -1 ? (cells[iDesc] ?? '') : '',
      unitPrice: num(iPrice),
      weight: num(iWeight),
      dimensions: { length: num(iL), width: num(iW), height: num(iH) },
      stockQuantity: num(iStock),
      lowStockThreshold: num(iLow, 10),
      unlimitedStock: false,
      status,
    });
  }
  return { products, errors };
}
