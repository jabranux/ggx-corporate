/**
 * Focused regression test for `POST /api/auth/quick-login` — the server-side
 * half of the Quick Login credential fix (see
 * docs/migration/ggx-corporate-heyq-live-ticketing.md §21). The client sends
 * only an opaque `scope` ('main' | 'subaccount'); this handler is the ONLY
 * place that scope resolves to a demo user and mints the same signed
 * `ggx_session` cookie `POST /api/auth/login` does.
 *
 * Bundled with esbuild the same way `api-support-categories.test.mjs` bundles
 * a handler — `api/**` isn't served by the plain `vite` dev server the
 * browser-driven tests in this suite use (no Vercel Functions runtime
 * locally).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-api-quick-login-test-'));

let quickLoginHandler;
let verifySessionToken;

before(async () => {
  process.env.SESSION_SECRET = 'test-secret-for-quick-login-test';

  const [handlerOut, sessionOut] = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/api/auth/quick-login.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/api/_lib/session.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);
  const handlerFile = path.join(TMP_DIR, 'quickLoginHandler.cjs');
  const sessionFile = path.join(TMP_DIR, 'sessionLib.cjs');
  fs.writeFileSync(handlerFile, handlerOut.outputFiles[0].text);
  fs.writeFileSync(sessionFile, sessionOut.outputFiles[0].text);

  const handlerMod = await import(`file://${handlerFile.replace(/\\/g, '/')}`);
  const sessionMod = await import(`file://${sessionFile.replace(/\\/g, '/')}`);
  quickLoginHandler = handlerMod.default.default ?? handlerMod.default;
  verifySessionToken = sessionMod.verifySessionToken ?? sessionMod.default.verifySessionToken;
});

after(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeReq(method, body) {
  return { method, body, headers: { 'content-type': 'application/json' } };
}

function makeRes() {
  return {
    _status: 200, _body: undefined, _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; },
    send(text) { this._body = text; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

/** Pull the ggx_session token value out of a `Set-Cookie` header. */
function cookieToken(setCookieHeader) {
  const match = /ggx_session=([^;]+)/.exec(setCookieHeader ?? '');
  return match?.[1];
}

describe('POST /api/auth/quick-login', () => {
  it('scope "main" issues a signed session for the seeded admin (user-admin-001 / Main Account)', async () => {
    const res = makeRes();
    await quickLoginHandler(makeReq('POST', { scope: 'main' }), res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._body.user, {
      id: 'user-admin-001', name: 'Max Rodriguez', email: 'max@email.com',
      role: 'admin', accountId: 'main', accountName: 'Main Account',
    });
    assert.ok(!('password' in res._body.user), 'quick-login response must never include a password field');

    const token = cookieToken(res._headers['Set-Cookie']);
    assert.ok(token, 'expected a Set-Cookie: ggx_session=... header');
    const payload = verifySessionToken(token);
    assert.equal(payload?.sub, 'user-admin-001');
    assert.equal(payload?.role, 'admin');
    assert.equal(payload?.accountId, 'main');
  });

  it('scope "subaccount" issues a signed session for the seeded manager (user-mgr-001 / Acme Luzon)', async () => {
    const res = makeRes();
    await quickLoginHandler(makeReq('POST', { scope: 'subaccount' }), res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._body.user, {
      id: 'user-mgr-001', name: 'Rina Lopez', email: 'manager@email.com',
      role: 'manager', accountId: 'acme-luzon', accountName: 'Acme Luzon',
    });

    const token = cookieToken(res._headers['Set-Cookie']);
    const payload = verifySessionToken(token);
    assert.equal(payload?.sub, 'user-mgr-001');
    assert.equal(payload?.role, 'manager');
    assert.equal(payload?.accountId, 'acme-luzon');
  });

  it('rejects an unrecognized scope with 400 and issues no session', async () => {
    for (const badScope of ['admin', 'user-admin-001', 'max@email.com', '', undefined, null, 42]) {
      const res = makeRes();
      await quickLoginHandler(makeReq('POST', { scope: badScope }), res);
      assert.equal(res._status, 400, `scope=${JSON.stringify(badScope)} should be rejected`);
      assert.equal(res._headers['Set-Cookie'], undefined, `scope=${JSON.stringify(badScope)} must not set a session cookie`);
    }
  });

  it('rejects a non-POST method with 405', async () => {
    const res = makeRes();
    await quickLoginHandler(makeReq('GET', {}), res);
    assert.equal(res._status, 405);
  });

  it('stays enabled on every deployed Vercel tier (VERCEL_ENV=production or preview) — issues a session for a valid scope', async () => {
    // §21.7 reverted the deploy-tier gate: the fixed scope→user mapping is
    // the security boundary here, not environment.
    for (const tier of ['production', 'preview']) {
      const prevVercelEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = tier;
      try {
        const res = makeRes();
        await quickLoginHandler(makeReq('POST', { scope: 'main' }), res);
        assert.equal(res._status, 200, `VERCEL_ENV=${tier} should still issue a session`);
        assert.ok(res._headers['Set-Cookie'], `VERCEL_ENV=${tier} must still issue a Quick Login session`);
      } finally {
        if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
        else process.env.VERCEL_ENV = prevVercelEnv;
      }
    }
  });

  it('stays enabled when NODE_ENV=production even with VERCEL_ENV unset', async () => {
    const prevVercelEnv = process.env.VERCEL_ENV;
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = makeRes();
      await quickLoginHandler(makeReq('POST', { scope: 'main' }), res);
      assert.equal(res._status, 200);
    } finally {
      if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prevVercelEnv;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
    }
  });

  it('stays enabled in true local dev (VERCEL_ENV and NODE_ENV=production both unset — plain `npm run dev` / node --test)', async () => {
    const prevVercelEnv = process.env.VERCEL_ENV;
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
    if (prevNodeEnv === 'production') delete process.env.NODE_ENV;
    try {
      const res = makeRes();
      await quickLoginHandler(makeReq('POST', { scope: 'main' }), res);
      assert.equal(res._status, 200);
    } finally {
      if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prevVercelEnv;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
    }
  });

  it('stays enabled under `vercel dev` (VERCEL_ENV=development) — a real local Functions runtime, not a public deployment', async () => {
    const prevVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'development';
    try {
      const res = makeRes();
      await quickLoginHandler(makeReq('POST', { scope: 'subaccount' }), res);
      assert.equal(res._status, 200);
      assert.equal(res._body.user.accountId, 'acme-luzon');
    } finally {
      if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prevVercelEnv;
    }
  });
});
