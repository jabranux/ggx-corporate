import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  IconPackage, IconCash, IconBuildingStore, IconClock,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { LocationCascadeFields } from '../components/LocationCascadeFields';
import { CheckoutDeliveryOptions } from '../components/CheckoutDeliveryOptions';
import { CheckoutPaymentOptions } from '../components/CheckoutPaymentOptions';
import { productCover } from '../services/inventoryService';
import { getPublicProductById, type PublicProductDetail } from '../services/publicStorefrontService';
import { getFeatureStateSync } from '../services/featureEnablementService';
import { placeStorefrontOrder } from '../services/storefrontOrdersService';
import { classifyRegion, estimateDeliveryFee, isMetroManila } from '../lib/checkoutEstimates';
import type { DeliveryServiceType } from '../services/transactionService';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface OrderForm {
  name: string; mobile: string; street: string;
  province: string; city: string; barangay: string; qty: string;
}

const blank: OrderForm = { name: '', mobile: '', street: '', province: '', city: '', barangay: '', qty: '1' };

const DELIVERY_TITLE: Record<DeliveryServiceType, string> = {
  standard: 'Standard delivery',
  same_day: 'Same-day delivery',
  on_demand: 'On-demand delivery',
};

/**
 * Public buyer checkout at /buy/:productId — opened from a product's shareable
 * link or a storefront card. The buyer views the product, enters recipient +
 * delivery details, and places a COD-only order. Demo flow: the order is
 * confirmed in-page (no real payment integration; COD only).
 */
export function BuyerCheckout() {
  const { productId } = useParams();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<PublicProductDetail | null>(null);
  const [form, setForm] = useState<OrderForm>(blank);
  const [activeImage, setActiveImage] = useState<string | undefined>();
  const [placed, setPlaced] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  // Seller scope drives delivery-option availability (On-Demand add-on gating)
  // and order attribution. Resolved from the product's owning scope.
  const scopeId = product?.accountId;
  const [storeMeta, setStoreMeta] = useState<{ name: string; slug?: string; sameDay: boolean }>({ name: 'Store', sameDay: false });
  const odEnabled = scopeId ? getFeatureStateSync('on_demand', scopeId).enabled : false;
  const deliveryOptions: DeliveryServiceType[] = [
    'standard',
    ...(storeMeta.sameDay ? (['same_day'] as DeliveryServiceType[]) : []),
    ...(odEnabled ? (['on_demand'] as DeliveryServiceType[]) : []),
  ];
  const [deliveryOption, setDeliveryOption] = useState<DeliveryServiceType>('standard');

  useEffect(() => {
    let active = true;
    // Public route, deliberately no-session (this link is meant for a
    // signed-out buyer) — see `getPublicProductById`'s docblock for why it
    // doesn't require the seller's storefront to be published. Store
    // name/slug/same-day personalization isn't available from a bare
    // product id (no public by-account-id storefront lookup exists), so
    // this legacy single-product checkout keeps the generic "Store" default
    // for those — only the product itself and On-Demand's own feature-flag
    // check (keyed off `accountId`, not the storefront) are real here.
    getPublicProductById(productId ?? '')
      .then((p) => {
        if (!active) return;
        setProduct(p);
        setActiveImage(p ? productCover(p) : undefined);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  // Keep selection valid if options change once seller context resolves.
  useEffect(() => {
    if (!deliveryOptions.includes(deliveryOption)) setDeliveryOption('standard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odEnabled, storeMeta.sameDay]);

  // Same-day / On-demand are Metro-Manila-only. Fall back to Standard when the
  // address isn't Metro Manila so totals + the placed order stay consistent.
  const metroOnly = isMetroManila(form.province);
  useEffect(() => {
    if (!metroOnly && (deliveryOption === 'same_day' || deliveryOption === 'on_demand')) {
      setDeliveryOption('standard');
    }
  }, [metroOnly, deliveryOption]);

  const set = <K extends keyof OrderForm>(k: K, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const qty = Math.max(1, Number(form.qty) || 1);
  const subtotal = product ? product.unitPrice * qty : 0;
  const region = classifyRegion(form.province);
  const feeKnown = region !== 'unknown';
  // Buyer always pays the delivery fee on COD orders (mock default). Who covers
  // the fee is seller/store configuration, not a buyer-facing choice.
  const deliveryFee = estimateDeliveryFee(deliveryOption, region);
  const collectTotal = subtotal + (feeKnown ? deliveryFee : 0);
  const outOfStock = !!product && (product.status !== 'active' || (!product.unlimitedStock && product.stockQuantity <= 0));
  const canOrder = useMemo(
    () => !outOfStock && form.name.trim() && form.mobile.trim() && form.street.trim()
      && form.province.trim() && form.city.trim() && form.barangay.trim(),
    [outOfStock, form],
  );

  const handlePlace = async () => {
    if (!canOrder || !product || !scopeId) return;
    const order = await placeStorefrontOrder({
      scopeAccountId: scopeId,
      storeName: storeMeta.name,
      storeSlug: storeMeta.slug,
      channel: 'product_checkout',
      serviceType: deliveryOption,
      buyer: {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        address: [form.street, form.barangay, form.city, form.province].map((s) => s.trim()).filter(Boolean).join(', '),
        destination: [form.city, form.province].map((s) => s.trim()).filter(Boolean).join(', '),
      },
      items: [{ productId: product.id, name: product.name, quantity: qty, unitPrice: product.unitPrice }],
      codTotal: collectTotal,
    });
    setPlacedOrderId(order.id);
    setPlaced(true);
  };

  if (loading) return null;

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <IconPackage className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Product not available</h1>
          <p className="text-sm text-gray-500 mt-1">This checkout link is invalid or the product was removed.</p>
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
              Thanks, {form.name}. Your order for <span className="font-medium">{qty} × {product.name}</span> has been sent to the seller.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
              <IconClock className="w-3.5 h-3.5" />
              Awaiting seller acceptance
            </div>
            <div className="mt-4 rounded-lg border border-gray-200 p-4 text-sm text-left space-y-1.5">
              {placedOrderId && <Row label="Order #">{placedOrderId}</Row>}
              <Row label="Delivery">{DELIVERY_TITLE[deliveryOption]}</Row>
              <Row label="Deliver to">{form.name} · {form.mobile}</Row>
              <Row label="Address">{[form.street, form.barangay, form.city, form.province].filter(Boolean).join(', ')}</Row>
              <Row label="Subtotal">{peso(subtotal)}</Row>
              <Row label="Delivery fee">{peso(deliveryFee)}</Row>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold">
                <span className="text-gray-900">Total to collect (COD)</span><span className="text-gray-900">{peso(collectTotal)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              The seller will review and accept your order, then book it for delivery via GoGo Xpress. Pay cash when your parcel arrives.
            </p>
            {placedOrderId && (
              <Link
                to={`/track/${placedOrderId}`}
                className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Track this order
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const cover = activeImage ?? productCover(product);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-2 text-sm text-gray-500">
          <IconBuildingStore className="w-4 h-4" /> Secure checkout · Powered by GoGo Xpress
        </div>
      </header>

      {/* Desktop: ~65% details / ~35% summary. Mobile: single column. */}
      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-6 lg:gap-8 items-start">
        {/* Details (65%) */}
        <div className="space-y-6">
          {/* Compact product header */}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {cover
                  ? <img src={cover} alt={product.name} className="w-full h-full object-cover" />
                  : <IconPackage className="w-8 h-8 text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">{product.category}</p>
                <h1 className="text-lg font-bold text-gray-900 leading-tight truncate">{product.name}</h1>
                <p className="text-base font-bold text-gray-900 mt-0.5">{peso(product.unitPrice)}</p>
                {outOfStock && <Badge variant="danger" className="mt-1">Out of stock</Badge>}
              </div>
            </CardContent>
          </Card>

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
              <div className="w-28">
                <Field label="Quantity">
                  <Input
                    type="number" min={1}
                    max={product.unlimitedStock ? undefined : (product.stockQuantity || undefined)}
                    value={form.qty}
                    onChange={(e) => set('qty', e.target.value)}
                  />
                </Field>
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {cover ? <img src={cover} alt={product.name} className="w-full h-full object-cover" /> : <IconPackage className="w-5 h-5 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 leading-snug truncate">{product.name}</p>
                  <p className="text-xs text-gray-500">Qty {qty}</p>
                </div>
                <p className="text-sm font-medium text-gray-900 flex-shrink-0">{peso(subtotal)}</p>
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Item subtotal</span>
                  <span className="font-medium text-gray-900">{peso(subtotal)}</span>
                </div>
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
              <Button className="w-full" disabled={!canOrder} onClick={handlePlace}>
                <IconCash className="w-4 h-4" /> Place COD order
              </Button>
              {outOfStock && (
                <p className="text-xs text-red-600 text-center">This product is currently unavailable.</p>
              )}
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
