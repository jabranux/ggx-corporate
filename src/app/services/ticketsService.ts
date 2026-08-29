/**
 * ticketsService — support-tickets façade for Business+ pages.
 *
 * ── Architecture / ownership ───────────────────────────────────────────────
 * Tickets are owned by HEYQ, not by Business+. This façade shapes HeyQ's
 * requester-facing data for the existing Support Tickets surfaces (list table,
 * ticket detail, topbar search) and forwards every write to HeyQ through the
 * adapter in `heyqService` — the single integration seam.
 *
 * Business+ holds NO ticket state of its own: there is no local ticket store to
 * drift out of sync. Status, assignment, escalation, replies, resolution, and
 * reopening all happen in HeyQ; we read what HeyQ says and render it.
 *
 * Ticket CREATION is not here on purpose. The product flow hands the user off to
 * HeyQ's own contact form (`openHeyQContact` / `startOrderHandoff`), which is
 * where HeyQ collects and validates the submission.
 *
 * Order data comes from OMS via `transactionService`, never from HeyQ.
 */

import {
  listMyTickets,
  getMyTicket,
  replyToMyTicket,
  getRequesterIdentity,
  TICKET_STATUS_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_OPTIONS,
  isTerminalTicketStatus,
  isPermanentlyClosed,
  type CustomerTicket,
  type CustomerTicketMessage,
  type HeyQAttachment,
  type HeyQTicketStatus,
  type HeyQLinkedOrder,
  type HeyQResult,
} from './heyqService';

export type {
  CustomerTicket,
  CustomerTicketMessage,
  HeyQAttachment,
  HeyQTicketStatus,
  HeyQLinkedOrder,
  HeyQResult,
};

export {
  TICKET_STATUS_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_OPTIONS,
  isTerminalTicketStatus,
  isPermanentlyClosed,
};

// Re-exported so pages have one import site for the HeyQ handoff + report actions.
export { openHeyQContact, startOrderHandoff, getLiveOrderStatus, submitOrderReport, listAuthorizedTransactions, getAttachmentUrl, buildAttachmentUrl, listConcernCategories, getRequesterIdentity } from './heyqService';
export type { OrderReportInput, AuthorizedTransactionOption, HeyQConcernType, HeyQRequesterIdentity, ConcernCategory, ConcernSubcategory } from './heyqService';

// Realtime (live conversation) — the token/URL/event-projection seam. Pages don't
// touch heyqService directly for realtime; they go through the client + hook,
// which import these from here.
export {
  getRealtimeToken,
  getHeyQRealtimeUrl,
  projectRealtimeMessage,
} from './heyqService';
export type {
  CustomerRealtimeEvent,
  CustomerRealtimeEventType,
  RealtimeActorType,
  StatusChangedData,
} from './heyqService';

// Typing presence — its own ephemeral path, consumed only by
// useTicketConversation.ts. Never part of a ticket read/poll payload.
// Sending is unchanged; receiving is event-driven (Supabase Realtime
// Broadcast via subscribeToAgentTyping + heyqTypingRealtime.ts), not a poll
// — see heyqService.ts's docblock.
export { sendTypingSignal, subscribeToAgentTyping } from './heyqService';
export type { AgentTypingSubscription } from './heyqService';

/**
 * List-row shape for the existing Support Tickets table and topbar search.
 * `trackingNumber` is the linked OMS order id, or '—' for a general ticket.
 */
export interface SupportTicket {
  id: string;
  reference: string;
  /**
   * Compact linked-order display: the primary tracking number, plus "+N more" when
   * the ticket links several. '—' when the ticket has no order. Every linked number
   * stays searchable via `trackingNumbers`.
   */
  trackingNumber: string;
  /** Every linked tracking number (primary first). Drives search across all of them. */
  trackingNumbers: string[];
  issueType: string;
  subject: string;
  /** SUPPORT status — not the order's delivery status. */
  status: HeyQTicketStatus;
  priority: CustomerTicket['priority'];
  /** Handling team. Agent identity is never exposed to Business+. */
  supportTeam: string;
  created: string;
  lastUpdate: string;
  canReopen: boolean;
}

/** "GGX-1 +2 more" for a multi-transaction ticket, the bare number for one, '—' for none. */
function compactTracking(numbers: string[]): string {
  if (numbers.length === 0) return '—';
  if (numbers.length === 1) return numbers[0];
  return `${numbers[0]} +${numbers.length - 1} more`;
}

function toRow(t: CustomerTicket): SupportTicket {
  const trackingNumbers = (t.linkedTransactions?.length
    ? t.linkedTransactions
    : t.linkedOrder
      ? [t.linkedOrder]
      : []
  ).map((o) => o.trackingNumber);
  return {
    id: t.id,
    reference: t.reference,
    trackingNumber: compactTracking(trackingNumbers),
    trackingNumbers,
    issueType: t.issueType,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    supportTeam: t.supportTeam,
    created: t.createdAt,
    lastUpdate: t.updatedAt,
    canReopen: t.canReopen,
  };
}

export interface TicketFilters {
  status?: HeyQTicketStatus | 'all';
  issueType?: string | 'all';
  search?: string;
}

/** The signed-in user's tickets from HeyQ, with optional presentation filters. */
export async function getTicketsList(filters?: TicketFilters): Promise<SupportTicket[]> {
  let rows = (await listMyTickets()).map(toRow);
  if (!filters) return rows;

  const { status, issueType, search } = filters;
  if (status && status !== 'all') rows = rows.filter((t) => t.status === status);
  if (issueType && issueType !== 'all') rows = rows.filter((t) => t.issueType === issueType);
  if (search && search.trim().length >= 2) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        (t.reference?.toLowerCase().includes(q) ?? false) ||
        t.trackingNumbers.some((n) => n.toLowerCase().includes(q)) ||
        t.subject.toLowerCase().includes(q),
    );
  }
  return rows;
}

/** Full customer-visible ticket (thread, linked order, resolution state). */
export async function getTicketById(id: string): Promise<HeyQResult<CustomerTicket>> {
  return getMyTicket(id);
}

/** Minimal reference to a still-active ticket linked to a transaction. */
export interface ActiveTicketLink {
  id: string;
  reference: string;
  status: HeyQTicketStatus;
}

/**
 * Short-TTL in-flight/result cache for the active-tickets map, same pattern as
 * `heyqService.ts`'s concern-categories cache. Without this, two callers that
 * both need this map within the same moment (e.g. the On-Demand card's button
 * and the general "Need Help?" card on ONE transaction page, or React 18
 * StrictMode's deliberate double-invoke of an effect in development) would
 * each trigger their own `listMyTickets()` request — exactly the per-CTA/
 * per-transaction request pattern this exists to avoid. 15s matches the
 * Support Tickets list's own poll cadence (`LIST_POLL_MS`).
 *
 * Keyed by requester identity (`externalUserId:externalOrgId`), not just
 * time: this app's demo Quick Login can switch the signed-in account without
 * a full page reload, so a bare time-based cache could hand a just-switched-to
 * account the PREVIOUS requester's ticket references/statuses for up to the
 * full TTL — a real account/subaccount scoping leak, not merely a staleness
 * quirk. A changed identity invalidates the cache the same way an elapsed TTL
 * does.
 */
const ACTIVE_TICKETS_CACHE_TTL_MS = 15_000;
let activeTicketsCache: { at: number; key: string; result: Promise<Map<string, ActiveTicketLink[]>> } | undefined;

export function invalidateActiveTicketsCache(): void {
  activeTicketsCache = undefined;
}

async function buildActiveTicketsByTrackingNumber(): Promise<Map<string, ActiveTicketLink[]>> {
  const tickets = await listMyTickets();
  const map = new Map<string, ActiveTicketLink[]>();
  for (const t of tickets) {
    if (isPermanentlyClosed(t)) continue;
    const linked = t.linkedTransactions?.length ? t.linkedTransactions : t.linkedOrder ? [t.linkedOrder] : [];
    for (const { trackingNumber } of linked) {
      const existing = map.get(trackingNumber);
      const link: ActiveTicketLink = { id: t.id, reference: t.reference, status: t.status };
      if (existing) existing.push(link);
      else map.set(trackingNumber, [link]);
    }
  }
  return map;
}

/**
 * Active (not permanently closed) tickets for every tracking number the
 * signed-in requester has, keyed by tracking number. Built from ONE
 * `listMyTickets()` fetch — the same list the Support Tickets page already
 * loads — so a caller checking many transactions (or the same transaction
 * from more than one CTA on a page) never issues a per-transaction request.
 * "Active" uses the same canonical lifecycle rule as everywhere else in this
 * app (`isPermanentlyClosed`): a resolved ticket still inside its 24h reopen
 * window counts as active, a permanently closed one does not.
 */
export async function getActiveTicketsByTrackingNumber(): Promise<Map<string, ActiveTicketLink[]>> {
  const who = await getRequesterIdentity();
  const key = who ? `${who.externalUserId}:${who.externalOrgId}` : 'anonymous';
  const now = Date.now();
  if (!activeTicketsCache || activeTicketsCache.key !== key || now - activeTicketsCache.at >= ACTIVE_TICKETS_CACHE_TTL_MS) {
    const pending = buildActiveTicketsByTrackingNumber();
    activeTicketsCache = { at: now, key, result: pending };
    try {
      return await pending;
    } catch (err) {
      // A failed fetch must not squat on the cache for the full TTL — the
      // next call should retry, not replay the same failure.
      if (activeTicketsCache?.result === pending) activeTicketsCache = undefined;
      throw err;
    }
  }
  return activeTicketsCache.result;
}

/**
 * Post a public reply (text-only). Replying to a resolved/closed ticket
 * reopens it in HeyQ — the only supported reopen path (there is no separate
 * explicit reopen call any more; see docs/migration/ggx-corporate-heyq-live-ticketing.md
 * "Reopen removal"). `messageId`, when given, is the Bridge idempotency
 * identifier for this reply (see `heyqService.replyToMyTicket`).
 */
export async function replyToTicket(id: string, body: string, messageId?: string): Promise<HeyQResult<CustomerTicket>> {
  return replyToMyTicket(id, body, messageId);
}
