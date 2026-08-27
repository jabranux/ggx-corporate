/**
 * useTicketConversation — the conversation state machine for one ticket.
 *
 * HeyQ (via QuadX Bridge) owns the ticket and remains the source of truth;
 * this hook is the customer client that keeps the on-screen thread in sync:
 *
 *   • REST is authoritative and the ONLY sync mechanism. The thread is seeded
 *     from the initial `getTicketById` read, kept current by an ADAPTIVE poll
 *     of `getTicketById` while the conversation is open, and every reply
 *     persists over REST (`replyToTicket`) — routed through the Corporate
 *     support proxy (`/api/support/*`), never QuadX Bridge/HeyQ directly.
 *   • Poll results are de-duplicated by `message.id` and ordered by
 *     `createdAt`.
 *   • Outgoing replies render OPTIMISTICALLY, are reconciled with the confirmed
 *     server message on the next successful read, and a failure is preserved
 *     with a retry action. A retry reuses the SAME message id
 *     (`X-Bridge-Message-Id`), so an ambiguous retry cannot duplicate the reply
 *     server-side.
 *
 * Polling cadence (adaptive, single-flight):
 *   • 15s between polls, scheduled request-completes → wait 15s → next poll
 *     (a `setTimeout` chain re-armed in each poll's `finally`, never a fixed
 *     `setInterval`) — a slow request can never stack a second one behind it.
 *   • Paused entirely while `document.hidden`, and while the ticket's own
 *     status is terminal (`resolved`/`closed` — see `isTerminalTicketStatus`);
 *     a reply that reopens a terminal ticket resumes the cadence immediately.
 *   • The tab becoming visible again triggers one immediate refresh, which
 *     then re-arms the normal 15s cadence from that point.
 *
 * DORMANT: this hook does NOT open a WebSocket. The approved QuadX Bridge
 * contract for this POC is REST + polling only — there is no realtime/typing
 * signal to show, so `notifyTyping`/`stopTyping` are no-ops and `agentTyping`
 * is always `false`. `heyqRealtimeClient.ts` and the realtime exports below
 * remain in the codebase, unused, as a documented dormant capability (see
 * docs/migration/ggx-corporate-heyq-live-ticketing.md) rather than deleted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTicketById,
  replyToTicket,
  isTerminalTicketStatus,
  type CustomerTicket,
  type CustomerTicketMessage,
  type HeyQTicketStatus,
} from '../services/ticketsService';
import type { RealtimeStatus } from '../services/heyqRealtimeClient';

/** Steady-state gap between ticket-detail polls once a request completes. */
const POLL_INTERVAL_MS = 15_000;

/** An outgoing reply the requester sent, before/while HeyQ confirms it. */
export interface PendingMessage {
  tempId: string;
  body: string;
  createdAt: string;
  status: 'sending' | 'failed';
}

export interface TicketConversation {
  /** Live ticket meta (status/updatedAt/reopen state), reconciled from HeyQ. */
  ticket: CustomerTicket;
  /** Confirmed server messages, de-duplicated and in chronological order. */
  messages: CustomerTicketMessage[];
  /** Optimistic outgoing replies not yet confirmed (newest, shown after `messages`). */
  pending: PendingMessage[];
  /** Always `false` — no realtime typing signal exists on this contract (dormant). */
  agentTyping: boolean;
  /** Polling connection status ('open' while the last poll succeeded, 'reconnecting'
   * after a failed one), for delayed-sync feedback. */
  connection: RealtimeStatus;
  /** True while a reply POST is in flight (guards duplicate submission). */
  sending: boolean;
  /** Send a text reply. Persists over REST; renders optimistically. */
  send: (body: string) => Promise<void>;
  /** Retry a previously failed reply (reuses its message id, so Bridge dedupes it). */
  retry: (tempId: string) => Promise<void>;
  /** Discard a failed reply the requester no longer wants to send. */
  dismissFailed: (tempId: string) => void;
  /** No-op (dormant — see the module docblock). Kept so the reply composer's
   * wiring doesn't need to change if realtime typing ever comes back. */
  notifyTyping: (value: string) => void;
  /** No-op (dormant — see the module docblock). */
  stopTyping: () => void;
}

const ordered = (list: CustomerTicketMessage[]): CustomerTicketMessage[] =>
  [...list].sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

export function useTicketConversation(id: string, initialTicket: CustomerTicket): TicketConversation {
  const [ticket, setTicket] = useState<CustomerTicket>(initialTicket);
  const [messages, setMessages] = useState<CustomerTicketMessage[]>(() => ordered(initialTicket.messages));
  const [pending, setPending] = useState<PendingMessage[]>([]);
  // The caller's initial `getTicketById(id)` read (passed in as `initialTicket`)
  // IS the first fresh load, so the connection starts 'open' rather than
  // 'connecting' — see the polling effect below for why no immediate GET follows.
  const [connection, setConnection] = useState<RealtimeStatus>('open');
  const [sending, setSending] = useState(false);

  // ── Message store helpers ──────────────────────────────────────────────────

  /** Drop optimistic entries whose text now exists as a confirmed 'you' message. */
  const reconcilePending = useCallback((incoming: CustomerTicketMessage[]) => {
    const youBodies = incoming.filter((m) => m.from === 'you').map((m) => m.body.trim());
    if (youBodies.length === 0) return;
    setPending((prev) => prev.filter((p) => !(p.status === 'sending' && youBodies.includes(p.body.trim()))));
  }, []);

  /** Upsert messages by id (dedupe), keep chronological order, reconcile pending. */
  const upsertMessages = useCallback(
    (incoming: CustomerTicketMessage[]) => {
      if (incoming.length === 0) return;
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of incoming) map.set(m.id, m);
        return ordered([...map.values()]);
      });
      reconcilePending(incoming);
    },
    [reconcilePending],
  );

  /** Merge an authoritative ticket read: thread + meta (status, reopen state…). */
  const mergeTicket = useCallback(
    (t: CustomerTicket) => {
      upsertMessages(t.messages);
      setTicket((prev) => ({
        ...t,
        // Keep whichever thread the store holds; `messages` state is the render source.
        messages: prev.messages,
      }));
    },
    [upsertMessages],
  );

  // ── Polling lifecycle ───────────────────────────────────────────────────────

  // Lets a confirmed reply (handled outside this effect, in `submit`) re-arm the
  // cadence with the ticket's post-reply status — needed because replying to a
  // resolved/closed ticket reopens it, and the paused loop wouldn't otherwise
  // know to resume until an unrelated remount.
  const restartPollingRef = useRef<(status: HeyQTicketStatus) => void>(() => {});

  useEffect(() => {
    // Re-seed for a new ticket id (route change reusing this hook instance).
    setTicket(initialTicket);
    setMessages(ordered(initialTicket.messages));
    setPending([]);
    setConnection('open'); // initialTicket is already a fresh read — see the field's docblock

    // Adaptive REST polling: single-flight, request-completes-then-wait-15s
    // cadence via a re-armed setTimeout (never a fixed setInterval, so a slow
    // request can't stack a second one behind it). No immediate GET on mount
    // — initialTicket already IS the first fresh load.
    let isPolling = false;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let statusNow: HeyQTicketStatus = initialTicket.status;

    const clearScheduled = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNext = (delayMs: number) => {
      clearScheduled();
      // Hidden tab: stay paused until visibility triggers a refresh. Terminal
      // ticket: stay paused until a reply reopens it (see restartPollingRef).
      if (cancelled || document.hidden || isTerminalTicketStatus(statusNow)) return;
      timeoutId = setTimeout(() => { void poll(); }, delayMs);
    };

    const poll = async () => {
      if (isPolling || cancelled) return; // single-flight
      isPolling = true;
      try {
        const res = await getTicketById(id);
        if (cancelled) return;
        if (res.status === 'ok') {
          statusNow = res.data.status;
          mergeTicket(res.data);
          setConnection('open');
        } else if (res.status === 'unavailable') {
          setConnection('reconnecting');
        }
      } catch {
        // Silently handle transient errors, keep existing conversation state
      } finally {
        isPolling = false;
        if (!cancelled) scheduleNext(POLL_INTERVAL_MS);
      }
    };

    scheduleNext(POLL_INTERVAL_MS); // starts paused if the ticket loads already terminal

    // An immediate refresh on foregrounding, then the poll's own completion
    // re-arms the normal 15s cadence from that point. A backgrounding tab
    // clears any pending tick outright — no request fires while hidden.
    const onVisibility = () => {
      clearScheduled();
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    restartPollingRef.current = (status) => {
      statusNow = status;
      scheduleNext(POLL_INTERVAL_MS);
    };

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearScheduled();
    };
    // Intentionally keyed on id only; initialTicket refresh is handled by merges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Typing (dormant no-ops — see the module docblock) ───────────────────────

  const stopTyping = useCallback(() => {}, []);
  const notifyTyping = useCallback((_value: string) => {}, []);

  // ── Sending replies (optimistic, REST-backed, retryable) ───────────────────

  const submit = useCallback(
    async (tempId: string, body: string) => {
      setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: 'sending' } : p)));
      // tempId doubles as the Bridge idempotency identifier (X-Bridge-Message-Id):
      // a retry of this same pending entry reuses it, so an ambiguous retry
      // cannot create a second message server-side.
      const res = await replyToTicket(id, body, tempId);
      if (res.status === 'ok') {
        mergeTicket(res.data);
        // Confirmed refresh already carries the post-reply ticket (incl. a
        // reopen out of resolved/closed) — re-arm the cadence from now rather
        // than waiting out whatever was left of the previous 15s window.
        restartPollingRef.current(res.data.status);
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
      } else {
        setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: 'failed' } : p)));
      }
    },
    [id, mergeTicket],
  );

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!text || sending) return; // guard empty + duplicate submission
      // A real UUID (not just a display key) — Bridge's message-id column is
      // typed uuid, and this same value is reused verbatim on retry.
      const tempId = crypto.randomUUID();
      setPending((prev) => [...prev, { tempId, body: text, createdAt: new Date().toISOString(), status: 'sending' }]);
      setSending(true);
      try {
        await submit(tempId, text);
      } finally {
        setSending(false);
      }
    },
    [sending, submit],
  );

  const retry = useCallback(
    async (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (!item || sending) return;
      setSending(true);
      try {
        await submit(tempId, item.body);
      } finally {
        setSending(false);
      }
    },
    [pending, sending, submit],
  );

  const dismissFailed = useCallback((tempId: string) => {
    setPending((prev) => prev.filter((p) => !(p.tempId === tempId && p.status === 'failed')));
  }, []);

  return useMemo(
    () => ({
      ticket,
      messages,
      pending,
      agentTyping: false, // dormant — see the module docblock
      connection,
      sending,
      send,
      retry,
      dismissFailed,
      notifyTyping,
      stopTyping,
    }),
    [ticket, messages, pending, connection, sending, send, retry, dismissFailed, notifyTyping, stopTyping],
  );
}
