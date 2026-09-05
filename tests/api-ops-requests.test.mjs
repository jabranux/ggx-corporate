/**
 * Focused regression tests for the new `/api/ops-requests/*` BFF routes —
 * see `api/_lib/bridge.ts`'s Ops Request category/subtype mapping helpers and
 * `docs/session_state.md`'s Ops Request POC entry.
 *
 * `api/**` isn't served by the plain Vite dev server the other browser-driven
 * tests in this suite use, so this bundles each handler + its `_lib` deps
 * with esbuild and calls it directly against a real local fake Bridge HTTP
 * server — same approach as `tests/api-claims.test.mjs`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-ops-requests-test-'));

let catalogHandler;
let indexHandler;
let byIdHandler;
let updatesHandler;
let createSessionToken;
let bridgeServer;
let bridgeRequests;

const FAKE_KEY = 'fake-bridge-key-for-ops-requests-test';

function fakeOpsRequest(overrides = {}) {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    requestNumber: 'OPR-2026-0001',
    externalRequestId: undefined,
    status: 'submitted',
    category: 'supply_request',
    subtype: 'pouches',
    requestData: { subaccountId: 'main', subaccountName: 'Main Account', createdBy: 'Max Rodriguez', supplyType: 'pouches', quantity: 500 },
    clientNotes: undefined,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

before(async () => {
  process.env.SESSION_SECRET = 'test-secret-for-ops-requests-test';
  process.env.QUADX_BRIDGE_API_KEY = FAKE_KEY;

  bridgeRequests = [];
  bridgeServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const authed = req.headers['x-corporate-internal-key'] === FAKE_KEY;
      bridgeRequests.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined, authed });
      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthenticated Corporate Bridge Caller' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/customer/ops-requests/catalog') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ supply_request: { label: 'Supply Request', subtypes: [{ key: 'pouches', label: 'Pouches' }] } }));
        return;
      }
      if (req.method === 'POST' && req.url === '/customer/ops-requests') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fakeOpsRequest()));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/customer/ops-requests?')) {
        // Bridge's single consolidated account — rows from BOTH GGX
        // subaccounts, since Bridge itself has no subaccount concept. The
        // BFF route under test is what must apply the subaccount split.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          fakeOpsRequest(),
          fakeOpsRequest({
            id: '44444444-4444-4444-4444-444444444444',
            requestNumber: 'OPR-2026-0002',
            requestData: { subaccountId: 'acme-luzon', subaccountName: 'Acme Luzon', createdBy: 'Rina Lopez', supplyType: 'boxes', quantity: 200 },
          }),
        ]));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/customer/ops-requests/OPR-MISSING')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ops Request not found' }));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/customer/ops-requests/OPR-2026-0001/updates')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ type: 'status_changed', summary: 'Status changed to In Review', occurredAt: '2026-09-05T01:00:00.000Z' }]));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/customer/ops-requests/OPR-2026-0001')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fakeOpsRequest()));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/customer/ops-requests/OPR-2026-0002')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fakeOpsRequest({
          id: '44444444-4444-4444-4444-444444444444',
          requestNumber: 'OPR-2026-0002',
          requestData: { subaccountId: 'acme-luzon', subaccountName: 'Acme Luzon', createdBy: 'Rina Lopez', supplyType: 'boxes', quantity: 200 },
        })));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve));
  const bridgePort = bridgeServer.address().port;
  process.env.QUADX_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`;

  const builds = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/api/ops-requests/catalog.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/ops-requests/index.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/ops-requests/[id].ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/ops-requests/[id]/updates.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const names = ['catalog', 'index', 'byId', 'updates', 'session'];
  const mods = {};
  for (let i = 0; i < builds.length; i++) {
    const file = path.join(TMP_DIR, `${names[i]}.cjs`);
    fs.writeFileSync(file, builds[i].outputFiles[0].text);
    mods[names[i]] = await import(`file://${file.replace(/\\/g, '/')}`);
  }
  catalogHandler = mods.catalog.default.default ?? mods.catalog.default;
  indexHandler = mods.index.default.default ?? mods.index.default;
  byIdHandler = mods.byId.default.default ?? mods.byId.default;
  updatesHandler = mods.updates.default.default ?? mods.updates.default;
  createSessionToken = mods.session.createSessionToken ?? mods.session.default.createSessionToken;
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
    send(text) { this._body = typeof text === 'string' ? JSON.parse(text) : text; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

function sessionCookie() {
  const token = createSessionToken({ sub: 'user-admin-001', email: 'max@email.com', role: 'admin', accountId: 'main', accountName: 'Main Account' });
  return { cookie: `ggx_session=${token}` };
}

function managerSessionCookie() {
  const token = createSessionToken({ sub: 'user-mgr-001', email: 'manager@email.com', role: 'manager', accountId: 'acme-luzon', accountName: 'Acme Luzon' });
  return { cookie: `ggx_session=${token}` };
}

describe('GET /api/ops-requests/catalog', () => {
  it('401s with no session, never reaching Bridge', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await catalogHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res._status, 401);
    assert.equal(bridgeRequests.length, 0);
  });

  it('relays the live catalog with a valid session', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await catalogHandler({ method: 'GET', headers: sessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.ok(res._body.supply_request);
  });
});

describe('GET /api/ops-requests', () => {
  it('401s with no session', async () => {
    const res = makeRes();
    await indexHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res._status, 401);
  });

  it('Main Account admin sees the CONSOLIDATED list across every subaccount', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler({ method: 'GET', headers: sessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.length, 2, 'admin must see both subaccounts\' requests, not just their own');
    const req = bridgeRequests.find((r) => r.method === 'GET' && r.url.startsWith('/customer/ops-requests?'));
    assert.ok(req, 'expected a GET /customer/ops-requests?... call');
    assert.ok(req.url.includes('externalUserId=max%40email.com'));
    // externalOrgId is always the single pinned Bridge demo-account constant
    // (Bridge has no subaccount concept), never the caller's own accountId —
    // otherwise Main Account and a subaccount manager would silently split
    // into two disjoint Bridge accounts, breaking consolidated visibility.
    assert.ok(req.url.includes('externalOrgId=ggx-corporate'));
  });

  it('a subaccount manager sees ONLY their own subaccount\'s requests — enforced server-side, not just by a browser filter', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler({ method: 'GET', headers: managerSessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.length, 1);
    assert.equal(res._body[0].requestNumber, 'OPR-2026-0002');
    assert.equal(res._body[0].requestData.subaccountId, 'acme-luzon');
  });
});

describe('POST /api/ops-requests', () => {
  it('401s with no session, never reaching Bridge', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler({ method: 'POST', headers: {}, body: { category: 'supply', subtype: 'pouches' } }, res);
    assert.equal(res._status, 401);
    assert.equal(bridgeRequests.length, 0);
  });

  it('400s without a category/subtype', async () => {
    const res = makeRes();
    await indexHandler({ method: 'POST', headers: { ...sessionCookie(), 'idempotency-key': 'abc' }, body: {} }, res);
    assert.equal(res._status, 400);
  });

  it('400s without an Idempotency-Key header', async () => {
    const res = makeRes();
    await indexHandler({ method: 'POST', headers: sessionCookie(), body: { category: 'supply', subtype: 'pouches' } }, res);
    assert.equal(res._status, 400);
  });

  it('maps GGX category/subtype keys to Bridge\'s canonical keys, forwards Idempotency-Key, and server-resolved identity always wins', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler(
      {
        method: 'POST',
        headers: { ...sessionCookie(), 'idempotency-key': 'test-idem-key-1' },
        body: {
          category: 'supply', subtype: 'other_packaging',
          requestData: { supplyType: 'other_packaging', quantity: 10 },
          externalUserId: 'attacker@evil.com', externalOrgId: 'other-org',
        },
      },
      res,
    );
    assert.equal(res._status, 200);
    assert.equal(bridgeRequests.length, 1);
    const call = bridgeRequests[0];
    assert.equal(call.url, '/customer/ops-requests');
    assert.equal(call.body.category, 'supply_request', 'GGX "supply" must map to Bridge\'s "supply_request"');
    assert.equal(call.body.subtype, 'other_packaging_supplies', 'GGX "other_packaging" must map to Bridge\'s "other_packaging_supplies"');
    assert.equal(call.body.externalUserId, 'max@email.com', 'server-resolved identity must win over anything client-supplied');
    assert.equal(call.body.externalOrgId, 'ggx-corporate', 'externalOrgId is always the pinned single-account constant, never the caller\'s own accountId');
  });

  it('never trusts a client-supplied requestedByName — always the server-verified display name', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler(
      {
        method: 'POST',
        headers: { ...sessionCookie(), 'idempotency-key': 'test-idem-key-4' },
        body: { category: 'supply', subtype: 'pouches', requestedByName: 'Someone Else Entirely' },
      },
      res,
    );
    assert.equal(res._status, 200);
    assert.equal(bridgeRequests[0].body.requestedByName, 'Max Rodriguez');
  });

  it('a subaccount manager can never attribute a request to a different subaccount or person — requestData is forced server-side', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler(
      {
        method: 'POST',
        headers: { ...managerSessionCookie(), 'idempotency-key': 'test-idem-key-5' },
        body: {
          category: 'supply', subtype: 'pouches',
          requestData: { subaccountId: 'acme-corporation', subaccountName: 'Someone Else\'s Subaccount', createdBy: 'Impersonated Name', supplyType: 'pouches', quantity: 50 },
        },
      },
      res,
    );
    assert.equal(res._status, 200);
    const sentRequestData = bridgeRequests[0].body.requestData;
    assert.equal(sentRequestData.subaccountId, 'acme-luzon', 'must be forced to the manager\'s own subaccount, never the spoofed value');
    assert.equal(sentRequestData.subaccountName, 'Acme Luzon');
    assert.equal(sentRequestData.createdBy, 'Rina Lopez');
    assert.equal(sentRequestData.quantity, 50, 'non-identity requestData fields still pass through unchanged');
  });

  it('the Main Account admin\'s explicit subaccount choice IS trusted (they already have unrestricted cross-subaccount access)', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler(
      {
        method: 'POST',
        headers: { ...sessionCookie(), 'idempotency-key': 'test-idem-key-6' },
        body: {
          category: 'supply', subtype: 'pouches',
          requestData: { subaccountId: 'acme-corporation', subaccountName: 'Acme Corporation', supplyType: 'pouches', quantity: 50 },
        },
      },
      res,
    );
    assert.equal(res._status, 200);
    const sentRequestData = bridgeRequests[0].body.requestData;
    assert.equal(sentRequestData.subaccountId, 'acme-corporation');
    assert.equal(sentRequestData.subaccountName, 'Acme Corporation');
    assert.equal(sentRequestData.createdBy, 'Max Rodriguez', 'createdBy is always the server-verified name, even for the admin');
  });

  it('maps operational_assistance subtypes that differ from Bridge\'s keys', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler(
      { method: 'POST', headers: { ...sessionCookie(), 'idempotency-key': 'test-idem-key-2' }, body: { category: 'operational_assistance', subtype: 'high_volume_dispatch' } },
      res,
    );
    assert.equal(bridgeRequests[0].body.category, 'operational_assistance');
    assert.equal(bridgeRequests[0].body.subtype, 'high_volume_dispatch_coordination');
  });

  it('passes pickup_support subtypes through unchanged (already identical to Bridge)', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await indexHandler(
      { method: 'POST', headers: { ...sessionCookie(), 'idempotency-key': 'test-idem-key-3' }, body: { category: 'pickup_support', subtype: 'four_wheel_pickup' } },
      res,
    );
    assert.equal(bridgeRequests[0].body.category, 'pickup_support');
    assert.equal(bridgeRequests[0].body.subtype, 'four_wheel_pickup');
  });
});

describe('GET /api/ops-requests/:id', () => {
  it('401s with no session', async () => {
    const res = makeRes();
    await byIdHandler({ method: 'GET', query: { id: 'OPR-2026-0001' }, headers: {} }, res);
    assert.equal(res._status, 401);
  });

  it('relays one Ops Request by request number, scoped by identity', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await byIdHandler({ method: 'GET', query: { id: 'OPR-2026-0001' }, headers: sessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.requestNumber, 'OPR-2026-0001');
    const req = bridgeRequests.find((r) => r.method === 'GET' && r.url.startsWith('/customer/ops-requests/OPR-2026-0001?'));
    assert.ok(req, 'expected a GET /customer/ops-requests/OPR-2026-0001?... call');
  });

  it('404s for an unknown request', async () => {
    const res = makeRes();
    await byIdHandler({ method: 'GET', query: { id: 'OPR-MISSING' }, headers: sessionCookie() }, res);
    assert.equal(res._status, 404);
  });

  it('a subaccount manager 404s reading a request that belongs to a DIFFERENT subaccount (fail-closed, never 403)', async () => {
    const res = makeRes();
    await byIdHandler({ method: 'GET', query: { id: 'OPR-2026-0001' }, headers: managerSessionCookie() }, res);
    assert.equal(res._status, 404, 'OPR-2026-0001 belongs to "main", not the manager\'s "acme-luzon" subaccount');
  });

  it('a subaccount manager CAN read their own subaccount\'s request', async () => {
    const res = makeRes();
    await byIdHandler({ method: 'GET', query: { id: 'OPR-2026-0002' }, headers: managerSessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.requestNumber, 'OPR-2026-0002');
  });

  it('the Main Account admin can read ANY subaccount\'s request', async () => {
    const res = makeRes();
    await byIdHandler({ method: 'GET', query: { id: 'OPR-2026-0002' }, headers: sessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.requestNumber, 'OPR-2026-0002');
  });
});

describe('GET /api/ops-requests/:id/updates', () => {
  it('401s with no session', async () => {
    const res = makeRes();
    await updatesHandler({ method: 'GET', query: { id: 'OPR-2026-0001' }, headers: {} }, res);
    assert.equal(res._status, 401);
  });

  it('relays the client-visible update history', async () => {
    const res = makeRes();
    await updatesHandler({ method: 'GET', query: { id: 'OPR-2026-0001' }, headers: sessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.length, 1);
    assert.equal(res._body[0].type, 'status_changed');
  });

  it('a subaccount manager 404s reading another subaccount\'s update history (ownership checked before the updates fetch)', async () => {
    const res = makeRes();
    await updatesHandler({ method: 'GET', query: { id: 'OPR-2026-0001' }, headers: managerSessionCookie() }, res);
    assert.equal(res._status, 404);
  });
});
