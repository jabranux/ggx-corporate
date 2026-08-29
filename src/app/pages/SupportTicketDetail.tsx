import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import {
  IconArrowLeft, IconSend, IconUser, IconHeadset, IconPackage, IconCalendar,
  IconUsersGroup, IconRefresh, IconInfoCircle,
  IconPaperclip, IconAlertTriangle, IconLoader2, IconReload, IconX, IconWifi,
  IconDownload,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
// The ticket lives in HeyQ; this page is a customer-visible mirror of it. The
// conversation is kept current by an adaptive 15-second REST poll (useTicketConversation)
// routed through the Corporate support proxy, and every write (reply, reopen)
// persists the same way — Business+ keeps no ticket state of its own. Order
// data comes from OMS.
import {
  getTicketById, getLiveOrderStatus, getRequesterIdentity, buildAttachmentUrl,
  TICKET_STATUS_META, TICKET_PRIORITY_META, isPermanentlyClosed,
  type CustomerTicket, type CustomerTicketMessage, type HeyQAttachment,
  type HeyQRequesterIdentity,
} from '../services/ticketsService';
import { isPreviewable, formatBytes } from '../lib/attachmentPolicy';
import { statusConfig } from '../services/transactionService';
import { formatTicketDate } from '../lib/utils';
import { markTicketSeen } from '../lib/ticketReadState';
import { useTicketConversation, type PendingMessage } from '../hooks/useTicketConversation';
import type { RealtimeStatus } from '../services/heyqRealtimeClient';
import { ReportIssueDrawer } from '../components/ReportIssueDrawer';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; ticket: CustomerTicket }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

export function SupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!id) { setState({ kind: 'not_found' }); return; }
    const res = await getTicketById(id);
    if (res.status === 'ok') setState({ kind: 'ok', ticket: res.data });
    else if (res.status === 'unavailable') setState({ kind: 'unavailable' });
    else setState({ kind: 'not_found' }); // not_found | forbidden — same to the customer
  }, [id]);

  useEffect(() => { setState({ kind: 'loading' }); load(); }, [load]);

  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/support-tickets')}>
      <IconArrowLeft className="w-4 h-4 mr-2" />
      Back to Support Tickets
    </Button>
  );

  if (state.kind === 'loading') {
    return (
      <div className="p-6 space-y-6">
        {back}
        <Card><CardContent className="p-12 text-center text-sm text-gray-400">Loading ticket…</CardContent></Card>
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="p-6 space-y-6">
        {back}
        <Alert variant="warning" title="Support is temporarily unavailable">
          We can’t reach GGX Support right now. Your ticket is safe — please try again shortly.
        </Alert>
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="p-6 space-y-6">
        {back}
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-base font-semibold text-gray-700">Ticket not found</p>
            <p className="text-sm text-gray-400 mt-1">
              This ticket doesn’t exist or isn’t available on your account.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // The ticket loaded — hand off to the live view (subscribes to HeyQ realtime).
  return <LiveTicketView id={state.ticket.id} initialTicket={state.ticket} back={back} />;
}

/**
 * The live ticket surface. Owns the realtime subscription via
 * `useTicketConversation`: the header, alerts and conversation all render from
 * the hook's live `ticket`/`messages`, so an agent reply or status change appears
 * without a refresh.
 */
function LiveTicketView({
  id, initialTicket, back,
}: { id: string; initialTicket: CustomerTicket; back: React.ReactNode }) {
  const convo = useTicketConversation(id, initialTicket);
  const { ticket, messages, pending, agentTyping, connection, sending } = convo;
  const [reply, setReply] = useState('');
  // The signed-in requester identity — needed to build authorized attachment URLs.
  const [who, setWho] = useState<HeyQRequesterIdentity | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const navigate = useNavigate();

  // Mark the ticket seen (clears the unread dot on the list) on open and whenever
  // its latest activity advances while it's open. Read-state is customer-side only.
  const scope = useRef<string>('');
  useEffect(() => {
    let alive = true;
    getRequesterIdentity().then((identity) => {
      if (alive && identity) { scope.current = identity.externalUserId; setWho(identity); }
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    markTicketSeen(scope.current, ticket.id, ticket.updatedAt);
  }, [ticket.id, ticket.updatedAt]);

  const status = TICKET_STATUS_META[ticket.status];
  const priority = TICKET_PRIORITY_META[ticket.priority];
  // Reads the server-computed `canReopen`/`status` (see isPermanentlyClosed's
  // docblock) — QuadX Bridge is the actual authority and enforces the same
  // 24h rule on every reply attempt regardless (see useTicketConversation's
  // submit(), which resyncs from the server if a reply is ever rejected).
  const permanentlyClosed = isPermanentlyClosed(ticket);

  const handleSend = async () => {
    if (!reply.trim() || sending) return;
    const body = reply;
    setReply(''); // clear immediately; the message renders optimistically
    await convo.send(body); // convo.send() also clears the customer's own typing signal
  };

  const handleReplyChange = (value: string) => {
    setReply(value);
    convo.notifyTyping(value); // no-op for an empty value — also force-stops it
  };

  return (
    <div className="p-6 space-y-6">
      {back}

      {/* Ticket header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{ticket.subject}</h1>
            {/* Support-ticket status — NOT the order's delivery status. */}
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant={priority.variant}>{priority.label} priority</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Ticket {ticket.reference} · {ticket.issueType}
          </p>
        </div>
      </div>

      {permanentlyClosed ? (
        <Alert variant="warning" title="This ticket is closed">
          This ticket is closed. Create a new ticket if you still need assistance.
        </Alert>
      ) : ticket.status === 'resolved' && (
        <Alert variant="success" title="This ticket has been resolved">
          If this isn’t sorted, replying below will bring it back to our support team.
        </Alert>
      )}
      {ticket.reopenedAt && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
        <Alert variant="info" title="This ticket was reopened">
          Reopened {formatTicketDate(ticket.reopenedAt)}. Our support team is picking it back up.
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Conversation — public replies only. Internal notes never leave HeyQ. */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Conversation</CardTitle>
                <ConnectionPill status={connection} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} ticketId={ticket.id} who={who} />
              ))}

              {/* Optimistic outgoing replies (sending / failed with retry). */}
              {pending.map((p) => (
                <PendingBubble key={p.tempId} pending={p} onRetry={() => convo.retry(p.tempId)} onDismiss={() => convo.dismissFailed(p.tempId)} />
              ))}

              {/* Agent typing indicator. */}
              {agentTyping && <TypingBubble />}

              {/* Reply box. A reply to a resolved ticket (within its 24h window)
                  reopens it in HeyQ. Once permanently closed, the composer is
                  replaced with a read-only notice and a new-ticket CTA. */}
              {permanentlyClosed ? (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm text-gray-500 mb-3">
                    This ticket is closed. Create a new ticket if you still need assistance.
                  </p>
                  <Button variant="outline" onClick={() => setReportOpen(true)}>
                    Create a new ticket
                  </Button>
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <label htmlFor="ticket-reply" className="block text-sm font-medium text-gray-700">
                    Add a reply
                  </label>
                  <textarea
                    id="ticket-reply"
                    className="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Type your message to the support team..."
                    value={reply}
                    onChange={(e) => handleReplyChange(e.target.value)}
                    onBlur={() => convo.stopTyping()}
                    disabled={sending}
                  />
                  <p className="text-[11px] text-gray-400">
                    Attachments aren’t available in this demo integration yet.
                  </p>
                  {connection === 'reconnecting' && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                      <IconWifi className="w-3.5 h-3.5" />
                      Reconnecting… you can still send — it will go through on the next successful check.
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-3">
                    <Button disabled={!reply.trim() || sending} onClick={handleSend}>
                      {sending
                        ? <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <IconSend className="w-4 h-4 mr-2" />}
                      {sending ? 'Sending…' : 'Send Reply'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Details sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail icon={<IconUsersGroup className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
                label="Support team" value={ticket.supportTeam} />
              <Detail icon={<IconCalendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
                label="Opened" value={formatTicketDate(ticket.createdAt)} />
              <Detail icon={<IconCalendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
                label="Last update" value={formatTicketDate(ticket.updatedAt)} />
            </CardContent>
          </Card>

          <ConsolidatedAttachments messages={messages} ticketId={ticket.id} who={who} />

          {ticket.linkedOrder && <LinkedOrderCard ticket={ticket} />}
        </div>
      </div>

      <ReportIssueDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={(created) => { setReportOpen(false); navigate(`/dashboard/support-tickets/${created.id}`); }}
      />
    </div>
  );
}

/** A confirmed conversation entry. System notes are centered and quieter. */
function MessageBubble({ message: m, ticketId, who }: { message: CustomerTicketMessage; ticketId: string; who: HeyQRequesterIdentity | null }) {
  if (m.from === 'system') {
    return (
      <p className="text-center text-xs text-gray-400 py-1">
        {m.body} · {formatTicketDate(m.createdAt)}
      </p>
    );
  }
  const isCustomer = m.from === 'you';
  return (
    <div className={`flex gap-3 ${isCustomer ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCustomer ? 'bg-blue-600' : 'bg-gray-200'}`}>
        {isCustomer ? <IconUser className="w-4 h-4 text-white" /> : <IconHeadset className="w-4 h-4 text-gray-600" />}
      </div>
      <div className={`max-w-[80%] ${isCustomer ? 'items-end text-right' : ''}`}>
        <div className={`inline-block rounded-xl px-3.5 py-2.5 text-sm text-left ${isCustomer ? 'bg-blue-50 text-gray-800' : 'bg-gray-100 text-gray-800'}`}>
          {m.body}
          {m.attachments && m.attachments.length > 0 && <AttachmentList attachments={m.attachments} ticketId={ticketId} who={who} />}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          {m.authorLabel} · {formatTicketDate(m.createdAt)}
        </p>
      </div>
    </div>
  );
}

/** An optimistic outgoing reply — sending spinner, or failed with retry/dismiss. */
function PendingBubble({ pending: p, onRetry, onDismiss }: { pending: PendingMessage; onRetry: () => void; onDismiss: () => void }) {
  const failed = p.status === 'failed';
  return (
    <div className="flex gap-3 flex-row-reverse">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-600">
        <IconUser className="w-4 h-4 text-white" />
      </div>
      <div className="max-w-[80%] items-end text-right">
        <div className={`inline-block rounded-xl px-3.5 py-2.5 text-sm text-left ${failed ? 'bg-red-50 text-gray-800 ring-1 ring-red-200' : 'bg-blue-50/70 text-gray-500'}`}>
          {p.body}
        </div>
        {failed ? (
          <p className="text-[11px] text-red-600 mt-1 flex items-center justify-end gap-2">
            <IconAlertTriangle className="w-3.5 h-3.5" />
            {p.closed ? 'Not sent — this ticket is closed.' : 'Not sent.'}
            {/* Retrying an identical request against a closed ticket would only
                fail again the same way — offer Dismiss only. */}
            {!p.closed && (
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
                <IconReload className="w-3.5 h-3.5" /> Retry
              </button>
            )}
            <button type="button" onClick={onDismiss} className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600">
              <IconX className="w-3.5 h-3.5" /> Dismiss
            </button>
          </p>
        ) : (
          <p className="text-[11px] text-gray-400 mt-1 flex items-center justify-end gap-1.5">
            <IconLoader2 className="w-3 h-3 animate-spin" /> Sending…
          </p>
        )}
      </div>
    </div>
  );
}

/** "Customer Support is typing…" with animated dots. */
function TypingBubble() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200">
        <IconHeadset className="w-4 h-4 text-gray-600" />
      </div>
      <div>
        <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-3.5 py-3">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Customer Support is typing…</p>
      </div>
    </div>
  );
}

/**
 * Attachment chips inside a message. A real uploaded attachment (it has an `id`,
 * and we know the requester identity) becomes an authorized download link, with an
 * inline thumbnail/preview for images and PDFs; anything else offers a download.
 * Metadata-only attachments (no id) stay static chips.
 */
function AttachmentList({ attachments, ticketId, who }: { attachments: HeyQAttachment[]; ticketId: string; who: HeyQRequesterIdentity | null }) {
  return (
    <div className="mt-2 space-y-1.5">
      {attachments.map((a, i) => {
        if (!a.id || !who) {
          return (
            <div key={`${a.name}-${i}`} className="flex items-center gap-1.5 text-[12px] text-gray-500">
              <IconPaperclip className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{a.name}</span>
              <span className="text-gray-400">· {formatBytes(a.size)}</span>
            </div>
          );
        }
        const previewable = isPreviewable(a.type);
        const isImage = a.type.startsWith('image/');
        return (
          <div key={a.id} className="space-y-1">
            <a
              href={buildAttachmentUrl(who, ticketId, a.id)}
              download={a.name}
              className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:underline"
            >
              <IconPaperclip className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[180px]">{a.name}</span>
              <span className="text-gray-400">· {formatBytes(a.size)}</span>
              <IconDownload className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
            {previewable && (
              isImage ? (
                <a href={buildAttachmentUrl(who, ticketId, a.id, true)} target="_blank" rel="noreferrer" className="block w-fit">
                  <img
                    src={buildAttachmentUrl(who, ticketId, a.id, true)}
                    alt={a.name}
                    className="max-h-40 max-w-[200px] rounded-lg border border-gray-200 object-contain"
                  />
                </a>
              ) : (
                <a
                  href={buildAttachmentUrl(who, ticketId, a.id, true)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[11px] font-medium text-blue-600 hover:underline"
                >
                  Preview
                </a>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A ticket's consolidated attachment list, derived from the conversation messages
 * (deduped by attachment id) so it stays live without a separate fetch — a file
 * shared in any message shows here exactly once, with a link to download it and a
 * note of which message it came from.
 */
function ConsolidatedAttachments({
  messages, ticketId, who,
}: { messages: CustomerTicketMessage[]; ticketId: string; who: HeyQRequesterIdentity | null }) {
  const seen = new Set<string>();
  const items: { att: HeyQAttachment; from: string }[] = [];
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      if (!a.id || seen.has(a.id)) continue; // one row per file — never duplicated
      seen.add(a.id);
      items.push({ att: a, from: m.authorLabel });
    }
  }
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Attachments ({items.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {items.map(({ att, from }) => (
          <div key={att.id} className="flex items-start gap-2.5">
            <IconPaperclip className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              {who && att.id ? (
                <a href={buildAttachmentUrl(who, ticketId, att.id)} download={att.name} className="text-blue-600 font-medium hover:underline break-all">
                  {att.name}
                </a>
              ) : (
                <span className="text-gray-800 font-medium break-all">{att.name}</span>
              )}
              <p className="text-[11px] text-gray-400">{formatBytes(att.size)} · shared by {from}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Live-connection status chip in the Conversation header. */
function ConnectionPill({ status }: { status: RealtimeStatus }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live
      </span>
    );
  }
  if (status === 'closed') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {icon}
      <div>
        <p className="text-gray-500 text-xs">{label}</p>
        <p className="text-gray-900 font-medium">{value}</p>
      </div>
    </div>
  );
}

/**
 * The linked order, rendered SNAPSHOT-FIRST — the context captured when the
 * ticket was raised. The snapshot is what makes the ticket self-sufficient: it
 * still renders when the order has since changed, or was archived upstream.
 *
 * "Check live status" re-reads the CURRENT delivery status through the OMS
 * service boundary. Delivery status and ticket status are independent: a parcel
 * moving to Delivered does not resolve the ticket.
 */
function LinkedOrderCard({ ticket }: { ticket: CustomerTicket }) {
  const linked = ticket.linkedOrder!;
  const snapshot = linked.snapshot;
  const [live, setLive] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; label: string; key: string } | { kind: 'gone' }
  >({ kind: 'idle' });

  const checkLive = async () => {
    setLive({ kind: 'loading' });
    const res = await getLiveOrderStatus(linked.externalOrderId);
    if (res.status === 'ok') {
      setLive({ kind: 'ok', label: res.data.deliveryStatusLabel, key: res.data.deliveryStatus });
    } else {
      setLive({ kind: 'gone' });
    }
  };

  const snapshotVariant = snapshot
    ? (statusConfig[snapshot.deliveryStatus as keyof typeof statusConfig]?.variant ?? 'default')
    : 'default';
  const liveVariant =
    live.kind === 'ok'
      ? (statusConfig[live.key as keyof typeof statusConfig]?.variant ?? 'default')
      : 'default';
  const drifted = live.kind === 'ok' && snapshot && live.key !== snapshot.deliveryStatus;

  return (
    <Card>
      <CardHeader><CardTitle>Linked order</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-2.5">
          <IconPackage className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-gray-500 text-xs">Order</p>
            <Link
              to={`/dashboard/transactions/${linked.trackingNumber}`}
              className="text-blue-600 font-medium hover:underline break-all"
            >
              {linked.trackingNumber}
            </Link>
          </div>
        </div>

        {snapshot ? (
          <>
            <div>
              <p className="text-gray-500 text-xs mb-1">Delivery status when reported</p>
              {/* Delivery status uses the OMS status palette — deliberately a
                  different vocabulary from the support-ticket status above. */}
              <Badge variant={snapshotVariant}>{snapshot.deliveryStatusLabel}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-gray-500 text-xs">Service</p>
                <p className="text-gray-900 font-medium">{snapshot.serviceType}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Booked</p>
                <p className="text-gray-900 font-medium">{snapshot.bookedOn}</p>
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Route</p>
              <p className="text-gray-900 font-medium">{snapshot.route}</p>
            </div>
            <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-100">
              Snapshot taken {formatTicketDate(linked.capturedAt)}
            </p>
          </>
        ) : (
          <Alert variant="info" icon={<IconInfoCircle className="w-4 h-4" />}>
            No order snapshot was captured for this ticket.
          </Alert>
        )}

        {live.kind === 'ok' && (
          <div className="pt-1">
            <p className="text-gray-500 text-xs mb-1">Delivery status now</p>
            <Badge variant={liveVariant}>{live.label}</Badge>
            {drifted && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                The delivery has moved on since this ticket was raised. That doesn’t change the
                ticket’s status — support closes it, not the courier.
              </p>
            )}
          </div>
        )}
        {live.kind === 'gone' && (
          <Alert variant="warning">
            We couldn’t load the current status for this order. The details above are from when the
            ticket was raised.
          </Alert>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={checkLive}
          disabled={live.kind === 'loading'}
        >
          <IconRefresh className="w-4 h-4 mr-2" />
          {live.kind === 'loading' ? 'Checking…' : 'Check live status'}
        </Button>
      </CardContent>
    </Card>
  );
}
