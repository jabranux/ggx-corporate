/**
 * Focused regression test for `GET /api/support/categories`'s
 * `Cache-Control: no-store` response header (audit finding — see
 * docs/migration/ggx-corporate-live-concern-categories.md).
 *
 * `api/**` isn't served by the plain Vite dev server the other browser-driven
 * tests in this suite use (no Vercel Functions runtime locally), so this test
 * bundles the handler + its `_lib` deps with esbuild (already a transitive
 * dependency of Vite; pinned here as an explicit devDependency for a stable,
 * committed test) and calls it directly against a real local fake Bridge HTTP
 * server — the same approach used for this route's original throwaway smoke
 * test, now made permanent for this one regression.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-categories-test-'));

let bridgeServer;
let bridgePort;
let categoriesHandler;
let createSessionToken;

const FAKE_KEY = 'fake-bridge-key-for-categories-cache-test';
const CATEGORIES = [
  { id: 'cat-general', slug: 'general', name: 'General inquiry', subcategories: [] },
];

before(async () => {
  process.env.SESSION_SECRET = 'test-secret-for-categories-cache-test';
  process.env.QUADX_BRIDGE_API_KEY = FAKE_KEY;

  // Fake QuadX Bridge — only the one route this test needs.
  bridgeServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/customer/categories' && req.headers['x-corporate-internal-key'] === FAKE_KEY) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(CATEGORIES));
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthenticated Corporate Bridge Caller' }));
  });
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve));
  bridgePort = bridgeServer.address().port;
  process.env.QUADX_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`;

  const [categoriesOut, sessionOut] = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/api/support/categories.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const categoriesFile = path.join(TMP_DIR, 'categoriesHandler.cjs');
  const sessionFile = path.join(TMP_DIR, 'sessionLib.cjs');
  fs.writeFileSync(categoriesFile, categoriesOut.outputFiles[0].text);
  fs.writeFileSync(sessionFile, sessionOut.outputFiles[0].text);

  const categoriesMod = await import(`file://${categoriesFile.replace(/\\/g, '/')}`);
  const sessionMod = await import(`file://${sessionFile.replace(/\\/g, '/')}`);
  categoriesHandler = categoriesMod.default.default ?? categoriesMod.default;
  createSessionToken = sessionMod.createSessionToken ?? sessionMod.default.createSessionToken;
});

after(() => {
  bridgeServer?.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeRes() {
  return {
    _status: 200, _body: undefined, _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; },
    send(text) { this._body = text; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

describe('GET /api/support/categories — Cache-Control: no-store', () => {
  it('sets Cache-Control: no-store on a successful (200) response', async () => {
    const token = createSessionToken({ sub: 'user-admin-001', email: 'max@email.com', role: 'admin', accountId: 'main', accountName: 'Main Account' });
    const res = makeRes();
    await categoriesHandler({ method: 'GET', headers: { cookie: `ggx_session=${token}` } }, res);
    assert.equal(res._status, 200);
    assert.equal(res._headers['Cache-Control'], 'no-store', 'a successful categories response must never be cacheable');
  });

  it('sets Cache-Control: no-store even on a 401 (unauthenticated) response', async () => {
    const res = makeRes();
    await categoriesHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res._status, 401);
    assert.equal(res._headers['Cache-Control'], 'no-store', 'the header is set unconditionally, before any early return');
  });
});
