/**
 * heyqCustomerApi — the HTTP client behind the heyqService seam.
 *
 * Ticket reads/writes go through GGX Corporate's OWN same-origin support proxy
 * (`/api/support/*`, implemented under `api/support/**` at the repo root — see
 * `api/_lib/bridge.ts`), never directly to QuadX Bridge or HeyQ. The proxy is
 * the only place that attaches the `QUADX_BRIDGE_API_KEY` server-side secret;
 * this module never sees it and never could — it just calls same-origin paths:
 *   GET  /api/support/tickets                  → the signed-in requester's tickets
 *   GET  /api/support/tickets/:id              → one of them
 *   POST /api/support/tickets                  → create a ticket
 *   POST /api/support/tickets/:id/messages     → a requester reply
 *   POST /api/support/tickets/:id/reopen       → a requester reopen
 * Full architecture + the POC identity assumption this relies on:
 * docs/migration/ggx-corporate-heyq-live-ticketing.md.
 *
 * The proxy forwards to QuadX Bridge's customer surface, which enforces
 * visibility SERVER-SIDE: the response is already projected to what a customer
 * may see — no internal notes, assignee, escalation, SLA or tier. This module is
 * a SHAPE adapter, not the privacy boundary, but it still constructs the
 * Business+ `CustomerTicket` by an explicit field allowlist (`toCustomerTicket`
 * below), so a malformed or over-broad response can never surface an agent-only
 * field into Business+.
 *
 * Requester identity is passed as query/body params today (externalUserId/Org),
 * resolved client-side from the app's mock/demo session and trusted by the proxy
 * as-is — a deliberate POC assumption, not production auth (see the handoff doc).
 *
 * Attachments are NOT sent on this path: the approved Bridge contract is
 * text-only (upload bytes are rejected with 400), so `apiCreateTicket` /
 * `apiReplyToMyTicket` below only ever send JSON. The realtime WebSocket
 * (`getHeyQRealtimeUrl` / `apiMintRealtimeToken` below) and the attachment
 * download helper (`buildAttachmentUrl`) are UNUSED by the app today — the
 * approved Bridge contract for this POC is REST + 5-second polling only (see
 * `hooks/useTicketConversation.ts`) — and are left in place, still pointed at
 * the legacy standalone HeyQ API origin, as a documented dormant capability
 * rather than deleted. Nothing in the running app calls them.
 */
import type {
  CustomerTicket,
  CustomerTicketMessage,
  HeyQAttachment,
  HeyQConcernType,
  HeyQLinkedOrder,
  HeyQOrderSnapshot,
  HeyQRequesterIdentity,
  HeyQResult,
  HeyQTicketStatus,
} from './heyqService';

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Origin of the standalone HeyQ API (legacy Railway service). NOT used by any
 * ticket read/write on this page today — those go through the same-origin
 * `/api/support/*` proxy below. This remains the base for the two DORMANT,
 * unused capabilities described in the module docblock (realtime WebSocket
 * token minting, attachment download URLs); nothing in the running app calls
 * them. Distinct from `VITE_HEYQ_URL`, which is the HeyQ *frontend* used to
 * OPEN HeyQ pages (contact form, portal). Override with `VITE_HEYQ_API_URL`;
 * requests resolve to `${base}/api/...`. No trailing slash, no `/api` suffix.
 */
export function getHeyQApiBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_HEYQ_API_URL : undefined;
  return (configured || 'https://heyq-api-production.up.railway.app').replace(/\/+$/, '');
}

// ── HeyQ response shapes (what the customer API returns) ──────────────────────
// Only the fields Business+ reads are typed. HeyQ's own model is the source of
// truth; these mirror its M23 customer projection (src/app/models/ticket.ts).

interface HeyQApiAttachment {
  /** Present for real uploaded attachments — used to build a download URL. */
  id?: string;
  name: string;
  size: number;
  type: string;
}

interface HeyQApiMessage {
  id: string;
  from: 'you' | 'support' | 'system';
  authorLabel: string;
  body: string;
  attachments?: HeyQApiAttachment[];
  createdAt: string;
}

interface HeyQApiSnapshot {
  shipmentStatus: string;
  bookingDate: string;
  destination?: string;
  serviceType?: string;
  deliverySummary?: string;
  route?: string;
}

interface HeyQApiLinkedOrder {
  externalOrderId: string;
  trackingNumber: string;
  snapshot?: HeyQApiSnapshot;
  capturedAt: string;
}

interface HeyQApiCustomerTicket {
  id: string;
  reference: string;
  subject: string;
  concernType?: string;
  issueType: string;
  status: HeyQTicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  supportTeam: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  reopenedAt?: string;
  linkedOrder?: HeyQApiLinkedOrder;
  linkedTransactions?: HeyQApiLinkedOrder[];
  messages?: HeyQApiMessage[];
  canReopen: boolean;
}

// ── HeyQ → Business+ mapping ──────────────────────────────────────────────────

/**
 * HeyQ concern keys don't all exist in Business+; map the overlap and default the
 * rest to a general enquiry. The human label (`issueType`) is taken verbatim from
 * HeyQ, so the displayed text is always HeyQ's own wording regardless of this map.
 */
const CONCERN_FROM_HEYQ: Record<string, HeyQConcernType> = {
  delivery_delay: 'delivery_delay',
  failed_delivery: 'failed_delivery',
  pickup_issue: 'general_inquiry',
  missing_parcel: 'missing_parcel',
  damaged_parcel: 'damaged_parcel',
  cod_concern: 'cod_concern',
  remittance_concern: 'cod_concern',
  payment_issue: 'billing_issue',
  billing_issue: 'billing_issue',
  booking_issue: 'general_inquiry',
  address_correction: 'address_correction',
  account_concern: 'general_inquiry',
  general_inquiry: 'general_inquiry',
};

/**
 * Map HeyQ's shipment status to a Business+ OMS delivery-status key (for the badge
 * palette) plus a display label. Keeps the linked-order snapshot rendering in the
 * same vocabulary as the rest of the app's delivery statuses.
 */
const SHIPMENT_FROM_HEYQ: Record<string, { key: string; label: string }> = {
  booked: { key: 'pending', label: 'Booked' },
  picked_up: { key: 'picked-up', label: 'Picked Up' },
  in_transit: { key: 'in-transit', label: 'In Transit' },
  out_for_delivery: { key: 'in-transit', label: 'Out for Delivery' },
  delivered: { key: 'delivered', label: 'Delivered' },
  failed_delivery: { key: 'failed', label: 'Failed' },
  returned: { key: 'returned', label: 'Returned' },
  cancelled: { key: 'failed', label: 'Cancelled' },
  on_hold: { key: 'pending', label: 'On Hold' },
};

/** OMS delivery-status key → HeyQ shipment status (for the create payload). */
const SHIPMENT_TO_HEYQ: Record<string, string> = {
  pending: 'booked',
  'picked-up': 'picked_up',
  'in-transit': 'in_transit',
  delivered: 'delivered',
  failed: 'failed_delivery',
  returned: 'returned',
};

/** Business+ concern → HeyQ concern (HeyQ owns the taxonomy; unknowns default). */
const CONCERN_TO_HEYQ: Record<HeyQConcernType, string> = {
  delivery_delay: 'delivery_delay',
  failed_delivery: 'delivery_delay',
  missing_parcel: 'missing_parcel',
  damaged_parcel: 'damaged_parcel',
  cod_concern: 'cod_concern',
  billing_issue: 'payment_issue',
  address_correction: 'address_correction',
  general_inquiry: 'general_inquiry',
};

function toSnapshot(s: HeyQApiSnapshot): HeyQOrderSnapshot {
  const mapped = SHIPMENT_FROM_HEYQ[s.shipmentStatus] ?? { key: s.shipmentStatus, label: s.shipmentStatus };
  return {
    deliveryStatus: mapped.key,
    deliveryStatusLabel: mapped.label,
    serviceType: s.serviceType ?? '—',
    deliverySummary: s.deliverySummary ?? '',
    route: s.route ?? s.destination ?? '',
    bookedOn: s.bookingDate,
  };
}

function toLinkedOrder(o: HeyQApiLinkedOrder): HeyQLinkedOrder {
  return {
    externalOrderId: o.externalOrderId,
    trackingNumber: o.trackingNumber,
    snapshot: o.snapshot ? toSnapshot(o.snapshot) : undefined,
    capturedAt: o.capturedAt,
  };
}

/** Copy only the customer-safe attachment metadata — never spread the payload. */
function toAttachments(list: HeyQApiAttachment[] | undefined): HeyQAttachment[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map((a) => ({
    id: typeof a.id === 'string' ? a.id : undefined,
    name: a.name,
    size: a.size,
    type: a.type,
  }));
}

function toMessage(m: HeyQApiMessage): CustomerTicketMessage {
  return {
    id: m.id,
    from: m.from,
    authorLabel: m.authorLabel,
    body: m.body,
    attachments: toAttachments(m.attachments),
    createdAt: m.createdAt,
  };
}

/**
 * Project a raw realtime `message.created` payload's message into the Business+
 * `CustomerTicketMessage` by the SAME explicit allowlist the REST path uses. The
 * server already projects for the customer audience; this re-projection is the
 * client-side guarantee that no unexpected field on a socket frame can reach the
 * UI (mirrors `CUSTOMER_SAFE_MESSAGE_FIELDS` in HeyQ's realtime model).
 */
export function projectRealtimeMessage(raw: unknown): CustomerTicketMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<HeyQApiMessage>;
  if (typeof m.id !== 'string' || typeof m.body !== 'string') return null;
  const from = m.from === 'you' || m.from === 'support' || m.from === 'system' ? m.from : 'support';
  return {
    id: m.id,
    from,
    authorLabel: typeof m.authorLabel === 'string' ? m.authorLabel : '',
    body: m.body,
    attachments: toAttachments(m.attachments),
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
  };
}

/**
 * Build the Business+ `CustomerTicket` by an explicit allowlist. Only these
 * fields are copied — nothing is spread — so an unexpected agent-only field on
 * the response has no path into Business+.
 */
function toCustomerTicket(t: HeyQApiCustomerTicket): CustomerTicket {
  // Normalize both shapes to one array: the new `linkedTransactions` collection
  // when present, else the legacy single `linkedOrder` as a one-element list. The
  // scalar `linkedOrder` is kept (first entry) so any existing reader still works.
  const linkedTransactions = Array.isArray(t.linkedTransactions) && t.linkedTransactions.length
    ? t.linkedTransactions.map(toLinkedOrder)
    : t.linkedOrder
      ? [toLinkedOrder(t.linkedOrder)]
      : undefined;
  return {
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    concernType: (t.concernType && CONCERN_FROM_HEYQ[t.concernType]) || 'general_inquiry',
    issueType: t.issueType,
    status: t.status,
    priority: t.priority,
    supportTeam: t.supportTeam,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
    reopenedAt: t.reopenedAt,
    linkedOrder: linkedTransactions?.[0],
    linkedTransactions,
    messages: (t.messages ?? []).map(toMessage),
    canReopen: t.canReopen,
  };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

/**
 * Same-origin base for GGX Corporate's own support proxy (`api/support/**` at
 * the repo root). Always same-origin/relative — a BFF has no separate origin
 * to configure. This is the ONLY base used for ticket reads/writes.
 */
const SUPPORT_PROXY_BASE = '/api/support';

function identityQuery(who: HeyQRequesterIdentity): string {
  const q = new URLSearchParams({
    externalUserId: who.externalUserId,
    externalOrgId: who.externalOrgId,
  });
  return q.toString();
}

/** Map an HTTP status to the adapter's production-shaped result union. */
function resultForStatus(status: number): 'forbidden' | 'not_found' | 'unavailable' {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return 'unavailable'; // 5xx, 429, and anything else transient/unknown
}

/**
 * GET JSON from `${base}${path}`. `base` is either `SUPPORT_PROXY_BASE` (every
 * live ticket read) or `${getHeyQApiBaseUrl()}/api` (the dormant realtime/
 * attachment paths only — see the module docblock).
 */
async function getJson(base: string, path: string): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, result: resultForStatus(res.status) };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' }; // network / CORS / DNS
  }
}

/** POST JSON, no response body needed. `headers` carries idempotency headers
 * (Idempotency-Key / X-Bridge-Message-Id) through to the proxy unchanged. */
async function post(base: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<
  { ok: true } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, result: resultForStatus(res.status) };
    return { ok: true };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

/** POST JSON, response body returned as the created/updated resource. */
async function postJson(base: string, path: string, body: unknown, headers?: Record<string, string>): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, result: resultForStatus(res.status) };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

/**
 * Direct URL to download or (for images/PDFs) preview an attachment on the
 * customer surface. Identity travels as query params (the same handoff the other
 * customer reads use) so the URL is loadable directly by an <img>/<a>. HeyQ still
 * authorizes the ticket before serving the bytes.
 */
export function buildAttachmentUrl(
  who: HeyQRequesterIdentity,
  ticketId: string,
  attachmentId: string,
  inline = false,
): string {
  const q = new URLSearchParams({ externalUserId: who.externalUserId, externalOrgId: who.externalOrgId });
  if (inline) q.set('disposition', 'inline');
  return `${getHeyQApiBaseUrl()}/api/customer/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}?${q.toString()}`;
}

// ── Public operations (consumed by heyqService) ───────────────────────────────
// Every operation below calls the same-origin Corporate support proxy
// (SUPPORT_PROXY_BASE), never QuadX Bridge/HeyQ directly.

/** The signed-in requester's tickets. Any failure degrades to an empty list. */
export async function apiListMyTickets(who: HeyQRequesterIdentity): Promise<CustomerTicket[]> {
  const res = await getJson(SUPPORT_PROXY_BASE, `/tickets?${identityQuery(who)}`);
  if (!res.ok || !Array.isArray(res.data)) return [];
  return (res.data as HeyQApiCustomerTicket[]).map(toCustomerTicket);
}

/** One of the requester's tickets, or a typed failure. */
export async function apiGetMyTicket(
  who: HeyQRequesterIdentity,
  id: string,
): Promise<HeyQResult<CustomerTicket>> {
  const res = await getJson(SUPPORT_PROXY_BASE, `/tickets/${encodeURIComponent(id)}?${identityQuery(who)}`);
  if (!res.ok) return { status: res.result };
  return { status: 'ok', data: toCustomerTicket(res.data as HeyQApiCustomerTicket) };
}

/**
 * Post a requester reply, then re-read the customer view so the caller gets the
 * updated thread + (if the ticket was resolved/closed) the reopened status.
 *
 * Text-only — the approved Bridge contract rejects attachment bytes with 400,
 * so this never sends files (see the module docblock). `messageId`, when
 * given, travels as `X-Bridge-Message-Id`: the caller (`useTicketConversation`)
 * reuses the SAME id across a retry of the same logical reply, so Bridge's
 * atomic RPC dedupes an ambiguous retry instead of creating a second message.
 */
export async function apiReplyToMyTicket(
  who: HeyQRequesterIdentity,
  id: string,
  body: string,
  messageId?: string,
): Promise<HeyQResult<CustomerTicket>> {
  const posted = await post(
    SUPPORT_PROXY_BASE,
    `/tickets/${encodeURIComponent(id)}/messages`,
    { externalUserId: who.externalUserId, externalOrgId: who.externalOrgId, body },
    messageId ? { 'X-Bridge-Message-Id': messageId } : undefined,
  );
  if (!posted.ok) return { status: posted.result };
  return apiGetMyTicket(who, id);
}

/**
 * Reopen a resolved/closed ticket, then re-read the customer view.
 *
 * KNOWN LIMITATION: this Bridge route runs against HeyQ's legacy in-memory
 * ticket store, not the Supabase-backed path the rest of this contract uses,
 * so it does not find a Bridge-created ticket (see
 * docs/migration/ggx-corporate-heyq-live-ticketing.md). A reply already
 * reopens a resolved/on_hold ticket automatically via `apiReplyToMyTicket`,
 * which IS the Supabase-backed path — that is the reliable way to reopen a
 * ticket today.
 */
export async function apiReopenMyTicket(
  who: HeyQRequesterIdentity,
  id: string,
): Promise<HeyQResult<CustomerTicket>> {
  const posted = await post(SUPPORT_PROXY_BASE, `/tickets/${encodeURIComponent(id)}/reopen`, {
    externalUserId: who.externalUserId,
    externalOrgId: who.externalOrgId,
  });
  if (!posted.ok) return { status: posted.result };
  return apiGetMyTicket(who, id);
}

export interface CreateCustomerTicketInput {
  /** Requester display fields for the ticket's guest requester record. */
  name: string;
  email: string;
  concernType: HeyQConcernType;
  subject: string;
  description: string;
  /**
   * Linked transactions (Business+ OMS shape), primary/originating first; mapped to
   * HeyQ's snapshot on the wire. One ticket references all of them. Omit/empty for
   * a general, unlinked ticket.
   */
  linkedTransactions?: {
    externalOrderId: string;
    trackingNumber: string;
    snapshot: HeyQOrderSnapshot;
    capturedAt: string;
  }[];
}

/**
 * Create a ticket via the Corporate support proxy and return the mapped
 * CustomerTicket. The Business+ (OMS) snapshot is translated to HeyQ's linked-
 * order shape here; the response comes back already customer-projected.
 *
 * Text-only — no attachments are ever sent (see the module docblock). Always
 * carries a fresh `Idempotency-Key`, so a network-level retry of this exact
 * call is deduplicated by Bridge's atomic RPC instead of creating a second
 * ticket.
 */
export async function apiCreateTicket(
  who: HeyQRequesterIdentity,
  input: CreateCustomerTicketInput,
): Promise<HeyQResult<CustomerTicket>> {
  const linkedTransactions = input.linkedTransactions?.length
    ? input.linkedTransactions.map((o) => ({
        externalOrderId: o.externalOrderId,
        trackingNumber: o.trackingNumber,
        capturedAt: o.capturedAt,
        snapshot: {
          shipmentStatus: SHIPMENT_TO_HEYQ[o.snapshot.deliveryStatus] ?? o.snapshot.deliveryStatus,
          bookingDate: o.snapshot.bookedOn,
          serviceType: o.snapshot.serviceType,
          deliverySummary: o.snapshot.deliverySummary,
          route: o.snapshot.route,
        },
      }))
    : undefined;

  const trackingNumber = linkedTransactions?.[0]?.trackingNumber;

  const payload = {
    externalUserId: who.externalUserId,
    externalOrgId: who.externalOrgId,
    name: input.name,
    email: input.email,
    concernType: CONCERN_TO_HEYQ[input.concernType] ?? 'general_inquiry',
    subject: input.subject,
    description: input.description,
    trackingNumber,
    linkedTransactions,
  };

  const idempotencyKey = crypto.randomUUID();
  const res = await postJson(SUPPORT_PROXY_BASE, '/tickets', payload, { 'Idempotency-Key': idempotencyKey });
  if (!res.ok) return { status: res.result };
  return { status: 'ok', data: toCustomerTicket(res.data as HeyQApiCustomerTicket) };
}

// ── Realtime connection token (short-lived, single-use, ticket-scoped) ─────────

export interface RealtimeToken {
  token: string;
  expiresInMs: number;
}

/**
 * Mint a customer realtime connection token for ONE ticket over REST
 * (`POST /api/customer/realtime/token`). HeyQ verifies the requester may see the
 * ticket and returns 404 otherwise — knowing a ticket id is never enough. The
 * token is short-lived (~60 s) and single-use; the socket carries NO credentials
 * in its URL, only this token as its first message. A fresh token is minted per
 * connection attempt (including every reconnect).
 */
export async function apiMintRealtimeToken(
  who: HeyQRequesterIdentity,
  ticketId: string,
): Promise<HeyQResult<RealtimeToken>> {
  const res = await postJson(`${getHeyQApiBaseUrl()}/api`, '/customer/realtime/token', {
    externalUserId: who.externalUserId,
    externalOrgId: who.externalOrgId,
    ticketId,
  });
  if (!res.ok) return { status: res.result };
  const data = res.data as Partial<RealtimeToken>;
  if (!data || typeof data.token !== 'string') return { status: 'unavailable' };
  return {
    status: 'ok',
    data: { token: data.token, expiresInMs: typeof data.expiresInMs === 'number' ? data.expiresInMs : 60_000 },
  };
}
