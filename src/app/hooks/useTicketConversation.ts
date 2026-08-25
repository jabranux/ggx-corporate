/**
 * useTicketConversation — the live-conversation state machine for one ticket.
 *
 * HeyQ owns the ticket and remains the source of truth; this hook is the customer
 * client that keeps the on-screen thread in sync:
 *
 *   • REST is authoritative. The thread is seeded from the initial `getTicketById`
 *     read and every reply persists over REST (`replyToTicket`).
 *   • The WebSocket (heyqRealtimeClient) carries LIVE signals only. Incoming
 *     events are de-duplicated by `event.id`, messages by `message.id`, and the
 *     thread is ordered by `createdAt` — socket arrival order is never trusted.
 *   • On every (re)connect the client fires `onResubscribed`; we REFETCH to
 *     recover anything missed while offline, then resume applying live events.
 *   • Outgoing replies render OPTIMISTICALLY, are reconciled with the confirmed
 *     server message, survive a socket outage (they go over REST), and a failure
 *     is preserved with a retry action.
 *   • Typing is throttled out and force-stopped on send/clear/blur/unmount; an
 *     agent's typing is shown with a stale-state backstop.
 *
 * The hook never renders internal notes or agent-only fields — the client only
 * forwards customer-safe events and message payloads are re-projected through the
 * `projectRealtimeMessage` allowlist.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTicketById,
  replyToTicket,
  reopenTicket,
  getRealtimeToken,
  getHeyQRealtimeUrl,
  projectRealtimeMessage,
  type CustomerTicket,
  type CustomerTicketMessage,
  type CustomerRealtimeEvent,
  type StatusChangedData,
  type HeyQResult,
} from '../services/ticketsService';
import { createHeyQRealtimeClient, type RealtimeClient, type RealtimeStatus } from '../services/heyqRealtimeClient';

/** An outgoing reply the requester sent, before/while HeyQ confirms it. */
export interface PendingMessage {
  tempId: string;
  body: string;
  createdAt: string;
  status: 'sending' | 'failed';
  /** Staged files to (re)upload with this reply. */
  files?: File[];
  /** Display metadata for the optimistic bubble (no id until HeyQ stores them). */
  attachments?: { name: string; size: number; type: string }[];
}

export interface TicketConversation {
  /** Live ticket meta (status/updatedAt/reopen state), reconciled from HeyQ. */
  ticket: CustomerTicket;
  /** Confirmed server messages, de-duplicated and in chronological order. */
  messages: CustomerTicketMessage[];
  /** Optimistic outgoing replies not yet confirmed (newest, shown after `messages`). */
  pending: PendingMessage[];
  /** True while the support agent is typing (with a stale-state backstop). */
  agentTyping: boolean;
  /** Realtime connection status, for reconnecting / delayed-sync feedback. */
  connection: RealtimeStatus;
  /** True while a reply POST is in flight (guards duplicate submission). */
  sending: boolean;
  /** Send a reply, optionally with file attachments. Persists over REST; renders optimistically. */
  send: (body: string, files?: File[]) => Promise<void>;
  /** Retry a previously failed reply. */
  retry: (tempId: string) => Promise<void>;
  /** Discard a failed reply the requester no longer wants to send. */
  dismissFailed: (tempId: string) => void;
  /** Reopen a resolved/closed ticket. */
  reopen: () => Promise<HeyQResult<CustomerTicket>['status']>;
  /** Signal that the requester is typing (throttled emit). */
  notifyTyping: (value: string) => void;
  /** Force a typing-stop (call on blur). */
  stopTyping: () => void;
}

const ordered = (list: CustomerTicketMessage[]): CustomerTicketMessage[] =>
  [...list].sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

const TYPING_THROTTLE_MS = 2_000; // re-emit "start" at most this often
const TYPING_INACTIVITY_MS = 3_000; // stop after this much idle
const AGENT_TYPING_STALE_MS = 6_000; // clear a stranded "agent is typing"

export function useTicketConversation(id: string, initialTicket: CustomerTicket): TicketConversation {
  const [ticket, setTicket] = useState<CustomerTicket>(initialTicket);
  const [messages, setMessages] = useState<CustomerTicketMessage[]>(() => ordered(initialTicket.messages));
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [agentTyping, setAgentTyping] = useState(false);
  const [connection, setConnection] = useState<RealtimeStatus>('connecting');
  const [sending, setSending] = useState(false);

  const seenEventIds = useRef<Set<string>>(new Set());
  const clientRef = useRef<RealtimeClient | null>(null);
  const agentTypingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Typing-emit bookkeeping.
  const typingStarted = useRef(false);
  const lastTypingStart = useRef(0);
  const typingInactivity = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const reload = useCallback(async () => {
    const res = await getTicketById(id);
    if (res.status === 'ok') mergeTicket(res.data);
  }, [id, mergeTicket]);

  // ── Agent typing (received) ────────────────────────────────────────────────

  const showAgentTyping = useCallback(() => {
    setAgentTyping(true);
    if (agentTypingTimer.current) clearTimeout(agentTypingTimer.current);
    agentTypingTimer.current = setTimeout(() => setAgentTyping(false), AGENT_TYPING_STALE_MS);
  }, []);

  const clearAgentTyping = useCallback(() => {
    if (agentTypingTimer.current) clearTimeout(agentTypingTimer.current);
    setAgentTyping(false);
  }, []);

  // ── Realtime event handling ────────────────────────────────────────────────

  const handleEvent = useCallback(
    (event: CustomerRealtimeEvent) => {
      if (seenEventIds.current.has(event.id)) return; // de-dupe by stable event id
      seenEventIds.current.add(event.id);

      switch (event.type) {
        case 'message.created': {
          const data = event.data as { message?: unknown } | null;
          const msg = projectRealtimeMessage(data?.message);
          if (!msg) return;
          upsertMessages([msg]);
          // A support reply lands the conversation's latest activity forward.
          setTicket((prev) => ({ ...prev, updatedAt: event.serverTimestamp }));
          if (msg.from === 'support') clearAgentTyping(); // the reply supersedes "typing…"
          return;
        }
        case 'ticket.status_changed': {
          const data = event.data as StatusChangedData | null;
          if (data?.status) {
            setTicket((prev) => ({ ...prev, status: data.status, updatedAt: event.serverTimestamp }));
          }
          // Refetch to reconcile canReopen / resolvedAt / reopenedAt authoritatively.
          void reload();
          return;
        }
        case 'typing.started':
          if (event.actorType === 'agent') showAgentTyping();
          return;
        case 'typing.stopped':
          if (event.actorType === 'agent') clearAgentTyping();
          return;
      }
    },
    [upsertMessages, reload, showAgentTyping, clearAgentTyping],
  );

  // Keep the latest handler in a ref so the client (created once per ticket) always
  // calls through to current state setters without being torn down each render.
  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // ── Connection lifecycle (one client per ticket) ───────────────────────────

  useEffect(() => {
    // Re-seed for a new ticket id (route change reusing this hook instance).
    seenEventIds.current = new Set();
    setTicket(initialTicket);
    setMessages(ordered(initialTicket.messages));
    setPending([]);
    setAgentTyping(false);

    // REST Polling: poll getTicketById every 5s while conversation is open
    let isPolling = false;
    const pollInterval = setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const res = await getTicketById(id);
        if (res.status === 'ok') {
          mergeTicket(res.data);
          setConnection('open');
        } else if (res.status === 'unavailable') {
          setConnection('reconnecting');
        }
      } catch {
        // Silently handle transient errors, keep existing conversation state
      } finally {
        isPolling = false;
      }
    }, 5_000);

    const client = createHeyQRealtimeClient({
      url: getHeyQRealtimeUrl(),
      ticketId: id,
      mintToken: async () => {
        const res = await getRealtimeToken(id);
        return res.status === 'ok' ? res.data.token : null;
      },
      onEvent: (event) => handleEventRef.current(event),
      onStatus: setConnection,
      onResubscribed: () => void reloadRef.current(),
    });
    clientRef.current = client;
    client.start();

    return () => {
      clearInterval(pollInterval);
      client.stop();
      clientRef.current = null;
      if (agentTypingTimer.current) clearTimeout(agentTypingTimer.current);
      if (typingInactivity.current) clearTimeout(typingInactivity.current);
      typingStarted.current = false;
      lastTypingStart.current = 0;
    };
    // Intentionally keyed on id only; initialTicket refresh is handled by merges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Typing (emitted) ───────────────────────────────────────────────────────

  const stopTyping = useCallback(() => {
    if (typingInactivity.current) { clearTimeout(typingInactivity.current); typingInactivity.current = undefined; }
    if (typingStarted.current) {
      clientRef.current?.sendTyping('stop');
      typingStarted.current = false;
    }
    lastTypingStart.current = 0;
  }, []);

  const notifyTyping = useCallback(
    (value: string) => {
      if (!value.trim()) { stopTyping(); return; }
      const now = Date.now();
      // Throttled "start": once per burst, then at most once / TYPING_THROTTLE_MS
      // so the server's 4s expiry never lapses mid-typing. Never per keystroke.
      if (!typingStarted.current || now - lastTypingStart.current > TYPING_THROTTLE_MS) {
        clientRef.current?.sendTyping('start');
        typingStarted.current = true;
        lastTypingStart.current = now;
      }
      if (typingInactivity.current) clearTimeout(typingInactivity.current);
      typingInactivity.current = setTimeout(stopTyping, TYPING_INACTIVITY_MS);
    },
    [stopTyping],
  );

  // ── Sending replies (optimistic, REST-backed, retryable) ───────────────────

  const submit = useCallback(
    async (tempId: string, body: string, files?: File[]) => {
      setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: 'sending' } : p)));
      const res = await replyToTicket(id, body, files);
      if (res.status === 'ok') {
        mergeTicket(res.data);
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
      } else {
        setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: 'failed' } : p)));
      }
    },
    [id, mergeTicket],
  );

  const send = useCallback(
    async (body: string, files?: File[]) => {
      const text = body.trim();
      if (!text || sending) return; // guard empty + duplicate submission
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const attachments = files?.map((f) => ({ name: f.name, size: f.size, type: f.type }));
      setPending((prev) => [...prev, { tempId, body: text, createdAt: new Date().toISOString(), status: 'sending', files, attachments }]);
      stopTyping(); // typing ends on send
      setSending(true);
      try {
        await submit(tempId, text, files);
      } finally {
        setSending(false);
      }
    },
    [sending, submit, stopTyping],
  );

  const retry = useCallback(
    async (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (!item || sending) return;
      setSending(true);
      try {
        await submit(tempId, item.body, item.files);
      } finally {
        setSending(false);
      }
    },
    [pending, sending, submit],
  );

  const dismissFailed = useCallback((tempId: string) => {
    setPending((prev) => prev.filter((p) => !(p.tempId === tempId && p.status === 'failed')));
  }, []);

  const reopen = useCallback(async () => {
    const res = await reopenTicket(id);
    if (res.status === 'ok') mergeTicket(res.data);
    return res.status;
  }, [id, mergeTicket]);

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
      reopen,
      notifyTyping,
      stopTyping,
    }),
    [ticket, messages, pending, agentTyping, connection, sending, send, retry, dismissFailed, reopen, notifyTyping, stopTyping],
  );
}
