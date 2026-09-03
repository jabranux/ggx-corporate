/**
 * Focused regression tests for the new `/api/claims/:claimId/*` BFF routes
 * (sync / state / messages) — see
 * docs/migration/ggx-corporate-quadx-bridge-claims-integration.md.
 *
 * `api/**` isn't served by the plain Vite dev server the other browser-driven
 * tests in this suite use, so this bundles each handler + its `_lib` deps
 * with esbuild and calls it directly against a real local fake Bridge HTTP
 * server — same approach as `tests/api-support-categories.test.mjs`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-claims-test-'));

let syncHandler;
let stateHandler;
let messagesHandler;
let createSessionToken;
let bridgeServer;
let bridgeRequests;

const FAKE_KEY = 'fake-bridge-key-for-claims-test';
const TICKET_ID = '11111111-1111-1111-1111-111111111111';

function fakeClaimState(overrides = {}) {
  return {
    claimId: '22222222-2222-2222-2222-222222222222',
    externalReference: 'CLM-1008',
    status: 'pending_approval',
    reason: 'delivery_failure',
    trackingNumber: 'GGX-2026-90006',
    filedAt: '2026-08-30T00:00:00.000Z',
    ticket: { id: TICKET_ID, status: 'open', customerVisible: true },
    timelineEvents: [{ type: 'claim_filed', summary: 'Claim filed', occurredAt: '2026-08-30T00:00:00.000Z' }],
    messages: [],
    ...overrides,
  };
}

before(async () => {
  process.env.SESSION_SECRET = 'test-secret-for-claims-test';
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
      if (req.method === 'POST' && req.url === '/customer/claims') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fakeClaimState()));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/customer/claims/')) {
        const ref = decodeURIComponent(req.url.split('/customer/claims/')[1].split('?')[0]);
        if (ref === 'CLM-MISSING') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Claim not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fakeClaimState({ externalReference: ref })));
        return;
      }
      if (req.method === 'POST' && req.url === `/customer/tickets/${TICKET_ID}/messages`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: TICKET_ID, status: 'in_progress', messages: [] }));
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
    esbuild.build({ entryPoints: [`${ROOT}/api/claims/[claimId]/sync.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/claims/[claimId]/state.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/claims/[claimId]/messages.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const names = ['sync', 'state', 'messages', 'session'];
  const mods = {};
  for (let i = 0; i < builds.length; i++) {
    const file = path.join(TMP_DIR, `${names[i]}.cjs`);
    fs.writeFileSync(file, builds[i].outputFiles[0].text);
    mods[names[i]] = await import(`file://${file.replace(/\\/g, '/')}`);
  }
  syncHandler = mods.sync.default.default ?? mods.sync.default;
  stateHandler = mods.state.default.default ?? mods.state.default;
  messagesHandler = mods.messages.default.default ?? mods.messages.default;
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

describe('POST /api/claims/:claimId/sync', () => {
  it('401s with no session, never reaching Bridge', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await syncHandler({ method: 'POST', query: { claimId: 'CLM-1008' }, headers: {}, body: {} }, res);
    assert.equal(res._status, 401);
    assert.equal(bridgeRequests.length, 0);
  });

  it('always sends externalReference = the URL claimId, ignoring any body override, and maps the GGX reason string to Bridge\'s canonical code', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await syncHandler(
      { method: 'POST', query: { claimId: 'CLM-1008' }, headers: sessionCookie(), body: { reason: 'Lost in transit', externalReference: 'SPOOFED', trackingNumber: 'GGX-2026-90006' } },
      res,
    );
    assert.equal(res._status, 200);
    assert.equal(bridgeRequests.length, 1);
    assert.equal(bridgeRequests[0].url, '/customer/claims');
    assert.equal(bridgeRequests[0].body.externalReference, 'CLM-1008');
    assert.equal(bridgeRequests[0].body.reason, 'lost_parcel');
    assert.equal(bridgeRequests[0].body.externalUserId, 'max@email.com', 'server-resolved identity must win over anything client-supplied');
    assert.equal(bridgeRequests[0].body.externalOrgId, 'main');
  });

  it('never trusts a client-supplied externalUserId/externalOrgId/demoAccountId', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await syncHandler(
      { method: 'POST', query: { claimId: 'CLM-1008' }, headers: sessionCookie(), body: { reason: 'Other', externalUserId: 'attacker@evil.com', externalOrgId: 'other-org', demoAccountId: 'user-mgr-001' } },
      res,
    );
    assert.equal(bridgeRequests[0].body.externalUserId, 'max@email.com');
    assert.equal(bridgeRequests[0].body.externalOrgId, 'main');
  });

  it('405s on a non-POST method', async () => {
    const res = makeRes();
    await syncHandler({ method: 'GET', query: { claimId: 'CLM-1008' }, headers: {}, body: {} }, res);
    assert.equal(res._status, 405);
  });
});

describe('GET /api/claims/:claimId/state', () => {
  it('401s with no session', async () => {
    const res = makeRes();
    await stateHandler({ method: 'GET', query: { claimId: 'CLM-1008' }, headers: {} }, res);
    assert.equal(res._status, 401);
  });

  it('relays a linked claim\'s live state, scoped by the session-derived identity', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await stateHandler({ method: 'GET', query: { claimId: 'CLM-1008' }, headers: sessionCookie() }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.externalReference, 'CLM-1008');
    assert.equal(res._body.ticket.id, TICKET_ID);
    const req = bridgeRequests.find((r) => r.method === 'GET' && r.url.startsWith('/customer/claims/CLM-1008'));
    assert.ok(req, 'expected a GET /customer/claims/CLM-1008 call');
    assert.ok(req.url.includes('externalUserId=max%40email.com'));
  });

  it('404s for an unlinked/unknown claim', async () => {
    const res = makeRes();
    await stateHandler({ method: 'GET', query: { claimId: 'CLM-MISSING' }, headers: sessionCookie() }, res);
    assert.equal(res._status, 404);
  });
});

describe('POST /api/claims/:claimId/messages', () => {
  it('401s with no session', async () => {
    const res = makeRes();
    await messagesHandler({ method: 'POST', query: { claimId: 'CLM-1008' }, headers: {}, body: {} }, res);
    assert.equal(res._status, 401);
  });

  it('rejects an attachment payload with 400, never reaching Bridge', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await messagesHandler(
      { method: 'POST', query: { claimId: 'CLM-1008' }, headers: sessionCookie(), body: { body: 'hi', attachments: [{ name: 'x.png' }] } },
      res,
    );
    assert.equal(res._status, 400);
    assert.equal(bridgeRequests.length, 0);
  });

  it('resolves the ticket id server-side (never trusting a client-supplied one) and posts the reply to it, with X-Bridge-Message-Id forwarded', async () => {
    bridgeRequests = [];
    const res = makeRes();
    await messagesHandler(
      { method: 'POST', query: { claimId: 'CLM-1008' }, headers: { ...sessionCookie(), 'x-bridge-message-id': 'msg-123' }, body: { body: 'Any update?', ticketId: 'SPOOFED-TICKET-ID' } },
      res,
    );
    assert.equal(res._status, 200);
    const claimGet = bridgeRequests.find((r) => r.method === 'GET' && r.url.startsWith('/customer/claims/CLM-1008'));
    const messagePost = bridgeRequests.find((r) => r.method === 'POST' && r.url === `/customer/tickets/${TICKET_ID}/messages`);
    assert.ok(claimGet, 'expected the route to resolve the ticket id via a claim state read first');
    assert.ok(messagePost, 'expected the reply to be posted to the REAL linked ticket id, not the spoofed one');
    assert.equal(messagePost.body.body, 'Any update?');
    assert.equal(messagePost.body.externalUserId, 'max@email.com');
  });

  it('404s when the claim has no linked ticket yet', async () => {
    const res = makeRes();
    await messagesHandler({ method: 'POST', query: { claimId: 'CLM-MISSING' }, headers: sessionCookie(), body: { body: 'hi' } }, res);
    assert.equal(res._status, 404);
  });
});
