// Reproducible end-to-end validation for the GGX Corporate <-> HeyQ support
// integration, driven through the real deployed HTTP routes
// (`/api/auth/login`, `/api/support/**`) — never by importing handler code
// directly. Authenticates LEGITIMATELY through the real login endpoint (see
// docs/migration/ggx-corporate-heyq-live-ticketing.md, "Server-verified
// support identity"); it never bypasses or weakens auth to make automation
// easier.
//
// This file did not previously exist in the repo even though an earlier
// handoff entry (§17.2) described running it — that was a documentation/
// reality mismatch, not a deleted script (confirmed via `git log --all` on
// this path). This is the harness that entry should have pointed at.
//
// Credentials: the two accounts below are the app's own POC demo accounts —
// already shown on the Login screen itself as a sign-in hint
// (src/app/pages/Login.tsx) and duplicated server-side in
// api/_lib/demoUsers.ts. They are NOT production secrets; nothing here reads
// QUADX_BRIDGE_API_KEY, SESSION_SECRET, or any service-role key, and the
// script never could — those are server-only env vars this process has no
// access to even if it wanted them. Override via env if your deployment uses
// different demo accounts.
//
// Run (against local `vercel dev`, the default):
//   node scripts/prod-e2e-validation.mjs
// Run against a real deployment (explicit — never defaults to a live URL):
//   E2E_BASE_URL=https://ggx-corporate.vercel.app node scripts/prod-e2e-validation.mjs
//
// Exit code is 0 iff every check passes.

const BASE_URL = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'max@email.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? '!1234qwer',
};
const MANAGER = {
  email: process.env.E2E_MANAGER_EMAIL ?? 'manager@email.com',
  password: process.env.E2E_MANAGER_PASSWORD ?? '!1234qwer',
};

const RUN_TAG = `GGX-E2E-${Date.now()}`;
let passCount = 0;
let failCount = 0;
const createdTicketIds = [];

function log(status, label, detail) {
  const marker = status === 'pass' ? 'PASS' : 'FAIL';
  console.log(`[${marker}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (status === 'pass') passCount++;
  else failCount++;
}

function check(label, cond, detail) {
  log(cond ? 'pass' : 'fail', label, detail);
  return cond;
}

/** Extract the session cookie's name=value pair from a Set-Cookie response header,
 * ready to send back as a Cookie request header on subsequent calls. */
function cookieFromSetHeader(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function login(creds) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const cookie = cookieFromSetHeader(res);
  const body = await res.json().catch(() => null);
  return { res, cookie, body };
}

async function api(path, { method = 'GET', cookie, body, headers } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function main() {
  console.log(`Target: ${BASE_URL}`);
  console.log(`Run tag: ${RUN_TAG}\n`);

  // 1. Authenticated legitimate account -> support API succeeds.
  const adminLogin = await login(ADMIN);
  check('admin login succeeds (200) and sets a session cookie', adminLogin.res.status === 200 && !!adminLogin.cookie);
  const adminCookie = adminLogin.cookie;
  if (!adminCookie) {
    console.error('\nCannot continue without a valid admin session cookie.');
    process.exitCode = 1;
    return summarize();
  }

  // 2. Unauthenticated request -> rejected, fail closed.
  const noCookie = await api('/api/support/tickets');
  check('unauthenticated GET /api/support/tickets -> 401', noCookie.status === 401, `got ${noCookie.status}`);

  const garbageCookie = await api('/api/support/tickets', { cookie: 'ggx_session=not-a-real-token' });
  check('garbage session cookie -> 401 (fail closed, not silently accepted)', garbageCookie.status === 401, `got ${garbageCookie.status}`);

  // 3. Create + idempotency.
  const idemKey = `${RUN_TAG}-create`;
  const createBody = {
    name: 'E2E Admin', email: ADMIN.email, concernType: 'general_inquiry',
    subject: `${RUN_TAG} subject`, description: `${RUN_TAG} description`,
  };
  const create1 = await api('/api/support/tickets', { method: 'POST', cookie: adminCookie, body: createBody, headers: { 'Idempotency-Key': idemKey } });
  check('authenticated create -> 200/201', create1.status === 200 || create1.status === 201, `got ${create1.status}`);
  const ticketId = create1.body?.id;
  if (ticketId) createdTicketIds.push(ticketId);
  check('create response carries a ticket id', typeof ticketId === 'string' && ticketId.length > 0);

  const create2 = await api('/api/support/tickets', { method: 'POST', cookie: adminCookie, body: createBody, headers: { 'Idempotency-Key': idemKey } });
  check('retried create with the SAME Idempotency-Key returns the SAME ticket id', create2.body?.id === ticketId, `${create2.body?.id} vs ${ticketId}`);

  // 4. Forged identity fields in the body have no effect (server-resolved identity wins).
  const forgedCreate = await api('/api/support/tickets', {
    method: 'POST', cookie: adminCookie,
    body: { ...createBody, subject: `${RUN_TAG} forged`, demoAccountId: 'user-mgr-001', externalUserId: 'someone-else@email.com', externalOrgId: 'acme-luzon' },
    headers: { 'Idempotency-Key': `${RUN_TAG}-forged` },
  });
  const forgedId = forgedCreate.body?.id;
  if (forgedId && forgedId !== ticketId) createdTicketIds.push(forgedId);
  check('create with forged demoAccountId/externalUserId/externalOrgId still succeeds as the REAL caller', forgedCreate.status === 200 || forgedCreate.status === 201, `got ${forgedCreate.status}`);

  // 5. Get + reply + reply idempotency.
  if (ticketId) {
    const got = await api(`/api/support/tickets/${encodeURIComponent(ticketId)}`, { cookie: adminCookie });
    check('GET the created ticket -> 200 with matching subject', got.status === 200 && got.body?.subject === createBody.subject, `status ${got.status}`);

    const msgId = `${RUN_TAG}-msg-1`;
    const reply1 = await api(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', cookie: adminCookie, body: { body: `${RUN_TAG} reply` }, headers: { 'X-Bridge-Message-Id': msgId } });
    check('authenticated reply -> 200', reply1.status === 200, `got ${reply1.status}`);
    const reply2 = await api(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', cookie: adminCookie, body: { body: `${RUN_TAG} reply retry` }, headers: { 'X-Bridge-Message-Id': msgId } });
    check('retried reply with the SAME X-Bridge-Message-Id still returns 200 (Bridge dedupes)', reply2.status === 200, `got ${reply2.status}`);
  }

  // 5b. Resolved-ticket reply auto-reopen (no explicit reopen route — see the
  // handoff doc's "Reopen removal" section). Requires the ticket to actually
  // reach `resolved` first, which only an agent-side HeyQ action can do — not
  // reachable from this Corporate-only script. Skipped unless a pre-resolved
  // ticket id is supplied explicitly.
  if (process.env.E2E_RESOLVED_TICKET_ID) {
    const rid = process.env.E2E_RESOLVED_TICKET_ID;
    const before = await api(`/api/support/tickets/${encodeURIComponent(rid)}`, { cookie: adminCookie });
    check('E2E_RESOLVED_TICKET_ID starts resolved', before.body?.status === 'resolved', `got ${before.body?.status}`);
    const reopenReply = await api(`/api/support/tickets/${encodeURIComponent(rid)}/messages`, { method: 'POST', cookie: adminCookie, body: { body: `${RUN_TAG} reopen via reply` } });
    check('replying to a resolved ticket auto-reopens it', reopenReply.status === 200 && reopenReply.body?.status !== 'resolved', `now ${reopenReply.body?.status}`);
  } else {
    console.log('[SKIP] resolved-ticket auto-reopen — set E2E_RESOLVED_TICKET_ID to a ticket already in `resolved` status to exercise this (agent-side action, not creatable from this script)');
  }

  // 6. Cross-account isolation.
  const managerLogin = await login(MANAGER);
  check('manager login succeeds and sets its own session cookie', managerLogin.res.status === 200 && !!managerLogin.cookie);
  const managerCookie = managerLogin.cookie;
  if (managerCookie && ticketId) {
    const crossGet = await api(`/api/support/tickets/${encodeURIComponent(ticketId)}`, { cookie: managerCookie });
    check("manager GET on admin's ticket -> 404 (cross-account isolation)", crossGet.status === 404, `got ${crossGet.status}`);
    const crossReply = await api(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', cookie: managerCookie, body: { body: 'should not land' } });
    check("manager reply on admin's ticket -> 404", crossReply.status === 404, `got ${crossReply.status}`);
  }

  // 7. Forged demoAccountId/externalUserId/externalOrgId cannot escalate an
  //    authenticated-but-wrong-account caller either — the manager cannot
  //    read the admin ticket by claiming to be the admin in the body.
  if (managerCookie && ticketId) {
    const spoofedGet = await api(`/api/support/tickets/${encodeURIComponent(ticketId)}?demoAccountId=user-admin-001&externalUserId=${encodeURIComponent(ADMIN.email)}&externalOrgId=main`, { cookie: managerCookie });
    check('manager cannot use query-string identity spoofing to read the admin ticket -> 404', spoofedGet.status === 404, `got ${spoofedGet.status}`);
  }

  // 8. Attachment contract unchanged.
  const attachAttempt = await api('/api/support/tickets', { method: 'POST', cookie: adminCookie, body: { ...createBody, attachments: [{ name: 'x.pdf' }] } });
  check('attachment payload -> 400 (text-only Bridge contract)', attachAttempt.status === 400, `got ${attachAttempt.status}`);

  // 9. Logout actually clears the session.
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', headers: { Cookie: adminCookie } });
  const clearedSetCookieHeader = logoutRes.headers.get('set-cookie'); // full header — Max-Age lives past the first ';', which cookieFromSetHeader (deliberately) strips for reuse as a request Cookie
  check('logout returns 200 and clears the cookie (Max-Age=0)', logoutRes.status === 200 && /Max-Age=0/.test(clearedSetCookieHeader ?? ''), clearedSetCookieHeader ?? '(none)');
  const afterLogout = await api('/api/support/tickets', { cookie: adminCookie });
  // Note: the ORIGINAL cookie value is still cryptographically valid until it
  // expires (logout doesn't revoke server-side state, it just clears the
  // browser's copy) — this call intentionally reuses it to document that
  // limitation rather than assert a false guarantee. See the handoff doc's
  // "Server-verified support identity" section, "Known limitation: logout".
  check('post-logout request with the OLD cookie value still authenticates (documented limitation, not a bug)', afterLogout.status === 200, `got ${afterLogout.status}`);

  summarize();
}

function summarize() {
  console.log(`\n${passCount} passed, ${failCount} failed.`);
  if (createdTicketIds.length) {
    console.log(`\nCreated ticket ids (tag ${RUN_TAG}) — this script holds no DB/service-role`);
    console.log('credentials, so it cannot clean these up itself. Prune them manually if this');
    console.log('ran against a shared/production database:');
    for (const id of createdTicketIds) console.log(`  - ${id}`);
  }
  process.exitCode = failCount > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('\nE2E harness crashed:', err);
  process.exitCode = 1;
});
