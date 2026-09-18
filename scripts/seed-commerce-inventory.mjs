// One-time seed: creates a handful of REAL demo Inventory products (with
// variants, and at least one multi-image product) in the real Commerce
// Postgres backend, via the actual BFF business logic (`api/commerce/router.ts`
// + `api/_lib/commerceProducts.ts`) — not raw SQL inserts — so SKU allocation,
// slug uniqueness, and tenant scoping all run for real, the same as a real
// request would exercise. Modeled on the old mock seed (`acme-luzon`'s
// products in the now-removed `src/app/data/inventory.ts`).
//
// Why call the router in-process instead of doing real HTTP: there's no
// server running by default in this environment, and minting a real signed
// session cookie would need the deployed SESSION_SECRET (a real secret this
// script has no business knowing). Instead — the same pattern
// `tests/api-commerce-products.test.mjs` already uses — this sets a
// throwaway local SESSION_SECRET, esbuild-bundles the router + session
// modules to temp CommonJS files, and calls the router function directly
// with a synthetic (locally signed AND locally verified, all within this one
// process) manager session for the 'acme-luzon' account. The router still
// runs every real check (scoping, validation, SKU/slug allocation) exactly
// as it would over HTTP — only the transport is skipped.
//
// Images: since this script doesn't have real product photo files to upload
// through R2, it fabricates a valid-looking object key (correctly namespaced
// under the seeded account, so it passes `objectKeyBelongsToAccount`) and
// points the stored `url` at a real, stable public placeholder image
// (picsum.photos, seeded so each product gets a consistent photo across
// runs) so products actually render with photos in the UI. No R2
// credentials are required to run this script.
//
// Idempotent: re-running skips any product whose SKU already exists in the
// target account (detected via a 409 from the create call), so it's safe to
// run more than once.
//
// Requires GGX_COMMERCE_DATABASE_URL (reads .env.local, same as
// scripts/apply-commerce-migrations.mjs — see that script for the format).
//
// Run:
//   node scripts/seed-commerce-inventory.mjs

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
  return `https://picsum.photos/seed/ggx-${seed}-${n}/900/900`;
}

// ─── Demo catalog — realistic Acme Luzon-style products ────────────────────

const PRODUCTS = [
  {
    name: 'Premium Coffee Beans 1kg',
    sku: 'COF-1KG-001',
    category: 'Food & Beverages',
    description: 'Single-origin arabica beans, whole bean, 1kg resealable pack.',
    unitPrice: 850,
    weight: 1.05,
    dimensions: { length: 20, width: 12, height: 8 },
    stockQuantity: 320,
    lowStockThreshold: 50,
    status: 'active',
    images: [placeholderImage('coffee', 1)],
  },
  {
    name: 'Stainless Tumbler 500ml',
    sku: 'TMB-500-014',
    category: 'Home & Living',
    description: 'Double-wall insulated stainless steel tumbler, 500ml.',
    unitPrice: 420,
    weight: 0.35,
    dimensions: { length: 9, width: 9, height: 22 },
    stockQuantity: 38,
    lowStockThreshold: 40,
    status: 'active',
    images: [placeholderImage('tumbler', 1), placeholderImage('tumbler', 2)],
  },
  {
    name: 'Canvas Tote Bag',
    sku: 'BAG-CNV-007',
    category: 'Apparel',
    description: 'Heavy-duty 12oz canvas tote, natural color.',
    unitPrice: 290,
    weight: 0.25,
    dimensions: { length: 38, width: 42, height: 2 },
    stockQuantity: 0,
    lowStockThreshold: 25,
    status: 'draft',
    images: [],
  },
  {
    name: 'Everyday Cotton T-Shirt',
    sku: 'TEE-COT-020',
    category: 'Apparel',
    description: 'Soft 100% cotton crew-neck tee, available in multiple colors and sizes.',
    unitPrice: 350,
    weight: 0.2,
    dimensions: { length: 30, width: 25, height: 2 },
    stockQuantity: 0, // base stock is irrelevant once variants exist — each variant carries its own
    lowStockThreshold: 10,
    status: 'active',
    images: [placeholderImage('tshirt', 1), placeholderImage('tshirt', 2), placeholderImage('tshirt', 3)],
    variantOptions: [
      { name: 'Color', values: ['Black', 'White', 'Navy'] },
      { name: 'Size', values: ['S', 'M', 'L'] },
    ],
  },
  {
    name: 'Scented Soy Candle',
    sku: 'CNDL-SOY-011',
    category: 'Home & Living',
    description: 'Hand-poured soy wax candle, 45-hour burn time.',
    unitPrice: 320,
    compareAtPrice: 380,
    weight: 0.4,
    dimensions: { length: 8, width: 8, height: 9 },
    stockQuantity: 64,
    lowStockThreshold: 15,
    status: 'active',
    images: [placeholderImage('candle', 1)],
    variantOptions: [{ name: 'Scent', values: ['Lavender', 'Sandalwood', 'Sea Salt'] }],
  },
];

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

  console.log(`Seeding Commerce Inventory for account "${SEED_ACCOUNT_ID}"...\n`);

  let created = 0;
  let skipped = 0;
  const summary = [];

  for (const p of PRODUCTS) {
    const createRes = await call('POST', 'products', {
      name: p.name, sku: p.sku, category: p.category, description: p.description,
      status: p.status, unitPrice: p.unitPrice, compareAtPrice: p.compareAtPrice ?? null,
      weight: p.weight, dimensions: p.dimensions,
      stockQuantity: p.stockQuantity, lowStockThreshold: p.lowStockThreshold,
      unlimitedStock: false,
    });

    if (createRes._status === 409) {
      console.log(`  skip  ${p.name} (${p.sku}) — SKU already exists`);
      skipped += 1;
      continue;
    }
    if (createRes._status !== 201) {
      console.log(`  FAIL  ${p.name} (${p.sku}) — ${createRes._status} ${createRes._body?.error ?? ''}`);
      continue;
    }
    const product = createRes._body.product;
    created += 1;
    let note = '';

    for (let i = 0; i < p.images.length; i++) {
      const url = p.images[i];
      const r2ObjectKey = `accounts/${SEED_ACCOUNT_ID}/products/${product.id}/seed-${i + 1}.jpg`;
      const imgRes = await call('POST', `products/${product.id}/images`, { r2ObjectKey, url });
      if (imgRes._status !== 201) console.log(`    (image ${i + 1} failed: ${imgRes._status})`);
    }
    if (p.images.length > 0) note += ` · ${p.images.length} image(s)`;

    if (p.variantOptions) {
      const varRes = await call('PUT', `products/${product.id}/variant-options`, { options: p.variantOptions });
      if (varRes._status === 200) {
        note += ` · ${varRes._body.product.variants.length} variants`;
      } else {
        console.log(`    (variant generation failed: ${varRes._status} ${varRes._body?.error ?? ''})`);
      }
    }

    console.log(`  done  ${p.name} (${product.sku})${note}`);
    summary.push({ name: p.name, sku: product.sku, id: product.id });
  }

  console.log(`\n${created} product(s) created, ${skipped} skipped (already seeded).`);

  // Sanity round-trip: confirm the account's product list now reflects what
  // we just wrote (per the task's verification step).
  const listRes = await call('GET', 'products', undefined);
  console.log(`GET /products now returns ${listRes._body.products.length} product(s) for "${SEED_ACCOUNT_ID}".`);

  rmSync(TMP_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
