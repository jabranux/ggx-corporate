import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  IconBuildingStore, IconCash, IconClock, IconPackage, IconTag, IconX,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { LocationCascadeFields } from '../components/LocationCascadeFields';
import { CheckoutDeliveryOptions } from '../components/CheckoutDeliveryOptions';
import { CheckoutPaymentOptions } from '../components/CheckoutPaymentOptions';
import {
  useCartItems, clearCart, getCartSeller,
  useAppliedPromoCode, setAppliedPromoCode,
} from '../lib/cartStore';
import { getFeatureStateSync } from '../services/featureEnablementService';
import { getPublicStore } from '../services/publicStorefrontService';
import { placeStorefrontOrder } from '../services/storefrontOrdersService';
import { validatePromotionCode, redeemPromotionCode, type DiscountResult } from '../services/promotionsService';
import { classifyRegion, estimateDeliveryFee, isMetroManila } from '../lib/checkoutEstimates';
import { getSaleInfo } from '../lib/salePricing';
import type { DeliveryServiceType } from '../services/transactionService';

const DELIVERY_TITLE: Record<DeliveryServiceType, string> = {
  standard: 'Standard delivery',
  same_day: 'Same-day delivery',
  on_demand: 'On-demand delivery',
};

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CheckoutForm {
  name: string; mobile: string; street: string;
  province: string; city: string; barangay: string;
}

const blank: CheckoutForm = {
  name: '', mobile: '', street: '', province: '', city: '', barangay: '',
};

/**
 * CartCheckout — /checkout. Multi-product COD checkout for a storefront cart.
 * Cart is read from the session-only cartStore. On place, captures totals before
 * clearing so the confirmation screen has correct values.
 */
export function CartCheckout() {
  const navigate = useNavigate();
  const items = useCartItems();
  const [form, setForm] = useState<CheckoutForm>(blank);
  const [placed, setPlaced] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState({
    subtotal: 0, fee: 0, discount: 0, promoCode: undefined as string | undefined, total: 0, itemCount: 0, service: 'standard' as DeliveryServiceType,
  });

  // Promo code applied on the cart page (CartReview owns entry/editing — this
  // page only displays + redeems it). Re-validated on mount/cart-change so a
  // stale discount is never shown; the actual authoritative amount is always
  // whatever the server returns, both here (display) and at redeem time.
  const appliedPromoCode = useAppliedPromoCode();
  const [discount, setDiscount] = useState<DiscountResult | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  // Seller context (set while browsing /shop/:slug) gates delivery options and
  // attributes the placed order.
  const seller = getCartSeller();
  const odEnabled = seller ? getFeatureStateSync('on_demand', seller.scopeId).enabled : false;
  const [sameDayOffered, setSameDayOffered] = useState(false);
  useEffect(() => {
    let active = true;
    if (!seller) { setSameDayOffered(false); return; }
    // Public route — checkout is reached by anonymous buyers with no
    // merchant session, so this must never call the authenticated
    // `storefrontService.getStorefrontProfile` (which would 401 for a
    // signed-out buyer, or return a signed-IN manager's own scoped profile
    // instead of the actual seller's, if one happens to be logged in).
    getPublicStore(seller.slug).then((p) => {
      if (active) setSameDayOffered(!!p?.deliveryOptions.includes('same_day'));
    });
    return () => { active = false; };
  }, [seller?.scopeId, seller?.slug]);

  const deliveryOptions: DeliveryServiceType[] = [
    'standard',
    ...(sameDayOffered ? (['same_day'] as DeliveryServiceType[]) : []),
    ...(odEnabled ? (['on_demand'] as DeliveryServiceType[]) : []),
  ];
  const [deliveryOption, setDeliveryOption] = useState<DeliveryServiceType>('standard');
  useEffect(() => {
    if (!deliveryOptions.includes(deliveryOption)) setDeliveryOption('standard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odEnabled, sameDayOffered]);

  // Same-day / On-demand are Metro-Manila-only. Fall back to Standard when the
  // address isn't Metro Manila so totals + the placed order stay consistent.
  const metroOnly = isMetroManila(form.province);
  useEffect(() => {
    if (!metroOnly && (deliveryOption === 'same_day' || deliveryOption === 'on_demand')) {
      setDeliveryOption('standard');
    }
  }, [metroOnly, deliveryOption]);

  const set = <K extends keyof CheckoutForm>(k: K, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.productSnapshot.unitPrice * i.quantity, 0),
    [items],
  );
  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );
  const productIds = useMemo(() => Array.from(new Set(items.map((i) => i.productId))), [items]);

  // Idempotency key for `redeemPromotionCode` — must be reused across repeat
  // clicks of the SAME checkout attempt (e.g. after a network error whose
  // outcome is unknown: the server may have already committed the
  // redemption), so a retry can never double-redeem a limited-use code. Only
  // rotates when the cart contents or applied promo actually change, i.e.
  // this has genuinely become a different attempt.
  const idempotencyKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const cartSignature = useMemo(
    () => `${appliedPromoCode ?? ''}|${items.map((i) => `${i.productId}:${i.variantId ?? ''}:${i.quantity}`).join(',')}`,
    [appliedPromoCode, items],
  );
  function getIdempotencyKey(): string {
    if (idempotencyKeyRef.current?.signature !== cartSignature) {
      idempotencyKeyRef.current = { signature: cartSignature, key: crypto.randomUUID() };
    }
    return idempotencyKeyRef.current.key;
  }

  const region = classifyRegion(form.province);
  const feeKnown = region !== 'unknown';
  // Buyer always pays the delivery fee on COD orders (mock default). Who covers
  // the fee is seller/store configuration, not a buyer-facing choice.
  const deliveryFee = estimateDeliveryFee(deliveryOption, region);
  const discountAmount = discount?.discountAmount ?? 0;
  const collectTotal = Math.max(0, subtotal - discountAmount) + (feeKnown ? deliveryFee : 0);

  // Refresh the applied promo's discount whenever it's set or the cart
  // changes (never display an amount computed against a stale subtotal).
  useEffect(() => {
    if (!appliedPromoCode || !seller || items.length === 0) {
      setDiscount(null);
      return;
    }
    let ignore = false;
    validatePromotionCode(seller.slug, appliedPromoCode, subtotal, productIds).then((res) => {
      if (ignore) return;
      if (res.ok) {
        setDiscount(res.data);
        setPromoError(null);
      } else {
        setDiscount(null);
        setPromoError(res.message);
      }
    });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedPromoCode, subtotal, productIds.join(','), seller?.slug, items.length]);

  // Apply/replace a promo code directly from Checkout — same server-authoritative
  // `validatePromotionCode` call CartReview uses; this only sets which code is
  // APPLIED (persisted in cartStore), never redeems it. Redemption still only
  // happens once, at `handlePlace` below, so visiting/editing Checkout can
  // never itself consume a promo's usage.
  //
  // `orderPlacedRef` guards against a real race Codex flagged: order placement
  // is blocked while `validatingPromo` is true (see `canOrder`), but a promo
  // apply already in flight when placement STARTS can still resolve after
  // `handlePlace` has cleared the cart/applied-code — without this guard, that
  // late resolution would silently reapply a promo code onto an already-placed,
  // already-cleared order.
  const orderPlacedRef = useRef(false);
  const handleApplyPromo = async () => {
    const code = promoInput.trim();
    if (!code || !seller || placing) return;
    setValidatingPromo(true);
    setPromoError(null);
    const res = await validatePromotionCode(seller.slug, code, subtotal, productIds);
    setValidatingPromo(false);
    if (orderPlacedRef.current) return; // order placed while this was in flight — its result is moot
    if (res.ok) {
      setDiscount(res.data);
      setAppliedPromoCode(res.data.code);
      setPromoInput('');
    } else {
      setDiscount(null);
      setPromoError(res.message);
    }
  };

  const canOrder = !!(
    items.length > 0 &&
    form.name.trim() && form.mobile.trim() && form.street.trim() &&
    form.province.trim() && form.city.trim() && form.barangay.trim() &&
    !placing && !validatingPromo
  );

  const handlePlace = async () => {
    // Seller context is required to attribute + place the order. Without it we
    // must not fabricate a confirmation (see the "Store session expired" guard).
    if (!canOrder || !seller) return;
    orderPlacedRef.current = true;
    setPlacing(true);
    setPlaceError(null);

    // Redeem the promo (real, backend-authoritative) BEFORE placing the mock
    // order — if this fails (e.g. the usage limit was reached by a concurrent
    // checkout since the last validate), the mock order must NOT be placed,
    // so the two never disagree. The idempotency key is stable for this exact
    // cart+promo attempt (see `getIdempotencyKey`) — a retry after an
    // ambiguous failure (e.g. the response was lost after the server already
    // committed the redemption) replays the SAME key instead of consuming a
    // second unit of a limited-use code; only a genuinely different attempt
    // (cart or promo changed) gets a new one.
    let redeemedAmount = 0;
    let redeemedCode: string | undefined;
    if (appliedPromoCode) {
      const idempotencyKey = getIdempotencyKey();
      const res = await redeemPromotionCode(seller.slug, appliedPromoCode, subtotal, productIds, idempotencyKey);
      if (!res.ok) {
        orderPlacedRef.current = false; // placement did not go through — a promo apply may resume
        setPlaceError(`Your promo code could not be applied: ${res.message} Please remove it or try again.`);
        setPlacing(false);
        return;
      }
      redeemedAmount = res.data.discountAmount;
      redeemedCode = res.data.code;
    }

    const total = Math.max(0, subtotal - redeemedAmount) + (feeKnown ? deliveryFee : 0);
    const order = await placeStorefrontOrder({
      scopeAccountId: seller.scopeId,
      storeName: seller.storeName,
      storeSlug: seller.slug,
      channel: 'storefront_checkout',
      serviceType: deliveryOption,
      buyer: {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        address: [form.street, form.barangay, form.city, form.province].map((s) => s.trim()).filter(Boolean).join(', '),
        destination: [form.city, form.province].map((s) => s.trim()).filter(Boolean).join(', '),
      },
      items: items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        variantLabel: i.productSnapshot.variantLabel,
        sku: i.productSnapshot.sku,
        name: i.productSnapshot.name,
        quantity: i.quantity,
        unitPrice: i.productSnapshot.unitPrice,
      })),
      codTotal: total,
      promoCode: redeemedCode,
      discountAmount: redeemedAmount || undefined,
    });
    setPlacedOrderId(order.id);
    setSnapshot({
      subtotal, fee: feeKnown ? deliveryFee : 0, discount: redeemedAmount, promoCode: redeemedCode,
      total, itemCount, service: deliveryOption,
    });
    clearCart();
    setAppliedPromoCode(null);
    setPlacing(false);
    setPlaced(true);
  };

  // No seller context (e.g. /checkout opened directly without coming from a
  // store) → can't attribute or place an order. Show a clear recoverable state
  // instead of a fabricated confirmation. `placed` is unreachable without a
  // seller, so this never hides a real confirmation.
  if (!placed && !seller) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <IconBuildingStore className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Store session expired</h1>
          <p className="text-sm text-gray-500 mt-1">
            Please return to the store and try checking out again.
          </p>
          <button type="button" onClick={() => navigate(-1)} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !placed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center">
          <p className="text-sm text-gray-500">Your cart is empty.</p>
          <button type="button" onClick={() => navigate(-1)} className="mt-3 text-sm text-blue-600 hover:text-blue-800">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <IconClock className="w-9 h-9 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Order placed!</h1>
            <p className="text-sm text-gray-600 mt-2">
              Thanks, {form.name}. Your order of {snapshot.itemCount} item{snapshot.itemCount === 1 ? '' : 's'} has been sent to the seller.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
              <IconClock className="w-3.5 h-3.5" />
              Awaiting seller acceptance
            </div>
            <div className="mt-4 rounded-lg border border-gray-200 p-4 text-sm text-left space-y-1.5">
              {placedOrderId && <Row label="Order #">{placedOrderId}</Row>}
              <Row label="Delivery">{DELIVERY_TITLE[snapshot.service]}</Row>
              <Row label="Deliver to">{form.name} · {form.mobile}</Row>
              <Row label="Address">{[form.street, form.barangay, form.city, form.province].filter(Boolean).join(', ')}</Row>
              <Row label="Subtotal">{peso(snapshot.subtotal)}</Row>
              {snapshot.discount > 0 && (
                <Row label={`Discount${snapshot.promoCode ? ` (${snapshot.promoCode})` : ''}`}>
                  <span className="text-green-700">−{peso(snapshot.discount)}</span>
                </Row>
              )}
              <Row label="Delivery fee">{peso(snapshot.fee)}</Row>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold">
                <span className="text-gray-900">Total to collect (COD)</span>
                <span className="text-gray-900">{peso(snapshot.total)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              The seller will review and accept your order, then book it for delivery via GoGo Xpress. Pay cash when your parcel arrives.
            </p>
            {placedOrderId && (
              <Link to={`/track/${placedOrderId}`} className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800">
                Track this order
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-2 text-sm text-gray-500">
          <IconBuildingStore className="w-4 h-4" /> Secure checkout · Powered by GoGo Xpress
        </div>
      </header>

      {/* Desktop: ~65% form / ~35% summary. Mobile: single column. */}
      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-6 lg:gap-8 items-start">
        {/* Delivery details + payment (65%) */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Delivery details</h2>
              <Field label="Full name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Recipient name" /></Field>
              <Field label="Mobile number"><Input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="+63 9xx xxx xxxx" /></Field>
              <Field label="Street address"><Input value={form.street} onChange={(e) => set('street', e.target.value)} placeholder="House/unit, street" /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LocationCascadeFields
                  province={form.province}
                  city={form.city}
                  barangay={form.barangay}
                  onChange={(p, c, b) => setForm((prev) => ({ ...prev, province: p, city: c, barangay: b }))}
                />
              </div>
            </CardContent>
          </Card>

          {deliveryOptions.length > 1 && (
            <Card>
              <CardContent className="p-6">
                <CheckoutDeliveryOptions
                  options={deliveryOptions}
                  value={deliveryOption}
                  onChange={setDeliveryOption}
                  region={region}
                  metroOnly={metroOnly}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <CheckoutPaymentOptions />
            </CardContent>
          </Card>
        </div>

        {/* Order summary (35%) */}
        <div className="lg:sticky lg:top-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Order summary</h2>
              <div className="space-y-3">
                {items.map((item) => {
                  const cover = item.productSnapshot.images[0];
                  const sale = getSaleInfo(item.productSnapshot.unitPrice, item.productSnapshot.compareAtPrice);
                  return (
                    <div key={`${item.productId}-${item.variantId ?? 'base'}`} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {cover
                          ? <img src={cover} alt={item.productSnapshot.name} className="w-full h-full object-cover" />
                          : <IconPackage className="w-5 h-5 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 leading-snug truncate">{item.productSnapshot.name}</p>
                        {item.productSnapshot.variantLabel && (
                          <p className="text-xs text-gray-400 truncate">{item.productSnapshot.variantLabel}</p>
                        )}
                        <p className="text-xs text-gray-500">Qty {item.quantity}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {peso(item.productSnapshot.unitPrice * item.quantity)}
                        </p>
                        {sale && (
                          <p className="text-xs text-gray-400 line-through">
                            {peso(item.productSnapshot.compareAtPrice! * item.quantity)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {appliedPromoCode ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-sm text-green-800 min-w-0">
                    <IconTag className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium truncate">{appliedPromoCode}</span>
                    {discount && <span className="text-xs text-green-700 flex-shrink-0">applied</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAppliedPromoCode(null)}
                    className="text-green-700 hover:text-green-900 flex-shrink-0"
                    aria-label="Remove promo code"
                  >
                    <IconX className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                // A promo applied on the Cart page already carries into this
                // component via `appliedPromoCode` (persisted in cartStore);
                // this input is only for applying one for the first time, or
                // re-applying a different one after removing the last, right
                // from Checkout — same validate-only call CartReview uses.
                <div className="flex items-center gap-2">
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo(); } }}
                    placeholder="Promo code"
                    className="uppercase"
                  />
                  <Button size="sm" variant="outline" disabled={!promoInput.trim() || validatingPromo || placing} onClick={handleApplyPromo}>
                    {validatingPromo ? 'Applying…' : 'Apply'}
                  </Button>
                </div>
              )}
              {promoError && <p className="text-xs text-red-600">{promoError}</p>}

              <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Item subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})</span>
                  <span className="font-medium text-gray-900">{peso(subtotal)}</span>
                </div>
                {discount && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount ({discount.code})</span>
                    <span className="font-medium">−{peso(discount.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery fee</span>
                  <span className="font-medium text-gray-900">
                    {feeKnown ? peso(deliveryFee) : <span className="text-gray-400 font-normal text-xs">Calculated after address</span>}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-900">Total to collect (COD)</span>
                  <span className="font-bold text-gray-900">{peso(collectTotal)}</span>
                </div>
                <p className="text-[11px] text-gray-400">Delivery fee is an estimate; final fees are confirmed when the seller books delivery.</p>
              </div>

              {placeError && <Alert variant="destructive">{placeError}</Alert>}

              <Button className="w-full" disabled={!canOrder} onClick={handlePlace}>
                <IconCash className="w-4 h-4" /> {placing ? 'Placing order…' : `Place COD order · ${peso(collectTotal)}`}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                Your order is sent to the seller to accept before it&apos;s booked for delivery.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 text-right">{children}</span>
    </div>
  );
}
