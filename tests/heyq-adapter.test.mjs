/**
 * Focused contract tests for the Business+ → HeyQ adapter.
 *
 * Two halves:
 *   • The Corporate support-proxy path (`heyqCustomerApi` behind `heyqService`)
 *     — driven with a stubbed `window.fetch`, so we assert the request the
 *     adapter makes (identity, URL, idempotency headers) and the mapping/
 *     privacy of the response it returns, plus the failure modes, without a
 *     live proxy/Bridge/HeyQ. Every ticket read/write goes to the same-origin
 *     `/api/support/*` proxy, never a Bridge/Railway origin directly.
 *   • The OMS side (order authorization + the customer-safe snapshot + live
 *     status) — driven against the real `transactionService`, which owns orders.
 *
 * They run INSIDE the page (Vite serves the TS modules) so we hit the real
 * adapter the app hits.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5191;
// The legacy standalone HeyQ API origin. No longer used by any ticket
// read/write (those go through /api/support/*) — kept only as the default
// base for the two DORMANT, unused capabilities (realtime token minting,
// attachment download URLs). See heyqCustomerApi.ts's module docblock.
const API_DEFAULT = 'https://heyq-api-production.up.railway.app';

let server;
let browser;
let page;

/** A HeyQ customer-API ticket, plus adversarial agent-only fields that a buggy or
 *  over-broad server might include — the adapter's allowlist mapper must drop them. */
const HEYQ_TICKET = {
  id: 'tkt_abc123',
  reference: 'HQ-5001',
  subject: 'Delivery failed but recipient was available',
  concernType: 'pickup_issue', // not a Business+ concern key → maps to general_inquiry
  issueType: 'Pickup issue',
  status: 'in_progress',
  priority: 'high',
  supportTeam: 'Claims',
  createdAt: '2026-06-01T09:00:00Z',
  updatedAt: '2026-06-02T09:00:00Z',
  openedBySupport: false,
  canReopen: false,
  linkedOrder: {
    externalOrderId: 'GGX-2026-90008',
    trackingNumber: 'GGX-2026-90008',
    capturedAt: '2026-06-01T09:00:00Z',
    snapshot: {
      shipmentStatus: 'out_for_delivery',
      bookingDate: '2026-05-31',
      destination: 'Pasig City',
      serviceType: 'On-Demand',
      deliverySummary: 'Standard delivery',
      route: 'Metro Manila → Pasig City',
    },
  },
  messages: [
    { id: 'm1', from: 'you', authorLabel: 'You', body: 'Please re-attempt.', createdAt: '2026-06-01T09:00:00Z' },
    { id: 'm2', from: 'support', authorLabel: 'Claims', body: 'On it — re-delivery scheduled.', createdAt: '2026-06-02T09:00:00Z' },
  ],
  // ── must NEVER reach Business+ ──
  assigneeName: 'Bea Santos',
  escalationState: 'escalated',
  supportTier: 'L2',
  slaPolicyId: 'sla-high',
  internalNotes: [{ body: 'goodwill credit — do not disclose' }],
};

/**
 * Run an adapter expression with `window.fetch` stubbed. `response` is returned
 * as JSON for every call; `status` sets the HTTP status; `reject` simulates a
 * network failure. Returns the adapter result plus the captured fetch calls.
 */
const withStub = (fn, { response = null, status = 200, reject = false } = {}) =>
  page.evaluate(
    async ({ src, response, status, reject }) => {
      const calls = [];
      const orig = window.fetch;
      window.fetch = async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ?? null, cache: init?.cache });
        if (reject) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify(response), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      try {
        const svc = await import('/src/app/services/heyqService.ts');
        // eslint-disable-next-line no-new-func
        const result = await new Function('svc', `return (${src})(svc);`)(svc);
        return { result, calls };
      } finally {
        window.fetch = orig;
      }
    },
    { src: fn.toString(), response, status, reject },
  );

/**
 * Restore the admin UI-display session in `localStorage` after a test that
 * deliberately triggers a real 401 — `heyqCustomerApi.ts`'s
 * `notifySessionExpired()` dispatches a genuine `window` event that this
 * SAME page's real, mounted `AuthContext` also receives (it isn't scoped to
 * the test's own listener), clearing the session for real. The adapter
 * functions under test read `localStorage` fresh on every call (not React
 * state), so restoring it here is enough to un-block every test that runs
 * after — without it, a real 401 earlier in the file cascades into
 * `session.isAuthenticated === false` for everything downstream.
 */
const restoreAdminSession = () =>
  page.evaluate(() => {
    localStorage.setItem(
      'ggx.auth',
      JSON.stringify({ id: 'user-admin-001', name: 'Max Rodriguez', email: 'max@email.com', role: 'admin', accountId: 'main', accountName: 'Main Account' }),
    );
  });

/** OMS-side adapter call (no stub — real transactionService). */
const adapter = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const svc = await import('/src/app/services/heyqService.ts');
      // eslint-disable-next-line no-new-func
      return new Function('svc', 'arg', `return (${src})(svc, arg);`)(svc, arg);
    },
    { src: fn.toString(), arg },
  );

before(async () => {
  server = await startDevServer(PORT);
  const session = await signIn(server.base, 'admin');
  browser = session.browser;
  page = session.page;
});

after(async () => {
  await browser?.close();
  stopDevServer(server);
});

// The page is a live dashboard whose shell also polls the ticket list, so the
// stub sees background calls too — assert on the RELEVANT request, not the count.
const customerReads = (calls) => calls.filter((c) => c.method === 'GET' && c.url.includes('/api/support/tickets'));
const creates = (calls) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/support/tickets'));

describe('configuration', () => {
  it('reads tickets through the same-origin Corporate support proxy, never Bridge/Railway directly', async () => {
    const { calls } = await withStub((svc) => svc.listMyTickets(), { response: [] });
    const reads = customerReads(calls);
    assert.ok(reads.length >= 1, 'a customer read must be issued');
    assert.ok(reads[0].url.startsWith('/api/support/tickets'), reads[0].url);
    // Same-origin/relative — never an absolute Bridge/Railway URL.
    assert.doesNotMatch(reads[0].url, /^https?:\/\//);
  });

  it('keeps the dormant realtime/attachment base at its legacy default (unused by any live read/write)', async () => {
    const base = await page.evaluate(async () => {
      const api = await import('/src/app/services/heyqCustomerApi.ts');
      return api.getHeyQApiBaseUrl();
    });
    assert.equal(base, API_DEFAULT);
  });
});

describe('requester identity (server-verified session — handoff doc "Server-verified support identity")', () => {
  it('states no client-side identity at all — no demoAccountId/externalUserId/externalOrgId', async () => {
    const { calls } = await withStub((svc) => svc.listMyTickets(), { response: [] });
    const url = new URL(customerReads(calls)[0].url, 'http://x');
    // Identity now travels only via the signed, httpOnly session cookie — the
    // request carries no identity query params at all.
    assert.equal(url.search, '');
  });

  it('holds the same for a manager session — still no identity params on the request', async () => {
    const mgr = await signIn(server.base, 'manager');
    try {
      const { calls } = await mgr.page.evaluate(async () => {
        const calls = [];
        const orig = window.fetch;
        window.fetch = async (url, init) => {
          calls.push({ url: String(url), method: init?.method ?? 'GET' });
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        try {
          const svc = await import('/src/app/services/heyqService.ts');
          await svc.listMyTickets();
          return { calls };
        } finally {
          window.fetch = orig;
        }
      });
      const read = calls.find((c) => c.method === 'GET' && c.url.includes('/api/support/tickets'));
      const url = new URL(read.url, 'http://x');
      assert.equal(url.search, '');
    } finally {
      await mgr.browser.close();
    }
  });
});

describe('API response mapping', () => {
  it('maps a HeyQ customer ticket to the Business+ CustomerTicket shape', async () => {
    const { result } = await withStub((svc) => svc.listMyTickets(), { response: [HEYQ_TICKET] });
    assert.equal(result.length, 1);
    const t = result[0];
    assert.equal(t.id, 'tkt_abc123');
    assert.equal(t.reference, 'HQ-5001');
    assert.equal(t.status, 'in_progress');
    assert.equal(t.priority, 'high');
    assert.equal(t.supportTeam, 'Claims');
    assert.equal(t.issueType, 'Pickup issue'); // HeyQ's own label, verbatim
    assert.equal(t.concernType, 'general_inquiry'); // pickup_issue has no BP key
    assert.equal(t.messages.length, 2);
    assert.deepEqual(t.messages.map((m) => m.from), ['you', 'support']);
  });

  it('maps the linked-order snapshot into the OMS delivery vocabulary', async () => {
    const { result } = await withStub((svc) => svc.getMyTicket('tkt_abc123'), { response: HEYQ_TICKET });
    assert.equal(result.status, 'ok');
    const snap = result.data.linkedOrder.snapshot;
    assert.equal(snap.deliveryStatus, 'in-transit');       // out_for_delivery → in-transit key
    assert.equal(snap.deliveryStatusLabel, 'Out for Delivery');
    assert.equal(snap.serviceType, 'On-Demand');
    assert.equal(snap.route, 'Metro Manila → Pasig City');
    assert.equal(snap.bookedOn, '2026-05-31');
    assert.equal(result.data.linkedOrder.trackingNumber, 'GGX-2026-90008');
  });
});

describe('ticketsService.getTicketsList — shared search filter matches the reference', () => {
  it('matches the full human-readable reference, a partial substring, and still matches the id (UUID)', async () => {
    const ticket = { ...HEYQ_TICKET, id: 'd1f847ee-d472-483c-9774-971070242891', reference: 'HQS-2026-0001-3116' };
    const search = (q) =>
      page.evaluate(
        async ({ q, response }) => {
          const orig = window.fetch;
          window.fetch = async () =>
            new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
          try {
            const svc = await import('/src/app/services/ticketsService.ts');
            const rows = await svc.getTicketsList({ search: q });
            return rows.length;
          } finally {
            window.fetch = orig;
          }
        },
        { q, response: [ticket] },
      );

    assert.equal(await search('HQS-2026-0001-3116'), 1, 'full reference must match');
    assert.equal(await search('0001-3116'), 1, 'partial reference must match');
    assert.equal(await search('d1f847ee-d472-483c-9774-971070242891'), 1, 'the id (UUID) must still match — existing behavior retained');
    assert.equal(await search('no-such-ticket'), 0, 'an unrelated query must not match');
  });
});

describe('privacy filtering', () => {
  it('drops agent-only fields even when the response carries them', async () => {
    const { result } = await withStub((svc) => svc.getMyTicket('tkt_abc123'), { response: HEYQ_TICKET });
    const blob = JSON.stringify(result.data).toLowerCase();
    for (const leaked of ['assigneename', 'escalationstate', 'supporttier', 'slapolicyid', 'internalnotes', 'openedbysupport']) {
      assert.ok(!blob.includes(leaked), `customer view must not carry ${leaked}`);
    }
    assert.ok(!blob.includes('bea santos'), 'agent identity must not be exposed');
    assert.ok(!blob.includes('goodwill credit'), 'internal note body must not be exposed');
    // The handling team IS customer-safe.
    assert.equal(result.data.supportTeam, 'Claims');
  });
});

describe('common API failures', () => {
  const cases = [
    { status: 401, expect: 'forbidden' },
    { status: 403, expect: 'forbidden' },
    { status: 404, expect: 'not_found' },
    { status: 500, expect: 'unavailable' },
  ];
  for (const c of cases) {
    it(`maps HTTP ${c.status} to ${c.expect}`, async () => {
      const { result } = await withStub((svc) => svc.getMyTicket('tkt_x'), { response: { error: 'x' }, status: c.status });
      assert.equal(result.status, c.expect);
      // A real 401 dispatches ggx:session-expired, which this page's real,
      // mounted AuthContext also receives and acts on for real (see
      // restoreAdminSession's docblock) — undo that so later tests still
      // run as an authenticated session.
      if (c.status === 401) await restoreAdminSession();
    });
  }

  it('maps a network error to unavailable', async () => {
    const { result } = await withStub((svc) => svc.getMyTicket('tkt_x'), { reject: true });
    assert.equal(result.status, 'unavailable');
  });

  it('degrades the list to empty on failure', async () => {
    const { result } = await withStub((svc) => svc.listMyTickets(), { response: { error: 'down' }, status: 503 });
    assert.deepEqual(result, []);
  });
});

/**
 * A 401 from `/api/support/**` means the signed session cookie is gone or no
 * longer maps to a valid account (`requireSessionIdentity` in the HeyQ
 * repo's `api/_lib/bridge.ts` — the ONLY status it writes, always before
 * Bridge is called). That must clear the client's own UI-display session
 * (`AuthContext`, via `SESSION_EXPIRED_EVENT`) so `ProtectedRoute` sends the
 * user back to Login instead of leaving a stale "signed in" UI in front of a
 * ticket list that will now silently 401 forever (the production symptom
 * this closes — session cookie TTL and the localStorage UI flag had no way
 * to stay in sync). A 403 is a DIFFERENT thing — a Bridge-side ownership
 * denial on an otherwise-valid session — and must never trigger this.
 *
 * Each test here fires a REAL 401 against the live, mounted app on this
 * page, so `restoreAdminSession()` afterward undoes the real cascading
 * logout for whatever runs next (see its docblock).
 */
describe('session-expired signal (401 vs 403 from the support proxy)', () => {
  const withEventCapture = (fn, { status }) =>
    page.evaluate(
      async ({ src, status }) => {
        const events = [];
        const listener = () => events.push('fired');
        window.addEventListener('ggx:session-expired', listener);
        const orig = window.fetch;
        window.fetch = async () => new Response(JSON.stringify({ error: 'x' }), { status, headers: { 'Content-Type': 'application/json' } });
        try {
          const svc = await import('/src/app/services/heyqService.ts');
          // eslint-disable-next-line no-new-func
          await new Function('svc', `return (${src})(svc);`)(svc);
          return events;
        } finally {
          window.fetch = orig;
          window.removeEventListener('ggx:session-expired', listener);
        }
      },
      { src: fn.toString(), status },
    );

  it('a 401 from the support proxy dispatches ggx:session-expired', async () => {
    const events = await withEventCapture((svc) => svc.getMyTicket('tkt_x'), { status: 401 });
    assert.deepEqual(events, ['fired']);
    await restoreAdminSession();
  });

  it('a 403 from the support proxy does NOT dispatch ggx:session-expired (a valid session, just denied)', async () => {
    const events = await withEventCapture((svc) => svc.getMyTicket('tkt_x'), { status: 403 });
    assert.deepEqual(events, []);
  });
});

describe('requester writes go through the support proxy, then re-read the customer view', () => {
  it('reply posts to /api/support/tickets/:id/messages then re-reads /api/support/tickets/:id', async () => {
    const { result, calls } = await withStub((svc) => svc.replyToMyTicket('tkt_abc123', 'Any update?'), {
      response: HEYQ_TICKET,
    });
    assert.equal(result.status, 'ok');
    const post = calls.find((c) => c.method === 'POST' && /\/api\/support\/tickets\/tkt_abc123\/messages$/.test(c.url));
    assert.ok(post, 'a reply POST must be issued');
    assert.match(String(post.body), /Any update\?/);
    const reread = calls.find((c) => c.method === 'GET' && /\/api\/support\/tickets\/tkt_abc123$/.test(c.url));
    assert.ok(reread, 'the customer view must be re-read after the reply');
  });

  it('a failed reply surfaces the failure without re-reading', async () => {
    const { result, calls } = await withStub((svc) => svc.replyToMyTicket('tkt_x', 'hi'), {
      response: { error: 'forbidden' },
      status: 403,
    });
    assert.equal(result.status, 'forbidden');
    // POST issued, but no re-read of this ticket after the failed write.
    assert.ok(calls.find((c) => c.method === 'POST' && /\/api\/support\/tickets\/tkt_x\/messages$/.test(c.url)));
    assert.ok(!calls.find((c) => c.method === 'GET' && /\/api\/support\/tickets\/tkt_x$/.test(c.url)));
  });
});

describe('idempotency headers reach the proxy', () => {
  it('two separate create calls each carry their own, different Idempotency-Key', async () => {
    const out = await page.evaluate(
      async ({ src, response }) => {
        const calls = [];
        const orig = window.fetch;
        window.fetch = async (url, init) => {
          calls.push({ url: String(url), headers: init?.headers ?? {} });
          return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        try {
          const api = await import('/src/app/services/heyqCustomerApi.ts');
          // eslint-disable-next-line no-new-func
          await new Function('api', `return (${src})(api);`)(api);
          return calls;
        } finally {
          window.fetch = orig;
        }
      },
      {
        src: ((api) => Promise.all([
          api.apiCreateTicket({ name: 'Max', email: 'max@email.com', categoryId: 'cat-general', subject: 's1', description: 'd1' }),
          api.apiCreateTicket({ name: 'Max', email: 'max@email.com', categoryId: 'cat-general', subject: 's2', description: 'd2' }),
        ])).toString(),
        response: { id: 'tkt-x', reference: 'HQ-9', subject: 's', issueType: 'General', status: 'open', priority: 'normal', supportTeam: 'CS', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', canReopen: false, messages: [] },
      },
    );
    const posts = out.filter((c) => c.url.endsWith('/api/support/tickets'));
    assert.equal(posts.length, 2);
    assert.ok(posts[0].headers['Idempotency-Key'], 'a create must carry an Idempotency-Key');
    assert.ok(posts[1].headers['Idempotency-Key'], 'a create must carry an Idempotency-Key');
    assert.notEqual(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key'], 'two distinct create calls get distinct keys');
  });

  it('a retried reply forwards the SAME X-Bridge-Message-Id so Bridge can dedupe it', async () => {
    const out = await page.evaluate(
      async ({ src, response }) => {
        const calls = [];
        const orig = window.fetch;
        window.fetch = async (url, init) => {
          calls.push({ url: String(url), headers: init?.headers ?? {} });
          return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        try {
          const api = await import('/src/app/services/heyqCustomerApi.ts');
          // eslint-disable-next-line no-new-func
          await new Function('api', `return (${src})(api);`)(api);
          return calls;
        } finally {
          window.fetch = orig;
        }
      },
      {
        src: ((api) => Promise.all([
          api.apiReplyToMyTicket('tkt1', 'hi', 'msg-uuid-1'),
          api.apiReplyToMyTicket('tkt1', 'hi again (retry)', 'msg-uuid-1'),
        ])).toString(),
        response: HEYQ_TICKET,
      },
    );
    const posts = out.filter((c) => /\/messages$/.test(c.url));
    assert.equal(posts.length, 2);
    assert.equal(posts[0].headers['X-Bridge-Message-Id'], 'msg-uuid-1');
    assert.equal(posts[1].headers['X-Bridge-Message-Id'], 'msg-uuid-1');
  });
});

describe('submitting an order report (create via the customer API)', () => {
  const CREATED = {
    id: 'tkt-created-1', reference: 'HQ-2026-9001', subject: 'Delivery failed',
    concernType: 'delivery_delay', issueType: 'Delivery delay', status: 'open',
    priority: 'normal', supportTeam: 'Customer Support',
    createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z',
    openedBySupport: false, canReopen: false,
    linkedOrder: {
      externalOrderId: 'GGX-2026-90008', trackingNumber: 'GGX-2026-90008', capturedAt: '2026-07-15T00:00:00Z',
      snapshot: { shipmentStatus: 'failed_delivery', bookingDate: '2026-05-31', route: 'Metro Manila → Pasig City' },
    },
    messages: [{ id: 'm1', from: 'you', authorLabel: 'You', body: 'Recipient was available.', createdAt: '2026-07-15T00:00:00Z' }],
  };

  it('authorizes the order via OMS, then POSTs the canonical categoryId to /customer/tickets', async () => {
    const { result, calls } = await withStub(
      (svc) => svc.submitOrderReport({
        externalOrderIds: ['GGX-2026-90008'],
        categoryId: 'cat-delivery',
        subject: 'Delivery failed',
        description: 'Recipient was available.',
      }),
      { response: CREATED },
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.data.reference, 'HQ-2026-9001');
    const posts = creates(calls);
    assert.equal(posts.length, 1, 'exactly one create must be issued');
    const body = JSON.parse(posts[0].body);
    assert.equal(body.demoAccountId, undefined, 'the client must not send demoAccountId directly');
    assert.equal(body.externalUserId, undefined, 'the client must not send externalUserId directly');
    assert.equal(body.externalOrgId, undefined, 'the client must not send externalOrgId directly');
    assert.equal(body.categoryId, 'cat-delivery', 'the canonical category id is sent verbatim, never substituted');
    // Best-effort legacy label hint derived from the category — never authoritative.
    assert.equal(body.concernType, 'delivery_delay');
    assert.equal(body.subject, 'Delivery failed');
    // Multi-transaction wire shape: a linkedTransactions array (one entry here).
    assert.equal(body.linkedTransactions.length, 1);
    assert.equal(body.linkedTransactions[0].trackingNumber, 'GGX-2026-90008');
    assert.equal(body.linkedTransactions[0].snapshot.shipmentStatus, 'failed_delivery'); // OMS 'failed' → HeyQ
  });

  it('sends a category id with no legacy equivalent WITHOUT fabricating a concernType', async () => {
    const { calls } = await withStub(
      (svc) => svc.submitOrderReport({
        externalOrderIds: [],
        categoryId: 'cat-technical', // has no entry in the legacy hint map
        subject: 'App keeps crashing',
        description: 'On the tracking page.',
      }),
      { response: { ...CREATED, linkedOrder: undefined } },
    );
    const body = JSON.parse(creates(calls)[0].body);
    assert.equal(body.categoryId, 'cat-technical');
    assert.equal(body.concernType, undefined, 'no locally-invented legacy label for an unmapped category');
  });

  it('creates ONE ticket linking ALL selected transactions (not one per transaction)', async () => {
    const { result, calls } = await withStub(
      (svc) => svc.submitOrderReport({
        externalOrderIds: ['GGX-2026-90008', 'GGX-2026-90009'],
        categoryId: 'cat-general',
        subject: 'Two affected orders',
        description: 'Both delayed.',
      }),
      { response: CREATED },
    );
    assert.equal(result.status, 'ok');
    const posts = creates(calls);
    assert.equal(posts.length, 1, 'exactly one ticket is created for all transactions');
    const body = JSON.parse(posts[0].body);
    // Order preserved: the primary/originating transaction stays first.
    assert.deepEqual(body.linkedTransactions.map((o) => o.trackingNumber), ['GGX-2026-90008', 'GGX-2026-90009']);
  });

  it('allows an UNLINKED submission (general concern) — no linked transactions', async () => {
    const { result, calls } = await withStub(
      (svc) => svc.submitOrderReport({
        externalOrderIds: [],
        categoryId: 'cat-payment',
        subject: 'Billing question',
        description: 'Not about a specific order.',
      }),
      { response: { ...CREATED, linkedOrder: undefined } },
    );
    assert.equal(result.status, 'ok');
    const posts = creates(calls);
    assert.equal(posts.length, 1);
    const body = JSON.parse(posts[0].body);
    assert.equal(body.linkedTransactions, undefined, 'a general ticket carries no linked transactions');
  });

  it('refuses the WHOLE submission if ANY selected order is out of scope — no ticket is created', async () => {
    const { result, calls } = await withStub(
      (svc) => svc.submitOrderReport({
        // First is authorized, second is unknown: the whole submission must fail.
        externalOrderIds: ['GGX-2026-90008', 'GGX-9999-00000'],
        categoryId: 'cat-general',
        subject: 'x',
        description: 'y',
      }),
      { response: CREATED },
    );
    assert.equal(result.status, 'not_found');
    assert.equal(creates(calls).length, 0, 'no create request may be sent when any order is unauthorized');
  });
});

describe('live Concern Categories (report drawer selector)', () => {
  const CATEGORIES = [
    { id: 'cat-general', slug: 'general', name: 'General inquiry', subcategories: [{ id: 'sub-gen-info', name: 'General information' }] },
    { id: 'cat-delivery', slug: 'delivery', name: 'Delivery', requiresTracking: true, subcategories: [] },
  ];

  it('fetches from the same-origin Corporate proxy, never Bridge/Railway directly', async () => {
    const { result, calls } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, { response: CATEGORIES });
    assert.equal(result.status, 'ok');
    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/api/support/categories'));
    assert.equal(reads.length, 1);
    assert.doesNotMatch(reads[0].url, /^https?:\/\//);
    assert.deepEqual(result.data.map((c) => c.id), ['cat-general', 'cat-delivery']);
  });

  it('requests the live list with cache: "no-store" — no browser/HTTP cache may serve a stale list', async () => {
    const { calls } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, { response: CATEGORIES });
    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/api/support/categories'));
    assert.equal(reads.length, 1);
    assert.equal(reads[0].cache, 'no-store');
  });

  it('carries requiresTracking/requiresOrderRef and subcategories through untouched', async () => {
    const { result } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, { response: CATEGORIES });
    const delivery = result.data.find((c) => c.id === 'cat-delivery');
    assert.equal(delivery.requiresTracking, true);
    const general = result.data.find((c) => c.id === 'cat-general');
    assert.deepEqual(general.subcategories, [{ id: 'sub-gen-info', name: 'General information' }]);
  });

  it('never exposes a team/routing field even if the response carried one', async () => {
    const { result } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, {
      response: [{ ...CATEGORIES[0], defaultTeamId: 'team-cs', internalNotes: 'x' }],
    });
    const blob = JSON.stringify(result.data).toLowerCase();
    assert.ok(!blob.includes('team-cs'), 'no routing/team field may reach Business+');
    assert.ok(!blob.includes('internalnotes'));
  });

  it('treats zero eligible categories as a distinct, valid "empty" outcome — not a failure', async () => {
    const { result } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, { response: [] });
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.data, []);
  });

  it('maps a fetch failure to unavailable — never a fabricated fallback category list', async () => {
    const { result } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, { response: { error: 'down' }, status: 503 });
    assert.equal(result.status, 'unavailable');
  });

  it('maps a network error to unavailable', async () => {
    const { result } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, { reject: true });
    assert.equal(result.status, 'unavailable');
  });

  it('drops a malformed entry (missing id/name) rather than passing it through', async () => {
    const { result } = await withStub((svc) => { svc.invalidateConcernCategoriesCache(); return svc.listConcernCategories(); }, {
      response: [...CATEGORIES, { slug: 'broken', subcategories: [] }],
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.length, 2, 'the malformed entry is filtered out, not defaulted or passed through');
  });

  // Network-request audit: the report drawer re-fetched categories on every
  // open, then again right before submit — up to 3 Bridge round trips per
  // ticket-creation flow for taxonomy data that rarely changes. These pin
  // the short-TTL cache added to fix that, and the pre-submit re-verification
  // that must stay genuinely uncached.
  it('serves a second call from cache — only one network request for two reads', async () => {
    const { calls } = await withStub(
      (svc) => {
        svc.invalidateConcernCategoriesCache();
        return svc.listConcernCategories().then(() => svc.listConcernCategories());
      },
      { response: CATEGORIES },
    );
    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/api/support/categories'));
    assert.equal(reads.length, 1, 'the second call must be served from cache, not a new request');
  });

  it('forceFresh bypasses the cache — always a new network request', async () => {
    const { calls } = await withStub(
      (svc) => {
        svc.invalidateConcernCategoriesCache();
        return svc.listConcernCategories().then(() => svc.listConcernCategories({ forceFresh: true }));
      },
      { response: CATEGORIES },
    );
    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/api/support/categories'));
    assert.equal(reads.length, 2, 'forceFresh must never read the cached answer');
  });

  it('does not cache a failed fetch — the next call retries instead of replaying the failure', async () => {
    const { calls } = await withStub(
      (svc) => {
        svc.invalidateConcernCategoriesCache();
        return svc.listConcernCategories().then(() => svc.listConcernCategories());
      },
      { response: { error: 'down' }, status: 503 },
    );
    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/api/support/categories'));
    assert.equal(reads.length, 2, 'a failed result must not squat on the cache');
  });
});

describe('multi-transaction response mapping', () => {
  const MULTI = {
    id: 'tkt_multi', reference: 'HQ-7777', subject: 'Two orders',
    issueType: 'General inquiry', status: 'open', priority: 'normal', supportTeam: 'Customer Support',
    createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z', canReopen: false,
    linkedTransactions: [
      { externalOrderId: 'GGX-2026-90008', trackingNumber: 'GGX-2026-90008', capturedAt: '2026-07-15T00:00:00Z',
        snapshot: { shipmentStatus: 'in_transit', bookingDate: '2026-05-31', route: 'Metro Manila → Pasig City' } },
      { externalOrderId: 'GGX-2026-90009', trackingNumber: 'GGX-2026-90009', capturedAt: '2026-07-15T00:00:00Z',
        snapshot: { shipmentStatus: 'delivered', bookingDate: '2026-05-30', route: 'Makati City → Cebu City' } },
    ],
    messages: [],
  };

  it('maps a linkedTransactions array and mirrors the first into linkedOrder', async () => {
    const { result } = await withStub((svc) => svc.getMyTicket('tkt_multi'), { response: MULTI });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.linkedTransactions.length, 2);
    assert.deepEqual(result.data.linkedTransactions.map((o) => o.trackingNumber), ['GGX-2026-90008', 'GGX-2026-90009']);
    // Back-compat: linkedOrder is the primary (first) transaction.
    assert.equal(result.data.linkedOrder.trackingNumber, 'GGX-2026-90008');
    assert.equal(result.data.linkedTransactions[1].snapshot.deliveryStatusLabel, 'Delivered');
  });
});

// ── OMS side: order authorization + the customer-safe snapshot (real service) ──

describe('handoff URLs', () => {
  it('builds a HeyQ contact link with no order for general support', async () => {
    const url = await adapter((svc) => svc.buildContactUrl());
    assert.match(url, /\/contact$/);
    assert.doesNotMatch(url, /order=/);
  });

  it('deep-links the stable OMS order id for order-specific support', async () => {
    const url = await adapter((svc) => svc.buildContactUrl('GGX-2026-90008'));
    assert.match(url, /\/contact\?order=GGX-2026-90008$/);
  });
});

describe('OMS order authorization', () => {
  it('authorizes an in-scope order and returns a snapshot', async () => {
    const res = await adapter(async (svc) => {
      const who = await svc.getRequesterIdentity();
      return svc.getAuthorizedOrder(who, 'GGX-2026-90008');
    });
    assert.equal(res.status, 'ok');
    assert.equal(res.data.trackingNumber, 'GGX-2026-90008');
    assert.equal(res.data.snapshot.deliveryStatus, 'failed');
  });

  it('rejects an unknown order id as not_found', async () => {
    const res = await adapter(async (svc) => {
      const who = await svc.getRequesterIdentity();
      return svc.getAuthorizedOrder(who, 'GGX-9999-00000');
    });
    assert.equal(res.status, 'not_found');
  });

  it("rejects another account's order as forbidden", async () => {
    const res = await adapter((svc) =>
      svc.getAuthorizedOrder(
        { externalUserId: 'manager@email.com', externalOrgId: 'acme-luzon' },
        'GGX-2026-90008', // owned by Acme Corporation
      ),
    );
    assert.equal(res.status, 'forbidden');
  });
});

describe('the customer-safe snapshot', () => {
  it('passes only support-relevant order fields', async () => {
    const snapshot = await adapter(async (svc) => {
      const who = await svc.getRequesterIdentity();
      const res = await svc.getAuthorizedOrder(who, 'GGX-2026-90008');
      return res.data.snapshot;
    });
    assert.deepEqual(
      Object.keys(snapshot).sort(),
      ['bookedOn', 'deliveryStatus', 'deliveryStatusLabel', 'deliverySummary', 'route', 'serviceType'],
    );
  });

  it('withholds recipient, payment, parcel and internal order data', async () => {
    const snapshot = await adapter(async (svc) => {
      const who = await svc.getRequesterIdentity();
      const res = await svc.getAuthorizedOrder(who, 'GGX-2026-90008');
      return res.data.snapshot;
    });
    const blob = JSON.stringify(snapshot).toLowerCase();
    assert.ok(!blob.includes('horizon'), 'snapshot must not carry the recipient name');
    assert.ok(!blob.includes('robinsons'), 'snapshot must not carry the street address');
  });
});

describe('live order status (OMS, independent of ticket status)', () => {
  it('reads the current delivery status for an in-scope order', async () => {
    const res = await adapter(async (svc) => {
      const who = await svc.getRequesterIdentity();
      return svc.getLiveOrderStatus('GGX-2026-90008');
    });
    assert.equal(res.status, 'ok');
    assert.equal(res.data.deliveryStatus, 'failed');
  });

  it('reports not_found for an order that no longer exists in OMS', async () => {
    const res = await adapter((svc) => svc.getLiveOrderStatus('GGX-2023-00001'));
    assert.equal(res.status, 'not_found');
  });
});
