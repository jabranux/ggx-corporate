/**
 * /api/commerce/... — GGX Corporate Commerce BFF (Inventory today; Storefront/
 * Collections/Promotions land in follow-up passes onto the same router).
 * Talks directly to the dedicated Commerce Postgres database
 * (`api/_lib/commerceDb.ts`) — never QuadX Bridge, never the browser.
 *
 * One consolidated Serverless Function (dispatching on `path` segments),
 * same convention as `api/support/router.ts`/`api/ops-requests/router.ts`,
 * to stay well under Vercel's Hobby per-deployment function-count limit.
 * Routed via an explicit `vercel.json` rewrite
 * (`/api/commerce/:path+` → `/api/commerce/router?path=:path*`) — the
 * wildcard capture arrives as a single `/`-joined string, so
 * `pathSegments` below splits it (see `api/support/router.ts`'s docblock
 * for why this project doesn't use the filesystem `[...path].ts` convention).
 *
 * Every route resolves identity/scope from the signed session cookie only
 * (`commerceAuth.ts`) — see that module's docblock for the admin-may-choose/
 * manager-is-forced account scoping rule.
 */
import type { ProxyRequest, ProxyResponse } from '../_lib/bridge.js';
import { getRequestBody, getQueryParam } from '../_lib/bridge.js';
import {
  requireCommerceIdentity, resolveScope, resolveWriteAccountId, CommerceIdentity,
} from '../_lib/commerceAuth.js';
import {
  CommerceConflictError, CommerceForbiddenError, CommerceNotFoundError, CommerceValidationError,
} from '../_lib/commerceErrors.js';
import { CommerceConfigError } from '../_lib/commerceDb.js';
import {
  listProducts, getProductDetail, createProduct, updateProduct, deleteProduct, adjustStock,
  addProductImage, removeProductImage, reorderProductImages, setCoverImage,
  setVariantOptions, updateVariant, deleteVariant, getSkuSettings, updateSkuSettings,
  type ProductStatus,
} from '../_lib/commerceProducts.js';
import { createPresignedUpload, deleteObject, CommerceStorageConfigError, type MediaKind } from '../_lib/commerceStorage.js';
import {
  getStorefront, ensureStorefront, updateStorefront, setStorefrontLogo, setPublishStatus,
  getStorefrontProductIds, setStorefrontProducts, listCollections, createCollection, updateCollection,
  deleteCollection, setCollectionProducts, listHomepageSections, createHomepageSection, updateHomepageSection,
  deleteHomepageSection, reorderHomepageSections, listHeroBanners, createHeroBanner, updateHeroBanner,
  deleteHeroBanner, reorderHeroBanners, getPublicStorefront,
} from '../_lib/commerceStorefront.js';
import { listPublicStorefrontProducts, getPublicProductBySlug, type PublicProductSort, type Availability } from '../_lib/commerceProducts.js';
import { listPromotions, createPromotion, updatePromotion, deletePromotion, validatePromotion, redeemPromotion } from '../_lib/commercePromotions.js';

function pathSegments(req: ProxyRequest): string[] {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  return [];
}

function methodNotAllowed(res: ProxyResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'Method not allowed' });
}

// ─── Products ───────────────────────────────────────────────────────────

async function handleProductsList(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  if (req.method === 'GET') {
    const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
    const status = getQueryParam(req, 'status') as ProductStatus | undefined;
    const products = await listProducts(scope, { status });
    res.status(200).json({ products });
    return;
  }

  const body = await getRequestBody(req);
  const accountId = resolveWriteAccountId(identity, typeof body.accountId === 'string' ? body.accountId : undefined);
  const product = await createProduct(accountId, body as any, identity.accountName);
  res.status(201).json({ product });
}

async function handleProductDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  if (req.method === 'GET') {
    const product = await getProductDetail(scope, id);
    res.status(200).json({ product });
    return;
  }
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    const product = await updateProduct(scope, id, body as any, identity.accountName);
    res.status(200).json({ product });
    return;
  }
  if (req.method === 'DELETE') {
    await deleteProduct(scope, id);
    res.status(204).send('');
    return;
  }
  methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
}

async function handleStockAdjust(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  const body = await getRequestBody(req);
  const delta = Number(body.delta);
  if (!Number.isFinite(delta)) throw new CommerceValidationError('delta must be a number.');
  const product = await adjustStock(scope, id, delta, identity.accountName);
  res.status(200).json({ product });
}

async function handleImages(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  if (req.method === 'POST') {
    const body = await getRequestBody(req);
    if (typeof body.r2ObjectKey !== 'string' || typeof body.url !== 'string') {
      throw new CommerceValidationError('r2ObjectKey and url are required.');
    }
    const images = await addProductImage(scope, id, { r2ObjectKey: body.r2ObjectKey, url: body.url });
    res.status(201).json({ images });
    return;
  }
  methodNotAllowed(res, ['POST']);
}

async function handleImageDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string, imageId: string): Promise<void> {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  const { r2ObjectKey } = await removeProductImage(scope, id, imageId);
  if (r2ObjectKey) await deleteObject(r2ObjectKey).catch((err: unknown) => console.error('[commerce] R2 cleanup failed', err));
  res.status(204).send('');
}

async function handleImageReorder(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  const body = await getRequestBody(req);
  if (!Array.isArray(body.orderedImageIds)) throw new CommerceValidationError('orderedImageIds must be an array.');
  const images = await reorderProductImages(scope, id, body.orderedImageIds as string[]);
  res.status(200).json({ images });
}

async function handleImageCover(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string, imageId: string): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  const images = await setCoverImage(scope, id, imageId);
  res.status(200).json({ images });
}

async function handleVariantOptions(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  if (req.method !== 'PUT') return methodNotAllowed(res, ['PUT']);
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  const body = await getRequestBody(req);
  if (!Array.isArray(body.options)) throw new CommerceValidationError('options must be an array of { name, values }.');
  const product = await setVariantOptions(scope, id, { options: body.options as any }, identity.accountName);
  res.status(200).json({ product });
}

async function handleVariantDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string, variantId: string): Promise<void> {
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    const product = await updateVariant(scope, id, variantId, body as any);
    res.status(200).json({ product });
    return;
  }
  if (req.method === 'DELETE') {
    const product = await deleteVariant(scope, id, variantId);
    res.status(200).json({ product });
    return;
  }
  methodNotAllowed(res, ['PATCH', 'DELETE']);
}

async function handleSkuSettings(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  if (req.method === 'GET') {
    const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
    const accountId = scope.mode === 'single' ? scope.accountId : identity.sessionAccountId;
    res.status(200).json({ settings: await getSkuSettings(accountId) });
    return;
  }
  if (req.method === 'PUT') {
    const body = await getRequestBody(req);
    const accountId = resolveWriteAccountId(identity, typeof body.accountId === 'string' ? body.accountId : undefined);
    if (typeof body.autoGenerate !== 'boolean' || typeof body.prefix !== 'string') {
      throw new CommerceValidationError('autoGenerate (boolean) and prefix (string) are required.');
    }
    const settings = await updateSkuSettings(accountId, { autoGenerate: body.autoGenerate, prefix: body.prefix });
    res.status(200).json({ settings });
    return;
  }
  methodNotAllowed(res, ['GET', 'PUT']);
}

async function handleUploads(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await getRequestBody(req);
  const accountId = resolveWriteAccountId(identity, typeof body.accountId === 'string' ? body.accountId : undefined);
  if (typeof body.contentType !== 'string') throw new CommerceValidationError('contentType is required.');

  let kind: MediaKind;
  if (body.kind === 'product-image') {
    kind = { type: 'product-image', productId: typeof body.productId === 'string' ? body.productId : undefined };
  } else if (body.kind === 'storefront-logo') {
    kind = { type: 'storefront-logo' };
  } else if (body.kind === 'storefront-banner') {
    kind = { type: 'storefront-banner' };
  } else {
    throw new CommerceValidationError('kind must be one of: product-image, storefront-logo, storefront-banner.');
  }

  const presigned = await createPresignedUpload(accountId, kind, body.contentType);
  res.status(200).json(presigned);
}

// ─── Storefront ─────────────────────────────────────────────────────────

function targetAccountId(identity: CommerceIdentity, req: ProxyRequest): string {
  const scope = resolveScope(identity, getQueryParam(req, 'accountId'));
  return scope.mode === 'single' ? scope.accountId : identity.sessionAccountId;
}

async function handleStorefront(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'GET') {
    res.status(200).json({ storefront: await ensureStorefront(accountId, identity.accountName) });
    return;
  }
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    res.status(200).json({ storefront: await updateStorefront(accountId, body as any) });
    return;
  }
  methodNotAllowed(res, ['GET', 'PATCH']);
}

async function handleStorefrontLogo(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'PUT') {
    const body = await getRequestBody(req);
    if (typeof body.r2ObjectKey !== 'string' || typeof body.url !== 'string') throw new CommerceValidationError('r2ObjectKey and url are required.');
    res.status(200).json({ storefront: await setStorefrontLogo(accountId, { r2ObjectKey: body.r2ObjectKey, url: body.url }) });
    return;
  }
  if (req.method === 'DELETE') {
    res.status(200).json({ storefront: await setStorefrontLogo(accountId, null) });
    return;
  }
  methodNotAllowed(res, ['PUT', 'DELETE']);
}

async function handleStorefrontPublish(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const accountId = targetAccountId(identity, req);
  const body = await getRequestBody(req);
  if (!['draft', 'published', 'unpublished'].includes(body.status as string)) {
    throw new CommerceValidationError('status must be draft, published, or unpublished.');
  }
  res.status(200).json({ storefront: await setPublishStatus(accountId, body.status as any) });
}

async function handleStorefrontProducts(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'GET') {
    res.status(200).json({ productIds: await getStorefrontProductIds(accountId) });
    return;
  }
  if (req.method === 'PUT') {
    const body = await getRequestBody(req);
    if (!Array.isArray(body.productIds)) throw new CommerceValidationError('productIds must be an array.');
    res.status(200).json({ productIds: await setStorefrontProducts(accountId, body.productIds as string[]) });
    return;
  }
  methodNotAllowed(res, ['GET', 'PUT']);
}

// ─── Collections ────────────────────────────────────────────────────────

async function handleCollectionsList(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'GET') {
    res.status(200).json({ collections: await listCollections(accountId) });
    return;
  }
  if (req.method === 'POST') {
    const body = await getRequestBody(req);
    res.status(201).json({ collection: await createCollection(accountId, body as any) });
    return;
  }
  methodNotAllowed(res, ['GET', 'POST']);
}

async function handleCollectionDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    res.status(200).json({ collection: await updateCollection(accountId, id, body as any) });
    return;
  }
  if (req.method === 'DELETE') {
    await deleteCollection(accountId, id);
    res.status(204).send('');
    return;
  }
  methodNotAllowed(res, ['PATCH', 'DELETE']);
}

async function handleCollectionProducts(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  if (req.method !== 'PUT') return methodNotAllowed(res, ['PUT']);
  const accountId = targetAccountId(identity, req);
  const body = await getRequestBody(req);
  if (!Array.isArray(body.productIds)) throw new CommerceValidationError('productIds must be an array.');
  res.status(200).json({ collection: await setCollectionProducts(accountId, id, body.productIds as string[]) });
}

// ─── Homepage sections ──────────────────────────────────────────────────

async function handleHomepageSectionsList(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'GET') {
    res.status(200).json({ sections: await listHomepageSections(accountId) });
    return;
  }
  if (req.method === 'POST') {
    const body = await getRequestBody(req);
    res.status(201).json({ section: await createHomepageSection(accountId, body as any) });
    return;
  }
  methodNotAllowed(res, ['GET', 'POST']);
}

async function handleHomepageSectionReorder(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const accountId = targetAccountId(identity, req);
  const body = await getRequestBody(req);
  if (!Array.isArray(body.orderedSectionIds)) throw new CommerceValidationError('orderedSectionIds must be an array.');
  res.status(200).json({ sections: await reorderHomepageSections(accountId, body.orderedSectionIds as string[]) });
}

async function handleHomepageSectionDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    res.status(200).json({ section: await updateHomepageSection(accountId, id, body as any) });
    return;
  }
  if (req.method === 'DELETE') {
    await deleteHomepageSection(accountId, id);
    res.status(204).send('');
    return;
  }
  methodNotAllowed(res, ['PATCH', 'DELETE']);
}

// ─── Hero banners ───────────────────────────────────────────────────────

async function handleBannersList(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'GET') {
    res.status(200).json({ banners: await listHeroBanners(accountId) });
    return;
  }
  if (req.method === 'POST') {
    const body = await getRequestBody(req) as any;
    if (!body.desktopImage?.r2ObjectKey || !body.desktopImage?.url) throw new CommerceValidationError('desktopImage { r2ObjectKey, url } is required.');
    res.status(201).json({ banner: await createHeroBanner(accountId, body) });
    return;
  }
  methodNotAllowed(res, ['GET', 'POST']);
}

async function handleBannerReorder(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const accountId = targetAccountId(identity, req);
  const body = await getRequestBody(req);
  if (!Array.isArray(body.orderedBannerIds)) throw new CommerceValidationError('orderedBannerIds must be an array.');
  res.status(200).json({ banners: await reorderHeroBanners(accountId, body.orderedBannerIds as string[]) });
}

async function handleBannerDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    res.status(200).json({ banner: await updateHeroBanner(accountId, id, body as any) });
    return;
  }
  if (req.method === 'DELETE') {
    await deleteHeroBanner(accountId, id);
    res.status(204).send('');
    return;
  }
  methodNotAllowed(res, ['PATCH', 'DELETE']);
}

// ─── Promotions ─────────────────────────────────────────────────────────

async function handlePromotionsList(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'GET') {
    res.status(200).json({ promotions: await listPromotions(accountId) });
    return;
  }
  if (req.method === 'POST') {
    const body = await getRequestBody(req);
    res.status(201).json({ promotion: await createPromotion(accountId, body as any) });
    return;
  }
  methodNotAllowed(res, ['GET', 'POST']);
}

async function handlePromotionDetail(req: ProxyRequest, res: ProxyResponse, identity: CommerceIdentity, id: string): Promise<void> {
  const accountId = targetAccountId(identity, req);
  if (req.method === 'PATCH') {
    const body = await getRequestBody(req);
    res.status(200).json({ promotion: await updatePromotion(accountId, id, body as any) });
    return;
  }
  if (req.method === 'DELETE') {
    await deletePromotion(accountId, id);
    res.status(204).send('');
    return;
  }
  methodNotAllowed(res, ['PATCH', 'DELETE']);
}

/** Validate a promo code against the caller's OWN storefront cart. Unlike
 * every other route above, this one deliberately accepts a `storeSlug`
 * instead of relying on the session's account — checkout runs as the buyer,
 * not the merchant, so there IS no merchant session here; the storefront
 * must be published for this to resolve at all (mirrors `handlePublic*`),
 * but the discount math itself always happens here, never in the browser. */
async function handlePromotionValidate(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await getRequestBody(req);
  if (typeof body.storeSlug !== 'string' || typeof body.code !== 'string' || typeof body.subtotal !== 'number') {
    throw new CommerceValidationError('storeSlug, code, and subtotal are required.');
  }
  const storefront = await getPublicStorefront(body.storeSlug);
  const result = await validatePromotion(storefront.accountId, body.code, {
    subtotal: body.subtotal,
    productIds: Array.isArray(body.productIds) ? body.productIds : [],
  });
  res.status(200).json(result);
}

async function handlePromotionRedeem(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await getRequestBody(req);
  if (typeof body.storeSlug !== 'string' || typeof body.code !== 'string' || typeof body.subtotal !== 'number' || typeof body.idempotencyKey !== 'string') {
    throw new CommerceValidationError('storeSlug, code, subtotal, and idempotencyKey are required.');
  }
  const storefront = await getPublicStorefront(body.storeSlug);
  const result = await redeemPromotion(storefront.accountId, body.code, {
    subtotal: body.subtotal,
    productIds: Array.isArray(body.productIds) ? body.productIds : [],
    idempotencyKey: body.idempotencyKey,
    storefrontOrderRef: typeof body.storefrontOrderRef === 'string' ? body.storefrontOrderRef : undefined,
  });
  res.status(200).json(result);
}

// ─── Public storefront (no session required) ───────────────────────────

async function handlePublicStorefront(req: ProxyRequest, res: ProxyResponse, slug: string): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const storefront = await getPublicStorefront(slug);
  // Strip anything not meant for a public/buyer audience (no internal ids
  // beyond what the UI needs, no draft/unpublished leakage — getPublicStorefront
  // already 404s for anything not published).
  res.status(200).json({
    storeName: storefront.storeName,
    description: storefront.description,
    slug: storefront.slug,
    logoUrl: storefront.logoUrl,
    accentColor: storefront.accentColor,
    deliveryOptions: storefront.deliveryOptions,
    social: storefront.social,
  });
}

async function handlePublicProducts(req: ProxyRequest, res: ProxyResponse, slug: string): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const storefront = await getPublicStorefront(slug);
  const minPriceRaw = getQueryParam(req, 'minPrice');
  const maxPriceRaw = getQueryParam(req, 'maxPrice');
  const products = await listPublicStorefrontProducts(storefront.accountId, {
    search: getQueryParam(req, 'search'),
    category: getQueryParam(req, 'category'),
    sort: (getQueryParam(req, 'sort') as PublicProductSort | undefined) ?? 'featured',
    minPrice: minPriceRaw ? Number(minPriceRaw) : undefined,
    maxPrice: maxPriceRaw ? Number(maxPriceRaw) : undefined,
    availability: (getQueryParam(req, 'availability') as Availability | undefined) ?? 'all',
  });
  res.status(200).json({ products });
}

async function handlePublicProductDetail(req: ProxyRequest, res: ProxyResponse, slug: string, productSlug: string): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const storefront = await getPublicStorefront(slug);
  const product = await getPublicProductBySlug(storefront.accountId, productSlug);
  res.status(200).json({ product });
}

// ─── Dispatch ───────────────────────────────────────────────────────────

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  try {
    const segments = pathSegments(req);

    // Public storefront reads — no session, checked before requiring identity.
    if (segments[0] === 'public' && segments[1] === 'store' && segments.length >= 3) {
      const [, , slug, ...tail] = segments;
      if (tail.length === 0) return await handlePublicStorefront(req, res, slug);
      if (tail.length === 1 && tail[0] === 'products') return await handlePublicProducts(req, res, slug);
      if (tail.length === 2 && tail[0] === 'product') return await handlePublicProductDetail(req, res, slug, tail[1]);
    }
    if (segments[0] === 'promotions' && segments[1] === 'validate' && segments.length === 2) return await handlePromotionValidate(req, res);
    if (segments[0] === 'promotions' && segments[1] === 'redeem' && segments.length === 2) return await handlePromotionRedeem(req, res);

    const identity = requireCommerceIdentity(req, res);
    if (!identity) return; // 401 already written

    if (segments[0] === 'sku-settings' && segments.length === 1) return await handleSkuSettings(req, res, identity);
    if (segments[0] === 'uploads' && segments.length === 1) return await handleUploads(req, res, identity);

    if (segments[0] === 'products') {
      const rest = segments.slice(1);
      if (rest.length === 0) return await handleProductsList(req, res, identity);

      const [id, ...tail] = rest;
      if (tail.length === 0) return await handleProductDetail(req, res, identity, id);
      if (tail.length === 1 && tail[0] === 'stock-adjust') return await handleStockAdjust(req, res, identity, id);
      if (tail.length === 1 && tail[0] === 'images') return await handleImages(req, res, identity, id);
      if (tail.length === 2 && tail[0] === 'images' && tail[1] === 'reorder') return await handleImageReorder(req, res, identity, id);
      if (tail.length === 2 && tail[0] === 'images') return await handleImageDetail(req, res, identity, id, tail[1]);
      if (tail.length === 3 && tail[0] === 'images' && tail[2] === 'cover') return await handleImageCover(req, res, identity, id, tail[1]);
      if (tail.length === 1 && tail[0] === 'variant-options') return await handleVariantOptions(req, res, identity, id);
      if (tail.length === 2 && tail[0] === 'variants') return await handleVariantDetail(req, res, identity, id, tail[1]);
    }

    if (segments[0] === 'storefront') {
      const rest = segments.slice(1);
      if (rest.length === 0) return await handleStorefront(req, res, identity);
      if (rest.length === 1 && rest[0] === 'logo') return await handleStorefrontLogo(req, res, identity);
      if (rest.length === 1 && rest[0] === 'publish') return await handleStorefrontPublish(req, res, identity);
      if (rest.length === 1 && rest[0] === 'products') return await handleStorefrontProducts(req, res, identity);
    }

    if (segments[0] === 'collections') {
      const rest = segments.slice(1);
      if (rest.length === 0) return await handleCollectionsList(req, res, identity);
      const [id, ...tail] = rest;
      if (tail.length === 0) return await handleCollectionDetail(req, res, identity, id);
      if (tail.length === 1 && tail[0] === 'products') return await handleCollectionProducts(req, res, identity, id);
    }

    if (segments[0] === 'homepage-sections') {
      const rest = segments.slice(1);
      if (rest.length === 0) return await handleHomepageSectionsList(req, res, identity);
      if (rest.length === 1 && rest[0] === 'reorder') return await handleHomepageSectionReorder(req, res, identity);
      if (rest.length === 1) return await handleHomepageSectionDetail(req, res, identity, rest[0]);
    }

    if (segments[0] === 'hero-banners') {
      const rest = segments.slice(1);
      if (rest.length === 0) return await handleBannersList(req, res, identity);
      if (rest.length === 1 && rest[0] === 'reorder') return await handleBannerReorder(req, res, identity);
      if (rest.length === 1) return await handleBannerDetail(req, res, identity, rest[0]);
    }

    if (segments[0] === 'promotions') {
      const rest = segments.slice(1);
      if (rest.length === 0) return await handlePromotionsList(req, res, identity);
      if (rest.length === 1) return await handlePromotionDetail(req, res, identity, rest[0]);
    }

    res.status(404).json({ error: 'Not found' });
  } catch (err: unknown) {
    if (err instanceof CommerceValidationError) return void res.status(400).json({ error: err.message });
    if (err instanceof CommerceNotFoundError) return void res.status(404).json({ error: err.message });
    if (err instanceof CommerceConflictError) return void res.status(409).json({ error: err.message });
    if (err instanceof CommerceForbiddenError) return void res.status(403).json({ error: err.message });
    if (err instanceof CommerceConfigError || err instanceof CommerceStorageConfigError) {
      console.error('[commerce]', err.message);
      return void res.status(500).json({ error: err.message });
    }
    console.error('[commerce] unhandled', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
