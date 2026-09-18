/**
 * commerceProducts — Inventory business logic for the Commerce BFF: products,
 * images, SKU settings, and variants/options. See
 * docs/inventory_rules.md for the product model this extends.
 *
 * Every function takes an already-verified `accountId` (or a `ScopeSelection`
 * for reads) resolved by the router via `commerceAuth.ts` — never a
 * client-supplied one. Tenant isolation is enforced twice: once here (every
 * query is scoped by account_id) and again by the DB triggers the migrations
 * added (`commerce_check_*_tenant`), as defense-in-depth.
 */
import { randomUUID } from 'node:crypto';
import type { ISql } from 'postgres';
import { getCommerceSql } from './commerceDb.js';
import { CommerceNotFoundError, CommerceValidationError, translateDbError } from './commerceErrors.js';
import type { ScopeSelection } from './commerceAuth.js';
import { objectKeyBelongsToAccount } from './commerceStorage.js';

// ─── Types ──────────────────────────────────────────────────────────────

export type ProductStatus = 'draft' | 'active' | 'archived';
export type StockStatus = 'unlimited' | 'out_of_stock' | 'low_stock' | 'in_stock';
export type VariantStatus = 'active' | 'inactive';

export interface ProductImage {
  id: string;
  url: string;
  displayOrder: number;
  isCover: boolean;
}

export interface OptionValue {
  id: string;
  value: string;
  skuFragment: string;
  displayOrder: number;
}

export interface ProductOption {
  id: string;
  name: string;
  displayOrder: number;
  values: OptionValue[];
}

export interface Variant {
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

export interface ProductDimensions {
  length: number | null;
  width: number | null;
  height: number | null;
}

export interface ProductSummary {
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
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  weight: number | null;
  dimensions: ProductDimensions;
  images: ProductImage[];
  options: ProductOption[];
  variants: Variant[];
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ProductInput {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  status?: ProductStatus;
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

// ─── Helpers ────────────────────────────────────────────────────────────

export function deriveStockStatus(p: { stockQuantity: number; lowStockThreshold: number; unlimitedStock: boolean }): StockStatus {
  if (p.unlimitedStock) return 'unlimited';
  if (p.stockQuantity <= 0) return 'out_of_stock';
  if (p.stockQuantity <= p.lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
}

function skuFragmentFrom(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (cleaned.slice(0, 4) || 'OPT');
}

/** Common base of both `Sql` (the top-level client) and `TransactionSql`
 * (the `sql.begin` callback arg) — every helper below only ever runs a
 * tagged-template query, never `.begin()`/`.end()` itself, so this is the
 * right shared type for "either the client or an open transaction". */
type SqlLike = ISql<{}>;

async function ensureUniqueSlug(tx: SqlLike, accountId: string, base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // Bounded loop — a merchant would need 500+ same-named products to hit this,
  // and each iteration is a cheap indexed lookup.
  for (let i = 0; i < 500; i++) {
    const rows = excludeId
      ? await tx`select 1 from commerce_products where account_id = ${accountId} and slug = ${candidate} and id <> ${excludeId}`
      : await tx`select 1 from commerce_products where account_id = ${accountId} and slug = ${candidate}`;
    if (rows.length === 0) return candidate;
    candidate = `${base}-${n++}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/** Resolve the SKU string to write (manual, trimmed) or allocate the next one
 * from the account's auto-generate counter — row-locked so concurrent
 * creates never collide. Does NOT insert into the registry (caller does that
 * once the owning product/variant row exists — see the migrations' deferred
 * FK note). Throws `CommerceValidationError` when neither a manual SKU nor
 * auto-generate is available. */
async function resolveSkuValue(tx: SqlLike, accountId: string, manualSku: string | undefined): Promise<string> {
  const trimmed = manualSku?.trim();
  if (trimmed) return trimmed;
  const [settings] = await tx<{ auto_generate: boolean; prefix: string; next_sequence: number }[]>`
    select auto_generate, prefix, next_sequence from commerce_sku_settings where account_id = ${accountId} for update
  `;
  if (!settings || !settings.auto_generate) {
    throw new CommerceValidationError(
      'A SKU is required. Enter one manually, or enable auto-generate SKU in Commerce settings.',
    );
  }
  await tx`update commerce_sku_settings set next_sequence = next_sequence + 1 where account_id = ${accountId}`;
  return `${settings.prefix}-${String(settings.next_sequence).padStart(6, '0')}`;
}

async function insertSkuRegistry(
  tx: SqlLike,
  accountId: string,
  sku: string,
  target: { productId: string } | { variantId: string },
): Promise<void> {
  try {
    if ('productId' in target) {
      await tx`insert into commerce_sku_registry (account_id, sku, product_id) values (${accountId}, ${sku}, ${target.productId})`;
    } else {
      await tx`insert into commerce_sku_registry (account_id, sku, variant_id) values (${accountId}, ${sku}, ${target.variantId})`;
    }
  } catch (err) {
    translateDbError(err, `SKU "${sku}" is already in use for this account.`);
  }
}

function scopeWhere(scope: ScopeSelection, alias = ''): { clause: string; accountId: string | null } {
  const col = alias ? `${alias}.account_id` : 'account_id';
  if (scope.mode === 'consolidated') return { clause: '1=1', accountId: null };
  return { clause: `${col} = `, accountId: scope.accountId };
}

// ─── SKU settings ───────────────────────────────────────────────────────

export async function getSkuSettings(accountId: string): Promise<SkuSettings> {
  const sql = getCommerceSql();
  const rows = await sql<{ account_id: string; auto_generate: boolean; prefix: string; next_sequence: number }[]>`
    insert into commerce_sku_settings (account_id) values (${accountId})
    on conflict (account_id) do nothing
    returning account_id, auto_generate, prefix, next_sequence
  `;
  const row = rows[0] ?? (await sql<{ account_id: string; auto_generate: boolean; prefix: string; next_sequence: number }[]>`
    select account_id, auto_generate, prefix, next_sequence from commerce_sku_settings where account_id = ${accountId}
  `)[0];
  return {
    accountId: row.account_id,
    autoGenerate: row.auto_generate,
    prefix: row.prefix,
    nextSequence: row.next_sequence,
  };
}

export interface SkuSettingsInput {
  autoGenerate: boolean;
  prefix: string;
}

export async function updateSkuSettings(accountId: string, input: SkuSettingsInput): Promise<SkuSettings> {
  const prefix = input.prefix.trim().toUpperCase();
  if (prefix && !/^[A-Z0-9]{1,12}$/.test(prefix)) {
    throw new CommerceValidationError('SKU prefix must be 1-12 letters/numbers.');
  }
  const sql = getCommerceSql();
  await getSkuSettings(accountId); // ensure the row exists first
  // Changing the prefix only affects FUTURE allocations — next_sequence (and
  // every already-issued SKU) is untouched, so existing SKUs are never renamed.
  const [row] = await sql<{ account_id: string; auto_generate: boolean; prefix: string; next_sequence: number }[]>`
    update commerce_sku_settings set auto_generate = ${input.autoGenerate}, prefix = ${prefix}
    where account_id = ${accountId}
    returning account_id, auto_generate, prefix, next_sequence
  `;
  return { accountId: row.account_id, autoGenerate: row.auto_generate, prefix: row.prefix, nextSequence: row.next_sequence };
}

// ─── Mapping ────────────────────────────────────────────────────────────

function toDimensions(row: { length_cm: string | null; width_cm: string | null; height_cm: string | null }): ProductDimensions {
  return {
    length: row.length_cm === null ? null : Number(row.length_cm),
    width: row.width_cm === null ? null : Number(row.width_cm),
    height: row.height_cm === null ? null : Number(row.height_cm),
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────

export type ProductSort = 'newest' | 'price_asc' | 'price_desc';
export type Availability = 'in_stock' | 'out_of_stock' | 'all';

export interface ListProductsOptions {
  status?: ProductStatus;
  search?: string;
  category?: string;
  sort?: ProductSort;
  minPrice?: number;
  maxPrice?: number;
  availability?: Availability;
}

function orderByFragment(sql: ReturnType<typeof getCommerceSql>, sort: ProductSort | undefined) {
  if (sort === 'price_asc') return sql`order by p.unit_price asc`;
  if (sort === 'price_desc') return sql`order by p.unit_price desc`;
  return sql`order by p.created_at desc`; // 'newest' / default
}

export async function listProducts(scope: ScopeSelection, opts: ListProductsOptions = {}): Promise<ProductSummary[]> {
  const sql = getCommerceSql();
  const search = opts.search?.trim();
  const availability = opts.availability ?? 'all';
  const rows = await sql<any[]>`
    select
      p.id, p.account_id, p.name, p.slug, p.category, p.status, p.sku, p.has_variants,
      p.unit_price, p.compare_at_price, p.stock_quantity, p.low_stock_threshold, p.unlimited_stock,
      p.created_at, p.updated_at,
      (
        select img.url from commerce_product_images img
        where img.product_id = p.id
        order by img.is_cover desc, img.display_order asc
        limit 1
      ) as cover_image_url,
      (
        select jsonb_build_object(
          'min', min(coalesce(v.price_override, p.unit_price)),
          'max', max(coalesce(v.price_override, p.unit_price))
        )
        from commerce_product_variants v
        where v.product_id = p.id
      ) as price_range
    from commerce_products p
    where (${scope.mode === 'consolidated'} or p.account_id = ${scope.mode === 'single' ? scope.accountId : ''})
      and (${opts.status === undefined} or p.status = ${opts.status ?? 'draft'})
      and (${!search} or p.name ilike ${'%' + (search ?? '') + '%'})
      and (${!opts.category} or p.category = ${opts.category ?? ''})
      and (${opts.minPrice == null} or p.unit_price >= ${opts.minPrice ?? 0})
      and (${opts.maxPrice == null} or p.unit_price <= ${opts.maxPrice ?? 0})
      and (
        ${availability === 'all'}
        or (${availability === 'in_stock'} and (p.unlimited_stock or p.stock_quantity > 0))
        or (${availability === 'out_of_stock'} and not p.unlimited_stock and p.stock_quantity <= 0)
      )
    ${orderByFragment(sql, opts.sort)}
  `;
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    status: row.status,
    sku: row.sku,
    hasVariants: row.has_variants,
    unitPrice: Number(row.unit_price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    priceRange: row.has_variants && row.price_range ? { min: Number(row.price_range.min), max: Number(row.price_range.max) } : null,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    unlimitedStock: row.unlimited_stock,
    stockStatus: deriveStockStatus({ stockQuantity: row.stock_quantity, lowStockThreshold: row.low_stock_threshold, unlimitedStock: row.unlimited_stock }),
    coverImageUrl: row.cover_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export type PublicProductSort = ProductSort | 'featured';

/** Public storefront catalog — always `active` products only, regardless of
 * what the caller asks for. `'featured'` sorts by the merchant's own chosen
 * storefront product order (`commerce_storefront_products.display_order`);
 * anything not selected for the storefront falls back to newest. */
export async function listPublicStorefrontProducts(
  accountId: string,
  opts: Omit<ListProductsOptions, 'status' | 'sort'> & { sort?: PublicProductSort } = {},
): Promise<ProductSummary[]> {
  if (opts.sort !== 'featured') {
    return listProducts({ mode: 'single', accountId }, { ...opts, status: 'active', sort: opts.sort as ProductSort | undefined });
  }
  const { sort: _ignoredSort, ...rest } = opts;
  const base = await listProducts({ mode: 'single', accountId }, { ...rest, status: 'active' });
  const order = await getStorefrontProductOrder(accountId);
  return [...base].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

async function getStorefrontProductOrder(accountId: string): Promise<Map<string, number>> {
  const sql = getCommerceSql();
  const rows = await sql<any[]>`select product_id, display_order from commerce_storefront_products where account_id = ${accountId}`;
  return new Map(rows.map((r) => [r.product_id, r.display_order]));
}

/** Public, unauthenticated product-detail read — by the account that owns
 * the (already-verified-published) storefront and the product's own slug.
 * Only ever resolves an `active` product; draft/archived 404 the same as a
 * nonexistent one (never leaks existence/status to a public caller). */
export async function getPublicProductBySlug(accountId: string, productSlug: string): Promise<ProductDetail> {
  const sql = getCommerceSql();
  const [row] = await sql<any[]>`
    select id from commerce_products where account_id = ${accountId} and slug = ${productSlug} and status = 'active'
  `;
  if (!row) throw new CommerceNotFoundError('Product not found.');
  return getProductDetail({ mode: 'single', accountId }, row.id);
}

export async function getProductDetail(scope: ScopeSelection, productId: string): Promise<ProductDetail> {
  const sql = getCommerceSql();
  const [p] = await sql<any[]>`
    select * from commerce_products p
    where p.id = ${productId}
      and (${scope.mode === 'consolidated'} or p.account_id = ${scope.mode === 'single' ? scope.accountId : ''})
  `;
  if (!p) throw new CommerceNotFoundError('Product not found.');

  const images = await sql<any[]>`
    select id, url, display_order, is_cover from commerce_product_images
    where product_id = ${productId} order by display_order asc
  `;
  const options = await sql<any[]>`
    select o.id as option_id, o.name, o.display_order as option_order,
           v.id as value_id, v.value, v.sku_fragment, v.display_order as value_order
    from commerce_product_options o
    left join commerce_product_option_values v on v.option_id = o.id
    where o.product_id = ${productId}
    order by o.display_order asc, v.display_order asc
  `;
  const variantRows = await sql<any[]>`
    select v.id, v.sku, v.price_override, v.compare_at_price_override, v.stock_quantity, v.unlimited_stock,
           v.status, v.image_id,
           coalesce(array_agg(ov.option_value_id) filter (where ov.option_value_id is not null), '{}') as option_value_ids
    from commerce_product_variants v
    left join commerce_product_variant_option_values ov on ov.variant_id = v.id
    where v.product_id = ${productId}
    group by v.id
    order by v.created_at asc
  `;

  const optionsById = new Map<string, ProductOption>();
  for (const row of options) {
    if (!optionsById.has(row.option_id)) {
      optionsById.set(row.option_id, { id: row.option_id, name: row.name, displayOrder: row.option_order, values: [] });
    }
    if (row.value_id) {
      optionsById.get(row.option_id)!.values.push({
        id: row.value_id, value: row.value, skuFragment: row.sku_fragment, displayOrder: row.value_order,
      });
    }
  }

  const priceRange = p.has_variants && variantRows.length
    ? {
        min: Math.min(...variantRows.map((v) => Number(v.price_override ?? p.unit_price))),
        max: Math.max(...variantRows.map((v) => Number(v.price_override ?? p.unit_price))),
      }
    : null;

  return {
    id: p.id,
    accountId: p.account_id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    status: p.status,
    sku: p.sku,
    hasVariants: p.has_variants,
    unitPrice: Number(p.unit_price),
    compareAtPrice: p.compare_at_price === null ? null : Number(p.compare_at_price),
    priceRange,
    stockQuantity: p.stock_quantity,
    lowStockThreshold: p.low_stock_threshold,
    unlimitedStock: p.unlimited_stock,
    stockStatus: deriveStockStatus({ stockQuantity: p.stock_quantity, lowStockThreshold: p.low_stock_threshold, unlimitedStock: p.unlimited_stock }),
    coverImageUrl: images.find((i) => i.is_cover)?.url ?? images[0]?.url ?? null,
    description: p.description,
    weight: p.weight === null ? null : Number(p.weight),
    dimensions: toDimensions(p),
    images: images.map((i) => ({ id: i.id, url: i.url, displayOrder: i.display_order, isCover: i.is_cover })),
    options: [...optionsById.values()],
    variants: variantRows.map((v) => ({
      id: v.id,
      sku: v.sku,
      priceOverride: v.price_override === null ? null : Number(v.price_override),
      compareAtPriceOverride: v.compare_at_price_override === null ? null : Number(v.compare_at_price_override),
      stockQuantity: v.stock_quantity,
      unlimitedStock: v.unlimited_stock,
      status: v.status,
      imageId: v.image_id,
      optionValueIds: v.option_value_ids,
      stockStatus: deriveStockStatus({ stockQuantity: v.stock_quantity, lowStockThreshold: 0, unlimitedStock: v.unlimited_stock }),
    })),
    createdBy: p.created_by,
    updatedBy: p.updated_by,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────

function validateProductInput(input: ProductInput): void {
  if (!input.name?.trim()) throw new CommerceValidationError('Product name is required.');
  if (typeof input.unitPrice !== 'number' || input.unitPrice < 0) throw new CommerceValidationError('Unit price must be a non-negative number.');
  if (input.compareAtPrice != null && input.compareAtPrice <= input.unitPrice) {
    throw new CommerceValidationError('Compare-at price must be greater than the selling price.');
  }
}

export async function createProduct(accountId: string, input: ProductInput, actor: string): Promise<ProductDetail> {
  validateProductInput(input);
  const sql = getCommerceSql();
  const productId = randomUUID();

  await sql.begin(async (tx) => {
    const slug = await ensureUniqueSlug(tx, accountId, slugify(input.slug?.trim() || input.name));
    const sku = await resolveSkuValue(tx, accountId, input.sku);
    try {
      await tx`
        insert into commerce_products (
          id, account_id, name, slug, description, category, status, sku, unit_price, compare_at_price,
          weight, length_cm, width_cm, height_cm, stock_quantity, low_stock_threshold, unlimited_stock,
          created_by, updated_by
        ) values (
          ${productId}, ${accountId}, ${input.name.trim()}, ${slug}, ${input.description ?? ''}, ${input.category ?? ''},
          ${input.status ?? 'draft'}, ${sku}, ${input.unitPrice}, ${input.compareAtPrice ?? null},
          ${input.weight ?? null}, ${input.dimensions?.length ?? null}, ${input.dimensions?.width ?? null}, ${input.dimensions?.height ?? null},
          ${input.stockQuantity ?? 0}, ${input.lowStockThreshold ?? 0}, ${input.unlimitedStock ?? false},
          ${actor}, ${actor}
        )
      `;
    } catch (err) {
      translateDbError(err, 'Could not create the product.');
    }
    await insertSkuRegistry(tx, accountId, sku, { productId });
  });

  return getProductDetail({ mode: 'single', accountId }, productId);
}

export async function updateProduct(
  scope: ScopeSelection,
  productId: string,
  patch: Partial<ProductInput>,
  actor: string,
): Promise<ProductDetail> {
  const sql = getCommerceSql();
  const existing = await getProductDetail(scope, productId); // 404s if out of scope
  if (patch.compareAtPrice !== undefined) {
    const newPrice = patch.unitPrice ?? existing.unitPrice;
    if (patch.compareAtPrice != null && patch.compareAtPrice <= newPrice) {
      throw new CommerceValidationError('Compare-at price must be greater than the selling price.');
    }
  }

  await sql.begin(async (tx) => {
    let slug = existing.slug;
    if (patch.slug !== undefined || patch.name !== undefined) {
      const base = slugify((patch.slug ?? patch.name ?? existing.name).trim());
      if (base !== existing.slug) slug = await ensureUniqueSlug(tx, existing.accountId, base, productId);
    }
    try {
      await tx`
        update commerce_products set
          name = ${patch.name?.trim() ?? existing.name},
          slug = ${slug},
          description = ${patch.description ?? existing.description},
          category = ${patch.category ?? existing.category},
          status = ${patch.status ?? existing.status},
          unit_price = ${patch.unitPrice ?? existing.unitPrice},
          compare_at_price = ${patch.compareAtPrice !== undefined ? patch.compareAtPrice : existing.compareAtPrice},
          weight = ${patch.weight !== undefined ? patch.weight : existing.weight},
          length_cm = ${patch.dimensions?.length !== undefined ? patch.dimensions.length : existing.dimensions.length},
          width_cm = ${patch.dimensions?.width !== undefined ? patch.dimensions.width : existing.dimensions.width},
          height_cm = ${patch.dimensions?.height !== undefined ? patch.dimensions.height : existing.dimensions.height},
          stock_quantity = ${patch.stockQuantity ?? existing.stockQuantity},
          low_stock_threshold = ${patch.lowStockThreshold ?? existing.lowStockThreshold},
          unlimited_stock = ${patch.unlimitedStock ?? existing.unlimitedStock},
          updated_by = ${actor}
        where id = ${productId}
      `;
    } catch (err) {
      translateDbError(err, 'Could not update the product.');
    }
  });

  return getProductDetail(scope, productId);
}

/** Hard delete — cascades images/options/variants/SKU registry rows via FK.
 * Prefer `updateProduct(..., { status: 'archived' })` for the normal
 * "retire a product but keep its history" path; this is for a genuine
 * mistaken entry. */
export async function deleteProduct(scope: ScopeSelection, productId: string): Promise<void> {
  await getProductDetail(scope, productId); // 404s if out of scope
  const sql = getCommerceSql();
  await sql`delete from commerce_products where id = ${productId}`;
}

export async function adjustStock(scope: ScopeSelection, productId: string, delta: number, actor: string): Promise<ProductDetail> {
  const existing = await getProductDetail(scope, productId);
  const next = existing.stockQuantity + delta;
  if (next < 0) throw new CommerceValidationError('Stock cannot go below zero.');
  return updateProduct(scope, productId, { stockQuantity: next }, actor);
}

// ─── Images ─────────────────────────────────────────────────────────────

export async function addProductImage(
  scope: ScopeSelection,
  productId: string,
  image: { r2ObjectKey: string; url: string },
): Promise<ProductImage[]> {
  const existing = await getProductDetail(scope, productId);
  // The object key came from the client (echoing back what the presigned-
  // upload endpoint gave it) — verify it's actually namespaced under THIS
  // product's own account before trusting it, so a caller can never attach
  // another account's uploaded object (or an arbitrary key) to their product.
  if (!objectKeyBelongsToAccount(image.r2ObjectKey, existing.accountId)) {
    throw new CommerceValidationError('That image does not belong to this account.');
  }
  const sql = getCommerceSql();
  const isFirst = existing.images.length === 0;
  const [row] = await sql<any[]>`
    insert into commerce_product_images (product_id, account_id, r2_object_key, url, display_order, is_cover)
    values (${productId}, ${existing.accountId}, ${image.r2ObjectKey}, ${image.url}, ${existing.images.length}, ${isFirst})
    returning id, url, display_order, is_cover
  `;
  return [...existing.images, { id: row.id, url: row.url, displayOrder: row.display_order, isCover: row.is_cover }];
}

export async function removeProductImage(scope: ScopeSelection, productId: string, imageId: string): Promise<{ r2ObjectKey: string }> {
  const existing = await getProductDetail(scope, productId);
  const image = existing.images.find((i) => i.id === imageId);
  if (!image) throw new CommerceNotFoundError('Image not found on this product.');
  const sql = getCommerceSql();
  const [removed] = await sql<any[]>`
    delete from commerce_product_images where id = ${imageId} and product_id = ${productId} returning r2_object_key
  `;
  // Promote the next image (by display_order) to cover if the cover was removed.
  if (image.isCover) {
    const [next] = await sql<any[]>`
      select id from commerce_product_images where product_id = ${productId} order by display_order asc limit 1
    `;
    if (next) await sql`update commerce_product_images set is_cover = true where id = ${next.id}`;
  }
  return { r2ObjectKey: removed?.r2_object_key ?? '' };
}

export async function reorderProductImages(scope: ScopeSelection, productId: string, orderedImageIds: string[]): Promise<ProductImage[]> {
  const existing = await getProductDetail(scope, productId);
  const idsMatch = orderedImageIds.length === existing.images.length && existing.images.every((i) => orderedImageIds.includes(i.id));
  if (!idsMatch) throw new CommerceValidationError('The image order must include every image exactly once.');
  const sql = getCommerceSql();
  await sql.begin(async (tx) => {
    for (let i = 0; i < orderedImageIds.length; i++) {
      await tx`update commerce_product_images set display_order = ${i} where id = ${orderedImageIds[i]}`;
    }
  });
  return getProductDetail(scope, productId).then((p) => p.images);
}

export async function setCoverImage(scope: ScopeSelection, productId: string, imageId: string): Promise<ProductImage[]> {
  const existing = await getProductDetail(scope, productId);
  if (!existing.images.some((i) => i.id === imageId)) throw new CommerceNotFoundError('Image not found on this product.');
  const sql = getCommerceSql();
  await sql.begin(async (tx) => {
    await tx`update commerce_product_images set is_cover = false where product_id = ${productId}`;
    await tx`update commerce_product_images set is_cover = true where id = ${imageId}`;
  });
  return getProductDetail(scope, productId).then((p) => p.images);
}

// ─── Variants / options ──────────────────────────────────────────────────

export interface VariantOptionsInput {
  /** [{ name: 'Color', values: ['Black','White'] }, { name: 'Size', values: ['S','M'] }] */
  options: { name: string; values: string[] }[];
}

/**
 * Define/replace a product's variant option set and generate any missing
 * combinations as new variants (defaulting to inherited price, zero stock).
 * Existing variants for combinations still present are left untouched
 * (price/stock edits survive); a combination no longer in `options` keeps
 * its variant row (never silently deletes stock/price history) — remove it
 * explicitly via `deleteVariant` if truly no longer sold.
 */
export async function setVariantOptions(scope: ScopeSelection, productId: string, input: VariantOptionsInput, actor: string): Promise<ProductDetail> {
  const existing = await getProductDetail(scope, productId);
  if (input.options.length === 0) throw new CommerceValidationError('At least one option (e.g. Color) is required to create variants.');
  const sql = getCommerceSql();

  await sql.begin(async (tx) => {
    await tx`update commerce_products set has_variants = true, updated_by = ${actor} where id = ${productId}`;

    const optionValueIds: string[][] = [];
    for (let i = 0; i < input.options.length; i++) {
      const opt = input.options[i];
      const [optRow] = await tx<any[]>`
        insert into commerce_product_options (product_id, account_id, name, display_order)
        values (${productId}, ${existing.accountId}, ${opt.name.trim()}, ${i})
        on conflict (product_id, name) do update set display_order = excluded.display_order
        returning id
      `;
      const valueIds: string[] = [];
      for (let j = 0; j < opt.values.length; j++) {
        const value = opt.values[j].trim();
        const [valRow] = await tx<any[]>`
          insert into commerce_product_option_values (option_id, value, sku_fragment, display_order)
          values (${optRow.id}, ${value}, ${skuFragmentFrom(value)}, ${j})
          on conflict (option_id, value) do update set display_order = excluded.display_order
          returning id
        `;
        valueIds.push(valRow.id);
      }
      optionValueIds.push(valueIds);
    }

    // Cartesian product of all option-value id groups.
    let combinations: string[][] = [[]];
    for (const group of optionValueIds) {
      const next: string[][] = [];
      for (const combo of combinations) for (const id of group) next.push([...combo, id]);
      combinations = next;
    }

    for (const combo of combinations) {
      const combinationKey = [...combo].sort().join('|');
      const [already] = await tx<any[]>`
        select id from commerce_product_variants where product_id = ${productId} and combination_key = ${combinationKey}
      `;
      if (already) continue;

      const fragments = await tx<any[]>`
        select sku_fragment from commerce_product_option_values where id = any(${combo})
      `;
      const suffix = fragments.map((f) => f.sku_fragment).join('-');
      let sku = `${existing.sku}-${suffix}`;
      let disambiguator = 2;
      const variantId = randomUUID();

      // Variant row first — its FK to the registry is DEFERRED (checked at
      // commit), so it's fine to insert with a candidate sku before the
      // registry row exists. The registry row's FK to the variant is
      // immediate, so IT must come after. On the rare readable-suffix
      // collision (e.g. two differently-named values abbreviating the same
      // fragment), update the variant's own sku to the next candidate and
      // retry the registry insert — never leaves a variant/registry mismatch.
      await tx`
        insert into commerce_product_variants (id, product_id, account_id, sku, combination_key)
        values (${variantId}, ${productId}, ${existing.accountId}, ${sku}, ${combinationKey})
      `;
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          await tx`insert into commerce_sku_registry (account_id, sku, variant_id) values (${existing.accountId}, ${sku}, ${variantId})`;
          break;
        } catch (err) {
          if (attempt === 19) translateDbError(err, `Could not allocate a SKU for variant ${suffix}.`);
          sku = `${existing.sku}-${suffix}-${disambiguator++}`;
          await tx`update commerce_product_variants set sku = ${sku} where id = ${variantId}`;
        }
      }

      for (const valueId of combo) {
        await tx`insert into commerce_product_variant_option_values (variant_id, option_value_id) values (${variantId}, ${valueId})`;
      }
    }
  });

  return getProductDetail(scope, productId);
}

export interface VariantPatch {
  priceOverride?: number | null;
  compareAtPriceOverride?: number | null;
  stockQuantity?: number;
  unlimitedStock?: boolean;
  status?: VariantStatus;
  imageId?: string | null;
  sku?: string;
}

export async function updateVariant(scope: ScopeSelection, productId: string, variantId: string, patch: VariantPatch): Promise<ProductDetail> {
  const existing = await getProductDetail(scope, productId);
  const variant = existing.variants.find((v) => v.id === variantId);
  if (!variant) throw new CommerceNotFoundError('Variant not found on this product.');
  if (patch.compareAtPriceOverride != null) {
    const price = patch.priceOverride !== undefined ? patch.priceOverride : variant.priceOverride ?? existing.unitPrice;
    if (price != null && patch.compareAtPriceOverride <= price) {
      throw new CommerceValidationError('Variant compare-at price must be greater than its selling price.');
    }
  }
  const sql = getCommerceSql();
  await sql.begin(async (tx) => {
    if (patch.sku && patch.sku.trim() && patch.sku.trim() !== variant.sku) {
      const newSku = patch.sku.trim();
      await tx`delete from commerce_sku_registry where variant_id = ${variantId}`;
      try {
        await tx`insert into commerce_sku_registry (account_id, sku, variant_id) values (${existing.accountId}, ${newSku}, ${variantId})`;
      } catch (err) {
        translateDbError(err, `SKU "${newSku}" is already in use for this account.`);
      }
      await tx`update commerce_product_variants set sku = ${newSku} where id = ${variantId}`;
    }
    try {
      await tx`
        update commerce_product_variants set
          price_override = ${patch.priceOverride !== undefined ? patch.priceOverride : variant.priceOverride},
          compare_at_price_override = ${patch.compareAtPriceOverride !== undefined ? patch.compareAtPriceOverride : variant.compareAtPriceOverride},
          stock_quantity = ${patch.stockQuantity ?? variant.stockQuantity},
          unlimited_stock = ${patch.unlimitedStock ?? variant.unlimitedStock},
          status = ${patch.status ?? variant.status},
          image_id = ${patch.imageId !== undefined ? patch.imageId : variant.imageId}
        where id = ${variantId}
      `;
    } catch (err) {
      translateDbError(err, 'Could not update the variant.');
    }
  });
  return getProductDetail(scope, productId);
}

export async function deleteVariant(scope: ScopeSelection, productId: string, variantId: string): Promise<ProductDetail> {
  const existing = await getProductDetail(scope, productId);
  if (!existing.variants.some((v) => v.id === variantId)) throw new CommerceNotFoundError('Variant not found on this product.');
  const sql = getCommerceSql();
  await sql`delete from commerce_product_variants where id = ${variantId}`;
  return getProductDetail(scope, productId);
}
