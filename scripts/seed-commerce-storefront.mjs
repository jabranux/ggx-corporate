// One-time seed: sets up REAL demo Storefront data (branding, logo, publish
// status, collections, homepage sections, hero banners) for the "acme-luzon"
// account in the real Commerce Postgres backend, via the actual BFF business
// logic (`api/commerce/router.ts` + `api/_lib/commerceStorefront.ts`) — not
// raw SQL inserts. Modeled directly on `scripts/seed-commerce-inventory.mjs`
// (same in-process router-call technique — see that script's docblock for
// why HTTP isn't used here).
//
// Requires the 5 acme-luzon demo products from
// `node scripts/seed-commerce-inventory.mjs` to already exist (run that
// first if this reports 0 products).
//
// Images: no real photo files to upload through R2, so this fabricates a
// valid-looking object key (correctly namespaced under the seeded account,
// passes `objectKeyBelongsToAccount`) and points the stored `url` at a real,
// stable public placeholder image (picsum.photos) so the logo/banners
// actually render in the UI. No R2 credentials required.
//
// Idempotent-ish: storefront branding/publish/collections/sections/banners
// are all upserted or created-if-missing by name where practical; re-running
// is safe (collections/sections/banners keyed by name are skipped if a match
// already exists; branding/publish/product-selection always just re-apply).
//
// Requires GGX_COMMERCE_DATABASE_URL (reads .env.local, same as
// scripts/apply-commerce-migrations.mjs).
//
// Run:
//   node scripts/seed-commerce-storefront.mjs

import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SEED_ACCOUNT_ID = 'acme-luzon';
const SEED_ACCOUNT_NAME = 'Acme Luzon';

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

if (!process.env.GGX_COMMERCE_DATABASE_URL) {
  console.error('GGX_COMMERCE_DATABASE_URL is not set. Add it to .env.local and re-run.');
  process.exit(1);
}
// Only used to sign+verify a throwaway in-process session token below —
// never a real deployment secret, never persisted.
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'local-seed-script-secret';

const TMP_DIR = mkdtempSync(path.join(os.tmpdir(), 'ggx-commerce-seed-'));

function placeholderImage(seed, n) {
  return `https://picsum.photos/seed/ggx-${seed}-${n}/1600/900`;
}

async function main() {
  const builds = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/api/commerce/router.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const routerFile = path.join(TMP_DIR, 'router.cjs');
  writeFileSync(routerFile, builds[0].outputFiles[0].text);
  const sessionFile = path.join(TMP_DIR, 'session.cjs');
  writeFileSync(sessionFile, builds[1].outputFiles[0].text);

  const routerMod = await import(`file://${routerFile.replace(/\\/g, '/')}`);
  const sessionMod = await import(`file://${sessionFile.replace(/\\/g, '/')}`);
  const router = routerMod.default.default ?? routerMod.default;
  const createSessionToken = sessionMod.createSessionToken ?? sessionMod.default.createSessionToken;

  const token = createSessionToken({
    sub: 'seed-script', email: 'seed@ggx.local', role: 'manager',
    accountId: SEED_ACCOUNT_ID, accountName: SEED_ACCOUNT_NAME,
  });
  const headers = { cookie: `ggx_session=${token}` };

  function makeRes() {
    return {
      _status: 200, _body: undefined,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; },
      send(text) { this._body = text === '' ? undefined : text; },
      setHeader() {},
    };
  }
  async function call(method, pathStr, body) {
    const res = makeRes();
    await router({ method, query: { path: pathStr.split('/').filter(Boolean) }, headers, body }, res);
    return res;
  }

  console.log(`Seeding Commerce Storefront for account "${SEED_ACCOUNT_ID}"...\n`);

  // ─── Products already seeded by seed-commerce-inventory.mjs ──────────────
  const listRes = await call('GET', 'products', undefined);
  const products = listRes._body?.products ?? [];
  if (products.length === 0) {
    console.error('No products found for this account — run `node scripts/seed-commerce-inventory.mjs` first.');
    process.exit(1);
  }
  console.log(`Found ${products.length} existing product(s) to work with.`);
  const byName = (needle) => products.find((p) => p.name.toLowerCase().includes(needle.toLowerCase()));

  // ─── Branding ──────────────────────────────────────────────────────────────
  const brandingRes = await call('PATCH', 'storefront', {
    storeName: 'Acme Luzon Shop',
    description: 'Curated essentials shipped fast across Luzon — coffee, home goods, and everyday wear.',
    slug: 'acme-luzon',
    contactEmail: 'shop@acmeluzon.example',
    contactNumber: '+63 917 987 6543',
    deliveryOptions: ['standard', 'same_day'],
    accentColor: '#1A73E8',
    social: {
      facebook: 'https://facebook.com/acmeluzonshop',
      instagram: 'https://instagram.com/acmeluzonshop',
      tiktok: null,
      website: 'https://acmeluzon.example',
    },
  });
  if (brandingRes._status === 200) console.log('  done  branding profile updated');
  else console.log(`  FAIL  branding update — ${brandingRes._status} ${brandingRes._body?.error ?? ''}`);

  // Logo
  const logoKey = `accounts/${SEED_ACCOUNT_ID}/storefront/logo/seed-logo.jpg`;
  const logoRes = await call('PUT', 'storefront/logo', { r2ObjectKey: logoKey, url: placeholderImage('acme-logo', 1) });
  if (logoRes._status === 200) console.log('  done  logo set');
  else console.log(`  FAIL  logo — ${logoRes._status} ${logoRes._body?.error ?? ''}`);

  // ─── Storefront product selection (all seeded products) ──────────────────
  const allIds = products.map((p) => p.id);
  const selRes = await call('PUT', 'storefront/products', { productIds: allIds });
  if (selRes._status === 200) console.log(`  done  ${selRes._body.productIds.length} product(s) listed on storefront`);
  else console.log(`  FAIL  storefront product selection — ${selRes._status} ${selRes._body?.error ?? ''}`);

  // ─── Collections ───────────────────────────────────────────────────────────
  const existingCollections = (await call('GET', 'collections', undefined))._body?.collections ?? [];
  async function ensureCollection(name, input, productIds) {
    let collection = existingCollections.find((c) => c.name === name);
    if (!collection) {
      const res = await call('POST', 'collections', { name, ...input });
      if (res._status !== 201) {
        console.log(`  FAIL  collection "${name}" — ${res._status} ${res._body?.error ?? ''}`);
        return null;
      }
      collection = res._body.collection;
      console.log(`  done  collection "${name}" created (${input.type})`);
    } else {
      console.log(`  skip  collection "${name}" already exists`);
    }
    if (productIds.length > 0) {
      const prodRes = await call('PUT', `collections/${collection.id}/products`, { productIds });
      if (prodRes._status === 200) console.log(`    · ${productIds.length} product(s) added`);
      else console.log(`    (product attach failed: ${prodRes._status} ${prodRes._body?.error ?? ''})`);
    }
    return collection;
  }

  const featuredProducts = [byName('coffee'), byName('candle'), byName('tumbler')].filter(Boolean).map((p) => p.id);
  const featured = await ensureCollection('Featured Picks', { description: 'Our top picks this month.', type: 'featured', visible: true }, featuredProducts);

  const newInProducts = [byName('t-shirt'), byName('tote')].filter(Boolean).map((p) => p.id);
  await ensureCollection('New & Notable', { description: 'Recently added to the shop.', type: 'custom', visible: true }, newInProducts.length ? newInProducts : allIds.slice(0, 2));

  // ─── Homepage sections ──────────────────────────────────────────────────────
  const existingSections = (await call('GET', 'homepage-sections', undefined))._body?.sections ?? [];
  if (!existingSections.some((s) => s.sectionType === 'new_arrivals')) {
    const res = await call('POST', 'homepage-sections', { title: 'New Arrivals', sectionType: 'new_arrivals', enabled: true });
    if (res._status === 201) console.log('  done  homepage section "New Arrivals" added');
    else console.log(`  FAIL  New Arrivals section — ${res._status} ${res._body?.error ?? ''}`);
  } else {
    console.log('  skip  "New Arrivals" homepage section already exists');
  }
  if (featured && !existingSections.some((s) => s.collectionId === featured.id)) {
    const res = await call('POST', 'homepage-sections', { title: 'Featured Picks', sectionType: 'collection', collectionId: featured.id, enabled: true });
    if (res._status === 201) console.log('  done  homepage section "Featured Picks" added');
    else console.log(`  FAIL  Featured Picks section — ${res._status} ${res._body?.error ?? ''}`);
  } else if (featured) {
    console.log('  skip  "Featured Picks" homepage section already exists');
  }

  // ─── Hero banners ────────────────────────────────────────────────────────────
  const existingBanners = (await call('GET', 'hero-banners', undefined))._body?.banners ?? [];
  async function ensureBanner(headline, input) {
    if (existingBanners.some((b) => b.headline === headline)) {
      console.log(`  skip  banner "${headline}" already exists`);
      return;
    }
    const desktopKey = `accounts/${SEED_ACCOUNT_ID}/storefront/banners/seed-${input.seed}-desktop.jpg`;
    const mobileKey = `accounts/${SEED_ACCOUNT_ID}/storefront/banners/seed-${input.seed}-mobile.jpg`;
    const res = await call('POST', 'hero-banners', {
      headline,
      supportingText: input.supportingText,
      desktopImage: { r2ObjectKey: desktopKey, url: placeholderImage(input.seed, 1) },
      mobileImage: { r2ObjectKey: mobileKey, url: placeholderImage(input.seed, 2) },
      ctaLabel: input.ctaLabel,
      ctaType: input.ctaType,
      ctaTargetId: input.ctaTargetId ?? null,
      ctaExternalUrl: input.ctaExternalUrl ?? null,
      enabled: true,
    });
    if (res._status === 201) console.log(`  done  banner "${headline}" created`);
    else console.log(`  FAIL  banner "${headline}" — ${res._status} ${res._body?.error ?? ''}`);
  }

  await ensureBanner('Fresh Picks, Fast Delivery', {
    seed: 'banner-1',
    supportingText: 'Shop Acme Luzon’s best sellers, delivered same-day across Metro Manila.',
    ctaLabel: featured ? 'Shop Featured' : 'Shop Now',
    ctaType: featured ? 'collection' : null,
    ctaTargetId: featured?.id,
  });
  await ensureBanner('New This Season', {
    seed: 'banner-2',
    supportingText: 'Check out what just landed in the shop.',
    ctaLabel: 'Browse',
    ctaType: 'external_url',
    ctaExternalUrl: 'https://acmeluzon.example/new',
  });

  // ─── Publish ─────────────────────────────────────────────────────────────────
  const publishRes = await call('POST', 'storefront/publish', { status: 'published' });
  if (publishRes._status === 200) console.log(`  done  storefront publish status = ${publishRes._body.storefront.publishStatus}`);
  else console.log(`  FAIL  publish — ${publishRes._status} ${publishRes._body?.error ?? ''}`);

  // ─── Round-trip sanity check ──────────────────────────────────────────────
  const finalStorefront = (await call('GET', 'storefront', undefined))._body.storefront;
  const finalCollections = (await call('GET', 'collections', undefined))._body.collections;
  const finalSections = (await call('GET', 'homepage-sections', undefined))._body.sections;
  const finalBanners = (await call('GET', 'hero-banners', undefined))._body.banners;
  const finalProductIds = (await call('GET', 'storefront/products', undefined))._body.productIds;

  console.log('\n─── Summary ───');
  console.log(`Store: "${finalStorefront.storeName}" (/${finalStorefront.slug}) — ${finalStorefront.publishStatus}`);
  console.log(`Products listed: ${finalProductIds.length}`);
  console.log(`Collections: ${finalCollections.length} (${finalCollections.map((c) => `${c.name} [${c.type}, ${c.productIds.length} products]`).join(', ')})`);
  console.log(`Homepage sections: ${finalSections.length} (${finalSections.map((s) => `${s.title} [${s.sectionType}]`).join(', ')})`);
  console.log(`Hero banners: ${finalBanners.length} (${finalBanners.map((b) => b.headline).join(', ')})`);

  // Public read confirms the storefront is genuinely visible to a buyer.
  const publicRes = await call('GET', `public/store/${finalStorefront.slug}`, undefined);
  console.log(`Public read (/public/store/${finalStorefront.slug}): ${publicRes._status === 200 ? 'OK — storefront is publicly visible' : `FAILED (${publicRes._status})`}`);

  rmSync(TMP_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
