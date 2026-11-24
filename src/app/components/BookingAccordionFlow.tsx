/**
 * Accordion booking variant for the GGX Basic single-booking flow —
 * temporary prototyping tool, NOT a production feature (see
 * `BookDelivery.tsx`'s module docblock and `BookingUxSwitcher.tsx`). Combines
 * the Wizard's three logical groups (Pickup & Delivery, Item Details,
 * Review & Payment) into collapsible sections on one page instead of
 * separate steps, with no progress bar, and adds optional multiple-recipient
 * support that the Wizard variant does not have.
 *
 * Kept entirely self-contained with its own local state (never
 * `useBookingDraft`/`BookingDraft`) so this experiment can be iterated on
 * freely without risking the production Wizard flow it's being compared
 * against — see the module docblock in `BookDelivery.tsx` for why the two
 * variants are kept separate. Confirming here never navigates to the shared
 * `BookDeliverySuccess` screen (which is bound to a single booking id) —
 * success renders inline so one or many shipments can be shown at once.
 *
 * Single recipient (the common case) reuses the exact same section
 * components as the Wizard (`BookingAddressSection`, `BookingItemDetailsSection`)
 * so behavior and validation match exactly. Adding a second recipient
 * switches Pickup & Delivery and Item Details into a list-based multi-
 * recipient layout: one pickup, N recipients, one shared set of item details
 * that every recipient inherits until individually customized ("enter once,
 * customize only what's different").
 *
 * Multi-recipient entry points are temporarily disabled (2026-11-24, product
 * request) — `MULTI_RECIPIENT_ENABLED` below hides every way to reach more
 * than one recipient, so the flow is single-recipient-only in both variants
 * for now. The implementation itself (this file's `recipients` array,
 * per-recipient item overrides, consolidated review, multi-shipment confirm)
 * is untouched — every branch here still keys off `recipients.length`, not
 * the flag, so flipping it back to `true` re-enables the full experience
 * with no further changes.
 */
const MULTI_RECIPIENT_ENABLED = false;
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPlus, IconTrash, IconCircleCheckFilled, IconPackage, IconTruckDelivery, IconBuildingStore } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { AccordionItem } from './ui/Accordion';
import { BookingUxSwitcher, type BookingUxVariant } from './BookingUxSwitcher';
import { BookingAddressSection, AddressRouteRail, isCompleteAddress } from './BookingAddressSection';
import { BookingDeliverySection } from './BookingDeliverySection';
import { BookingItemDetailsSection } from './BookingItemDetailsSection';
import { BookingFeeBreakdownContent } from './BookingFeeBreakdownContent';
import { BookingAddressPickerDrawer } from './BookingAddressPickerDrawer';
import { labelColors, getDisplayLabel } from './AddressDisplayCard';
import { getDefaultBookingAddresses } from '../services/basicBookingPreferencesService';
import { recordBookingConfirmation, type BasicBookingHistoryEntry } from '../lib/basicBookingHistory';
import { isPickupDateSelectable, estimateDeliveryDateRange } from '../lib/basicPickupScheduling';
import { classifyRegion } from '../lib/checkoutEstimates';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import { getBasicPouchSize, type BasicPouchSizeKey } from '../lib/basicPouchSizes';
import { EMPTY_MERCHANDISE_COD, type BookingDraft, type FirstMile, type ItemProtectionTier, type FeePayer, type SenderPaymentMethod, type MerchandiseCod } from '../lib/basicBookingDraft';
import type { Address } from './AddressBook';
import type { DeliveryServiceType } from '../services/transactionService';

interface ItemFields {
  itemDescription: string;
  pouchSize: BasicPouchSizeKey;
  declaredValue: string;
  itemProtectionTier: ItemProtectionTier;
  merchandiseCod: MerchandiseCod;
}

const EMPTY_ITEM_FIELDS: ItemFields = {
  itemDescription: '',
  pouchSize: 'small',
  declaredValue: '',
  itemProtectionTier: 'free',
  merchandiseCod: EMPTY_MERCHANDISE_COD,
};

interface RecipientEntry {
  id: string;
  address: Address | null;
  /** null = inherits `sharedItemDetails`; set only once this recipient is individually customized. */
  itemOverride: ItemFields | null;
}

function newRecipientId(): string {
  return `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function itemFieldsValid(f: ItemFields): boolean {
  const declaredValueNum = Number(f.declaredValue);
  const declaredValueValid = f.merchandiseCod.enabled
    || f.itemProtectionTier === 'free'
    || f.declaredValue.trim() === ''
    || (Number.isFinite(declaredValueNum) && declaredValueNum >= 0);
  const codAmountNum = Number(f.merchandiseCod.amount);
  const codValid = !f.merchandiseCod.enabled
    || (f.merchandiseCod.amount.trim() !== '' && Number.isFinite(codAmountNum) && codAmountNum >= 0);
  return Boolean(f.itemDescription.trim()) && declaredValueValid && codValid;
}

function AddressLine({ address, placeholder }: { address: Address | null; placeholder: string }) {
  if (!address) return <p className="text-sm text-gray-400">{placeholder}</p>;
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{address.name} · {address.mobileNumber}</p>
      <p className="text-xs text-gray-500 truncate">{[address.barangay, address.city, address.province].filter(Boolean).join(', ')}</p>
    </div>
  );
}

export interface BookingAccordionFlowProps {
  accountId: string;
  uxVariant: BookingUxVariant;
  onUxVariantChange: (v: BookingUxVariant) => void;
  /** Mirrors `BookDelivery.tsx`'s own exit-guard arming — called on every real user edit (never on the background pickup-address prefill). */
  onDirty: () => void;
  /** Called once a booking is successfully confirmed, so the page-level exit guard stops treating the (now-submitted) data as unsaved work. */
  onConfirmed: () => void;
}

export function BookingAccordionFlow({ accountId, uxVariant, onUxVariantChange, onDirty, onConfirmed }: BookingAccordionFlowProps) {
  const [openSection, setOpenSection] = useState<0 | 1 | 2>(0);

  const [pickupAddress, setPickupAddress] = useState<Address | null>(null);
  const [firstMile, setFirstMile] = useState<FirstMile>('pickup');
  const [serviceType, setServiceType] = useState<DeliveryServiceType>('standard');
  const [pickupDate, setPickupDate] = useState<string | null>(null);

  const [recipients, setRecipients] = useState<RecipientEntry[]>([{ id: newRecipientId(), address: null, itemOverride: null }]);
  const [sharedItemDetails, setSharedItemDetails] = useState<ItemFields>(EMPTY_ITEM_FIELDS);
  const [customizingId, setCustomizingId] = useState<string | null>(null);

  const [feePayer, setFeePayer] = useState<FeePayer>('sender');
  const [senderPaymentMethod, setSenderPaymentMethod] = useState<SenderPaymentMethod>('cash_pickup');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherDiscount, setVoucherDiscount] = useState(0);

  // Single-mode address-form-open tracking (mirrors `BookDelivery.tsx`).
  const [recipientFormOpen, setRecipientFormOpen] = useState(false);
  const [pickupFormOpen, setPickupFormOpen] = useState(false);
  // Multi-mode picker drawer.
  const [picker, setPicker] = useState<{ kind: 'pickup' | 'recipient'; recipientId?: string } | null>(null);

  const [confirmedEntries, setConfirmedEntries] = useState<BasicBookingHistoryEntry[] | null>(null);

  const multi = recipients.length > 1;
  const addressFormOpen = multi ? Boolean(picker) : (recipientFormOpen || pickupFormOpen);

  // Phase 1 parity with the Wizard: prefill pickup only, never overwrite a
  // user-made choice, never arm the dirty guard.
  useEffect(() => {
    if (pickupAddress) return;
    let active = true;
    getDefaultBookingAddresses(accountId).then(({ pickup }) => {
      if (active && pickup) setPickupAddress((prev) => prev ?? pickup);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Same drop-off/Cash-on-Pickup reconciliation `BookDelivery.tsx` owns for the Wizard.
  useEffect(() => {
    if (firstMile === 'dropoff' && senderPaymentMethod === 'cash_pickup') {
      setSenderPaymentMethod('gcash_wallet');
    }
  }, [firstMile, senderPaymentMethod]);

  const markDirty = () => onDirty();

  const addRecipient = () => {
    setRecipients((prev) => [...prev, { id: newRecipientId(), address: null, itemOverride: null }]);
    markDirty();
  };

  const removeRecipient = (id: string) => {
    setRecipients((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((r) => r.id !== id);
      // Folding back to single-recipient mode: don't silently drop a
      // customization the user made while multiple recipients existed —
      // the remaining recipient's effective details become the new shared
      // details, since single mode always reads from `sharedItemDetails`.
      if (next.length === 1 && next[0].itemOverride) {
        setSharedItemDetails(next[0].itemOverride);
        next[0] = { ...next[0], itemOverride: null };
      }
      return next;
    });
    if (customizingId === id) setCustomizingId(null);
    markDirty();
  };

  const updateRecipientAddress = (id: string, address: Address) => {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, address } : r)));
    markDirty();
  };

  const effectiveItemFor = (r: RecipientEntry): ItemFields => r.itemOverride ?? sharedItemDetails;

  const updateSharedItem = (patch: Partial<ItemFields>) => {
    setSharedItemDetails((prev) => ({ ...prev, ...patch }));
    markDirty();
  };

  const updateRecipientOverride = (id: string, patch: Partial<ItemFields>) => {
    setRecipients((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const base = r.itemOverride ?? sharedItemDetails;
      return { ...r, itemOverride: { ...base, ...patch } };
    }));
    markDirty();
  };

  const resetOverride = (id: string) => {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, itemOverride: null } : r)));
    markDirty();
  };

  // ---- Validation (mirrors BookDelivery.tsx's logic, generalized to N recipients) ----
  const pickupComplete = isCompleteAddress(pickupAddress);
  const recipientsAddressComplete = recipients.every((r) => isCompleteAddress(r.address));
  const pickupDateRequired = firstMile === 'pickup' && serviceType === 'standard';
  const pickupDateSet = Boolean(pickupDate);
  const pickupDateStale = pickupDateRequired && pickupDateSet && !isPickupDateSelectable(pickupDate!);
  const pickupDateComplete = !pickupDateRequired || (pickupDateSet && !pickupDateStale);
  const section0Valid = pickupComplete && recipientsAddressComplete && pickupDateComplete && !addressFormOpen;

  const section1Valid = recipients.every((r) => itemFieldsValid(effectiveItemFor(r)));

  const canConfirm = section0Valid && section1Valid;
  const confirmBlockReason = !pickupComplete
    ? 'Choose a complete pickup address to continue.'
    : !recipientsAddressComplete
    ? (multi ? 'Every recipient needs a complete address.' : 'Choose a complete recipient address to continue.')
    : addressFormOpen
    ? 'Save the address you’re editing to continue.'
    : pickupDateStale
    ? 'Your selected pickup date is no longer available — choose another.'
    : !pickupDateComplete
    ? 'Choose a pickup date to continue.'
    : !section1Valid
    ? (multi ? 'Finish item details for every recipient to continue.' : 'Finish item details to continue.')
    : undefined;

  const deliveryEstimateLabelFor = (recipientAddress: Address | null): string | undefined => {
    if (firstMile === 'dropoff') return undefined;
    if (serviceType === 'on_demand') return 'Within 40 minutes of pickup';
    if (serviceType !== 'standard' || !pickupDate) return undefined;
    const region = recipientAddress?.province ? classifyRegion(recipientAddress.province) : 'unknown';
    const [y, m, d] = pickupDate.split('-').map(Number);
    return estimateDeliveryDateRange(new Date(y, m - 1, d), serviceType, region).label;
  };

  const buildRecipientDraft = (r: RecipientEntry): BookingDraft => {
    const f = effectiveItemFor(r);
    return {
      pickupAddressId: pickupAddress?.id ?? null,
      pickupAddress,
      recipientAddressId: r.address?.id ?? null,
      recipientAddress: r.address,
      firstMile,
      serviceType,
      pickupDate,
      pouchSize: f.pouchSize,
      itemDescription: f.itemDescription,
      declaredValue: f.declaredValue,
      itemProtectionTier: f.itemProtectionTier,
      merchandiseCod: f.merchandiseCod,
      feePayer,
      senderPaymentMethod,
      voucherCode: '',
      voucherDiscount: 0,
    };
  };

  const perRecipient = useMemo(
    () => recipients.map((r) => {
      const draft = buildRecipientDraft(r);
      return { recipient: r, draft, totals: computeBookingTotals(draft) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipients, pickupAddress, firstMile, serviceType, pickupDate, feePayer, senderPaymentMethod, sharedItemDetails],
  );

  const sumBaseFee = perRecipient.reduce((s, p) => s + p.totals.baseFee, 0);
  const sumSurcharge = perRecipient.reduce((s, p) => s + p.totals.serviceSurcharge, 0);
  const sumProtection = perRecipient.reduce((s, p) => s + p.totals.itemProtection, 0);
  const sumShippingRaw = sumBaseFee + sumSurcharge;
  const sumCod = perRecipient.reduce((s, p) => s + p.totals.codAmount, 0);
  const grandTotal = Math.max(sumShippingRaw + sumProtection - voucherDiscount, 0);

  // A lightweight stand-in `BookingDraft` purely so `BookingFeeBreakdownContent`
  // (shared, unmodified) can read/write `feePayer`/`senderPaymentMethod`/
  // `voucherCode` the exact same way it does for the Wizard — real per-
  // shipment totals are supplied separately via `summaryTotals` below, never
  // derived from this stand-in.
  const summaryDraft: BookingDraft = {
    pickupAddressId: pickupAddress?.id ?? null,
    pickupAddress,
    recipientAddressId: recipients[0]?.address?.id ?? null,
    recipientAddress: recipients[0]?.address ?? null,
    firstMile,
    serviceType,
    pickupDate,
    pouchSize: 'small',
    itemDescription: '',
    declaredValue: '',
    itemProtectionTier: 'free',
    merchandiseCod: { enabled: sumCod > 0, amount: String(sumCod) },
    feePayer,
    senderPaymentMethod,
    voucherCode,
    voucherDiscount,
  };
  const summaryTotals = {
    baseFee: sumBaseFee,
    serviceSurcharge: sumSurcharge,
    shipping: sumShippingRaw,
    itemProtection: sumProtection,
    coveredValue: 0,
    discount: voucherDiscount,
    total: grandTotal,
    codAmount: sumCod,
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const entries = perRecipient.map(({ recipient, draft, totals }) =>
      recordBookingConfirmation(accountId, draft, totals.total, totals.codAmount, deliveryEstimateLabelFor(recipient.address)));
    setConfirmedEntries(entries);
    onConfirmed();
  };

  const resetAll = () => {
    setConfirmedEntries(null);
    setOpenSection(0);
    setPickupAddress(null);
    setFirstMile('pickup');
    setServiceType('standard');
    setPickupDate(null);
    setRecipients([{ id: newRecipientId(), address: null, itemOverride: null }]);
    setSharedItemDetails(EMPTY_ITEM_FIELDS);
    setCustomizingId(null);
    setFeePayer('sender');
    setSenderPaymentMethod('cash_pickup');
    setVoucherCode('');
    setVoucherDiscount(0);
    getDefaultBookingAddresses(accountId).then(({ pickup }) => { if (pickup) setPickupAddress(pickup); });
  };

  // ---- Compact collapsed summaries ----
  const pickupDeliverySummary = useMemo(() => {
    const parts: string[] = [pickupAddress ? pickupAddress.name : 'Pickup not set'];
    parts.push(multi ? `→ ${recipients.filter((r) => r.address).length}/${recipients.length} recipients` : `→ ${recipients[0]?.address?.name ?? 'Recipient not set'}`);
    parts.push(firstMile === 'dropoff' ? 'Drop-off' : pickupDate ? new Date(pickupDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'Pickup date not set');
    return parts.join(' · ');
  }, [pickupAddress, recipients, multi, firstMile, pickupDate]);

  const itemDetailsSummary = useMemo(() => {
    if (!multi) {
      return sharedItemDetails.itemDescription ? `${sharedItemDetails.itemDescription} · ${getBasicPouchSize(sharedItemDetails.pouchSize).label}` : 'Not set';
    }
    const customized = recipients.filter((r) => r.itemOverride).length;
    const base = sharedItemDetails.itemDescription || 'Shared item details';
    return customized > 0 ? `${base} · ${customized} customized` : base;
  }, [multi, sharedItemDetails, recipients]);

  const addressSection = (
    <BookingAddressSection
      accountId={accountId}
      pickupAddress={pickupAddress}
      recipientAddress={recipients[0]?.address ?? null}
      onPickupChange={(a) => { setPickupAddress(a); markDirty(); }}
      onRecipientChange={(a) => updateRecipientAddress(recipients[0].id, a)}
      onRecipientFormOpenChange={setRecipientFormOpen}
      onPickupFormOpenChange={setPickupFormOpen}
      onDirty={markDirty}
    />
  );

  if (confirmedEntries) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardContent className="p-5 text-center">
            <IconCircleCheckFilled className="mx-auto mb-2 h-10 w-10 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              {confirmedEntries.length === 1 ? 'Booking confirmed' : `${confirmedEntries.length} shipments confirmed`}
            </h2>
            <p className="mt-1 text-sm text-gray-500">Sample tracking numbers for this demo booking:</p>
            <div className="mt-3 space-y-2 text-left">
              {confirmedEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.recipientName ?? 'Recipient'}</p>
                    <p className="text-xs text-gray-500">{e.trackingNumber}</p>
                  </div>
                  <span className="flex-shrink-0 text-sm font-semibold text-gray-900">{fmtPHP(e.total)}</span>
                </div>
              ))}
            </div>
            <Button className="mt-4 w-full" onClick={resetAll}>Book another delivery</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 lg:text-2xl lg:font-bold">Book a delivery</h1>
          <p className="mt-0.5 text-xs text-gray-500 lg:text-sm">Accordion preview — complete each section below.</p>
        </div>
        <BookingUxSwitcher value={uxVariant} onChange={onUxVariantChange} className="flex-shrink-0" />
      </div>

      <Card>
        <CardContent className="px-4 py-0">
          <AccordionItem
            open={openSection === 0}
            onOpenChange={(o) => setOpenSection(o ? 0 : openSection)}
            title={
              <div className="min-w-0 flex-1 text-left">
                <span>Pickup &amp; Delivery</span>
                {openSection !== 0 && <p className="mt-0.5 truncate text-xs font-normal text-gray-500">{pickupDeliverySummary}</p>}
              </div>
            }
          >
            <div className="space-y-3">
              {!multi ? (
                <>
                  {addressSection}
                  {MULTI_RECIPIENT_ENABLED && (
                    <button
                      type="button"
                      onClick={addRecipient}
                      className="flex items-center gap-1.5 text-sm font-semibold text-blue-600"
                    >
                      <IconPlus className="h-3.5 w-3.5" /> Add another recipient
                    </button>
                  )}
                </>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pickup address</p>
                          <AddressLine address={pickupAddress} placeholder="Not set" />
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setPicker({ kind: 'pickup' })}>
                          {pickupAddress ? 'Change' : 'Set'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    {recipients.map((r, i) => (
                      <Card key={r.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient {i + 1}</p>
                                {r.address && (
                                  <Badge variant={labelColors[r.address.label] || 'default'} className="text-[10px] px-1.5 py-0 capitalize">
                                    {getDisplayLabel(r.address)}
                                  </Badge>
                                )}
                              </div>
                              <AddressLine address={r.address} placeholder="Tap to add" />
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => setPicker({ kind: 'recipient', recipientId: r.id })}>
                                {r.address ? 'Change' : 'Set'}
                              </Button>
                              {recipients.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeRecipient(r.id)}
                                  aria-label={`Remove recipient ${i + 1}`}
                                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <IconTrash className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {MULTI_RECIPIENT_ENABLED && (
                    <button
                      type="button"
                      onClick={addRecipient}
                      className="flex items-center gap-1.5 text-sm font-semibold text-blue-600"
                    >
                      <IconPlus className="h-3.5 w-3.5" /> Add recipient
                    </button>
                  )}
                </>
              )}

              <BookingDeliverySection
                accountId={accountId}
                recipientAddress={recipients[0]?.address ?? null}
                firstMile={firstMile}
                onFirstMileChange={(v) => { setFirstMile(v); markDirty(); }}
                serviceType={serviceType}
                onServiceTypeChange={(v) => { setServiceType(v); markDirty(); }}
                pickupDate={pickupDate}
                onPickupDateChange={(v) => { setPickupDate(v); markDirty(); }}
              />

              <div>
                {confirmBlockReason && openSection === 0 && !section0Valid && (
                  <p className="mb-2 text-xs text-red-600">{confirmBlockReason}</p>
                )}
                <Button className="w-full sm:w-auto" disabled={!section0Valid} onClick={() => setOpenSection(1)}>
                  Continue
                </Button>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem
            open={openSection === 1}
            onOpenChange={(o) => setOpenSection(o ? 1 : openSection)}
            title={
              <div className="min-w-0 flex-1 text-left">
                <span>Item Details</span>
                {openSection !== 1 && <p className="mt-0.5 truncate text-xs font-normal text-gray-500">{itemDetailsSummary}</p>}
              </div>
            }
          >
            <div className="space-y-3">
              {!multi ? (
                <BookingItemDetailsSection
                  firstMile={firstMile}
                  itemDescription={sharedItemDetails.itemDescription}
                  onItemDescriptionChange={(v) => updateSharedItem({ itemDescription: v })}
                  pouchSize={sharedItemDetails.pouchSize}
                  onPouchSizeChange={(v) => updateSharedItem({ pouchSize: v })}
                  declaredValue={sharedItemDetails.declaredValue}
                  onDeclaredValueChange={(v) => updateSharedItem({ declaredValue: v })}
                  codEnabled={sharedItemDetails.merchandiseCod.enabled}
                  codAmount={sharedItemDetails.merchandiseCod.amount}
                  onCodChange={(enabled, amount) => updateSharedItem({ merchandiseCod: { enabled, amount } })}
                  itemProtectionTier={sharedItemDetails.itemProtectionTier}
                  onItemProtectionTierChange={(v) => updateSharedItem({ itemProtectionTier: v })}
                />
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shared item details</p>
                  <p className="text-xs text-gray-500 -mt-1">Applies to every recipient unless customized below.</p>
                  <BookingItemDetailsSection
                    firstMile={firstMile}
                    itemDescription={sharedItemDetails.itemDescription}
                    onItemDescriptionChange={(v) => updateSharedItem({ itemDescription: v })}
                    pouchSize={sharedItemDetails.pouchSize}
                    onPouchSizeChange={(v) => updateSharedItem({ pouchSize: v })}
                    declaredValue={sharedItemDetails.declaredValue}
                    onDeclaredValueChange={(v) => updateSharedItem({ declaredValue: v })}
                    codEnabled={sharedItemDetails.merchandiseCod.enabled}
                    codAmount={sharedItemDetails.merchandiseCod.amount}
                    onCodChange={(enabled, amount) => updateSharedItem({ merchandiseCod: { enabled, amount } })}
                    itemProtectionTier={sharedItemDetails.itemProtectionTier}
                    onItemProtectionTierChange={(v) => updateSharedItem({ itemProtectionTier: v })}
                  />

                  <p className="pt-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Per-recipient customization</p>
                  <div className="space-y-2">
                    {recipients.map((r, i) => {
                      const effective = effectiveItemFor(r);
                      const pouch = getBasicPouchSize(effective.pouchSize);
                      const isCustomizing = customizingId === r.id;
                      return (
                        <Card key={r.id}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{r.address?.name ?? `Recipient ${i + 1}`}</p>
                                <p className="text-xs text-gray-500 truncate">
                                  {effective.itemDescription || 'No description'} · {pouch.label}
                                  {r.itemOverride && <span className="ml-1 font-medium text-blue-600">· customized</span>}
                                </p>
                              </div>
                              <div className="flex flex-shrink-0 gap-1.5">
                                {r.itemOverride && (
                                  <Button size="sm" variant="outline" onClick={() => resetOverride(r.id)}>Reset</Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => setCustomizingId(isCustomizing ? null : r.id)}>
                                  {isCustomizing ? 'Close' : 'Customize'}
                                </Button>
                              </div>
                            </div>
                            {isCustomizing && (
                              <div className="mt-3 border-t border-gray-100 pt-3">
                                <BookingItemDetailsSection
                                  firstMile={firstMile}
                                  itemDescription={effective.itemDescription}
                                  onItemDescriptionChange={(v) => updateRecipientOverride(r.id, { itemDescription: v })}
                                  pouchSize={effective.pouchSize}
                                  onPouchSizeChange={(v) => updateRecipientOverride(r.id, { pouchSize: v })}
                                  declaredValue={effective.declaredValue}
                                  onDeclaredValueChange={(v) => updateRecipientOverride(r.id, { declaredValue: v })}
                                  codEnabled={effective.merchandiseCod.enabled}
                                  codAmount={effective.merchandiseCod.amount}
                                  onCodChange={(enabled, amount) => updateRecipientOverride(r.id, { merchandiseCod: { enabled, amount } })}
                                  itemProtectionTier={effective.itemProtectionTier}
                                  onItemProtectionTierChange={(v) => updateRecipientOverride(r.id, { itemProtectionTier: v })}
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}

              <div>
                {!section1Valid && (
                  <p className="mb-2 text-xs text-red-600">
                    {multi ? 'Finish item details for every recipient to continue.' : 'Finish item details to continue.'}
                  </p>
                )}
                <Button className="w-full sm:w-auto" disabled={!section1Valid} onClick={() => setOpenSection(2)}>
                  Continue
                </Button>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem
            open={openSection === 2}
            onOpenChange={(o) => setOpenSection(o ? 2 : openSection)}
            title={
              <div className="min-w-0 flex-1 text-left">
                <span>Review &amp; Payment</span>
                {openSection !== 2 && <p className="mt-0.5 truncate text-xs font-normal text-gray-500">{fmtPHP(grandTotal)} total</p>}
              </div>
            }
          >
            <div className="space-y-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <AddressRouteRail />
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pickup</p>
                      <AddressLine address={pickupAddress} placeholder="Not set" />
                      <div className="my-2 flex items-center gap-1.5">
                        <Badge variant="outline" className="inline-flex items-center gap-1.5 border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {firstMile === 'pickup' ? <IconTruckDelivery className="h-3 w-3" /> : <IconBuildingStore className="h-3 w-3" />}
                          {firstMile === 'pickup' ? 'Rider Pickup' : 'Drop-off'}
                        </Badge>
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {recipients.length > 1 ? `${recipients.length} recipients` : 'Recipient'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {perRecipient.map(({ recipient, totals }, i) => {
                const effective = effectiveItemFor(recipient);
                const pouch = getBasicPouchSize(effective.pouchSize);
                return (
                  <Card key={recipient.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {recipients.length > 1 ? `Shipment ${i + 1} of ${recipients.length}` : 'Shipment'}
                        </p>
                        <span className="text-sm font-semibold text-gray-900">{fmtPHP(totals.total)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-50">
                          <IconPackage className="h-5 w-5 text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <AddressLine address={recipient.address} placeholder="Recipient not set" />
                          <p className="mt-0.5 truncate text-xs text-gray-500">{effective.itemDescription || 'No description'} · {pouch.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Fees &amp; payment</h3>
                <BookingFeeBreakdownContent
                  draft={summaryDraft}
                  onChange={(patch) => {
                    if (patch.feePayer !== undefined) setFeePayer(patch.feePayer);
                    if (patch.senderPaymentMethod !== undefined) setSenderPaymentMethod(patch.senderPaymentMethod);
                    if (patch.voucherCode !== undefined) setVoucherCode(patch.voucherCode);
                    if (patch.voucherDiscount !== undefined) setVoucherDiscount(patch.voucherDiscount);
                    markDirty();
                  }}
                  totals={summaryTotals}
                  showFinalTotal
                />
              </div>
            </div>
          </AccordionItem>
        </CardContent>
      </Card>

      {multi && picker && (
        <BookingAddressPickerDrawer
          accountId={accountId}
          open
          onClose={() => setPicker(null)}
          title={picker.kind === 'pickup' ? 'Choose a pickup address' : 'Choose a recipient address'}
          customLabel={picker.kind === 'pickup' ? 'Pickup' : 'Recipient'}
          onSelect={(addr) => {
            if (picker.kind === 'pickup') {
              setPickupAddress(addr);
            } else if (picker.recipientId) {
              updateRecipientAddress(picker.recipientId, addr);
            }
            markDirty();
          }}
        />
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 px-4 pt-2.5 space-y-2 lg:left-auto lg:w-full"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">Total shipping charge{recipients.length > 1 ? ` · ${recipients.length} shipments` : ''}</p>
            <p className="text-base font-bold text-gray-900">{fmtPHP(grandTotal)}</p>
          </div>
          <Button className="flex-shrink-0" onClick={handleConfirm} disabled={!canConfirm}>
            Confirm Booking
          </Button>
        </div>
        {!canConfirm && confirmBlockReason && (
          <p className="mx-auto max-w-2xl text-xs text-red-600">{confirmBlockReason}</p>
        )}
      </div>
    </div>
  );
}
