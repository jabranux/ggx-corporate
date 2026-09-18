/**
 * Focused regression tests for `/api/commerce/{storefront,collections,
 * homepage-sections,hero-banners,promotions,public/store}` — see
 * `api/_lib/commerceStorefront.ts` and `api/_lib/commercePromotions.ts`.
 *
 * Same real-disposable-Postgres approach as `tests/api-commerce-products.test.mjs`
 * (see that file's docblock) — skips itself when Docker isn't available.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-commerce-sp-test-'));
const CONTAINER_NAME = `ggx-commerce-sp-test-${process.pid}`;
const PORT = 55980 + (process.pid % 500);

let dockerAvailable = true;
try {
  execFileSync('docker', ['--version'], { stdio: 'ignore' });
} catch {
  dockerAvailable = false;
}

let router;
let createSessionToken;

function makeRes() {
  return {
    _status: 200, _body: undefined, _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; },
    send(text) { this._body = text === '' ? undefined : (typeof text === 'string' ? JSON.parse(text) : text); },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

function managerCookie() {
  const token = createSessionToken({ sub: 'user-mgr-001', email: 'manager@email.com', role: 'manager', accountId: 'acme-luzon', accountName: 'Acme Luzon' });
  return { cookie: `ggx_session=${token}` };
}
function otherManagerCookie() {
  const token = createSessionToken({ sub: 'user-mgr-002', email: 'other@email.com', role: 'manager', accountId: 'other-merchant', accountName: 'Other Merchant' });
  return { cookie: `ggx_session=${token}` };
}

async function call(method, urlPath, { headers = {}, body, query } = {}) {
  const res = makeRes();
  await router({ method, query: { path: query ?? urlPath.split('/').filter(Boolean) }, headers, body }, res);
  return res;
}

async function callPublic(method, urlPath, opts = {}) {
  return call(method, urlPath, { ...opts, headers: {} });
}

before(async () => {
  if (!dockerAvailable) return;

  await execFileAsync('docker', [
    'run', '-d', '--name', CONTAINER_NAME, '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PORT}:5432`, 'postgres:17',
  ]);
  for (let i = 0; i < 30; i++) {
    try {
      await execFileAsync('docker', ['exec', CONTAINER_NAME, 'pg_isready', '-U', 'postgres']);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  process.env.SESSION_SECRET = 'test-secret-for-commerce-sp-test';
  process.env.GGX_COMMERCE_DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/postgres`;
  process.env.GGX_COMMERCE_DATABASE_SSL = 'disable';
  process.env.GGX_COMMERCE_R2_ACCOUNT_ID = 'fake-account-id';
  process.env.GGX_COMMERCE_R2_ACCESS_KEY_ID = 'fake-access-key';
  process.env.GGX_COMMERCE_R2_SECRET_ACCESS_KEY = 'fake-secret-key';
  process.env.GGX_COMMERCE_R2_BUCKET = 'fake-bucket';
  process.env.GGX_COMMERCE_R2_PUBLIC_URL = 'https://fake-bucket.example.com';

  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.GGX_COMMERCE_DATABASE_URL, { max: 1 });
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await sql.unsafe(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await sql.end();

  const builds = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/api/commerce/router.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const routerFile = path.join(TMP_DIR, 'router.cjs');
  fs.writeFileSync(routerFile, builds[0].outputFiles[0].text);
  const sessionFile = path.join(TMP_DIR, 'session.cjs');
  fs.writeFileSync(sessionFile, builds[1].outputFiles[0].text);

  const routerMod = await import(`file://${routerFile.replace(/\\/g, '/')}`);
  const sessionMod = await import(`file://${sessionFile.replace(/\\/g, '/')}`);
  router = routerMod.default.default ?? routerMod.default;
  createSessionToken = sessionMod.createSessionToken ?? sessionMod.default.createSessionToken;
});

after(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  if (dockerAvailable) await execFileAsync('docker', ['rm', '-f', CONTAINER_NAME]).catch(() => {});
});

describe('Commerce storefront/collections/banners/promotions API', { skip: dockerAvailable ? false : 'Docker not available in this environment' }, () => {
  let productId;
  let storeSlug;

  it('sets up a storefront and product to exercise everything else', async () => {
    const storefront = await call('PATCH', 'storefront', { headers: managerCookie(), body: { storeName: 'Acme Test Shop', description: 'desc' } });
    assert.equal(storefront._status, 200);
    storeSlug = storefront._body.storefront.slug;

    const product = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Widget', sku: 'WID-001', unitPrice: 100, status: 'active' } });
    productId = product._body.product.id;
    assert.equal(product._status, 201);

    const selected = await call('PUT', 'storefront/products', { headers: managerCookie(), body: { productIds: [productId] } });
    assert.deepEqual(selected._body.productIds, [productId]);

    const published = await call('POST', 'storefront/publish', { headers: managerCookie(), body: { status: 'published' } });
    assert.equal(published._body.storefront.publishStatus, 'published');
  });

  it('public storefront/product/list routes work with no session and never leak an unpublished store', async () => {
    const pub = await callPublic('GET', `public/store/${storeSlug}`);
    assert.equal(pub._status, 200);
    assert.equal(pub._body.storeName, 'Acme Test Shop');
    assert.equal(pub._body.publishStatus, undefined, 'internal fields must not leak to the public payload');

    const products = await callPublic('GET', `public/store/${storeSlug}/products`);
    assert.equal(products._status, 200);
    assert.equal(products._body.products.length, 1);

    const notFound = await callPublic('GET', 'public/store/does-not-exist');
    assert.equal(notFound._status, 404);
  });

  it('public/product/:id (legacy direct share link) resolves an active product with no session and no storefront-publish requirement, 404s for inactive/unknown ids', async () => {
    const draftProduct = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Draft Widget', sku: 'DFT-001', unitPrice: 50, status: 'draft' } });
    const draftId = draftProduct._body.product.id;

    const active = await callPublic('GET', `public/product/${productId}`);
    assert.equal(active._status, 200);
    assert.equal(active._body.product.name, 'Widget');

    const draft = await callPublic('GET', `public/product/${draftId}`);
    assert.equal(draft._status, 404, 'a draft product must not be resolvable by this public route');

    const unknown = await callPublic('GET', 'public/product/00000000-0000-0000-0000-000000000000');
    assert.equal(unknown._status, 404);
  });

  it('does not expose a draft/unpublished storefront publicly', async () => {
    const other = await call('PATCH', 'storefront', { headers: otherManagerCookie(), body: { storeName: 'Unpublished Shop' } });
    const slug = other._body.storefront.slug;
    const pub = await callPublic('GET', `public/store/${slug}`);
    assert.equal(pub._status, 404, 'a draft storefront must 404 publicly, not reveal it exists');
  });

  it('collections: tenant isolation on attaching another account\'s product', async () => {
    const otherProduct = await call('POST', 'products', { headers: otherManagerCookie(), body: { name: 'Other Product', sku: 'OTH-001', unitPrice: 10 } });
    const collection = await call('POST', 'collections', { headers: managerCookie(), body: { name: 'Featured', type: 'featured' } });
    assert.equal(collection._status, 201);
    const attach = await call('PUT', `collections/${collection._body.collection.id}/products`, { headers: managerCookie(), body: { productIds: [otherProduct._body.product.id] } });
    // The DB's own tenant-check trigger rejects this (not just app-level
    // validation) — surfaced as 403, since the request is well-formed but
    // forbidden by ownership, not malformed.
    assert.equal(attach._status, 403, 'attaching another account\'s product to a collection must be rejected');
  });

  it('hero banners: rejects a CTA target that belongs to another account', async () => {
    const otherProduct = await call('POST', 'products', { headers: otherManagerCookie(), body: { name: 'Other Product 2', sku: 'OTH-002', unitPrice: 10 } });
    const res = await call('POST', 'hero-banners', {
      headers: managerCookie(),
      body: {
        desktopImage: { r2ObjectKey: 'accounts/acme-luzon/storefront/banners/a.jpg', url: 'https://cdn/a.jpg' },
        headline: 'Sale!',
        ctaType: 'product',
        ctaTargetId: otherProduct._body.product.id,
        ctaLabel: 'Shop now',
      },
    });
    assert.equal(res._status, 400);
  });

  it('hero banners: rejects an image belonging to another account', async () => {
    const res = await call('POST', 'hero-banners', {
      headers: managerCookie(),
      body: {
        desktopImage: { r2ObjectKey: 'accounts/other-merchant/storefront/banners/a.jpg', url: 'https://cdn/a.jpg' },
        headline: 'Sale!',
      },
    });
    assert.equal(res._status, 400);
  });

  it('public homepage: returns enabled collection/new_arrivals sections and in-window banners, drops disabled/invisible/expired ones', async () => {
    const collection = await call('POST', 'collections', { headers: managerCookie(), body: { name: 'Homepage Featured', type: 'featured' } });
    const collectionId = collection._body.collection.id;
    await call('PUT', `collections/${collectionId}/products`, { headers: managerCookie(), body: { productIds: [productId] } });

    const hiddenCollection = await call('POST', 'collections', { headers: managerCookie(), body: { name: 'Hidden', type: 'custom', visible: false } });

    const collectionSection = await call('POST', 'homepage-sections', { headers: managerCookie(), body: { title: 'Featured', sectionType: 'collection', collectionId } });
    const arrivalsSection = await call('POST', 'homepage-sections', { headers: managerCookie(), body: { title: 'New Arrivals', sectionType: 'new_arrivals' } });
    const hiddenSection = await call('POST', 'homepage-sections', { headers: managerCookie(), body: { title: 'Hidden Collection Section', sectionType: 'collection', collectionId: hiddenCollection._body.collection.id } });
    const disabledSection = await call('POST', 'homepage-sections', { headers: managerCookie(), body: { title: 'Disabled', sectionType: 'new_arrivals', enabled: false } });
    assert.equal(collectionSection._status, 201);
    assert.equal(arrivalsSection._status, 201);
    assert.equal(hiddenSection._status, 201);
    assert.equal(disabledSection._status, 201);

    const liveBanner = await call('POST', 'hero-banners', { headers: managerCookie(), body: { desktopImage: { r2ObjectKey: 'accounts/acme-luzon/storefront/banners/live.jpg', url: 'https://cdn/live.jpg' }, headline: 'Live banner' } });
    const disabledBanner = await call('POST', 'hero-banners', { headers: managerCookie(), body: { desktopImage: { r2ObjectKey: 'accounts/acme-luzon/storefront/banners/off.jpg', url: 'https://cdn/off.jpg' }, headline: 'Disabled banner', enabled: false } });
    const expiredBanner = await call('POST', 'hero-banners', { headers: managerCookie(), body: { desktopImage: { r2ObjectKey: 'accounts/acme-luzon/storefront/banners/expired.jpg', url: 'https://cdn/expired.jpg' }, headline: 'Expired banner', endDate: '2000-01-01T00:00:00Z' } });
    assert.equal(liveBanner._status, 201);
    assert.equal(disabledBanner._status, 201);
    assert.equal(expiredBanner._status, 201);

    const homepage = await callPublic('GET', `public/store/${storeSlug}/homepage`);
    assert.equal(homepage._status, 200);
    const sectionTypes = homepage._body.sections.map((s) => s.sectionType);
    assert.deepEqual(sectionTypes, ['collection', 'new_arrivals'], 'disabled and hidden-collection sections must be dropped');
    assert.deepEqual(homepage._body.sections[0].collection.productIds, [productId]);
    assert.equal(homepage._body.sections[1].collection, null);
    assert.deepEqual(homepage._body.banners.map((b) => b.headline), ['Live banner'], 'disabled and expired banners must be dropped');

    const notFound = await callPublic('GET', 'public/store/does-not-exist/homepage');
    assert.equal(notFound._status, 404);
  });

  it('promotions: full validate/redeem lifecycle with server-computed discount', async () => {
    const promo = await call('POST', 'promotions', {
      headers: managerCookie(),
      body: { name: 'Ten Off', code: 'save10', discountType: 'percentage', discountValue: 10, startDate: '2020-01-01', endDate: '2099-01-01', minOrderAmount: 50 },
    });
    assert.equal(promo._status, 201);
    assert.equal(promo._body.promotion.code, 'SAVE10', 'code is normalized to uppercase');

    const validate = await callPublic('POST', 'promotions/validate', { body: { storeSlug, code: 'save10', subtotal: 1000, productIds: [productId] } });
    assert.equal(validate._status, 200);
    assert.equal(validate._body.discountAmount, 100);
    assert.equal(validate._body.finalSubtotal, 900);

    const belowMin = await callPublic('POST', 'promotions/validate', { body: { storeSlug, code: 'save10', subtotal: 10, productIds: [productId] } });
    assert.equal(belowMin._status, 400);

    const redeem = await callPublic('POST', 'promotions/redeem', { body: { storeSlug, code: 'save10', subtotal: 1000, productIds: [productId], idempotencyKey: 'idem-abc' } });
    assert.equal(redeem._status, 200);
    assert.equal(redeem._body.discountAmount, 100);

    // Replaying the same idempotency key must return the same result, not double-count usage.
    const replay = await callPublic('POST', 'promotions/redeem', { body: { storeSlug, code: 'save10', subtotal: 1000, productIds: [productId], idempotencyKey: 'idem-abc' } });
    assert.equal(replay._body.discountAmount, 100);
    const afterReplay = await call('GET', 'promotions', { headers: managerCookie() });
    const found = afterReplay._body.promotions.find((p) => p.code === 'SAVE10');
    assert.equal(found.usageCount, 1, 'replaying the same idempotency key must not increment usage twice');
  });

  it('promotions: a tampered/fabricated discount amount from the client is impossible to submit — server always recomputes it', async () => {
    // The redeem endpoint only ever accepts subtotal/productIds/code — there
    // is no discountAmount field it could even read from the client. Confirm
    // a client-supplied discountAmount field is silently ignored, not honored.
    const promo = await call('POST', 'promotions', {
      headers: managerCookie(),
      body: { name: 'Fixed Off', code: 'FIXED5', discountType: 'fixed', discountValue: 5, startDate: '2020-01-01', endDate: '2099-01-01' },
    });
    assert.equal(promo._status, 201);
    const redeem = await callPublic('POST', 'promotions/redeem', {
      body: { storeSlug, code: 'FIXED5', subtotal: 100, productIds: [], idempotencyKey: 'idem-fixed-1', discountAmount: 999999 },
    });
    assert.equal(redeem._body.discountAmount, 5, 'the server-computed fixed discount, never the client-supplied value');
  });

  it('promotions: rejects code reuse beyond its usage limit under concurrent redemption attempts', async () => {
    await call('POST', 'promotions', {
      headers: managerCookie(),
      body: { name: 'Limited', code: 'LIMIT1', discountType: 'fixed', discountValue: 1, startDate: '2020-01-01', endDate: '2099-01-01', usageLimit: 1 },
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        callPublic('POST', 'promotions/redeem', { body: { storeSlug, code: 'LIMIT1', subtotal: 100, productIds: [], idempotencyKey: `race-${i}` } })),
    );
    const succeeded = attempts.filter((a) => a.status === 'fulfilled' && a.value._status === 200);
    assert.equal(succeeded.length, 1, 'exactly one of 5 concurrent redemptions against usage_limit=1 may succeed');
  });

  it('promotions: expired code is rejected', async () => {
    await call('POST', 'promotions', {
      headers: managerCookie(),
      body: { name: 'Expired', code: 'OLDCODE', discountType: 'fixed', discountValue: 1, startDate: '2020-01-01', endDate: '2020-02-01' },
    });
    const res = await callPublic('POST', 'promotions/validate', { body: { storeSlug, code: 'OLDCODE', subtotal: 100, productIds: [] } });
    assert.equal(res._status, 400);
  });

  it('promotions: unknown code is rejected without revealing another account\'s codes', async () => {
    await call('POST', 'promotions', {
      headers: otherManagerCookie(),
      body: { name: 'Secret', code: 'SECRETCODE', discountType: 'fixed', discountValue: 1, startDate: '2020-01-01', endDate: '2099-01-01' },
    });
    const res = await callPublic('POST', 'promotions/validate', { body: { storeSlug, code: 'SECRETCODE', subtotal: 100, productIds: [] } });
    assert.equal(res._status, 404, 'a promo code belonging to a different store must not resolve');
  });
});
