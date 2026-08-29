/**
 * Regression coverage for the 24-hour reopen window / permanent closure
 * feature (QuadX Bridge's 20260902090000_ticket_permanent_closure.sql):
 *
 *   • A resolved ticket still inside its 24h reopen window keeps the normal
 *     composer, and a reply reopens it — unchanged existing behavior.
 *   • Once the window has elapsed (computed client-side from `resolvedAt`
 *     via `isPermanentlyClosed`, mirroring Bridge's own server-authoritative
 *     rule), the composer is replaced by a read-only "this ticket is
 *     closed" notice with a "Create a new ticket" CTA — no Send Reply
 *     button, no reply textarea.
 *   • A stale client that still thinks a reply is allowed gets Bridge's
 *     deterministic rejection (HTTP 409 → HeyQResult status 'closed') and
 *     the UI resyncs to the authoritative closed state rather than trusting
 *     its own stale local read — GGX Corporate never treats the client's
 *     own clock as authoritative, only as a best-effort immediate hint.
 *
 * Each test installs its own self-mutating fetch stub (same pattern as
 * heyq-request-lifecycle.test.mjs's race-condition test) rather than the
 * shared static TICKETS fixture, since the reply POST needs to actually
 * simulate Bridge's accept/reject decision.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer, stopDevServer, signIn } from './helpers.mjs';

const PORT = 5198;

let server;
before(async () => { server = await startDevServer(PORT); });
after(() => { stopDevServer(server); });

const HOUR_MS = 60 * 60 * 1000;

describe('24-hour reopen window / permanent ticket closure', () => {
  it('a reply within the 24h reopen window still reopens the ticket and the composer stays available', async () => {
    const TICKET_ID = 'closure-in-window-1';
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await page.addInitScript((args) => {
        const { ticketId, resolvedAt } = args;
        const now = () => new Date().toISOString();
        window.__ticket = {
          id: ticketId, reference: 'HQS-CLOSURE-0001', subject: 'Still within the reopen window',
          concernType: 'general_inquiry', issueType: 'General inquiry', status: 'resolved',
          priority: 'normal', supportTeam: 'Customer Support',
          createdAt: '2026-08-20T09:00:00Z', updatedAt: resolvedAt, resolvedAt,
          openedBySupport: false, canReopen: true,
          messages: [{ id: 'm1', from: 'support', authorLabel: 'Customer Support', body: 'Resolved.', createdAt: resolvedAt }],
        };
        const origFetch = window.fetch.bind(window);
        const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        window.fetch = async (url, init) => {
          const u = String(url);
          const method = (init?.method ?? 'GET').toUpperCase();
          const path = new URL(u, 'http://x').pathname;
          if (method === 'POST' && /\/api\/support\/tickets\/[^/]+\/messages$/.test(path)) {
            const body = init?.body ? JSON.parse(init.body) : {};
            window.__ticket.messages.push({ id: 'srv-1', from: 'you', authorLabel: 'You', body: body.body, createdAt: now() });
            window.__ticket.status = 'in_progress';
            window.__ticket.reopenedAt = now();
            window.__ticket.updatedAt = now();
            return json(window.__ticket);
          }
          if (u.includes('/api/support/tickets')) {
            const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
            if (m) return json(window.__ticket);
            return json([window.__ticket]);
          }
          return origFetch(url, init);
        };
      }, { ticketId: TICKET_ID, resolvedAt: new Date(Date.now() - 1 * HOUR_MS).toISOString() });

      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
      await page.getByText('This ticket has been resolved').waitFor({ timeout: 10_000 });
      assert.equal(await page.locator('#ticket-reply').count(), 1, 'the reply composer must still be present within the reopen window');
      assert.equal(await page.getByText(/this ticket is closed/i).count(), 0, 'must not show the closed notice while still inside the window');

      await page.locator('#ticket-reply').fill('Still an issue, please help.');
      await page.getByRole('button', { name: /send reply/i }).click();
      await page.getByText('Still an issue, please help.').first().waitFor({ timeout: 10_000 });
      await page.getByText('This ticket has been resolved').waitFor({ state: 'hidden', timeout: 5_000 });
      assert.equal(await page.locator('#ticket-reply').count(), 1, 'the composer remains available after a reply reopens the ticket');
    } finally {
      await browser.close();
    }
  });

  it('a ticket whose 24h reopen window has elapsed renders read-only with no composer', async () => {
    const TICKET_ID = 'closure-expired-1';
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await page.addInitScript((args) => {
        const { ticketId, resolvedAt } = args;
        window.__ticket = {
          id: ticketId, reference: 'HQS-CLOSURE-0002', subject: 'Past the reopen window',
          concernType: 'general_inquiry', issueType: 'General inquiry', status: 'resolved',
          priority: 'normal', supportTeam: 'Customer Support',
          createdAt: '2026-08-18T09:00:00Z', updatedAt: resolvedAt, resolvedAt,
          openedBySupport: false, canReopen: false,
          messages: [{ id: 'm1', from: 'support', authorLabel: 'Customer Support', body: 'Resolved.', createdAt: resolvedAt }],
        };
        const origFetch = window.fetch.bind(window);
        const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        window.fetch = async (url, init) => {
          const u = String(url);
          const path = new URL(u, 'http://x').pathname;
          if (u.includes('/api/support/tickets')) {
            const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
            if (m) return json(window.__ticket);
            return json([window.__ticket]);
          }
          return origFetch(url, init);
        };
      }, { ticketId: TICKET_ID, resolvedAt: new Date(Date.now() - 25 * HOUR_MS).toISOString() });

      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
      await page.getByText(/this ticket is closed/i).first().waitFor({ timeout: 10_000 });
      assert.equal(await page.locator('#ticket-reply').count(), 0, 'no reply composer once the reopen window has elapsed');
      assert.equal(await page.getByRole('button', { name: /send reply/i }).count(), 0, 'no Send Reply action once permanently closed');
      assert.equal(await page.getByRole('button', { name: /create a new ticket/i }).count(), 1, 'a new-ticket CTA must be offered instead');
      // Existing history stays visible — closure never hides the conversation.
      assert.equal(await page.getByText('Resolved.').count(), 1, 'prior conversation history remains readable');
    } finally {
      await browser.close();
    }
  });

  it('a stale client whose reply is rejected as closed resyncs to the authoritative closed state', async () => {
    const TICKET_ID = 'closure-stale-client-1';
    const { browser, page } = await signIn(server.base, 'admin');
    try {
      await page.addInitScript((args) => {
        const { ticketId, resolvedAt } = args;
        // Locally this LOOKS like it's still within the window (resolvedAt is
        // recent), reproducing a stale/modified client — but the stub always
        // rejects the reply, as Bridge itself would once truly closed
        // (clock skew, or the client simply hasn't refreshed).
        window.__ticket = {
          id: ticketId, reference: 'HQS-CLOSURE-0003', subject: 'Server disagrees with the local clock',
          concernType: 'general_inquiry', issueType: 'General inquiry', status: 'resolved',
          priority: 'normal', supportTeam: 'Customer Support',
          createdAt: '2026-08-20T09:00:00Z', updatedAt: resolvedAt, resolvedAt,
          openedBySupport: false, canReopen: true,
          messages: [{ id: 'm1', from: 'support', authorLabel: 'Customer Support', body: 'Resolved.', createdAt: resolvedAt }],
        };
        window.__rejected = false;
        const origFetch = window.fetch.bind(window);
        const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        window.fetch = async (url, init) => {
          const u = String(url);
          const method = (init?.method ?? 'GET').toUpperCase();
          const path = new URL(u, 'http://x').pathname;
          if (method === 'POST' && /\/api\/support\/tickets\/[^/]+\/messages$/.test(path)) {
            // Deterministic Bridge rejection — relayed through the proxy
            // untouched (api/support/tickets/[id]/messages.ts's `relay`).
            window.__rejected = true;
            return json({ error: 'This ticket is closed. Create a new ticket if you still need assistance.' }, 409);
          }
          if (u.includes('/api/support/tickets')) {
            const m = path.match(/\/api\/support\/tickets\/([^/]+)$/);
            if (m) {
              // Before the rejected reply: the initial (stale) view, still
              // 'resolved'. After it: the GET that useTicketConversation's
              // submit() issues to resync reflects the SERVER's
              // authoritative view — actually closed — regardless of what
              // the client's own stale resolvedAt suggested.
              return json(window.__rejected ? { ...window.__ticket, status: 'closed' } : window.__ticket);
            }
            return json([window.__ticket]);
          }
          return origFetch(url, init);
        };
      }, { ticketId: TICKET_ID, resolvedAt: new Date(Date.now() - 1 * HOUR_MS).toISOString() });

      await page.goto(`${server.base}/dashboard/support-tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
      // The stale client's own clock says it's still within the window.
      await page.getByText('This ticket has been resolved').waitFor({ timeout: 10_000 });
      assert.equal(await page.locator('#ticket-reply').count(), 1, 'the stale client still shows the composer before attempting the reply');

      await page.locator('#ticket-reply').fill('Trying to reply anyway.');
      await page.getByRole('button', { name: /send reply/i }).click();

      // The rejection surfaces on the pending bubble — Dismiss only, no Retry
      // (retrying an identical request would only fail again the same way).
      await page.getByText(/not sent.*this ticket is closed/i).waitFor({ timeout: 10_000 });
      assert.equal(await page.getByRole('button', { name: /^retry$/i }).count(), 0, 'no Retry action on a permanent-closure rejection');
      assert.equal(await page.getByRole('button', { name: /dismiss/i }).count(), 1, 'Dismiss remains available');

      // And the page resyncs to the server's authoritative closed state.
      await page.getByText(/this ticket is closed/i, { exact: false }).first().waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: /create a new ticket/i }).waitFor({ timeout: 10_000 });
    } finally {
      await browser.close();
    }
  });
});
