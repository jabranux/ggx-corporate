/**
 * Focused regression tests for `/api/commerce/*` (Inventory vertical:
 * products, images, SKU settings, variants) — see `api/_lib/commerceProducts.ts`
 * and `api/commerce/router.ts`.
 *
 * Runs against a REAL, disposable local Postgres (Docker), migrated with the
 * actual `supabase/migrations/*.sql` files — not a mock DB client — so the
 * DB-level constraints/triggers (SKU uniqueness, tenant-isolation triggers,
 * one-cover-image, variant-combination uniqueness) are exercised for real,
 * the same way `tests/api-ops-requests.test.mjs` exercises the real handler
 * code against a real local fake Bridge HTTP server. Skips itself (rather
 * than failing) when Docker isn't available in the environment running the
 * suite.
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
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-commerce-test-'));
const CONTAINER_NAME = `ggx-commerce-test-${process.pid}`;
const PORT = 55480 + (process.pid % 500);

// Checked synchronously at module load (before `describe` registers), since
// node:test's `skip` option needs a plain value, not a function — the async
// container startup itself still happens in `before()`.
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

function adminCookie() {
  const token = createSessionToken({ sub: 'user-admin-001', email: 'max@email.com', role: 'admin', accountId: 'main', accountName: 'Main Account' });
  return { cookie: `ggx_session=${token}` };
}
function managerCookie() {
  const token = createSessionToken({ sub: 'user-mgr-001', email: 'manager@email.com', role: 'manager', accountId: 'acme-luzon', accountName: 'Acme Luzon' });
  return { cookie: `ggx_session=${token}` };
}
function otherManagerCookie() {
  const token = createSessionToken({ sub: 'user-mgr-002', email: 'other@email.com', role: 'manager', accountId: 'other-merchant', accountName: 'Other Merchant' });
  return { cookie: `ggx_session=${token}` };
}

async function call(method, path, { headers = {}, body, query } = {}) {
  const res = makeRes();
  await router({ method, query: { path: query ?? path.split('/').filter(Boolean) }, headers, body }, res);
  return res;
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

  process.env.SESSION_SECRET = 'test-secret-for-commerce-test';
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
  if (dockerAvailable) {
    await execFileAsync('docker', ['rm', '-f', CONTAINER_NAME]).catch(() => {});
  }
});

describe('Commerce products API', { skip: dockerAvailable ? false : 'Docker not available in this environment' }, () => {
  it('401s with no session', async () => {
    const res = await call('GET', 'products');
    assert.equal(res._status, 401);
  });

  it('creates a product with a manual SKU', async () => {
    const res = await call('POST', 'products', {
      headers: managerCookie(),
      body: { name: 'Test Coffee', sku: 'TST-001', unitPrice: 100 },
    });
    assert.equal(res._status, 201);
    assert.equal(res._body.product.sku, 'TST-001');
    assert.equal(res._body.product.status, 'draft');
    assert.equal(res._body.product.accountId, 'acme-luzon');
  });

  it('rejects a duplicate manual SKU within the same account with 409', async () => {
    const res = await call('POST', 'products', {
      headers: managerCookie(),
      body: { name: 'Another Product', sku: 'TST-001', unitPrice: 50 },
    });
    assert.equal(res._status, 409);
  });

  it('rejects compare-at price <= selling price with 400', async () => {
    const res = await call('POST', 'products', {
      headers: managerCookie(),
      body: { name: 'Bad Price', sku: 'TST-BAD', unitPrice: 100, compareAtPrice: 100 },
    });
    assert.equal(res._status, 400);
  });

  it('auto-generates sequential SKUs once enabled, prefix change does not rename existing SKUs', async () => {
    await call('PUT', 'sku-settings', { headers: managerCookie(), body: { autoGenerate: true, prefix: 'ABC' } });
    const p1 = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Auto 1', unitPrice: 10 } });
    const p2 = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Auto 2', unitPrice: 10 } });
    assert.equal(p1._body.product.sku, 'ABC-000001');
    assert.equal(p2._body.product.sku, 'ABC-000002');

    await call('PUT', 'sku-settings', { headers: managerCookie(), body: { autoGenerate: true, prefix: 'XYZ' } });
    const detail1 = await call('GET', `products/${p1._body.product.id}`, { headers: managerCookie() });
    assert.equal(detail1._body.product.sku, 'ABC-000001', 'existing SKU must not be renamed by a prefix change');

    const p3 = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Auto 3', unitPrice: 10 } });
    assert.equal(p3._body.product.sku, 'XYZ-000003', 'new allocations use the new prefix but keep the counter going');
  });

  it('rejects creating a product with no SKU and auto-generate off', async () => {
    await call('PUT', 'sku-settings', { headers: otherManagerCookie(), body: { autoGenerate: false, prefix: '' } });
    const res = await call('POST', 'products', { headers: otherManagerCookie(), body: { name: 'No SKU', unitPrice: 10 } });
    assert.equal(res._status, 400);
  });

  it('tenant isolation: a manager cannot view another account\'s product (404, not 403)', async () => {
    const mine = await call('POST', 'products', { headers: otherManagerCookie(), body: { name: 'Other Acct Product', sku: 'OTH-001', unitPrice: 10 } });
    const res = await call('GET', `products/${mine._body.product.id}`, { headers: managerCookie() });
    assert.equal(res._status, 404);
  });

  it('Main Account admin can view any account\'s product via an explicit accountId', async () => {
    const mine = await call('POST', 'products', { headers: otherManagerCookie(), body: { name: 'Visible To Admin', sku: 'OTH-002', unitPrice: 10 } });
    const res = await call('GET', `products/${mine._body.product.id}`, { headers: adminCookie(), query: ['products', mine._body.product.id] });
    assert.equal(res._status, 200);
    assert.equal(res._body.product.name, 'Visible To Admin');
  });

  it('stock adjustment rejects going below zero', async () => {
    const created = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Stock Test', sku: 'STK-001', unitPrice: 10, stockQuantity: 5 } });
    const res = await call('POST', `products/${created._body.product.id}/stock-adjust`, { headers: managerCookie(), body: { delta: -10 } });
    assert.equal(res._status, 400);
  });

  it('variant generation: creates all combinations with readable SKU suffixes, rejects invalid image ownership', async () => {
    const created = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Shirt', sku: 'SHIRT-001', unitPrice: 500 } });
    const id = created._body.product.id;
    const res = await call('PUT', `products/${id}/variant-options`, {
      headers: managerCookie(),
      body: { options: [{ name: 'Color', values: ['Black', 'White'] }, { name: 'Size', values: ['S', 'M'] }] },
    });
    assert.equal(res._status, 200);
    assert.equal(res._body.product.variants.length, 4);
    const skus = res._body.product.variants.map((v) => v.sku).sort();
    assert.ok(skus.every((s) => s.startsWith('SHIRT-001-')));

    // Attaching an image whose key belongs to a DIFFERENT account must fail.
    const imgRes = await call('POST', `products/${id}/images`, {
      headers: managerCookie(),
      body: { r2ObjectKey: 'accounts/other-merchant/products/x/y.jpg', url: 'https://cdn/y.jpg' },
    });
    assert.equal(imgRes._status, 400);
  });

  it('re-running variant-options is idempotent for already-existing combinations', async () => {
    const created = await call('POST', 'products', { headers: managerCookie(), body: { name: 'Mug', sku: 'MUG-001', unitPrice: 200 } });
    const id = created._body.product.id;
    await call('PUT', `products/${id}/variant-options`, { headers: managerCookie(), body: { options: [{ name: 'Color', values: ['Black'] }] } });
    const patch = await call('PATCH', `products/${id}/variants/${(await call('GET', `products/${id}`, { headers: managerCookie() }))._body.product.variants[0].id}`, {
      headers: managerCookie(),
      body: { stockQuantity: 42 },
    });
    assert.equal(patch._body.product.variants[0].stockQuantity, 42);
    // Re-running with the same options must not reset the edited variant's stock.
    const again = await call('PUT', `products/${id}/variant-options`, { headers: managerCookie(), body: { options: [{ name: 'Color', values: ['Black'] }] } });
    assert.equal(again._body.product.variants.length, 1);
    assert.equal(again._body.product.variants[0].stockQuantity, 42, 'existing variant data must survive a re-run');
  });
});
