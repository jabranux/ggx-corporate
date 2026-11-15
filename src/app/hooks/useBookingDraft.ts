import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_BOOKING_DRAFT, type BookingDraft } from '../lib/basicBookingDraft';

/**
 * In-progress GGX Basic single-booking draft — plain in-memory React state,
 * scoped to the mounted `BookDelivery` page instance only. Deliberately NOT
 * persisted to any storage: no draft saving, no automatic booking recovery.
 * Every mount (first visit, a return visit after navigating away, or a
 * browser refresh/tab close) starts from `INITIAL_BOOKING_DRAFT` plus
 * whatever legitimate account defaults the page prefills afterward.
 * Navigating between the mobile wizard's steps, or across the desktop/
 * mobile breakpoint, never unmounts this page, so in-progress entries are
 * preserved for the length of one active booking session; leaving the page
 * (confirmed exit, browser back/forward, a sidebar link, refresh, or a
 * successful booking) always unmounts it and drops this state.
 *
 * Keyed by `accountId`: a different account signing in within the same tab
 * (without a full page reload) must never inherit the previous account's
 * in-progress recipient/address data (the account-scoping invariant every
 * other feature in this repo follows).
 */
export function useBookingDraft(accountId: string) {
  const [draft, setDraftState] = useState<BookingDraft>(INITIAL_BOOKING_DRAFT);

  const accountIdRef = useRef(accountId);
  useEffect(() => {
    if (accountIdRef.current === accountId) return;
    accountIdRef.current = accountId;
    setDraftState(INITIAL_BOOKING_DRAFT);
  }, [accountId]);

  const setDraft = useCallback(
    (patch: Partial<BookingDraft> | ((prev: BookingDraft) => BookingDraft)) => {
      setDraftState((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
    },
    [],
  );

  const resetDraft = useCallback(() => {
    setDraftState(INITIAL_BOOKING_DRAFT);
  }, []);

  return { draft, setDraft, resetDraft };
}
