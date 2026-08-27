/**
 * Route-level contract tests for `/api/support/tickets/:id/typing` (send)
 * and `/api/support/tickets/:id/typing/subscribe` (mint a Realtime receive
 * credential) — the server-side half of the typing-presence feature (see
 * `useTicketConversation.ts`'s module docblock and each route's own
 * docblock). `tests/heyq-typing.test.mjs` already exercises the wired-up
 * client behavior against a browser-level fetch stub; that stub bypasses
 * these routes entirely, so it can never catch a mismatch between what
 * Corporate's proxy sends and what the deployed QuadX Bridge contract
 * actually expects. This test bundles the real handlers with esbuild (same
 * approach as `tests/api-support-categories.test.mjs`) and drives them
 * against a real local fake Bridge HTTP server, asserting the exact route,
 * method, request body/query shape, response relay, ticket-UUID
 * passthrough, and server-verified (never client-supplied) identity.
 *
 * The former `GET /typing` route (a 3s-polled snapshot read) is REMOVED —
 * see `api/support/tickets/[id]/typing.ts`'s docblock — so there is no GET
 * coverage here any more; a GET now 405s like any other unsupported method.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-typing-test-'));

const FAKE_KEY = 'fake-bridge-key-for-typing-test';
// A real-looking Bridge ticket UUID — the route must forward this verbatim,
// never the human-readable `reference`.
const TICKET_UUID = '11111111-2222-3333-4444-555555555555';

const FAKE_SUBSCRIBE_RESPONSE = {
  token: 'fake.realtime.jwt',
  channel: `ticket:${TICKET_UUID}:agent_typing`,
  expiresIn: 300,
  expiresAt: '2026-08-27T12:05:00.000Z',
  supabaseUrl: 'https://fake-project.supabase.co',
  supabaseAnonKey: 'fake-anon-key',
};

let bridgeServer;
let bridgePort;
let typingHandler;
let subscribeHandler;
let createSessionToken;
let bridgeRequests;

before(async () => {
  process.env.SESSION_SECRET = 'test-secret-for-typing-test';
  process.env.QUADX_BRIDGE_API_KEY = FAKE_KEY;

  bridgeRequests = [];
  bridgeServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const url = new URL(req.url, 'http://x');
      const parsedBody = raw ? JSON.parse(raw) : undefined;
      bridgeRequests.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: parsedBody,
        key: req.headers['x-corporate-internal-key'],
      });

      if (req.headers['x-corporate-internal-key'] !== FAKE_KEY) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthenticated Corporate Bridge Caller' }));
        return;
      }
      if (url.pathname === `/customer/tickets/${TICKET_UUID}/typing` && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ typing: parsedBody?.state === 'start' }));
        return;
      }
      if (url.pathname === `/customer/tickets/${TICKET_UUID}/typing/subscribe` && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(FAKE_SUBSCRIBE_RESPONSE));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket not found' }));
    });
  });
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve));
  bridgePort = bridgeServer.address().port;
  process.env.QUADX_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`;

  const [typingOut, subscribeOut, sessionOut] = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/api/support/tickets/[id]/typing.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/support/tickets/[id]/typing/subscribe.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const typingFile = path.join(TMP_DIR, 'typingHandler.cjs');
  const subscribeFile = path.join(TMP_DIR, 'subscribeHandler.cjs');
  const sessionFile = path.join(TMP_DIR, 'sessionLib.cjs');
  fs.writeFileSync(typingFile, typingOut.outputFiles[0].text);
  fs.writeFileSync(subscribeFile, subscribeOut.outputFiles[0].text);
  fs.writeFileSync(sessionFile, sessionOut.outputFiles[0].text);

  const typingMod = await import(`file://${typingFile.replace(/\\/g, '/')}`);
  const subscribeMod = await import(`file://${subscribeFile.replace(/\\/g, '/')}`);
  const sessionMod = await import(`file://${sessionFile.replace(/\\/g, '/')}`);
  typingHandler = typingMod.default.default ?? typingMod.default;
  subscribeHandler = subscribeMod.default.default ?? subscribeMod.default;
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
    send(text) { this._body = typeof text === 'string' ? JSON.parse(text) : text; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

function sessionCookie() {
  const token = createSessionToken({ sub: 'user-admin-001', email: 'max@email.com', role: 'admin', accountId: 'main', accountName: 'Main Account' });
  return `ggx_session=${token}`;
}

describe('POST /api/support/tickets/:id/typing — deployed QuadX Bridge contract (send)', () => {
  it('forwards { externalUserId, externalOrgId, state } to the exact deployed Bridge route and relays { typing }', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await typingHandler(
      { method: 'POST', query: { id: TICKET_UUID }, body: { state: 'start' }, headers: { cookie: sessionCookie() } },
      res,
    );
    assert.equal(res._status, 200);
    assert.deepEqual(res._body, { typing: true });

    assert.equal(bridgeRequests.length, 1);
    const call = bridgeRequests[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.path, `/customer/tickets/${TICKET_UUID}/typing`);
    assert.deepEqual(call.body, { state: 'start', externalUserId: 'max@email.com', externalOrgId: 'main' });
    assert.equal(call.key, FAKE_KEY);
  });

  it('ignores a spoofed identity in the request body/query — only the server-verified session identity ever reaches Bridge', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await typingHandler(
      {
        method: 'POST',
        query: { id: TICKET_UUID, externalUserId: 'attacker@evil.com', externalOrgId: 'other-org' },
        body: { state: 'start', externalUserId: 'attacker@evil.com', externalOrgId: 'other-org' },
        headers: { cookie: sessionCookie() },
      },
      res,
    );
    assert.equal(res._status, 200);
    assert.equal(bridgeRequests[0].body.externalUserId, 'max@email.com', 'must use the verified session identity, never the request-supplied one');
    assert.equal(bridgeRequests[0].body.externalOrgId, 'main');
  });

  it('the ticket id is forwarded to Bridge verbatim (the UUID, never rewritten)', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await typingHandler({ method: 'POST', query: { id: TICKET_UUID }, body: { state: 'start' }, headers: { cookie: sessionCookie() } }, res);
    assert.equal(bridgeRequests[0].path, `/customer/tickets/${TICKET_UUID}/typing`);
  });

  it('401s before ever calling Bridge when there is no session cookie', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await typingHandler({ method: 'POST', query: { id: TICKET_UUID }, body: { state: 'start' }, headers: {} }, res);
    assert.equal(res._status, 401);
    assert.equal(bridgeRequests.length, 0, 'an unauthenticated caller must never reach Bridge');
  });

  it('400s a malformed state without ever calling Bridge', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await typingHandler(
      { method: 'POST', query: { id: TICKET_UUID }, body: { state: 'sideways' }, headers: { cookie: sessionCookie() } },
      res,
    );
    assert.equal(res._status, 400);
    assert.equal(bridgeRequests.length, 0);
  });

  it('405s any method other than POST — GET included, now that the poll it served is retired', async () => {
    const getRes = makeRes();
    await typingHandler({ method: 'GET', query: { id: TICKET_UUID }, headers: { cookie: sessionCookie() } }, getRes);
    assert.equal(getRes._status, 405);

    const deleteRes = makeRes();
    await typingHandler({ method: 'DELETE', query: { id: TICKET_UUID }, headers: { cookie: sessionCookie() } }, deleteRes);
    assert.equal(deleteRes._status, 405);
  });
});

describe('POST /api/support/tickets/:id/typing/subscribe — deployed QuadX Bridge contract (receive credential)', () => {
  it('forwards { externalUserId, externalOrgId } to the exact deployed Bridge route and relays the full credential', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await subscribeHandler(
      { method: 'POST', query: { id: TICKET_UUID }, body: {}, headers: { cookie: sessionCookie() } },
      res,
    );
    assert.equal(res._status, 200);
    assert.deepEqual(res._body, FAKE_SUBSCRIBE_RESPONSE);

    assert.equal(bridgeRequests.length, 1);
    const call = bridgeRequests[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.path, `/customer/tickets/${TICKET_UUID}/typing/subscribe`);
    assert.deepEqual(call.body, { externalUserId: 'max@email.com', externalOrgId: 'main' });
    assert.equal(call.key, FAKE_KEY);
  });

  it('never forwards a service-role secret or anything beyond the verified identity', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await subscribeHandler({ method: 'POST', query: { id: TICKET_UUID }, body: {}, headers: { cookie: sessionCookie() } }, res);
    const sentKeys = Object.keys(bridgeRequests[0].body).sort();
    assert.deepEqual(sentKeys, ['externalOrgId', 'externalUserId']);
    assert.ok(!JSON.stringify(bridgeRequests[0].body).toLowerCase().includes('service_role'));
  });

  it('ignores a spoofed identity in the request body/query — only the server-verified session identity ever reaches Bridge', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await subscribeHandler(
      {
        method: 'POST',
        query: { id: TICKET_UUID, externalUserId: 'attacker@evil.com', externalOrgId: 'other-org' },
        body: { externalUserId: 'attacker@evil.com', externalOrgId: 'other-org' },
        headers: { cookie: sessionCookie() },
      },
      res,
    );
    assert.equal(res._status, 200);
    assert.equal(bridgeRequests[0].body.externalUserId, 'max@email.com');
    assert.equal(bridgeRequests[0].body.externalOrgId, 'main');
  });

  it('the ticket id is forwarded to Bridge verbatim (the UUID, never rewritten)', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await subscribeHandler({ method: 'POST', query: { id: TICKET_UUID }, body: {}, headers: { cookie: sessionCookie() } }, res);
    assert.equal(bridgeRequests[0].path, `/customer/tickets/${TICKET_UUID}/typing/subscribe`);
  });

  it('401s before ever calling Bridge when there is no session cookie', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await subscribeHandler({ method: 'POST', query: { id: TICKET_UUID }, body: {}, headers: {} }, res);
    assert.equal(res._status, 401);
    assert.equal(bridgeRequests.length, 0, 'an unauthenticated caller must never reach Bridge');
  });

  it('relays a Bridge 404 unchanged (an unowned/nonexistent ticket — never a 403)', async () => {
    bridgeRequests.length = 0;
    const res = makeRes();
    await subscribeHandler(
      { method: 'POST', query: { id: '00000000-0000-0000-0000-000000000000' }, body: {}, headers: { cookie: sessionCookie() } },
      res,
    );
    assert.equal(res._status, 404);
  });

  it('405s any method other than POST', async () => {
    const res = makeRes();
    await subscribeHandler({ method: 'GET', query: { id: TICKET_UUID }, headers: { cookie: sessionCookie() } }, res);
    assert.equal(res._status, 405);
  });
});
