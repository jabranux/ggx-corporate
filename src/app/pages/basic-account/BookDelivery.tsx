/**
 * GGX Basic single-booking flow — /dashboard/book-delivery.
 *
 * Desktop: two-column single-page form (Address → Delivery → Item Details,
 * no Continue buttons between them) with a sticky Review & Payment rail that
 * updates live — same grid/sticky-rail technique as `pages/CartReview.tsx`.
 *
 * Mobile: a guided, screen-by-screen journey (Address → Delivery → Item
 * Details → Review), sharing the exact same section components and the same
 * `BookingDraft` state as desktop. Review & Payment (including the shipping
 * fee payer and voucher) lives only in the Review step — one Confirm Booking
 * action, no extra confirmation step. Editing a section from Review returns
 * directly to Review on save, instead of repeating the remaining steps.
 *
 * Phase 1 scope: saved-address prefill only (pickup + recipient). No
 * shortened journey and no remembered item details — deferred.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { IconChevronLeft, IconMapPin, IconTruckDelivery, IconPackage, IconClipboardCheck } from '@tabler/icons-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useAuth } from '../../contexts/AuthContext';
import { useBookingDraft } from '../../hooks/useBookingDraft';
import { useUploadExitGuard } from '../../hooks/useUploadExitGuard';
import { getDefaultBookingAddresses, setLastRecipientAddress } from '../../services/basicBookingPreferencesService';
import { estimateBasicBookingFee } from '../../lib/bookingFees';
import { recordBookingConfirmation } from '../../lib/basicBookingHistory';
import { isPickupDateSelectable } from '../../lib/basicPickupScheduling';
import type { BookingDraft } from '../../lib/basicBookingDraft';
import { BookingAddressSection, isCompleteAddress } from '../../components/BookingAddressSection';
import { BookingDeliverySection } from '../../components/BookingDeliverySection';
import { BookingItemDetailsSection } from '../../components/BookingItemDetailsSection';
import { BookingReviewPaymentPanel } from '../../components/BookingReviewPaymentPanel';
import { AddressDisplayCard } from '../../components/AddressDisplayCard';

const MOBILE_STEPS = [
  { label: 'Addresses', icon: IconMapPin },
  { label: 'Delivery', icon: IconTruckDelivery },
  { label: 'Item Details', icon: IconPackage },
  { label: 'Review', icon: IconClipboardCheck },
] as const;

const REVIEW_STEP = 3;

export function BookDelivery() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic';
  const { draft, setDraft, resetDraft } = useBookingDraft(accountId);
  const [step, setStep] = useState(0);
  const [editReturn, setEditReturn] = useState(false);

  // Only blocks navigation once the user has actually changed something —
  // opening the page with prefilled defaults must never trap Back/sidebar
  // nav. `setDraft` (used by the background address-prefill effect below)
  // never touches this; only `updateDraft` (used by every real user edit)
  // does. The guard's returned `blocker` is rendered as a real confirm
  // dialog below — same pattern as `BulkUploader.tsx`'s `exitGuardDialog`.
  const touchedRef = useRef(false);
  const exitGuard = useUploadExitGuard(touchedRef);

  // Reported by BookingAddressSection: whether its recipient/pickup forms
  // are open with unsaved edits. The mobile wizard's Continue button lives
  // outside that component and has no other visibility into this local form
  // state, so it must block advancing (rather than silently discarding the
  // edits) while either is true.
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
  // `ShippingFeePayerSelector`, which only mounts while the Review panel's
  // payment section is expanded and would otherwise let this go unreconciled
  // while collapsed.
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
  const declaredValueNum = Number(draft.declaredValue);
  const declaredValueValid = draft.declaredValue.trim() === '' || (Number.isFinite(declaredValueNum) && declaredValueNum >= 0);
  const codAmountNum = Number(draft.merchandiseCod.amount);
  const codValid = !draft.merchandiseCod.enabled
    || (draft.merchandiseCod.amount.trim() !== '' && Number.isFinite(codAmountNum) && codAmountNum >= 0);

  const addressesComplete = isCompleteAddress(draft.pickupAddress) && isCompleteAddress(draft.recipientAddress);
  // On-Demand is immediate — no pickup date to choose. Standard requires one,
  // and it must still be eligible right now — a date chosen earlier in the
  // session (or restored from a saved draft) can go stale if left open past
  // midnight or the pickup cutoff, so this isn't just a non-empty check.
  const pickupDateSet = Boolean(draft.pickupDate);
  const pickupDateStale = pickupDateSet && !isPickupDateSelectable(draft.pickupDate!);
  const pickupDateComplete = draft.serviceType !== 'standard' || (pickupDateSet && !pickupDateStale);

  const canConfirm = Boolean(
    addressesComplete && pickupDateComplete && !addressFormOpen && draft.itemDescription.trim() && declaredValueValid && codValid,
  );

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

  const handleConfirm = () => {
    // Recompute pickup-date eligibility fresh (using the real current time)
    // rather than trusting `canConfirm`/`pickupDateStale` as captured by
    // this closure — those are only as fresh as the last render, and the
    // (mock) cutoff can pass while the tab sits idle with no re-render in
    // between. If it just went stale, force a render so the blocking
    // reason/disabled state catch up immediately instead of silently
    // no-op'ing with no feedback.
    const stillPickupDateEligible = draft.serviceType !== 'standard'
      || (Boolean(draft.pickupDate) && isPickupDateSelectable(draft.pickupDate!));
    if (!canConfirm || !stillPickupDateEligible) {
      if (!stillPickupDateEligible) {
        updateDraft({ pickupDate: draft.pickupDate });
      }
      return;
    }
    const fee = estimateBasicBookingFee({
      pouchSize: draft.pouchSize,
      serviceType: draft.serviceType,
      declaredValue: Number(draft.declaredValue) || 0,
    });
    const shipping = fee.baseFee + fee.serviceSurcharge;
    const total = Math.max(shipping + fee.itemProtection - draft.voucherDiscount, 0);
    // Persist a demo booking record BEFORE clearing the draft — see
    // `lib/basicBookingHistory.ts`'s header comment for what this is (and
    // is not).
    recordBookingConfirmation(accountId, draft, total);
    // Remember the recipient for next time's prefill — must happen before
    // resetDraft() clears the in-memory draft this reads from.
    if (draft.recipientAddress) {
      void setLastRecipientAddress(accountId, draft.recipientAddress.id);
    }
    touchedRef.current = false;
    resetDraft();
    navigate('/dashboard/book-delivery/success');
  };

  const goToStepFromReview = (target: number) => {
    setEditReturn(true);
    setStep(target);
  };

  const handleContinue = () => {
    // Addresses is the only step with its own local unsaved-edit state
    // (the pickup/recipient forms) — block here rather than unmounting it
    // and silently losing whatever the user typed.
    if (step === 0 && addressFormOpen) return;
    if (editReturn) {
      setEditReturn(false);
      setStep(REVIEW_STEP);
      return;
    }
    setStep((s) => Math.min(REVIEW_STEP, s + 1));
  };

  const addressSection = (
    <BookingAddressSection
      accountId={accountId}
      pickupAddress={draft.pickupAddress}
      recipientAddress={draft.recipientAddress}
      onPickupChange={(a) => updateDraft({ pickupAddress: a, pickupAddressId: a.id })}
      onRecipientChange={(a) => updateDraft({ recipientAddress: a, recipientAddressId: a.id })}
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
      itemDescription={draft.itemDescription}
      onItemDescriptionChange={(v) => updateDraft({ itemDescription: v })}
      pouchSize={draft.pouchSize}
      onPouchSizeChange={(v) => updateDraft({ pouchSize: v })}
      declaredValue={draft.declaredValue}
      onDeclaredValueChange={(v) => updateDraft({ declaredValue: v })}
      codEnabled={draft.merchandiseCod.enabled}
      codAmount={draft.merchandiseCod.amount}
      onCodChange={(enabled, amount) => updateDraft({ merchandiseCod: { enabled, amount } })}
    />
  );

  const reviewPanel = (
    <BookingReviewPaymentPanel
      draft={draft}
      onChange={(patch) => updateDraft(patch)}
      onConfirm={handleConfirm}
      confirmDisabled={!canConfirm}
      blockingReason={confirmBlockReason}
    />
  );

  return (
    <div className="p-4 lg:p-6">
      {exitGuard.state === 'blocked' && (
        <ConfirmDialog
          open
          onClose={() => exitGuard.reset()}
          onConfirm={() => exitGuard.proceed()}
          title="Leave this booking?"
          description="Your in-progress booking details will be lost if you leave this page."
          cancelLabel="Continue booking"
          confirmLabel="Leave"
          variant="destructive"
        />
      )}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Book a delivery</h1>
        <p className="text-sm text-gray-500 mt-1">Fees shown are estimates. Final fees are confirmed at booking.</p>
      </div>

      {/* Desktop: two-column single page — no steps, no Continue buttons. */}
      <div className="hidden lg:grid lg:grid-cols-[7fr_3fr] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {addressSection}
          {deliverySection}
          {itemSection}
        </div>
        <div className="lg:sticky lg:top-6">{reviewPanel}</div>
      </div>

      {/* Mobile: guided step-by-step journey. */}
      <div className="lg:hidden space-y-4 pb-36">
        <MobileStepHeader
          step={step}
          onBack={step === 0 ? undefined : () => setStep((s) => Math.max(0, s - 1))}
        />

        {step === 0 && addressSection}
        {step === 1 && deliverySection}
        {step === 2 && itemSection}
        {step === REVIEW_STEP && (
          <div className="space-y-3">
            <ReviewSummaryCard label="Addresses" onEdit={() => goToStepFromReview(0)}>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Pickup</p>
                  {draft.pickupAddress
                    ? <AddressDisplayCard address={draft.pickupAddress} />
                    : <p className="text-sm text-gray-400">Not set</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Recipient</p>
                  {draft.recipientAddress
                    ? <AddressDisplayCard address={draft.recipientAddress} />
                    : <p className="text-sm text-gray-400">Not set</p>}
                </div>
              </div>
            </ReviewSummaryCard>
            <ReviewSummaryCard label="Delivery" onEdit={() => goToStepFromReview(1)}>
              <p className="text-sm text-gray-700">
                {draft.firstMile === 'pickup' ? 'Rider Pickup' : 'Drop-off'} · {draft.serviceType.replace('_', ' ')}
                {draft.serviceType === 'standard' && draft.pickupDate && ` · ${draft.pickupDate}`}
              </p>
            </ReviewSummaryCard>
            <ReviewSummaryCard label="Item details" onEdit={() => goToStepFromReview(2)}>
              <p className="text-sm text-gray-700">{draft.itemDescription || 'No description'} · {draft.pouchSize}</p>
            </ReviewSummaryCard>
            {reviewPanel}
          </div>
        )}

        {step !== REVIEW_STEP && (
          // Sits above BasicBottomNav (`fixed bottom-0 z-40`, ~52px content +
          // its own safe-area padding) rather than sharing the same bottom-0
          // stacking context, which would let the nav intercept taps on this
          // bar on real mobile devices.
          <div
            className="fixed inset-x-0 bg-white border-t border-gray-200 px-4 py-3 z-40"
            style={{ bottom: 'calc(52px + env(safe-area-inset-bottom))' }}
          >
            {step === 0 && addressFormOpen && (
              <p className="mb-2 text-xs text-center text-red-600">Save the address you’re editing to continue.</p>
            )}
            <Button className="w-full" onClick={handleContinue} disabled={step === 0 && addressFormOpen}>
              {editReturn ? 'Save and return to review' : 'Continue'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileStepHeader({ step, onBack }: { step: number; onBack?: () => void }) {
  const current = MOBILE_STEPS[step];
  return (
    <div className="flex items-center gap-2">
      {onBack && (
        <button type="button" onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100" aria-label="Back">
          <IconChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
      )}
      <div>
        <p className="text-xs text-gray-400">Step {step + 1} of {MOBILE_STEPS.length}</p>
        <p className="text-sm font-semibold text-gray-900">{current.label}</p>
      </div>
    </div>
  );
}

function ReviewSummaryCard({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-blue-600">Edit</button>
      </div>
      {children}
    </div>
  );
}
