/**
 * typingPresence — pure, framework-free state machine for the ticket
 * conversation's typing indicator. No timers/fetch of its own; callers inject
 * a `TypingClock` so this is unit-testable without real waits or a browser.
 *
 * Two independent halves:
 *
 *   • RemoteTypingTracker — turns a stream of remote "is the agent typing
 *     right now" signals (a poll snapshot, or a discrete start/stop event —
 *     this doesn't care which transport produced it) into a debounced
 *     `agentTyping` flag. A `true` signal arms/refreshes a stale-expiry timer
 *     so a LOST stop signal can never leave the indicator stuck; an explicit
 *     `false` signal clears it immediately, without waiting out that timer.
 *
 *   • CustomerTypingEmitter — turns raw reply-box keystrokes into throttled
 *     outbound start/stop calls (never one network call per keystroke), plus
 *     an inactivity-debounced stop and a `stopNow()` for send/clear/ticket
 *     change/unmount. Never emits `start` for an empty/whitespace-only value.
 *
 * Both are transport-agnostic: `send`/`onChange` callbacks are injected by the
 * caller (see `useTicketConversation.ts`), which is what keeps this module
 * usable unchanged once a real Bridge typing endpoint lands.
 */

export interface TypingClock {
  now(): number;
  setTimeout(fn: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

const realClock: TypingClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
};

/** How long the remote indicator stays up after the last "typing" signal with
 * no follow-up (start or stop) before it self-clears. Comfortably longer than
 * the dedicated typing poll interval so normal polling never flickers it. */
export const REMOTE_TYPING_STALE_MS = 8_000;
/** At most one outbound 'start' per burst of keystrokes. */
export const CUSTOMER_TYPING_THROTTLE_MS = 2_000;
/** Outbound 'stop' after this long with no further keystrokes. */
export const CUSTOMER_TYPING_STOP_DEBOUNCE_MS = 3_000;

export interface RemoteTypingTracker {
  /** Feed a fresh remote signal ('true' = the agent is typing right now). */
  signal(value: boolean): void;
  /** Tear down — call on ticket change / unmount. Fires no further onChange. */
  dispose(): void;
}

/**
 * Tracks whether the remote (agent) side is currently typing. `onChange`
 * fires only on an actual flip (not on every repeated signal), so it's safe
 * to call `signal` on every poll tick.
 */
export function createRemoteTypingTracker(
  onChange: (typing: boolean) => void,
  clock: TypingClock = realClock,
  staleMs = REMOTE_TYPING_STALE_MS,
): RemoteTypingTracker {
  let typing = false;
  let disposed = false;
  let staleTimer: number | null = null;

  const clearStale = () => {
    if (staleTimer !== null) {
      clock.clearTimeout(staleTimer);
      staleTimer = null;
    }
  };
  const setTyping = (value: boolean) => {
    if (disposed || typing === value) return;
    typing = value;
    onChange(value);
  };

  return {
    signal(value) {
      if (disposed) return;
      clearStale();
      if (value) {
        setTyping(true);
        // A lost 'stop' (or a poll that silently stops updating) can't leave
        // this stuck — it self-clears if no further 'true' arrives in time.
        staleTimer = clock.setTimeout(() => setTyping(false), staleMs);
      } else {
        setTyping(false);
      }
    },
    dispose() {
      disposed = true;
      clearStale();
    },
  };
}

export interface CustomerTypingEmitter {
  /** Call on every reply-box change with the CURRENT full value. */
  onInputChange(value: string): void;
  /** Force an immediate 'stop' if one is currently active — send, clear, ticket change, unmount. */
  stopNow(): void;
  /** Tear down timers. Does not itself emit a stop (call `stopNow()` first if one is needed). */
  dispose(): void;
}

/**
 * Turns raw input-box keystrokes into throttled outbound start/stop calls.
 * `send` is the injected transport call — fire-and-forget from this module's
 * point of view; the caller is responsible for swallowing any failure (see
 * `useTicketConversation.ts` — typing must never throw into the UI).
 */
export function createCustomerTypingEmitter(
  send: (state: 'start' | 'stop') => void,
  clock: TypingClock = realClock,
  throttleMs = CUSTOMER_TYPING_THROTTLE_MS,
  stopDebounceMs = CUSTOMER_TYPING_STOP_DEBOUNCE_MS,
): CustomerTypingEmitter {
  let active = false; // a 'start' has been sent with no 'stop' since
  let lastSentAt = 0;
  let stopTimer: number | null = null;

  const clearStopTimer = () => {
    if (stopTimer !== null) {
      clock.clearTimeout(stopTimer);
      stopTimer = null;
    }
  };
  const emitStop = () => {
    clearStopTimer();
    if (active) {
      active = false;
      send('stop');
    }
  };
  const armStopTimer = () => {
    clearStopTimer();
    stopTimer = clock.setTimeout(emitStop, stopDebounceMs);
  };

  return {
    onInputChange(value) {
      if (!value.trim()) {
        emitStop(); // empty input never emits 'start', and clears any active one
        return;
      }
      const now = clock.now();
      if (!active || now - lastSentAt >= throttleMs) {
        active = true;
        lastSentAt = now;
        send('start');
      }
      armStopTimer(); // any keystroke pushes the inactivity stop back out
    },
    stopNow() {
      emitStop();
    },
    dispose() {
      clearStopTimer();
    },
  };
}
