/**
 * heyqTypingRealtime — GGX Corporate's receiver for HEYQ agent-typing
 * broadcasts over Supabase Realtime. Replaces the former 3-second
 * `GET /typing` poll entirely: this is a PUSH subscription to a short-lived,
 * ticket-scoped, RECEIVE-ONLY Realtime credential minted by QuadX Bridge
 * (`POST /customer/tickets/:id/typing/subscribe`, proxied through
 * Corporate's own `/api/support/...` BFF — see `heyqService.ts`'s
 * `subscribeToAgentTyping` and `api/support/tickets/[id]/typing/subscribe.ts`).
 * The companion architecture this consumes: HEYQ/QuadX Bridge commit
 * `ac5b685` (`docs/migration/typing-realtime-broadcast-authorization.md` in
 * the HeyQ repo) — Supabase's "Broadcast from Database" + private-channel
 * "Realtime Authorization" primitives, not a custom WebSocket server.
 *
 * Framework-free, like `lib/typingPresence.ts`: no React here, just a small
 * connection state machine `useTicketConversation.ts` drives. Emits ONLY the
 * raw `{ typing, updatedAt }` payload via `onTyping` — never touches ticket
 * data, never triggers a refetch. The caller feeds `onTyping` straight into
 * the EXISTING `RemoteTypingTracker` (`lib/typingPresence.ts`), which still
 * provides the debounce + local stale-expiry self-heal on top of this raw
 * signal, unchanged from the poll era — just fed by a push now instead of a
 * pull.
 *
 * ── Security ─────────────────────────────────────────────────────────────
 * Only ever holds the SHORT-LIVED (~300s), RECEIVE-ONLY, ticket-scoped token
 * Bridge mints — never a Supabase `service_role` credential (Bridge never
 * sends one; this module has nothing to leak even if it wanted to), never a
 * broad/authenticated Supabase session. `realtime.setAuth(token)` is called
 * (and AWAITED) immediately before every initial subscribe AND every
 * reconnect — confirmed via HeyQ's own live-stack testing (same doc above)
 * that an unawaited or stale `setAuth` call before a (re)subscribe silently
 * falls back to the anon key and gets the channel rejected/closed by the
 * server. This module never assumes the token "stays attached" to the
 * client across a reconnect.
 *
 * ── Lifecycle this module owns ──────────────────────────────────────────
 *   - initial connect: mint credential → `setAuth` → subscribe.
 *   - token refresh: ~60s before the credential's own expiry (a 300s
 *     credential refreshes at ~240s), mints a FRESH credential and
 *     re-applies `setAuth` on the SAME already-open channel — no
 *     unsubscribe/resubscribe, a pure background call that never touches
 *     ticket data and is invisible to the indicator.
 *   - reconnect: on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` this module didn't
 *     itself request (a dropped connection, an expired token the server
 *     rejected, a network blip), the socket is fully torn down
 *     (`realtime.disconnect()`, AWAITED — an unawaited disconnect racing a
 *     resubscribe was the exact bug HeyQ's own testing hit and documented),
 *     a fresh credential is minted, then re-`setAuth` + resubscribed, with
 *     capped exponential backoff so a sustained outage never spins.
 *   - single-flight / duplicate-subscription prevention: `start()` is a
 *     no-op while a connection is already connecting or open.
 *   - `stop()` is idempotent and full: clears every timer, removes the
 *     channel, disconnects the socket. No further `onTyping`/`onStatus`
 *     call ever fires after `stop()`.
 *   - a stale callback from a superseded connection attempt (a bumped
 *     `generation` counter, the same pattern the dormant
 *     `heyqRealtimeClient.ts` already uses) is always ignored.
 *
 * `useTicketConversation.ts` creates a fresh connection object per ticket
 * mount AND per hidden→visible cycle (stopping the previous one first) —
 * this module itself is not responsible for ticket-status/visibility
 * policy, only for the connection mechanics once told to start/stop.
 */
import { createClient } from '@supabase/supabase-js';

/** The exact shape `POST /customer/tickets/:id/typing/subscribe` (via the
 * Corporate proxy) returns — see `heyqCustomerApi.ts`'s `AgentTypingSubscription`. */
export interface AgentTypingCredential {
  token: string;
  channel: string;
  /** Seconds until `token` expires (Bridge's own field name/units). */
  expiresIn: number;
  expiresAt: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export type TypingRealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface AgentTypingRealtimeOptions {
  /** Mint a fresh, ticket-scoped credential. Called on connect, on every
   * reconnect, and on each scheduled token refresh. Returns `null` when the
   * ticket is no longer visible or the requester is signed out — the
   * connection then backs off and retries, exactly like a transport failure
   * (mirrors the dormant `heyqRealtimeClient.ts`'s own `mintToken` contract). */
  mintCredential: () => Promise<AgentTypingCredential | null>;
  /** A broadcast arrived. Never called speculatively on connect/reconnect/
   * visibility-recovery — only for a genuine payload from HEYQ. */
  onTyping: (typing: boolean, updatedAt: string) => void;
  onStatus?: (status: TypingRealtimeStatus) => void;
}

export interface AgentTypingRealtimeConnection {
  /** Begin connecting. Idempotent — a no-op while already connecting/connected. */
  start(): void;
  /** Unsubscribe, disconnect, clear all timers. Idempotent. Permanent — this
   * connection object cannot be restarted; callers create a new one. */
  stop(): void;
}

/**
 * The minimal surface this module actually calls on a Supabase client — lets
 * tests inject a fake without a real `@supabase/supabase-js` WebSocket or
 * Supabase project, mirroring `lib/typingPresence.ts`'s injected-clock
 * pattern for the same reason (deterministic, network-free unit tests).
 */
export interface SupabaseRealtimeLike {
  realtime: {
    setAuth(token: string): Promise<void>;
    disconnect(): void | Promise<void>;
  };
  channel(topic: string, opts: { config: { private: true } }): {
    on(
      type: 'broadcast',
      filter: { event: string },
      cb: (msg: { payload: unknown }) => void,
    ): { subscribe(cb: (status: string, err?: Error) => void): unknown };
  };
  removeChannel(channel: unknown): void | Promise<void>;
}

type ClientFactory = (url: string, anonKey: string) => SupabaseRealtimeLike;

const defaultClientFactory: ClientFactory = (url, anonKey) =>
  createClient(url, anonKey, { auth: { persistSession: false } }) as unknown as SupabaseRealtimeLike;

let clientFactoryOverride: ClientFactory | null = null;

/**
 * TEST ONLY — overrides the Supabase client factory `connectAgentTypingRealtime`
 * uses, so tests can inject a fake client/channel and assert the exact
 * setAuth-before-subscribe / reconnect / refresh sequencing without a real
 * Supabase project or WebSocket server. Never called by production code.
 * Pass `null` to restore the real `@supabase/supabase-js` factory.
 *
 * For DOM-level tests that drive the real `useTicketConversation.ts` hook
 * (where this module isn't imported directly by the test, so this setter
 * can't be called in time to beat a race with React mounting), a second,
 * window-global seam exists: `window.__ggxTestSupabaseClientFactory`, set
 * synchronously via Playwright's `addInitScript` (guaranteed to run before
 * ANY page script). `resolveClientFactory` below reads it LAZILY, at the
 * moment a connection actually starts (well after React has mounted), never
 * at module-import time — so there is no timing race to lose. Checked ONLY
 * in a browser context; never read, never true, in a production bundle
 * unless a test explicitly sets it.
 */
export function __setSupabaseClientFactoryForTests(factory: ClientFactory | null): void {
  clientFactoryOverride = factory;
}

declare global {
  interface Window {
    __ggxTestSupabaseClientFactory?: ClientFactory;
  }
}

function resolveClientFactory(): ClientFactory {
  if (clientFactoryOverride) return clientFactoryOverride;
  if (typeof window !== 'undefined' && window.__ggxTestSupabaseClientFactory) {
    return window.__ggxTestSupabaseClientFactory;
  }
  return defaultClientFactory;
}

/** Refresh ~60s before expiry — a 300s Bridge credential refreshes at ~240s,
 * matching the task's "approximately 240 seconds is acceptable" guidance. */
const REFRESH_MARGIN_SECONDS = 60;
/** A failed background refresh retries this often. Never tears down the
 * still-valid channel over it — the current token stays good until its own
 * `expiresAt` regardless of a transient refresh failure. */
const REFRESH_RETRY_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

export function connectAgentTypingRealtime(opts: AgentTypingRealtimeOptions): AgentTypingRealtimeConnection {
  let stopped = false;
  let connecting = false; // single-flight guard — see start()
  let generation = 0; // bumped on every fresh connect attempt; stale callbacks from a superseded attempt are dropped
  let client: SupabaseRealtimeLike | null = null;
  let channel: unknown = null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempts = 0;

  const setStatus = (s: TypingRealtimeStatus) => opts.onStatus?.(s);

  const clearRefresh = () => {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  };

  /** Fully drop the current socket/channel, awaited — see the module
   * docblock for why an unawaited disconnect is unsafe here. */
  const teardownClient = async (): Promise<void> => {
    clearRefresh();
    const c = client;
    const ch = channel;
    client = null;
    channel = null;
    if (c && ch) {
      try {
        await c.removeChannel(ch);
      } catch {
        // best-effort
      }
    }
    if (c) {
      try {
        await c.realtime.disconnect();
      } catch {
        // best-effort
      }
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    setStatus('reconnecting');
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** reconnectAttempts, BACKOFF_MAX_MS);
    const jitter = Math.random() * 0.3 * delay;
    reconnectAttempts += 1;
    setTimeout(() => {
      void connect();
    }, delay + jitter);
  };

  const scheduleRefresh = (credential: AgentTypingCredential) => {
    clearRefresh();
    const delayMs = Math.max(0, (credential.expiresIn - REFRESH_MARGIN_SECONDS) * 1000);
    refreshTimer = setTimeout(() => {
      void refresh();
    }, delayMs);
  };

  /** Background token refresh on the ALREADY-open channel — no resubscribe,
   * no ticket data touched, invisible to the indicator. */
  const refresh = async (): Promise<void> => {
    if (stopped || !client) return;
    const myGen = generation;
    const credential = await opts.mintCredential();
    if (stopped || myGen !== generation || !client) return;
    if (!credential) {
      refreshTimer = setTimeout(() => {
        void refresh();
      }, REFRESH_RETRY_MS);
      return;
    }
    try {
      await client.realtime.setAuth(credential.token);
    } catch {
      refreshTimer = setTimeout(() => {
        void refresh();
      }, REFRESH_RETRY_MS);
      return;
    }
    if (stopped || myGen !== generation) return;
    scheduleRefresh(credential);
  };

  const connect = async (): Promise<void> => {
    if (stopped || connecting) return;
    connecting = true;
    try {
      setStatus(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
      await teardownClient(); // reconnect path: fully drop any previous socket FIRST, awaited
      if (stopped) return;

      const credential = await opts.mintCredential();
      if (stopped) return;
      if (!credential) {
        scheduleReconnect();
        return;
      }

      const myGen = ++generation;
      const factory = resolveClientFactory();
      const newClient = factory(credential.supabaseUrl, credential.supabaseAnonKey);
      await newClient.realtime.setAuth(credential.token); // MUST happen before subscribe — see module docblock
      if (stopped || myGen !== generation) return;

      const newChannel = newClient
        .channel(credential.channel, { config: { private: true } })
        .on('broadcast', { event: 'typing' }, (msg) => {
          if (stopped || myGen !== generation) return;
          const payload = msg.payload as { typing?: unknown; updatedAt?: unknown };
          if (typeof payload?.typing === 'boolean') {
            opts.onTyping(payload.typing, typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString());
          }
        })
        .subscribe((status) => {
          if (stopped || myGen !== generation) return;
          if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0;
            setStatus('live');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            void teardownClient().then(() => {
              if (!stopped && myGen === generation) scheduleReconnect();
            });
          }
        });

      client = newClient;
      channel = newChannel;
      scheduleRefresh(credential);
    } finally {
      connecting = false;
    }
  };

  return {
    start() {
      if (stopped || connecting || client) return; // single-flight / duplicate-subscription guard
      void connect();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      generation += 1;
      clearRefresh();
      void teardownClient();
      setStatus('closed');
    },
  };
}
