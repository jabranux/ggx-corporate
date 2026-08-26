/**
 * Attachment support for the Business+ ↔ HeyQ integration (client side).
 *
 * The approved QuadX Bridge contract for this POC is TEXT-ONLY — attachment
 * byte uploads are rejected with 400, so the app no longer offers an
 * attachment picker (`AttachmentInput` is unwired from the report drawer and
 * the reply composer) and the adapter no longer builds a multipart body for
 * ticket creation or replies. See docs/migration/ggx-corporate-heyq-live-ticketing.md.
 *
 * Runs INSIDE the page (Vite serves the TS modules) so we exercise the real
 * adapter + shared attachment policy the app uses. Three halves:
 *   • the shared policy module (allowlist / size / double-extension / MIME
 *     mismatch) — still present and correct, just unused by any wired-up UI;
 *   • the adapter's create/reply paths — confirm they are JSON-only now, never
 *     multipart, since there is no `files` parameter left to carry them;
 *   • `buildAttachmentUrl` + the realtime attachment-id projection — DORMANT
 *     (see heyqCustomerApi.ts's module docblock): correct in isolation, but no
 *     Bridge ticket will ever carry an attachment id in practice.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5193;
const API_DEFAULT = 'https://heyq-api-production.up.railway.app';
const WHO = { externalUserId: 'max@email.com', externalOrgId: 'main' };

let server;
let browser;
let page;

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

/** Evaluate an async fn in the page with `window.fetch` stubbed; capture requests
 * (including multipart FormData contents) and return the fn's result. */
const withStub = (fn, { response = null, status = 200 } = {}) =>
  page.evaluate(
    async ({ src, response, status, WHO }) => {
      const calls = [];
      const orig = window.fetch;
      window.fetch = async (url, init) => {
        const rec = { url: String(url), method: init?.method ?? 'GET', form: null, body: init?.body instanceof FormData ? null : (init?.body ?? null) };
        if (init?.body instanceof FormData) {
          rec.form = { fields: {}, files: [] };
          for (const [k, v] of init.body.entries()) {
            if (v instanceof File) rec.form.files.push({ field: k, name: v.name, type: v.type, size: v.size });
            else rec.form.fields[k] = v;
          }
        }
        calls.push(rec);
        return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
      };
      try {
        // eslint-disable-next-line no-new-func
        const result = await new Function('WHO', `return (${src})(WHO);`)(WHO);
        return { result, calls };
      } finally {
        window.fetch = orig;
      }
    },
    { src: fn.toString(), response, status, WHO },
  );

const evalInPage = (fn) =>
  page.evaluate(async ({ src, WHO }) => {
    // eslint-disable-next-line no-new-func
    return new Function('WHO', `return (${src})(WHO);`)(WHO);
  }, { src: fn.toString(), WHO });

// A HeyQ customer ticket the create/reply stub can return (already projected).
const TICKET_RESPONSE = (over = {}) => ({
  id: 'tkt_att', reference: 'HQ-7001', subject: 's', issueType: 'Delivery delay',
  status: 'open', priority: 'normal', supportTeam: 'Customer Support',
  createdAt: '2026-07-17T00:00:00Z', updatedAt: '2026-07-17T00:00:00Z', canReopen: false,
  messages: [], ...over,
});

// ── shared attachment policy ─────────────────────────────────────────────────

describe('attachment policy (shared with HeyQ)', () => {
  it('accepts allowed types and enforces the 5-file / 10-MB limits and rejections', async () => {
    const res = await evalInPage(async () => {
      const p = await import('/src/app/lib/attachmentPolicy.ts');
      const ok = (name, type, size = 100) => p.validateCandidate({ name, size, type });
      return {
        maxFiles: p.MAX_FILES_PER_SUBMISSION,
        validPdf: ok('receipt.pdf', 'application/pdf'),
        validPng: ok('photo.png', 'image/png'),
        blockedExe: ok('malware.exe', 'application/octet-stream'),
        mimeMismatch: ok('photo.png', 'application/x-msdownload'),
        doubleExt: ok('payload.exe.pdf', 'application/pdf'),
        tooBig: ok('big.pdf', 'application/pdf', 10 * 1024 * 1024 + 1),
        previewImage: p.isPreviewable('image/png'),
        previewZip: p.isPreviewable('application/zip'),
      };
    });
    assert.equal(res.maxFiles, 5);
    assert.equal(res.validPdf, null);
    assert.equal(res.validPng, null);
    assert.match(res.blockedExe, /not allowed/i);
    assert.match(res.mimeMismatch, /doesn.t match/i);
    assert.match(res.doubleExt, /double extension/i);
    assert.match(res.tooBig, /10 MB/i);
    assert.equal(res.previewImage, true);
    assert.equal(res.previewZip, false); // zip is downloadable, never inline
  });
});

// ── adapter create/reply are JSON-only (no attachment upload path) ────────────

describe('create and reply never send a multipart body — attachments are disabled', () => {
  it('apiCreateTicket has no files parameter and always posts plain JSON to the support proxy', async () => {
    const { calls } = await withStub(async (WHO) => {
      const api = await import('/src/app/services/heyqCustomerApi.ts');
      return api.apiCreateTicket(WHO, { name: 'Max', email: WHO.externalUserId, concernType: 'delivery_delay', subject: 's', description: 'd' });
    }, { response: TICKET_RESPONSE() });
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/support/tickets'));
    assert.ok(create, 'a create POST must be issued');
    assert.equal(create.form, null, 'creation is always JSON, never multipart');
  });

  it('apiReplyToMyTicket has no files parameter and always posts plain JSON to the support proxy', async () => {
    const { calls } = await withStub(async (WHO) => {
      const api = await import('/src/app/services/heyqCustomerApi.ts');
      return api.apiReplyToMyTicket(WHO, 'tkt_att', 'here is my update, no file needed');
    }, { response: TICKET_RESPONSE() });
    const reply = calls.find((c) => c.method === 'POST' && /\/api\/support\/tickets\/tkt_att\/messages$/.test(c.url));
    assert.ok(reply, 'a reply POST must be issued');
    assert.equal(reply.form, null, 'a reply is always JSON, never multipart');
    assert.equal(JSON.parse(reply.body ?? '{}').body, 'here is my update, no file needed');
  });
});

// ── download URL + realtime projection ───────────────────────────────────────

describe('download URLs and realtime attachment id', () => {
  it('buildAttachmentUrl is identity-scoped and honours inline preview', async () => {
    const url = await evalInPage(async (WHO) => {
      const api = await import('/src/app/services/heyqCustomerApi.ts');
      return api.buildAttachmentUrl(WHO, 'tkt_att', 'att_123', true);
    });
    assert.ok(url.startsWith(`${API_DEFAULT}/api/customer/tickets/tkt_att/attachments/att_123`), url);
    const q = new URL(url).searchParams;
    assert.equal(q.get('externalUserId'), 'max@email.com');
    assert.equal(q.get('externalOrgId'), 'main');
    assert.equal(q.get('disposition'), 'inline');
  });

  it('projectRealtimeMessage carries an attachment id through so a live file is downloadable', async () => {
    const msg = await evalInPage(async () => {
      const svc = await import('/src/app/services/heyqService.ts');
      return svc.projectRealtimeMessage({
        id: 'm9', from: 'support', authorLabel: 'Claims', body: 'label attached',
        createdAt: '2026-07-17T00:00:00Z',
        attachments: [{ id: 'att_live', name: 'label.pdf', size: 2048, type: 'application/pdf' }],
      });
    });
    assert.equal(msg.attachments.length, 1);
    assert.equal(msg.attachments[0].id, 'att_live'); // the id survives → the other app can download it
    assert.equal(msg.attachments[0].name, 'label.pdf');
  });
});
