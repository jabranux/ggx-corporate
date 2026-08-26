/**
 * heyqService — the GGX Business+ ↔ HeyQ adapter. THE SEAM.
 *
 * ── Ownership ──────────────────────────────────────────────────────────────
 *   • OMS (via `transactionService`) owns orders and shipment/delivery status.
 *   • HeyQ owns tickets: assignment, escalation, messages, status changes,
 *     resolution, reopening, history.
 *   • Business+ owns neither. It is a REQUESTER CLIENT of HeyQ (via QuadX
 *     Bridge) and a read consumer of OMS.
 *
 * Every Business+ ↔ HeyQ interaction goes through this module. Ticket reads and
 * writes go through GGX Corporate's own same-origin support proxy
 * (`/api/support/*`, see `heyqCustomerApi`'s docblock and
 * docs/migration/ggx-corporate-heyq-live-ticketing.md), which forwards to
 * QuadX Bridge and attaches the server-only Bridge secret — never the browser.
 * The OMS side (order authorization, the customer-safe snapshot, live delivery
 * status) is read through `transactionService`, never from HeyQ and never from
 * page state.
 *
 * Corporate proxy routes used (requester-scoped, all same-origin):
 *   GET  /api/support/tickets                → listMyTickets
 *   GET  /api/support/tickets/:id             → getMyTicket
 *   POST /api/support/tickets                 → submitOrderReport (create)
 *   POST /api/support/tickets/:id/messages    → replyToMyTicket
 *   POST /api/support/tickets/:id/reopen      → reopenMyTicket
 *
 * ── What this adapter deliberately does NOT do ─────────────────────────────
 * It exposes no agent/internal surface. Internal notes, assignee identity, team
 * queue, SLA policy, support tier and escalation state are dropped by HeyQ's
 * server-side projection and are never requested here — they must never reach a
 * Business+ page. Agent actions belong to the HeyQ agent app. It also sends no
 * attachments — the approved Bridge contract is text-only (see
 * `heyqCustomerApi`'s docblock).
 */

import { getTransactionById, getTransactionsBySubaccountId, statusConfig, serviceTypeLabel } from './transactionService';
import { getSessionContext } from './authService';
import { getAccountIdByName } from '../data/accounts';
import {
  apiListMyTickets,
  apiGetMyTicket,
  apiReplyToMyTicket,
  apiReopenMyTicket,
  apiCreateTicket,
  apiMintRealtimeToken,
  buildAttachmentUrl,
  getHeyQApiBaseUrl,
  projectRealtimeMessage,
  type RealtimeToken,
} from './heyqCustomerApi';

export { projectRealtimeMessage, buildAttachmentUrl } from './heyqCustomerApi';

// ── HeyQ contract types (owned by HeyQ; mirrored here for the adapter) ────────
// HeyQ's requester-facing vocabulary. Previously shared from the in-process mock;
// with reads/writes now served by the real HeyQ API, the adapter carries them.

export type HeyQTicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'on_hold'
  | 'resolved'
  | 'closed';

export type HeyQConcernType =
  | 'delivery_delay'
  | 'failed_delivery'
  | 'missing_parcel'
  | 'damaged_parcel'
  | 'cod_concern'
  | 'billing_issue'
  | 'address_correction'
  | 'general_inquiry';

export const HEYQ_CONCERN_LABELS: Record<HeyQConcernType, string> = {
  delivery_delay: 'Delayed Delivery',
  failed_delivery: 'Delivery Failed',
  missing_parcel: 'Missing Package',
  damaged_parcel: 'Package Damaged',
  cod_concern: 'COD Concern',
  billing_issue: 'Billing Inquiry',
  address_correction: 'Wrong Address',
  general_inquiry: 'General Inquiry',
};

/**
 * The signed-in Business+ user, as HeyQ's requester identity. `externalOrgId` is
 * the ACCOUNT SCOPE — Admin is `main` (sees everything), a Manager is their
 * subaccount — and is also what scopes order authorization.
 */
export interface HeyQRequesterIdentity {
  externalUserId: string;
  externalOrgId: string;
}

/**
 * The minimal, customer-safe order context. OMS-derived and captured at
 * submission; delivery status here is independent of the ticket's own status.
 */
export interface HeyQOrderSnapshot {
  /** OMS delivery status key at capture time (e.g. 'in-transit'). */
  deliveryStatus: string;
  /** Display label for the delivery status at capture time. */
  deliveryStatusLabel: string;
  /** Standard / Same-Day / On-Demand. */
  serviceType: string;
  /** Short, non-identifying summary (e.g. "Express delivery"). */
  deliverySummary: string;
  /** City-level route only (e.g. "Makati City → Quezon City"). */
  route: string;
  /** Booking date (the relevant date for support context). */
  bookedOn: string;
}

/**
 * A single option in the report drawer's transaction combobox. OMS-derived and
 * scoped to the caller's account — enough to recognize the order (tracking number,
 * status, a short destination/recipient reference) and link it to a ticket.
 */
export interface AuthorizedTransactionOption {
  /** Stable OMS order id (the tracking number). */
  externalOrderId: string;
  trackingNumber: string;
  /** OMS delivery-status key (for the badge palette). */
  statusKey: string;
  statusLabel: string;
  /** Badge variant for the delivery status, so the UI needn't import statusConfig. */
  statusVariant: BadgeVariant;
  /** Short destination or recipient reference for the result row. */
  reference: string;
}

/** A ticket's link to an OMS order: stable id + snapshot. Reference data only. */
export interface HeyQLinkedOrder {
  /** Stable OMS order id (Business+ tracking number). Never a HeyQ primary key. */
  externalOrderId: string;
  trackingNumber: string;
  /** Captured at submission. Absent when the snapshot could not be taken. */
  snapshot?: HeyQOrderSnapshot;
  /** When the snapshot was captured — makes snapshot age explicit. */
  capturedAt: string;
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Where the HeyQ FRONTEND lives — used to OPEN HeyQ pages (the contact form and
 * the requester portal). This is NOT the API origin; API calls go through
 * `heyqCustomerApi` (`VITE_HEYQ_API_URL`). Override the frontend with
 * `VITE_HEYQ_URL`; the default is the deployed HeyQ app. For local development
 * against a local HeyQ, set `VITE_HEYQ_URL=http://localhost:18020`.
 */
export function getHeyQBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_HEYQ_URL : undefined;
  return (configured || 'https://heyq.vercel.app').replace(/\/$/, '');
}

// ── Result unions ────────────────────────────────────────────────────────────
// Mirrors HeyQ's own provider contract, so authorization failure and downtime
// are handled today rather than discovered in production.

export type HeyQResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'unavailable' };

// ── Customer-facing view models ──────────────────────────────────────────────

/** Customer-safe attachment METADATA on a public message. `id` is present for
 * real uploaded attachments and lets the UI build an authorized download URL. */
export interface HeyQAttachment {
  id?: string;
  name: string;
  size: number;
  type: string;
}

/** A public conversation entry. Internal notes have no representation here. */
export interface CustomerTicketMessage {
  id: string;
  /** 'you' | 'support' | 'system' — never an individual agent identity. */
  from: 'you' | 'support' | 'system';
  /** Team name for support replies (e.g. "Claims"), not the agent's name. */
  authorLabel: string;
  body: string;
  /** Attachment metadata on this public message, if any. Display-only. */
  attachments?: HeyQAttachment[];
  createdAt: string;
}

/**
 * What Business+ is allowed to see about a HeyQ ticket. Note what is absent:
 * assignee identity, escalation state, support tier, SLA policy, internal notes.
 */
export interface CustomerTicket {
  id: string;
  reference: string;
  subject: string;
  concernType: HeyQConcernType;
  /** Human label for the concern (drives the existing "Issue Type" column). */
  issueType: string;
  /** SUPPORT-TICKET status — distinct from the order's delivery status. */
  status: HeyQTicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** The handling team. Team, not agent — agent identity stays inside HeyQ. */
  supportTeam: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  reopenedAt?: string;
  /** Primary/first linked order — legacy mirror of `linkedTransactions[0]`. */
  linkedOrder?: HeyQLinkedOrder;
  /**
   * All linked transactions (primary first). One ticket can reference many. Absent
   * for a general (unlinked) ticket; a one-element array for a single-order ticket.
   */
  linkedTransactions?: HeyQLinkedOrder[];
  messages: CustomerTicketMessage[];
  /** Requesters may reopen a resolved/closed ticket. */
  canReopen: boolean;
}

// ── Status presentation ──────────────────────────────────────────────────────
//
// SUPPORT-TICKET status only. Delivery status has its own map (`statusConfig` in
// transactionService) and the two must never be styled from the same source.
// Semantics: orange = waiting on us, blue = actively worked, amber = blocked,
// green = resolved, grey = closed.

export type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'pending';

export const TICKET_STATUS_META: Record<
  HeyQTicketStatus,
  { label: string; variant: BadgeVariant }
> = {
  new:         { label: 'New',         variant: 'pending' },
  open:        { label: 'Open',        variant: 'pending' },
  in_progress: { label: 'In Progress', variant: 'info' },
  on_hold:     { label: 'On Hold',     variant: 'warning' },
  resolved:    { label: 'Resolved',    variant: 'success' },
  closed:      { label: 'Closed',      variant: 'default' },
};

export const TICKET_PRIORITY_META: Record<
  CustomerTicket['priority'],
  { label: string; variant: BadgeVariant }
> = {
  urgent: { label: 'Urgent', variant: 'danger' },
  high:   { label: 'High',   variant: 'danger' },
  normal: { label: 'Normal', variant: 'warning' },
  low:    { label: 'Low',    variant: 'default' },
};

/** Ordered for the status filter on the Support Tickets page. */
export const TICKET_STATUS_OPTIONS: { value: HeyQTicketStatus; label: string }[] = (
  ['new', 'open', 'in_progress', 'on_hold', 'resolved', 'closed'] as HeyQTicketStatus[]
).map((s) => ({ value: s, label: TICKET_STATUS_META[s].label }));

/** Concern options for the in-app report drawer. */
export const REPORT_CONCERN_OPTIONS: { value: HeyQConcernType; label: string }[] = (
  [
    'delivery_delay', 'failed_delivery', 'missing_parcel', 'damaged_parcel',
    'cod_concern', 'billing_issue', 'address_correction', 'general_inquiry',
  ] as HeyQConcernType[]
).map((c) => ({ value: c, label: HEYQ_CONCERN_LABELS[c] }));

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * The signed-in Business+ user, as HeyQ's requester identity. In production the
 * handoff carries a verifiable session (e.g. a signed token) that resolves to
 * this on HeyQ's side; today we pass the external ids explicitly.
 */
export async function getRequesterIdentity(): Promise<HeyQRequesterIdentity | null> {
  const session = await getSessionContext();
  if (!session.isAuthenticated || !session.user || !session.accountId) return null;
  return {
    externalUserId: session.user.email,
    externalOrgId: session.accountId,
  };
}

// ── OMS order authorization + snapshot ───────────────────────────────────────

/**
 * May this identity see this order? Reads the order through the OMS boundary
 * (`transactionService`) — never page state — and checks it against the caller's
 * account scope. Admin (`main`) sees all accounts; a Manager sees only their own.
 *
 * An out-of-scope order is `forbidden` whether or not it exists, so the caller
 * learns nothing about other accounts' shipments.
 */
export async function getAuthorizedOrder(
  who: HeyQRequesterIdentity,
  externalOrderId: string,
): Promise<HeyQResult<{ snapshot: HeyQOrderSnapshot; trackingNumber: string }>> {
  const tx = await getTransactionById(externalOrderId);
  if (!tx) return { status: 'not_found' };

  if (who.externalOrgId !== 'main') {
    const owner = getAccountIdByName(tx.subaccount);
    if (owner !== who.externalOrgId) return { status: 'forbidden' };
  }

  return {
    status: 'ok',
    data: { snapshot: buildOrderSnapshot(tx), trackingNumber: tx.trackingNumber },
  };
}

/**
 * The transactions the signed-in requester may reference in a report, optionally
 * narrowed by a query. Scoped by account through the OMS boundary — Admin (`main`)
 * sees every account, a Manager only their subaccount — the same rule
 * `getAuthorizedOrder` enforces per order. The query matches tracking number
 * first (the primary search key), plus recipient and destination for convenience.
 * Results are capped so the combobox never renders an unbounded list.
 */
export async function listAuthorizedTransactions(
  query?: string,
  limit = 20,
): Promise<AuthorizedTransactionOption[]> {
  const who = await getRequesterIdentity();
  if (!who) return [];
  const summaries = await getTransactionsBySubaccountId(who.externalOrgId);
  const q = query?.trim().toLowerCase() ?? '';
  const matched = q
    ? summaries.filter(
        (t) =>
          t.tracking.toLowerCase().includes(q) ||
          t.recipient.toLowerCase().includes(q) ||
          t.destination.toLowerCase().includes(q),
      )
    : summaries;
  return matched.slice(0, limit).map((t) => ({
    externalOrderId: t.tracking,
    trackingNumber: t.tracking,
    statusKey: t.status,
    statusLabel: statusConfig[t.status]?.label ?? t.status,
    statusVariant: (statusConfig[t.status]?.variant ?? 'default') as BadgeVariant,
    reference: t.destination || t.recipient,
  }));
}

type OmsTransaction = NonNullable<Awaited<ReturnType<typeof getTransactionById>>>;

/**
 * Reduce an OMS order to the minimal, customer-safe context HeyQ needs to triage.
 *
 * Passed: delivery status, service type, a short delivery summary, a city-level
 * route, and the booking date. Withheld: recipient name/contact/address, payment
 * and COD values, parcel contents, fees, batch/internal attribution.
 */
function buildOrderSnapshot(tx: OmsTransaction): HeyQOrderSnapshot {
  const meta = statusConfig[tx.status];
  return {
    deliveryStatus: tx.status,
    deliveryStatusLabel: meta?.label ?? tx.status,
    serviceType: serviceTypeLabel(tx.serviceType),
    deliverySummary: `${tx.type} delivery`,
    // City-level only — never the street address.
    route: `${cityOf(tx.sender?.address)} → ${cityOf(tx.destination)}`,
    bookedOn: tx.date,
  };
}

/** Collapse an address to a city-level fragment. Defensive about mock shapes. */
function cityOf(value: string | undefined): string {
  if (!value) return 'Metro Manila';
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(', ') : (parts[0] ?? value);
}

// ── Handoff into HeyQ ────────────────────────────────────────────────────────

/** HeyQ's contact form, optionally deep-linked to one authorized order. */
export function buildContactUrl(externalOrderId?: string): string {
  const base = `${getHeyQBaseUrl()}/contact`;
  return externalOrderId
    ? `${base}?order=${encodeURIComponent(externalOrderId)}`
    : base;
}

function openExternal(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** General support: open HeyQ with no preselected order. */
export function openHeyQContact(): void {
  openExternal(buildContactUrl());
}

/**
 * Order-linked support: authorize the order against OMS, then hand off to HeyQ
 * with its stable id. Returns the outcome so the caller can explain a refusal
 * rather than silently opening an unlinked form.
 */
export async function startOrderHandoff(
  externalOrderId: string,
): Promise<HeyQResult<{ url: string }>> {
  const who = await getRequesterIdentity();
  if (!who) return { status: 'forbidden' };

  const authorized = await getAuthorizedOrder(who, externalOrderId);
  if (authorized.status !== 'ok') return authorized;

  const url = buildContactUrl(externalOrderId);
  openExternal(url);
  return { status: 'ok', data: { url } };
}

// ── Embedded report submission (creates a ticket via the HeyQ customer API) ──

export interface OrderReportInput {
  /**
   * The selected transactions (stable OMS order ids), primary/originating first.
   * MAY be empty — a general, non-order-specific concern submits with no link.
   * Every id is authorized against OMS before the ticket is created.
   */
  externalOrderIds: string[];
  concernType: HeyQConcernType;
  subject: string;
  description: string;
}

/**
 * Authorized download/preview URL for one of a ticket's attachments, for the
 * signed-in requester. DORMANT: the approved Bridge contract is text-only, so
 * no ticket ever carries an attachment id for this to be called with in
 * practice — kept only so a future attachment-capable Bridge doesn't need this
 * URL-building logic rebuilt. Resolves identity through the same path as every
 * other read; returns null when unauthenticated.
 */
export async function getAttachmentUrl(ticketId: string, attachmentId: string, inline = false): Promise<string | null> {
  const who = await getRequesterIdentity();
  if (!who) return null;
  return buildAttachmentUrl(who, ticketId, attachmentId, inline);
}

/**
 * Submit a report from inside Business+ (the report drawer). ONE ticket is created
 * for ALL selected transactions, not one per transaction. Every selected order is
 * authorized through the OMS boundary FIRST — Business+ owns order authorization,
 * so this is the server-side gate: if ANY selected order is out of scope the whole
 * submission is refused (that failure is returned), never partially linked. With no
 * selected order the ticket is created unlinked (a general concern). Snapshots are
 * OMS-captured; order is preserved so the primary/originating transaction stays first.
 * Returns the created customer ticket so the caller can link straight to it.
 */
export async function submitOrderReport(input: OrderReportInput): Promise<HeyQResult<CustomerTicket>> {
  const session = await getSessionContext();
  if (!session.isAuthenticated || !session.user || !session.accountId) return { status: 'forbidden' };
  const who: HeyQRequesterIdentity = {
    externalUserId: session.user.email,
    externalOrgId: session.accountId,
  };

  const capturedAt = new Date().toISOString();
  // Snapshot is REQUIRED on each entry here (unlike the display-only HeyQLinkedOrder,
  // whose snapshot may be absent) — it is always captured fresh from OMS below.
  const linkedTransactions: {
    externalOrderId: string;
    trackingNumber: string;
    snapshot: HeyQOrderSnapshot;
    capturedAt: string;
  }[] = [];
  for (const externalOrderId of input.externalOrderIds) {
    const authorized = await getAuthorizedOrder(who, externalOrderId);
    if (authorized.status !== 'ok') return authorized; // refuse the whole submission
    linkedTransactions.push({
      externalOrderId,
      trackingNumber: authorized.data.trackingNumber,
      snapshot: authorized.data.snapshot,
      capturedAt,
    });
  }

  return apiCreateTicket(who, {
    name: session.user.name,
    email: session.user.email,
    concernType: input.concernType,
    subject: input.subject,
    description: input.description,
    linkedTransactions: linkedTransactions.length ? linkedTransactions : undefined,
  });
}

// ── Requester-facing ticket reads + writes (HeyQ customer API) ────────────────

/** The signed-in user's tickets. Scoped by HeyQ to their identity. */
export async function listMyTickets(): Promise<CustomerTicket[]> {
  const who = await getRequesterIdentity();
  if (!who) return [];
  return apiListMyTickets(who);
}

/** One of the signed-in user's tickets. Another user's ticket is `not_found`. */
export async function getMyTicket(id: string): Promise<HeyQResult<CustomerTicket>> {
  const who = await getRequesterIdentity();
  if (!who) return { status: 'forbidden' };
  return apiGetMyTicket(who, id);
}

/**
 * Post a public reply (text-only — see the module docblock). Replying to a
 * resolved/closed ticket reopens it in HeyQ. `messageId`, when given, is
 * forwarded as the Bridge idempotency identifier for this reply — the caller
 * reuses the same id across a retry of the same logical send.
 */
export async function replyToMyTicket(
  id: string,
  body: string,
  messageId?: string,
): Promise<HeyQResult<CustomerTicket>> {
  const who = await getRequesterIdentity();
  if (!who) return { status: 'forbidden' };
  return apiReplyToMyTicket(who, id, body, messageId);
}

/** Reopen a resolved/closed ticket. HeyQ owns the resulting state transition. */
export async function reopenMyTicket(id: string): Promise<HeyQResult<CustomerTicket>> {
  const who = await getRequesterIdentity();
  if (!who) return { status: 'forbidden' };
  return apiReopenMyTicket(who, id);
}

// ── Realtime (DORMANT — live ticket conversation over the HeyQ WebSocket) ─────
//
// UNUSED by the running app. The approved QuadX Bridge contract for this POC
// is REST + 5-second polling only (see hooks/useTicketConversation.ts); it has
// no realtime/WebSocket route. This section (and heyqRealtimeClient.ts) is
// left in place, still pointed at the legacy standalone HeyQ API origin, as a
// documented dormant capability rather than deleted — nothing in the running
// app calls it, so it never reaches HeyQ/Bridge from the browser. See
// docs/migration/ggx-corporate-heyq-live-ticketing.md.
//
// HeyQ owns the channel and remains the source of truth (persist-first, then
// broadcast). Business+ is a CUSTOMER subscriber to a single authorized ticket.
// The full contract lives in HeyQ/docs/realtime-conversations.md. Only the
// customer-safe event subset is modelled here — assignment changes and internal
// notes are never delivered on a customer channel and have no type below.

/** The customer-visible realtime event types. `ticket.assignment_changed` is
 *  agent-only and deliberately absent. */
export type CustomerRealtimeEventType =
  | 'message.created'
  | 'ticket.status_changed'
  | 'typing.started'
  | 'typing.stopped';

/** Who caused an event. Customers only ever see these three. */
export type RealtimeActorType = 'agent' | 'requester' | 'system';

/**
 * The realtime envelope as it arrives on a customer socket. `id` is stable for
 * de-duplication; `serverTimestamp` is authoritative for ordering. `data` shape
 * depends on `type` (see the contract) and is intentionally left `unknown` — each
 * consumer projects the fields it needs through an explicit allowlist.
 */
export interface CustomerRealtimeEvent {
  id: string;
  type: CustomerRealtimeEventType;
  ticketId: string;
  actorType: RealtimeActorType;
  serverTimestamp: string;
  data: unknown;
}

/** `data` on a `ticket.status_changed` event (status is customer-safe). */
export interface StatusChangedData {
  status: HeyQTicketStatus;
  fromStatus?: HeyQTicketStatus;
}

/**
 * The WebSocket endpoint for the realtime channel, derived from the SAME origin
 * as the REST API (`VITE_HEYQ_API_URL`). https→wss, http→ws — so an https page
 * never attempts an insecure socket. No credentials are ever placed in this URL;
 * authentication is a token message sent after connect.
 */
export function getHeyQRealtimeUrl(): string {
  const base = getHeyQApiBaseUrl(); // e.g. https://heyq-api-production.up.railway.app
  const wsBase = base.replace(/^http/i, 'ws'); // https→wss, http→ws
  return `${wsBase}/api/realtime`;
}

/**
 * Mint a short-lived, single-use, ticket-scoped realtime connection token for the
 * signed-in requester. Resolves identity through the same path as every other
 * read, so an unauthenticated caller (or a ticket that isn't theirs) never gets a
 * token. Called once per connection attempt, including each reconnect.
 */
export async function getRealtimeToken(ticketId: string): Promise<HeyQResult<RealtimeToken>> {
  const who = await getRequesterIdentity();
  if (!who) return { status: 'forbidden' };
  return apiMintRealtimeToken(who, ticketId);
}

// ── Live order status (OMS, not HeyQ) ────────────────────────────────────────

/**
 * Re-read a linked order's CURRENT delivery status from OMS, for the "snapshot
 * vs live" comparison on a ticket. Routed through the OMS service boundary.
 *
 * A live shipment change never moves the HeyQ ticket status, and vice versa —
 * they are independent dimensions. `not_found` here is normal and expected: the
 * order may have been archived upstream since the ticket was raised, and the
 * ticket must still render from its snapshot.
 */
export async function getLiveOrderStatus(
  externalOrderId: string,
): Promise<HeyQResult<{ deliveryStatus: string; deliveryStatusLabel: string }>> {
  const who = await getRequesterIdentity();
  if (!who) return { status: 'forbidden' };
  const authorized = await getAuthorizedOrder(who, externalOrderId);
  if (authorized.status !== 'ok') return authorized;
  const { snapshot } = authorized.data;
  return {
    status: 'ok',
    data: {
      deliveryStatus: snapshot.deliveryStatus,
      deliveryStatusLabel: snapshot.deliveryStatusLabel,
    },
  };
}
