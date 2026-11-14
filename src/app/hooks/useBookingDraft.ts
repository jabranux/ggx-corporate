import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSessionState, saveSessionState, clearSessionState } from '../lib/storage';
import { INITIAL_BOOKING_DRAFT, type BookingDraft } from '../lib/basicBookingDraft';

/** sessionStorage key prefix for the in-progress Basic booking draft (PII — never localStorage). */
export const BOOKING_DRAFT_KEY = 'basicBookingDraft';

function draftKey(accountId: string): string {
  return `${BOOKING_DRAFT_KEY}.${accountId}`;
}

/**
 * In-progress GGX Basic single-booking draft, persisted to sessionStorage
 * (survives in-tab navigation between the mobile wizard's steps and the
 * desktop page; never outlives the browser tab, since it carries recipient
 * PII) — same convention as `lib/storage.ts`'s documented guidance.
 *
 * Keyed by `accountId`: a different account signing in within the same tab
 * must never inherit the previous account's in-progress recipient/address
 * data (the account-scoping invariant every other feature in this repo
 * follows). Switching accounts reloads (or starts fresh) the draft for the
 * new account instead of carrying the old one over.
 */
export function useBookingDraft(accountId: string) {
  const [draft, setDraftState] = useState<BookingDraft>(() =>
    loadSessionState<BookingDraft>(draftKey(accountId), INITIAL_BOOKING_DRAFT));

  const accountIdRef = useRef(accountId);
  useEffect(() => {
    if (accountIdRef.current === accountId) return;
    accountIdRef.current = accountId;
    setDraftState(loadSessionState<BookingDraft>(draftKey(accountId), INITIAL_BOOKING_DRAFT));
  }, [accountId]);

  const setDraft = useCallback(
    (patch: Partial<BookingDraft> | ((prev: BookingDraft) => BookingDraft)) => {
      setDraftState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        saveSessionState(draftKey(accountIdRef.current), next);
        return next;
      });
    },
    [],
  );

  const resetDraft = useCallback(() => {
    clearSessionState(draftKey(accountIdRef.current));
    setDraftState(INITIAL_BOOKING_DRAFT);
  }, []);

  return { draft, setDraft, resetDraft };
}
