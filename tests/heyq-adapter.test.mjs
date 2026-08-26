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
        calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ?? null });
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

describe('requester identity', () => {
  it('scopes the read to the signed-in identity via query params', async () => {
    const { calls } = await withStub((svc) => svc.listMyTickets(), { response: [] });
    const url = new URL(customerReads(calls)[0].url, 'http://x');
    // Admin session: max@email.com / main (the account scope).
    assert.equal(url.searchParams.get('externalUserId'), 'max@email.com');
    assert.equal(url.searchParams.get('externalOrgId'), 'main');
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
    { status: 403, expect: 'forbidden' },
    { status: 404, expect: 'not_found' },
    { status: 500, expect: 'unavailable' },
  ];
  for (const c of cases) {
    it(`maps HTTP ${c.status} to ${c.expect}`, async () => {
      const { result } = await withStub((svc) => svc.getMyTicket('tkt_x'), { response: { error: 'x' }, status: c.status });
      assert.equal(result.status, c.expect);
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

describe('requester writes go through the support proxy, then re-read the customer view', () => {
  it('reply posts to /api/support/tickets/:id/messages then re-reads /api/support/tickets/:id', async () => {
    const { result, calls } = await withStub((svc) => svc.replyToMyTicket('tkt_abc123', 'Any update?'), {
      response: HEYQ_TICKET,
    });
    assert.equal(result.status, 'ok');
    const post = calls.find((c) => c.method === 'POST' && /\/api\/support\/tickets\/tkt_abc123\/messages$/.test(c.url));
    assert.ok(post, 'a reply POST must be issued');
    assert.match(String(post.body), /Any update\?/);
    const reread = calls.find((c) => c.method === 'GET' && /\/api\/support\/tickets\/tkt_abc123\?/.test(c.url));
    assert.ok(reread, 'the customer view must be re-read after the reply');
  });

  it('reopen posts to /api/support/tickets/:id/reopen then re-reads the customer view', async () => {
    const { result, calls } = await withStub((svc) => svc.reopenMyTicket('tkt_abc123'), { response: HEYQ_TICKET });
    assert.equal(result.status, 'ok');
    assert.ok(calls.find((c) => c.method === 'POST' && /\/api\/support\/tickets\/tkt_abc123\/reopen$/.test(c.url)));
    assert.ok(calls.find((c) => c.method === 'GET' && /\/api\/support\/tickets\/tkt_abc123\?/.test(c.url)));
  });

  it('a failed reply surfaces the failure without re-reading', async () => {
    const { result, calls } = await withStub((svc) => svc.replyToMyTicket('tkt_x', 'hi'), {
      response: { error: 'forbidden' },
      status: 403,
    });
    assert.equal(result.status, 'forbidden');
    // POST issued, but no re-read of this ticket after the failed write.
    assert.ok(calls.find((c) => c.method === 'POST' && /\/api\/support\/tickets\/tkt_x\/messages$/.test(c.url)));
    assert.ok(!calls.find((c) => c.method === 'GET' && /\/api\/support\/tickets\/tkt_x\?/.test(c.url)));
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
          const who = { externalUserId: 'max@email.com', externalOrgId: 'main' };
          // eslint-disable-next-line no-new-func
          await new Function('api', 'who', `return (${src})(api, who);`)(api, who);
          return calls;
        } finally {
          window.fetch = orig;
        }
      },
      {
        src: ((api, who) => Promise.all([
          api.apiCreateTicket(who, { name: 'Max', email: 'max@email.com', concernType: 'general_inquiry', subject: 's1', description: 'd1' }),
          api.apiCreateTicket(who, { name: 'Max', email: 'max@email.com', concernType: 'general_inquiry', subject: 's2', description: 'd2' }),
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
          const who = { externalUserId: 'max@email.com', externalOrgId: 'main' };
          // eslint-disable-next-line no-new-func
          await new Function('api', 'who', `return (${src})(api, who);`)(api, who);
          return calls;
        } finally {
          window.fetch = orig;
        }
      },
      {
        src: ((api, who) => Promise.all([
          api.apiReplyToMyTicket(who, 'tkt1', 'hi', 'msg-uuid-1'),
          api.apiReplyToMyTicket(who, 'tkt1', 'hi again (retry)', 'msg-uuid-1'),
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

  it('authorizes the order via OMS, then POSTs a mapped payload to /customer/tickets', async () => {
    const { result, calls } = await withStub(
      (svc) => svc.submitOrderReport({
        externalOrderIds: ['GGX-2026-90008'],
        concernType: 'failed_delivery', // Business+ concern → HeyQ delivery_delay
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
    assert.equal(body.externalUserId, 'max@email.com');
    assert.equal(body.externalOrgId, 'main');
    assert.equal(body.concernType, 'delivery_delay'); // mapped from failed_delivery
    assert.equal(body.subject, 'Delivery failed');
    // Multi-transaction wire shape: a linkedTransactions array (one entry here).
    assert.equal(body.linkedTransactions.length, 1);
    assert.equal(body.linkedTransactions[0].trackingNumber, 'GGX-2026-90008');
    assert.equal(body.linkedTransactions[0].snapshot.shipmentStatus, 'failed_delivery'); // OMS 'failed' → HeyQ
  });

  it('creates ONE ticket linking ALL selected transactions (not one per transaction)', async () => {
    const { result, calls } = await withStub(
      (svc) => svc.submitOrderReport({
        externalOrderIds: ['GGX-2026-90008', 'GGX-2026-90009'],
        concernType: 'general_inquiry',
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
        concernType: 'billing_issue',
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
        concernType: 'general_inquiry',
        subject: 'x',
        description: 'y',
      }),
      { response: CREATED },
    );
    assert.equal(result.status, 'not_found');
    assert.equal(creates(calls).length, 0, 'no create request may be sent when any order is unauthorized');
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
