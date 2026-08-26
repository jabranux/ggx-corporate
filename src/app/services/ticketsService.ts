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
  TICKET_STATUS_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_OPTIONS,
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
};

// Re-exported so pages have one import site for the HeyQ handoff + report actions.
export { openHeyQContact, startOrderHandoff, getLiveOrderStatus, submitOrderReport, listAuthorizedTransactions, getAttachmentUrl, buildAttachmentUrl, REPORT_CONCERN_OPTIONS, getRequesterIdentity } from './heyqService';
export type { OrderReportInput, AuthorizedTransactionOption, HeyQConcernType, HeyQRequesterIdentity } from './heyqService';

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
