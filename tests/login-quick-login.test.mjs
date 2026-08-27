/**
 * Regression coverage for the Quick Login UI cleanup (Login.tsx) and its
 * follow-up fix: Quick Login must never hold or send the seeded credentials
 * client-side (see docs/migration/ggx-corporate-heyq-live-ticketing.md §21).
 *
 * Quick Login must:
 *   1. Show "Main Account" / "Subaccount" labels with their short descriptions.
 *   2. Map each option to the correct existing seeded account (unchanged
 *      underneath — same admin/manager identities as manual login).
 *   3. Authenticate through the same signed-session flow as manual login —
 *      now via `POST /api/auth/quick-login` with an opaque `scope`, resolved
 *      to a demo user server-side (`resolveQuickLoginUser`,
 *      `api/_lib/demoUsers.ts`) — never a client-held email/password.
 *      (Stubbed here the same way `helpers.mjs`'s `signIn` stubs
 *      `/api/auth/login` — no live Vercel functions runtime under plain
 *      `vite`.)
 *   4. Leave normal manual login working.
 *   5. Never render OR transmit the underlying seeded credentials or
 *      internal account ids — `Login.tsx`'s source must not contain them,
 *      the rendered page must not show them, and the Quick Login network
 *      request must carry only `{ scope }`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startDevServer, stopDevServer, stubAuthEndpoints, signIn, CREDENTIALS } from './helpers.mjs';

const PORT = 5197;
const LOGIN_TSX = path.resolve(import.meta.dirname, '..', 'src', 'app', 'pages', 'Login.tsx');

let server;
let browser;

before(async () => {
  server = await startDevServer(PORT);
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  stopDevServer(server);
});

describe('Login.tsx source — no client-side seeded credentials', () => {
  it('does not contain the seeded demo email/password anywhere in source', () => {
    const source = fs.readFileSync(LOGIN_TSX, 'utf-8');
    for (const leaked of [CREDENTIALS.admin.email, CREDENTIALS.manager.email, CREDENTIALS.admin.password]) {
      assert.ok(!source.includes(leaked), `expected Login.tsx source not to contain "${leaked}"`);
    }
  });
});

// §21.7: the endpoint 404s on any publicly reachable deployment
// (`isPubliclyReachable()`, api/auth/quick-login.ts); this guards the client
// side of that same boundary so the dead-click cards don't ship to prod.
describe('Login.tsx source — Quick Login UI is gated to non-production builds', () => {
  it('renders the Quick Login cards only when `import.meta.env.PROD` is false', () => {
    const source = fs.readFileSync(LOGIN_TSX, 'utf-8');
    assert.match(
      source,
      /const SHOW_QUICK_LOGIN = !import\.meta\.env\.PROD;/,
      'expected a SHOW_QUICK_LOGIN flag derived from import.meta.env.PROD'
    );
    assert.match(
      source,
      /\{SHOW_QUICK_LOGIN && \(/,
      'expected the Quick Login heading/cards block to be conditionally rendered on SHOW_QUICK_LOGIN'
    );
  });
});

describe('Login page — Quick Login', () => {
  it('shows Main Account and Subaccount options with their descriptions, and no underlying credentials', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await stubAuthEndpoints(page);
    await page.goto(server.base + '/', { waitUntil: 'networkidle' });

    const bodyText = await page.textContent('body');
    assert.match(bodyText, /Quick Login/);
    assert.match(bodyText, /Main Account/);
    assert.match(bodyText, /access to the main corporate account with broader administrative capabilities/i);
    assert.match(bodyText, /Subaccount/);
    assert.match(bodyText, /access scoped to a managed subaccount for day-to-day operations/i);

    // No seeded-account internals rendered anywhere on the page.
    for (const leaked of [CREDENTIALS.admin.email, CREDENTIALS.manager.email, CREDENTIALS.admin.password, 'user-admin-001', 'user-mgr-001', 'acme-luzon']) {
      assert.ok(!bodyText.includes(leaked), `expected page not to render "${leaked}"`);
    }

    await context.close();
  });

  it('Main Account quick login sends only an opaque scope and signs in as the seeded admin', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await stubAuthEndpoints(page);
    await page.goto(server.base + '/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /Main Account/ }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });

    // The request the client actually sent — must carry only { scope }, no
    // email/password (proves the credential resolution moved server-side).
    const requests = await page.evaluate(() => window.__authRequests ?? []);
    const quickLoginCall = requests.find((r) => r.path === '/api/auth/quick-login');
    assert.ok(quickLoginCall, 'expected a POST /api/auth/quick-login call');
    assert.deepEqual(Object.keys(quickLoginCall.body).sort(), ['scope']);
    assert.equal(quickLoginCall.body.scope, 'main');
    assert.ok(!requests.some((r) => r.path === '/api/auth/login'), 'Quick Login must not also call /api/auth/login');

    // AuthContext session persisted by quickLoginMockUser via the (stubbed)
    // POST /api/auth/quick-login — proves it went through the same
    // session-issuing flow manual login uses, not a client-only session.
    const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('ggx.auth') ?? 'null'));
    assert.equal(auth?.email, 'max@email.com');
    assert.equal(auth?.role, 'admin');
    assert.equal(auth?.accountId, 'main');
    assert.equal(auth?.accountName, 'Main Account');

    await context.close();
  });

  it('Subaccount quick login sends only an opaque scope and signs in as the seeded manager, scoped to their subaccount', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await stubAuthEndpoints(page);
    await page.goto(server.base + '/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /^Subaccount/ }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });

    const requests = await page.evaluate(() => window.__authRequests ?? []);
    const quickLoginCall = requests.find((r) => r.path === '/api/auth/quick-login');
    assert.ok(quickLoginCall, 'expected a POST /api/auth/quick-login call');
    assert.deepEqual(Object.keys(quickLoginCall.body).sort(), ['scope']);
    assert.equal(quickLoginCall.body.scope, 'subaccount');

    const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('ggx.auth') ?? 'null'));
    assert.equal(auth?.email, 'manager@email.com');
    assert.equal(auth?.role, 'manager');
    assert.equal(auth?.accountId, 'acme-luzon');
    assert.equal(auth?.accountName, 'Acme Luzon');

    // The topbar renders the manager's scoped account name (RootLayout.tsx).
    // Wait for the SPA to actually paint post-navigation — waitForURL only
    // observes the history change, not the React re-render.
    await page.waitForFunction(() => document.body.innerText.includes('Acme Luzon'), null, { timeout: 10_000 });

    await context.close();
  });

  it('normal manual login is unaffected by the Quick Login addition', async () => {
    const { browser: signInBrowser, context, page } = await signIn(server.base, 'admin');
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('ggx.auth') ?? 'null'));
    assert.equal(auth?.email, CREDENTIALS.admin.email);
    await context.close();
    await signInBrowser.close();
  });
});
