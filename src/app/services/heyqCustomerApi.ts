/**
 * heyqCustomerApi — the HTTP client behind the heyqService seam.
 *
 * This is where Business+ actually talks to the deployed HeyQ mock API (Railway)
 * over its CUSTOMER surface:
 *   GET  /api/customer/tickets            → the signed-in requester's tickets
 *   GET  /api/customer/tickets/:id        → one of them
 *   POST /api/tickets/:id/messages        → a requester reply
 *   POST /api/tickets/:id/reopen          → a requester reopen
 *
 * HeyQ enforces visibility SERVER-SIDE (server/visibility.ts): the response is
 * already projected to what a customer may see — no internal notes, assignee,
 * escalation, SLA or tier. This module is a SHAPE adapter, not the privacy
 * boundary, but it still constructs the Business+ `CustomerTicket` by an explicit
 * field allowlist (`toCustomerTicket` below), so a malformed or over-broad
 * response can never surface an agent-only field into Business+.
 *
 * Requester identity is passed as query params today (externalUserId/Org). When
 * HeyQ ships a real session, that handoff replaces these params; callers and this
 * module's shape do not change.
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
 * Origin of the deployed HeyQ API (the standalone Railway service). Distinct from
 * `VITE_HEYQ_URL`, which is the HeyQ *frontend* used to OPEN HeyQ pages (contact
 * form, portal). Override with `VITE_HEYQ_API_URL`; requests resolve to
 * `${base}/api/...`. No trailing slash, no `/api` suffix.
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

async function getJson(path: string): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${getHeyQApiBaseUrl()}/api${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, result: resultForStatus(res.status) };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' }; // network / CORS / DNS
  }
}

async function post(path: string, body?: unknown): Promise<
  { ok: true } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${getHeyQApiBaseUrl()}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, result: resultForStatus(res.status) };
    return { ok: true };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

async function postJson(path: string, body: unknown): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${getHeyQApiBaseUrl()}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, result: resultForStatus(res.status) };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

/**
 * POST a multipart/form-data body (an upload). The browser sets the multipart
 * `Content-Type`/boundary from the FormData, so it must NOT be set here. HeyQ
 * validates the files server-side and returns 400 with per-file detail on
 * rejection (client validation is the first gate, so that path is rare).
 */
async function postForm(path: string, form: FormData): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' }
> {
  try {
    const res = await fetch(`${getHeyQApiBaseUrl()}/api${path}`, { method: 'POST', body: form });
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

/** The signed-in requester's tickets. Any failure degrades to an empty list. */
export async function apiListMyTickets(who: HeyQRequesterIdentity): Promise<CustomerTicket[]> {
  const res = await getJson(`/customer/tickets?${identityQuery(who)}`);
  if (!res.ok || !Array.isArray(res.data)) return [];
  return (res.data as HeyQApiCustomerTicket[]).map(toCustomerTicket);
}

/** One of the requester's tickets, or a typed failure. */
export async function apiGetMyTicket(
  who: HeyQRequesterIdentity,
  id: string,
): Promise<HeyQResult<CustomerTicket>> {
  const res = await getJson(`/customer/tickets/${encodeURIComponent(id)}?${identityQuery(who)}`);
  if (!res.ok) return { status: res.result };
  return { status: 'ok', data: toCustomerTicket(res.data as HeyQApiCustomerTicket) };
}

/**
 * Post a requester reply, then re-read the customer view so the caller gets the
 * updated thread + (if the ticket was resolved/closed) the reopened status.
 */
export async function apiReplyToMyTicket(
  who: HeyQRequesterIdentity,
  id: string,
  body: string,
  files?: File[],
): Promise<HeyQResult<CustomerTicket>> {
  if (files?.length) {
    // A reply WITH attachments is a multipart upload: HeyQ validates + stores the
    // files atomically with the message, so the message never references a missing
    // upload. A rejected batch fails the whole reply (no message is created).
    const form = new FormData();
    form.append('externalUserId', who.externalUserId);
    form.append('externalOrgId', who.externalOrgId);
    form.append('body', body);
    for (const f of files) form.append('files', f, f.name);
    const posted = await postForm(`/customer/tickets/${encodeURIComponent(id)}/messages`, form);
    if (!posted.ok) return { status: posted.result };
  } else {
    const posted = await post(`/customer/tickets/${encodeURIComponent(id)}/messages`, {
      externalUserId: who.externalUserId,
      externalOrgId: who.externalOrgId,
      body,
    });
    if (!posted.ok) return { status: posted.result };
  }
  return apiGetMyTicket(who, id);
}

/** Reopen a resolved/closed ticket, then re-read the customer view. */
export async function apiReopenMyTicket(
  who: HeyQRequesterIdentity,
  id: string,
): Promise<HeyQResult<CustomerTicket>> {
  const posted = await post(`/tickets/${encodeURIComponent(id)}/reopen`, {
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
  /** Files attached during ticket creation (uploaded atomically with the ticket). */
  files?: File[];
}

/**
 * Create a ticket via the HeyQ customer surface and return the mapped
 * CustomerTicket. The Business+ (OMS) snapshot is translated to HeyQ's linked-
 * order shape here; the response comes back already customer-projected.
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

  let res;
  if (input.files?.length) {
    // Creation WITH attachments — multipart so files upload atomically with the
    // ticket. Scalar fields become form fields; linked transactions ride as JSON.
    const form = new FormData();
    form.append('externalUserId', payload.externalUserId);
    form.append('externalOrgId', payload.externalOrgId);
    form.append('name', payload.name);
    form.append('email', payload.email);
    form.append('concernType', payload.concernType);
    form.append('subject', payload.subject);
    form.append('description', payload.description);
    if (trackingNumber) form.append('trackingNumber', trackingNumber);
    if (linkedTransactions) form.append('linkedTransactions', JSON.stringify(linkedTransactions));
    for (const f of input.files) form.append('files', f, f.name);
    res = await postForm('/customer/tickets', form);
  } else {
    res = await postJson('/customer/tickets', payload);
  }
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
  const res = await postJson('/customer/realtime/token', {
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
