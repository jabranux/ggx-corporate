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
 * DORMANT (messages/status): this hook does NOT open a WebSocket. The
 * approved QuadX Bridge contract for this POC is REST + polling only for the
 * conversation thread itself — `heyqRealtimeClient.ts` and the realtime
 * message/status exports remain in the codebase, unused, as a documented
 * dormant capability (see docs/migration/ggx-corporate-heyq-live-ticketing.md)
 * rather than deleted.
 *
 * TYPING PRESENCE is its own lightweight, separate path — NOT the dormant
 * WebSocket above, and NOT folded into the 15s ticket-detail poll — consuming
 * the now-deployed QuadX Bridge typing contract (`POST`/`GET
 * /customer/tickets/:id/typing`, 6s server-side TTL; see that route's
 * docblock for the exact request/response shapes):
 *   • Remote (agent) typing: a dedicated 3s poll (`TYPING_POLL_INTERVAL_MS`)
 *     of `getTypingStatus(id)`, single-flight (never overlaps a slow GET —
 *     see `isPolling` below) and paused while `document.hidden` OR the
 *     ticket's own status is terminal (an "inactive" conversation, same
 *     condition the ticket-detail poll above pauses on) — feeding a
 *     `RemoteTypingTracker` (`lib/typingPresence.ts`) that debounces the
 *     `agentTyping` flag and self-clears if a stop signal is ever lost
 *     (stale-expiry timeout). A reply that reopens a terminal ticket resumes
 *     this poll immediately (`restartTypingPollRef`), same pattern as
 *     `restartPollingRef` above.
 *   • Customer typing: reply-box keystrokes go through a
 *     `CustomerTypingEmitter` (same module) that throttles outbound
 *     start-signals to roughly one per 2s (comfortably inside the 6s TTL) and
 *     force-stops on inactivity/send/clear/ticket-change/unmount — this side
 *     is NOT paused for a terminal ticket, since replying to one reopens it.
 *   • Transport: `sendTypingSignal`/`getTypingStatus` (`services/heyqService.ts`
 *     → a same-origin `/api/support/tickets/:id/typing` proxy route, which
 *     forwards to Bridge with the server-verified session identity). Both
 *     still degrade silently on any transport failure — sending never throws
 *     and reading never shows a stuck indicator — so typing can never block
 *     or break the real conversation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTicketById,
  replyToTicket,
  isTerminalTicketStatus,
  sendTypingSignal,
  getTypingStatus,
  type CustomerTicket,
  type CustomerTicketMessage,
  type HeyQTicketStatus,
} from '../services/ticketsService';
import type { RealtimeStatus } from '../services/heyqRealtimeClient';
import { createRemoteTypingTracker, createCustomerTypingEmitter } from '../lib/typingPresence';

/** Steady-state gap between ticket-detail polls once a request completes. */
const POLL_INTERVAL_MS = 15_000;
/** Dedicated typing-presence poll interval — intentionally separate from and
 * much shorter than POLL_INTERVAL_MS above; never shortens the ticket-detail
 * cadence to make typing feel responsive. */
const TYPING_POLL_INTERVAL_MS = 3_000;

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
  /** True while the assigned agent's typing signal is active (own poll path —
   * see the module docblock). Self-clears on an explicit stop or a stale-expiry
   * timeout; never persisted. */
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
  /** Call on every reply-box change with its current value. Throttled/debounced
   * internally (see `lib/typingPresence.ts`) — safe to call on every keystroke. */
  notifyTyping: (value: string) => void;
  /** Force an immediate typing-stop signal (send, clear, ticket change, unmount). */
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
  const [agentTyping, setAgentTyping] = useState(false);

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
    // Bumped by a confirmed reply (see restartPollingRef below). A poll whose
    // GET was already in flight when that happened started under an older
    // epoch: it may resolve AFTER the reply's own (authoritative, necessarily
    // fresher) response — e.g. a slow read racing a reply that reopens a
    // resolved ticket. Without this check that stale response would overwrite
    // the just-reopened status via mergeTicket/statusNow, and its own
    // `finally` would then see that stale terminal status and cancel the
    // cadence the reply just re-armed. Checking the epoch after the await
    // makes a superseded poll a no-op instead — no merge, no reschedule (the
    // reply's restart already scheduled the next one).
    let epoch = 0;

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
      const myEpoch = epoch;
      try {
        const res = await getTicketById(id);
        if (cancelled || myEpoch !== epoch) return; // superseded by a confirmed reply while in flight
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
        if (!cancelled && myEpoch === epoch) scheduleNext(POLL_INTERVAL_MS);
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
      epoch++; // invalidate any poll already in flight — its response is now stale
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

  // ── Typing presence (own path — see the module docblock) ───────────────────
  // Entirely separate from the ticket-detail polling effect above: its own
  // short poll for the remote (agent) signal, its own throttle/debounce for
  // outbound customer signals, its own cleanup. Never touches `statusNow`,
  // `epoch`, or POLL_INTERVAL_MS.

  const remoteTrackerRef = useRef<ReturnType<typeof createRemoteTypingTracker> | null>(null);
  const customerEmitterRef = useRef<ReturnType<typeof createCustomerTypingEmitter> | null>(null);
  // Kept current (without restarting the effect below) so the typing poll can
  // pause once the ticket goes terminal without re-running its whole setup —
  // the same "inactive conversation" condition the ticket-detail poll above
  // already pauses on. The customer's OWN typing signal keeps working
  // regardless (a reply to a terminal ticket still reopens it).
  const ticketStatusForTypingRef = useRef<HeyQTicketStatus>(initialTicket.status);
  useEffect(() => {
    ticketStatusForTypingRef.current = ticket.status;
  }, [ticket.status]);
  const restartTypingPollRef = useRef<(status: HeyQTicketStatus) => void>(() => {});

  useEffect(() => {
    setAgentTyping(false); // fresh ticket — no carried-over indicator
    ticketStatusForTypingRef.current = initialTicket.status;

    const remoteTracker = createRemoteTypingTracker((typing) => setAgentTyping(typing));
    // Fire-and-forget: sendTypingSignal already never throws (see heyqService),
    // but a stray rejection here must still never surface — typing can't be
    // allowed to affect sending a real reply.
    const customerEmitter = createCustomerTypingEmitter((state) => {
      void sendTypingSignal(id, state).catch(() => {});
    });
    remoteTrackerRef.current = remoteTracker;
    customerEmitterRef.current = customerEmitter;

    let isPolling = false; // guards against an overlapping GET (see poll() below)
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    const scheduleNextPoll = () => {
      clearPoll();
      // Paused while the tab is hidden, and while the ticket is terminal
      // (resolved/closed — an "inactive" conversation, mirroring the
      // ticket-detail poll's own pause condition above). restartTypingPollRef
      // below explicitly resumes this loop the moment a reply reopens it.
      if (cancelled || document.hidden || isTerminalTicketStatus(ticketStatusForTypingRef.current)) return;
      pollTimer = setTimeout(() => { void pollOnce(); }, TYPING_POLL_INTERVAL_MS);
    };

    const pollOnce = async () => {
      if (isPolling || cancelled) return; // single-flight — never overlap a slow GET
      isPolling = true;
      try {
        const typing = await getTypingStatus(id); // never throws — see heyqService
        if (!cancelled) remoteTracker.signal(typing);
      } catch {
        // Defensive only — getTypingStatus already fails closed to `false`.
      } finally {
        isPolling = false;
        if (!cancelled) scheduleNextPoll();
      }
    };

    scheduleNextPoll();

    const onVisibility = () => {
      clearPoll();
      if (document.visibilityState === 'visible') void pollOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Mirrors restartPollingRef above: a confirmed reply that reopens a
    // terminal ticket must resume a paused poll loop immediately, using the
    // status the reply just confirmed — not whatever ticketStatusForTypingRef
    // last saw, which updates via a separate effect and may not have
    // re-rendered yet at the point `submit` calls this.
    restartTypingPollRef.current = (status) => {
      ticketStatusForTypingRef.current = status;
      if (!isPolling) scheduleNextPoll();
    };

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearPoll();
      customerEmitter.stopNow(); // ticket change / unmount forces a stop signal
      customerEmitter.dispose();
      remoteTracker.dispose();
      remoteTrackerRef.current = null;
      customerEmitterRef.current = null;
    };
  }, [id]);

  const stopTyping = useCallback(() => {
    customerEmitterRef.current?.stopNow();
  }, []);
  const notifyTyping = useCallback((value: string) => {
    customerEmitterRef.current?.onInputChange(value);
  }, []);

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
        restartTypingPollRef.current(res.data.status); // resume the typing poll if a reply just reopened a terminal ticket
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
      customerEmitterRef.current?.stopNow(); // sending a message always clears the customer's own typing signal
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
      agentTyping,
      connection,
      sending,
      send,
      retry,
      dismissFailed,
      notifyTyping,
      stopTyping,
    }),
    [ticket, messages, pending, agentTyping, connection, sending, send, retry, dismissFailed, notifyTyping, stopTyping],
  );
}
