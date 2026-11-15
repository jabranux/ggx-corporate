/**
 * GGX Basic single-booking flow — /dashboard/book-delivery.
 *
 * Two genuinely different layouts share one `BookingDraft` state and the
 * same section/panel components, switched by the `isDesktop` media-query
 * flag below — deliberately JS-driven, not a `lg:`/`hidden` CSS pair, and
 * deliberately only ONE layout mounted at a time (not both, CSS-hidden):
 * an earlier version of this screen kept both permanently mounted, and two
 * live `BookingAddressSection` instances (one per layout) fell out of sync
 * with each other's saved-address list and open-drawer/unsaved-edit state
 * the moment the user resized mid-edit — silently blocking Continue/Confirm
 * with no visible cause. Switching the mounted tree instead only resets
 * that kind of transient, component-local UI state (an open address
 * drawer, in-progress unsaved new-address text) — the booking DATA itself
 * lives in `draft` (sessionStorage-backed, independent of any component's
 * mount lifecycle), so no entered information is ever lost on resize.
 *
 * - **Desktop (≥1024px)**: the ORIGINAL continuous two-column layout — no
 *   steps, no Continue buttons. Addresses, Delivery, and Item Details all
 *   render together in the ~70% left column; a sticky ~30% right column
 *   holds the live-updating Review & Payment panel
 *   (`BookingReviewPaymentPanel.tsx`), Confirm Booking included.
 * - **Mobile (<1024px)**: a guided 3-step wizard (Pickup & Delivery → Item
 *   Details → Review), one step at a time with a Continue button between
 *   them. Step 0 combines Addresses and Delivery as two sections on one
 *   page (both must be valid — complete addresses AND, for Standard, a
 *   selected pickup date — before Continue enables); Review is its own
 *   step with compact summary cards (`BookingReviewSummary.tsx`) and a
 *   sticky bottom payment bar (`BookingPaymentSummaryBar.tsx`).
 *
 * `BookingHeader` (compact back/exit + title + step progress) is
 * MOBILE-ONLY — it steps backward (or returns to Review when reached via
 * Edit) until step 0, where it asks to exit. Desktop has no step wizard to
 * step back through, so its page header is the plain GGX Corporate page-
 * title pattern (`text-3xl font-bold` + `text-gray-600 mt-1` subtitle, no
 * back control — same as Bulk Upload, Support Tickets, Address Book),
 * rendered directly below; leaving mid-booking on desktop goes through
 * `exitGuard` (real navigation, e.g. a sidebar link) instead of an in-page
 * Back button. `BasicCorporateLayout.tsx` hides its own header/bottom nav
 * for this route only below `lg:` — desktop keeps the standard app header
 * above this page's own title.
 *
 * Phase 1 scope: saved-address prefill only (pickup + recipient). No
 * shortened journey and no remembered item details — deferred.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useAuth } from '../../contexts/AuthContext';
import { useBookingDraft } from '../../hooks/useBookingDraft';
import { useUploadExitGuard } from '../../hooks/useUploadExitGuard';
import { getDefaultBookingAddresses, setLastRecipientAddress } from '../../services/basicBookingPreferencesService';
import { recordBookingConfirmation } from '../../lib/basicBookingHistory';
import { isPickupDateSelectable, estimateDeliveryDateRange } from '../../lib/basicPickupScheduling';
import { classifyRegion } from '../../lib/checkoutEstimates';
import { computeBookingTotals } from '../../lib/basicBookingTotals';
import type { BookingDraft } from '../../lib/basicBookingDraft';
import { BookingAddressSection, isCompleteAddress } from '../../components/BookingAddressSection';
import { BookingDeliverySection } from '../../components/BookingDeliverySection';
import { BookingItemDetailsSection } from '../../components/BookingItemDetailsSection';
import { BookingReviewPaymentPanel } from '../../components/BookingReviewPaymentPanel';
import { BookingPaymentSummaryBar } from '../../components/BookingPaymentSummaryBar';
import { BookingReviewSummary } from '../../components/BookingReviewSummary';
import { BookingFeeBreakdownContent } from '../../components/BookingFeeBreakdownContent';
import { BookingHeader } from '../../components/BookingHeader';

const REVIEW_STEP = 2;

export function BookDelivery() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic';
  const { draft, setDraft, resetDraft } = useBookingDraft(accountId);
  const [step, setStep] = useState(0);
  const [editReturn, setEditReturn] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Only blocks navigation once the user has actually changed something —
  // opening the page with prefilled defaults must never trap Back/sidebar
  // nav. `setDraft` (used by the background address-prefill effect below)
  // never touches this; only `updateDraft` (used by every real user edit)
  // does. The guard's returned `blocker` is rendered as a real confirm
  // dialog below — same pattern as `BulkUploader.tsx`'s `exitGuardDialog`.
  const touchedRef = useRef(false);
  const exitGuard = useUploadExitGuard(touchedRef);

  // Drives which layout mounts AND the header's Back/Exit behavior (see
  // module docblock) — must be a live media-query listener, not a
  // one-time check, so resizing across the breakpoint mid-session
  // (explicitly required to preserve state, never to reset it) switches
  // immediately without a reload. `64rem`, not a hardcoded `1024px` — this
  // must mirror Tailwind's own `lg:` breakpoint EXACTLY (Tailwind defines
  // it in rem), so a non-default root font-size can never make this flag
  // disagree with which layout the `lg:` classes elsewhere on the page
  // (e.g. `BasicCorporateLayout.tsx`'s sidebar) are actually showing.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 64rem)');
    const handler = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Back/forward across a real cross-document navigation (e.g. the user
  // left this tab for an external site/OAuth redirect, then came back) can
  // restore this whole page from the browser's back-forward cache instead
  // of a fresh mount — the frozen JS heap, including this component's
  // in-memory draft, reappears verbatim with no remount and no re-run of
  // `useBookingDraft`'s own reset. A same-app SPA route change never
  // triggers this (no new document is loaded), so it doesn't affect the
  // step-to-step/desktop-mobile cases above; this only guards the one path
  // those can't reach. Forcing a real reload here reduces it to the
  // already-correct refresh case instead of needing to hand-reset every
  // piece of local UI state (step, editReturn, drawer-open flags, etc.).
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Reported by BookingAddressSection: whether a pickup/recipient drawer is
  // open on its editable "add" view with unsaved edits. The wizard's
  // Continue button lives outside that component and has no other
  // visibility into this local form state, so it must block advancing
  // (rather than silently discarding the edits) while either is true.
  const [recipientFormOpen, setRecipientFormOpen] = useState(false);
  const [pickupFormOpen, setPickupFormOpen] = useState(false);
  const addressFormOpen = recipientFormOpen || pickupFormOpen;

  const updateDraft = useCallback((patch: Partial<BookingDraft>) => {
    touchedRef.current = true;
    setDraft(patch);
  }, [setDraft]);

  // A drop-off booking has no rider to hand cash to at pickup — reconcile an
  // already-selected Cash on Pickup instead of leaving a contradictory
  // selection confirmable. Owned here (always mounted) rather than inside
  // `ShippingFeePayerSelector`, which only mounts while its own payment
  // drawer is open and would otherwise miss reconciling the draft the rest
  // of the time.
  useEffect(() => {
    if (draft.firstMile === 'dropoff' && draft.senderPaymentMethod === 'cash_pickup') {
      updateDraft({ senderPaymentMethod: 'gcash_wallet' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.firstMile, draft.senderPaymentMethod]);

  // Phase 1: prefill from saved addresses only, and only when the draft is
  // still empty (never overwrite something the user already picked/edited).
  // Uses the raw setDraft, not updateDraft — a background prefill is not a
  // user edit and must not arm the exit guard.
  useEffect(() => {
    if (draft.pickupAddress || draft.recipientAddress) return;
    let active = true;
    getDefaultBookingAddresses(accountId).then(({ pickup, recipient }) => {
      if (!active) return;
      setDraft((prev) => ({
        ...prev,
        pickupAddress: prev.pickupAddress ?? pickup,
        pickupAddressId: prev.pickupAddressId ?? pickup?.id ?? null,
        recipientAddress: prev.recipientAddress ?? recipient,
        recipientAddressId: prev.recipientAddressId ?? recipient?.id ?? null,
      }));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Monetary validation — typed negative values bypass a plain `min={0}`
  // input attribute, so confirmation itself must gate on parsed values.
  // Declared value only matters (and is only editable) while COD is off —
  // see `BookingItemDetailsSection.tsx` and `basicItemProtection.ts`'s
  // `getProtectionCoveredValue`.
  const declaredValueNum = Number(draft.declaredValue);
  const declaredValueValid = draft.merchandiseCod.enabled
    // Free tier hides the declared-value input entirely — a leftover invalid
    // string typed while Increase was selected must never keep blocking
    // Continue/Confirm once the user switches away from it.
    || draft.itemProtectionTier === 'free'
    || draft.declaredValue.trim() === ''
    || (Number.isFinite(declaredValueNum) && declaredValueNum >= 0);
  const codAmountNum = Number(draft.merchandiseCod.amount);
  const codValid = !draft.merchandiseCod.enabled
    || (draft.merchandiseCod.amount.trim() !== '' && Number.isFinite(codAmountNum) && codAmountNum >= 0);

  const addressesComplete = isCompleteAddress(draft.pickupAddress) && isCompleteAddress(draft.recipientAddress);
  // A pickup date is only ever needed for a Rider Pickup under Standard
  // service — On-Demand is immediate, and Drop-off has no rider to schedule
  // at all (the user picks a drop-off location instead, with no date to
  // choose). When required, it must still be eligible right now — a date
  // chosen earlier in the session (or restored from a saved draft) can go
  // stale if left open past midnight or the pickup cutoff, so this isn't
  // just a non-empty check.
  const pickupDateRequired = draft.firstMile === 'pickup' && draft.serviceType === 'standard';
  const pickupDateSet = Boolean(draft.pickupDate);
  const pickupDateStale = pickupDateRequired && pickupDateSet && !isPickupDateSelectable(draft.pickupDate!);
  const pickupDateComplete = !pickupDateRequired || (pickupDateSet && !pickupDateStale);
  const itemDetailsValid = Boolean(draft.itemDescription.trim()) && declaredValueValid && codValid;

  const canConfirm = Boolean(addressesComplete && pickupDateComplete && !addressFormOpen && itemDetailsValid);

  const confirmBlockReason = !addressesComplete
    ? 'Choose a complete pickup address and recipient to continue.'
    : addressFormOpen
    ? 'Save the address you’re editing to continue.'
    : pickupDateStale
    ? 'Your selected pickup date is no longer available — choose another.'
    : !pickupDateComplete
    ? 'Choose a pickup date to continue.'
    : !draft.itemDescription.trim()
    ? 'Add an item description to continue.'
    : !declaredValueValid
    ? 'Declared value must be 0 or greater.'
    : !codValid
    ? 'Enter a valid Cash on Delivery amount (0 or greater).'
    : undefined;

  // Per-step validity/reason for the Continue button between steps 0–1 —
  // each step must be individually valid before advancing, not only at
  // final Confirm. Step 0 (Pickup & Delivery) now combines both the
  // address-completeness and pickup-date checks, since Addresses and
  // Delivery share one step.
  const stepValid = [addressesComplete && !addressFormOpen && pickupDateComplete, itemDetailsValid];
  const stepBlockReason = [
    addressFormOpen
      ? 'Save the address you’re editing to continue.'
      : !addressesComplete
      ? 'Choose a complete pickup address and recipient to continue.'
      : pickupDateStale
      ? 'Your selected pickup date is no longer available — choose another.'
      : 'Choose a pickup date to continue.',
    !draft.itemDescription.trim()
      ? 'Add an item description to continue.'
      : !declaredValueValid
      ? 'Declared value must be 0 or greater.'
      : 'Enter a valid Cash on Delivery amount (0 or greater).',
  ];

  const handleConfirm = () => {
    // Recompute pickup-date eligibility fresh (using the real current time)
    // rather than trusting `canConfirm`/`pickupDateStale` as captured by
    // this closure — those are only as fresh as the last render, and the
    // (mock) cutoff can pass while the tab sits idle with no re-render in
    // between. If it just went stale, force a render so the blocking
    // reason/disabled state catch up immediately instead of silently
    // no-op'ing with no feedback.
    const stillPickupDateEligible = draft.firstMile !== 'pickup' || draft.serviceType !== 'standard'
      || (Boolean(draft.pickupDate) && isPickupDateSelectable(draft.pickupDate!));
    if (!canConfirm || !stillPickupDateEligible) {
      if (!stillPickupDateEligible) {
        updateDraft({ pickupDate: draft.pickupDate });
      }
      return;
    }
    const totals = computeBookingTotals(draft);
    // Persist a demo booking record BEFORE clearing the draft — see
    // `lib/basicBookingHistory.ts`'s header comment for what this is (and
    // is not). The Confirmation screen reads this same record (never the
    // draft, which is cleared immediately below) to show its summary —
    // bound to it by id via navigation state, not just "the latest record",
    // so revisiting/refreshing never shows a different booking's details.
    const entry = recordBookingConfirmation(accountId, draft, totals.total, totals.codAmount, deliveryEstimateLabel);
    // Remember the recipient for next time's prefill — must happen before
    // resetDraft() clears the in-memory draft this reads from.
    if (draft.recipientAddress) {
      void setLastRecipientAddress(accountId, draft.recipientAddress.id);
    }
    touchedRef.current = false;
    resetDraft();
    navigate('/dashboard/book-delivery/success', { state: { bookingId: entry.id } });
  };

  const goToStepFromReview = (target: number) => {
    setEditReturn(true);
    setStep(target);
  };

  const handleContinue = () => {
    // Addresses is the only step with its own local unsaved-edit state
    // (the pickup/recipient drawers) — block here rather than silently
    // losing whatever the user typed.
    if (step === 0 && addressFormOpen) return;
    if (!stepValid[step]) return;
    if (editReturn) {
      setEditReturn(false);
      setStep(REVIEW_STEP);
      return;
    }
    setStep((s) => Math.min(REVIEW_STEP, s + 1));
  };

  // Mobile wizard only now — desktop's page header has no back control
  // (matches the rest of GGX Corporate: Bulk Upload, Support Tickets, and
  // Address Book have none either). Desktop still asks before leaving an
  // in-progress booking via `exitGuard`, which intercepts real navigation
  // (a sidebar link, browser back) regardless of this handler.
  const handleHeaderBack = () => {
    // Check editReturn first — reached via "Edit" from Review (including
    // step 0), Back must return to Review, never trigger the exit
    // confirmation meant for a first-time pass through step 0.
    if (editReturn) {
      setEditReturn(false);
      setStep(REVIEW_STEP);
      return;
    }
    if (step === 0) {
      setShowExitConfirm(true);
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    // Must clear this before navigating — `useUploadExitGuard`'s blocker
    // intercepts ANY navigation (including this programmatic one) while
    // true, which would otherwise immediately stack its own "Leave this
    // booking?" dialog on top of the one just confirmed.
    touchedRef.current = false;
    // Explicitly drop the in-progress draft before leaving, rather than
    // relying only on the page unmounting — leaving via this confirmation
    // must behave identically to leaving via the `exitGuard` blocker below
    // (which also never re-enters this draft).
    resetDraft();
    navigate('/dashboard');
  };

  const deliveryEstimateLabel = useMemo(() => {
    // Drop-off has no rider pickup to estimate from — this label is
    // pickup-specific scheduling info, same as the date selector itself.
    if (draft.firstMile === 'dropoff') return undefined;
    if (draft.serviceType === 'on_demand') return 'Within 40 minutes of pickup';
    if (draft.serviceType !== 'standard' || !draft.pickupDate) return undefined;
    const region = draft.recipientAddress?.province ? classifyRegion(draft.recipientAddress.province) : 'unknown';
    const [y, m, d] = draft.pickupDate.split('-').map(Number);
    return estimateDeliveryDateRange(new Date(y, m - 1, d), draft.serviceType, region).label;
  }, [draft.firstMile, draft.serviceType, draft.pickupDate, draft.recipientAddress]);

  const addressSection = (
    <BookingAddressSection
      accountId={accountId}
      pickupAddress={draft.pickupAddress}
      recipientAddress={draft.recipientAddress}
      onPickupChange={(a) => updateDraft({ pickupAddress: a, pickupAddressId: a.id })}
      onRecipientChange={(a) => updateDraft({
        recipientAddress: a,
        recipientAddressId: a.id,
        // On-Demand eligibility is address-dependent (`BookingDeliverySection`'s
        // own serviceability check, which only re-runs while that step is
        // mounted). Editing the recipient from Review and saving returns
        // straight to Review without remounting it — reset defensively here
        // so a now-ineligible On-Demand selection is never left silently
        // confirmable when the recipient changes to a different address.
        ...(draft.recipientAddress?.id !== a.id && draft.serviceType === 'on_demand' ? { serviceType: 'standard' as const } : {}),
      })}
      onRecipientFormOpenChange={setRecipientFormOpen}
      onPickupFormOpenChange={setPickupFormOpen}
      onDirty={() => { touchedRef.current = true; }}
    />
  );

  const deliverySection = (
    <BookingDeliverySection
      accountId={accountId}
      recipientAddress={draft.recipientAddress}
      firstMile={draft.firstMile}
      onFirstMileChange={(v) => updateDraft({ firstMile: v })}
      serviceType={draft.serviceType}
      onServiceTypeChange={(v) => updateDraft({ serviceType: v })}
      pickupDate={draft.pickupDate}
      onPickupDateChange={(v) => updateDraft({ pickupDate: v })}
    />
  );

  const itemSection = (
    <BookingItemDetailsSection
      firstMile={draft.firstMile}
      itemDescription={draft.itemDescription}
      onItemDescriptionChange={(v) => updateDraft({ itemDescription: v })}
      pouchSize={draft.pouchSize}
      onPouchSizeChange={(v) => updateDraft({ pouchSize: v })}
      declaredValue={draft.declaredValue}
      onDeclaredValueChange={(v) => updateDraft({ declaredValue: v })}
      codEnabled={draft.merchandiseCod.enabled}
      codAmount={draft.merchandiseCod.amount}
      onCodChange={(enabled, amount) => updateDraft({ merchandiseCod: { enabled, amount } })}
      itemProtectionTier={draft.itemProtectionTier}
      onItemProtectionTierChange={(v) => updateDraft({ itemProtectionTier: v })}
    />
  );

  // Mobile wizard only — desktop has no Continue button (see module docblock).
  const continueBlockReason = !stepValid[step] ? stepBlockReason[step] : undefined;
  const continueButton = (
    <div className="w-full">
      {continueBlockReason && <p className="mb-2 text-xs text-red-600 text-center">{continueBlockReason}</p>}
      <Button className="w-full" onClick={handleContinue} disabled={!stepValid[step]}>
        {editReturn ? 'Save and return to review' : 'Continue'}
      </Button>
    </div>
  );

  return (
    <div className="p-4 lg:p-6">
      {exitGuard.state === 'blocked' && (
        <ConfirmDialog
          open
          onClose={() => exitGuard.reset()}
          onConfirm={() => {
            // Same reasoning as `handleConfirmExit` — leaving via browser
            // back/forward or a sidebar link must drop the in-progress
            // draft just as explicitly as leaving via the header's own
            // exit confirmation does.
            touchedRef.current = false;
            resetDraft();
            exitGuard.proceed();
          }}
          title="Leave this booking?"
          description="Your in-progress booking details will be lost if you leave this page."
          cancelLabel="Continue booking"
          confirmLabel="Leave"
          variant="destructive"
        />
      )}
      <ConfirmDialog
        open={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={handleConfirmExit}
        title="Leave this booking?"
        description="Your in-progress booking details will be lost if you leave this page."
        cancelLabel="Continue booking"
        confirmLabel="Leave"
        variant="destructive"
      />

      {/* `BookingHeader`'s sticky compact bar + step progress is mobile-only
          (see its own docblock). Desktop's title/subtitle render below,
          inside the same max-width container as the booking content — see
          that block's own comment. */}
      {!isDesktop && <BookingHeader step={step} onBack={handleHeaderBack} />}

      {/* Switched on the same `isDesktop` JS flag the header's Back/Exit
          action already uses (not a CSS `lg:`/`hidden` pair) — deliberately
          only ONE layout is ever mounted. Addresses/Delivery/Item Details
          each render as a single `addressSection`/`deliverySection`/
          `itemSection` element reused across both branches below, so
          switching layouts does remount that one instance (clearing its
          own transient UI state — an open address drawer, in-progress
          unsaved new-address text), but the booking DATA itself lives in
          `draft` (sessionStorage-backed), never in these components, so no
          entered information is lost. The alternative — keeping both
          layouts permanently mounted via CSS — was tried and reverted: two
          live `BookingAddressSection` instances fell out of sync with each
          other's saved-address list and open/unsaved-edit state once the
          user resized mid-edit, silently blocking Continue/Confirm with no
          visible cause. */}
      {isDesktop ? (
        // Desktop: the original continuous two-column layout — no steps,
        // no Continue buttons. Addresses, Delivery, and Item Details all
        // render together on the left; the live-updating Review & Payment
        // panel (Confirm Booking included) stays sticky on the right.
        // Constrained to a centered 1280px-max container so the ~70/30
        // columns stay scannable on ultrawide monitors — this wrapper is
        // local to the booking content only (the sidebar/app header live
        // outside this page entirely). The page title/subtitle live in
        // this same container (not a separate full-width block above it)
        // so they share its left edge at every viewport width — exactly
        // the existing GGX Corporate desktop page-header pattern (Bulk
        // Upload, Support Tickets, Address Book: `text-3xl font-bold` title
        // + `text-gray-600 mt-1` subtitle in one `<div>`, no back control).
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Book a delivery</h1>
            <p className="text-gray-600 mt-1">Enter your delivery details to book a shipment.</p>
          </div>
          <div className="grid grid-cols-[7fr_3fr] gap-6 items-start">
            <div className="space-y-4 min-w-0">
              {addressSection}
              {deliverySection}
              {itemSection}
            </div>
            {/* `top-6` (not the header-clearing offset the old sticky
                compact header needed) — small enough that it never exceeds
                this column's natural top position, so the sticky panel
                never jumps down from the left column's starting line on
                initial render; it only starts sticking once the page is
                scrolled, 24px below the content edge. */}
            <div className="sticky top-6">
              <BookingReviewPaymentPanel
                draft={draft}
                onChange={(patch) => updateDraft(patch)}
                onConfirm={handleConfirm}
                confirmDisabled={!canConfirm}
                blockingReason={confirmBlockReason}
                deliveryEstimateLabel={deliveryEstimateLabel}
              />
            </div>
          </div>
        </div>
      ) : (
        // Mobile: guided 3-step wizard, one step at a time. Step 0
        // combines Addresses and Delivery as two sections on one page.
        <>
          <div className="pt-3 pb-32">
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Addresses</p>
                  {addressSection}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Delivery</p>
                  {deliverySection}
                </div>
              </div>
            )}
            {step === 1 && itemSection}
            {step === REVIEW_STEP && (
              <div className="space-y-4">
                <BookingReviewSummary
                  draft={draft}
                  onEditAddresses={() => goToStepFromReview(0)}
                  onEditItem={() => goToStepFromReview(1)}
                  deliveryEstimateLabel={deliveryEstimateLabel}
                />
                {/* Fee breakdown, vouchers, and payment method are always
                    visible here now — no "View breakdown" tap required
                    (the sticky bottom bar below keeps its existing total +
                    Confirm Booking placement). */}
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <h2 className="mb-3 text-sm font-semibold text-gray-900">Review &amp; Payment</h2>
                  <BookingFeeBreakdownContent
                    draft={draft}
                    onChange={(patch) => updateDraft(patch)}
                    totals={computeBookingTotals(draft)}
                    showFinalTotal
                  />
                </div>
              </div>
            )}
          </div>

          {step === REVIEW_STEP && (
            <BookingPaymentSummaryBar
              draft={draft}
              onConfirm={handleConfirm}
              confirmDisabled={!canConfirm}
              blockingReason={confirmBlockReason}
            />
          )}

          {step !== REVIEW_STEP && (
            <div
              className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 px-4 pt-3 z-40"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              {continueButton}
            </div>
          )}
        </>
      )}
    </div>
  );
}
