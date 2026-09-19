import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  IconShoppingCart, IconTrash, IconBuildingStore, IconPackage, IconArrowLeft, IconTag, IconX, IconLoader2,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  useCartItems, removeFromCart, updateQty, getCartSeller,
  useAppliedPromoCode, setAppliedPromoCode,
} from '../lib/cartStore';
import { validatePromotionCode, type DiscountResult } from '../services/promotionsService';
import { getSaleInfo } from '../lib/salePricing';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * CartReview — /shop/:slug/cart. Shows the buyer's current cart items for a
 * storefront session, lets them adjust quantities (capped to real backend
 * stock when known), apply a promo code, then proceeds to checkout.
 *
 * Layout (Commerce Phase 4 cart redesign, spec §14): desktop is a two-column
 * grid — line items on the left, a sticky right-rail Order Summary (subtotal/
 * discount/total + promo code + checkout CTA) that stays in view while items
 * scroll past it. Mobile collapses to a single column with a compact sticky
 * bottom bar (total + CTA) and the promo code tucked into a collapsible
 * section, rather than shrinking the desktop rail.
 *
 * Promo code: validated against the REAL Commerce backend
 * (`promotionsService.validatePromotionCode` → `POST /api/commerce/promotions/validate`,
 * public/no-session). The discount shown is always whatever the server just
 * returned — never computed here — and is re-validated whenever the cart's
 * subtotal/contents change so a stale amount is never displayed. The applied
 * CODE (not the amount) persists across the /cart → /checkout navigation via
 * `cartStore`'s `appliedPromoCode`; actual redemption (the one write that
 * matters) happens at `CartCheckout`'s place-order step.
 */
export function CartReview() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const items = useCartItems();
  const seller = getCartSeller();
  const appliedCode = useAppliedPromoCode();

  const subtotal = items.reduce((sum, i) => sum + i.productSnapshot.unitPrice * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const productIds = useMemo(() => Array.from(new Set(items.map((i) => i.productId))), [items]);

  const [promoInput, setPromoInput] = useState('');
  const [discount, setDiscount] = useState<DiscountResult | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  // Re-validate the applied code whenever it's set/changes, or whenever the
  // cart's subtotal/contents change (qty edits, removals) — never trust a
  // discount computed against a cart that has since changed.
  useEffect(() => {
    if (!appliedCode || !seller || items.length === 0) {
      setDiscount(null);
      return;
    }
    let ignore = false;
    setValidating(true);
    validatePromotionCode(seller.slug, appliedCode, subtotal, productIds).then((res) => {
      if (ignore) return;
      if (res.ok) {
        setDiscount(res.data);
        setPromoError(null);
      } else {
        setDiscount(null);
        setPromoError(res.message);
      }
    }).finally(() => { if (!ignore) setValidating(false); });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCode, subtotal, productIds.join(','), seller?.slug, items.length]);

  const handleApplyPromo = async () => {
    const code = promoInput.trim();
    if (!code || !seller) return;
    setValidating(true);
    setPromoError(null);
    const res = await validatePromotionCode(seller.slug, code, subtotal, productIds);
    setValidating(false);
    if (res.ok) {
      setDiscount(res.data);
      setAppliedPromoCode(res.data.code);
      setPromoInput('');
    } else {
      setDiscount(null);
      setPromoError(res.message);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromoCode(null);
    setDiscount(null);
    setPromoError(null);
    setPromoInput('');
  };

  const total = Math.max(0, subtotal - (discount?.discountAmount ?? 0));

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-2 text-sm text-gray-500">
            <IconBuildingStore className="w-4 h-4" /> Secure checkout · Powered by GoGo Xpress
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <IconShoppingCart className="w-8 h-8 text-gray-300" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Your cart is empty</h1>
            <p className="text-sm text-gray-500 mt-1">Browse the store and add products to continue.</p>
            <Link to={`/shop/${slug}`} className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800">
              ← Back to store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const promoSection = (
    <div className="space-y-2">
      {discount ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-sm text-green-800 min-w-0">
            <IconTag className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium truncate">{discount.code}</span>
            <span className="text-xs text-green-700 flex-shrink-0">applied</span>
          </div>
          <button type="button" onClick={handleRemovePromo} className="text-green-700 hover:text-green-900 flex-shrink-0" aria-label="Remove promo code">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo(); } }}
            placeholder="Promo code"
            className="uppercase"
          />
          <Button size="sm" variant="outline" disabled={!promoInput.trim() || validating} onClick={handleApplyPromo}>
            {validating ? <IconLoader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
          </Button>
        </div>
      )}
      {promoError && <p className="text-xs text-red-600">{promoError}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-2 text-sm text-gray-500">
          <IconBuildingStore className="w-4 h-4" /> Secure checkout · Powered by GoGo Xpress
        </div>
      </header>

      {/* Bottom padding on mobile clears the fixed bottom bar. */}
      <main className="max-w-5xl mx-auto px-6 py-8 pb-28 lg:pb-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
        {/* Line items */}
        <div className="space-y-6 min-w-0">
          <div className="flex items-center gap-3">
            <Link to={`/shop/${slug}`}>
              <Button variant="ghost" size="sm">
                <IconArrowLeft className="w-4 h-4 mr-1.5" /> Continue shopping
              </Button>
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Your cart ({itemCount} item{itemCount === 1 ? '' : 's'})</h1>

          <div className="space-y-3">
            {items.map((item) => {
              const cover = item.productSnapshot.images[0];
              const { stockQuantity, unlimitedStock, compareAtPrice, sku } = item.productSnapshot;
              const sale = getSaleInfo(item.productSnapshot.unitPrice, compareAtPrice);
              const atMax = !unlimitedStock && stockQuantity != null && item.quantity >= stockQuantity;
              const lowStockHint = !unlimitedStock && stockQuantity != null && stockQuantity <= 5;
              return (
                <Card key={`${item.productId}-${item.variantId ?? 'base'}`}>
                  <CardContent className="p-4">
                    {/* Row 1: image + details. Row 2 (below, full width): qty
                        controls / line total / remove — kept on its own row
                        so narrow (mobile) widths never squeeze the stepper
                        and price into the details column. */}
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {cover
                          ? <img src={cover} alt={item.productSnapshot.name} className="w-full h-full object-cover" />
                          : <IconPackage className="w-6 h-6 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{item.productSnapshot.category}</p>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{item.productSnapshot.name}</p>
                        {item.productSnapshot.variantLabel && (
                          <p className="text-xs text-gray-500">{item.productSnapshot.variantLabel}</p>
                        )}
                        {sku && <p className="text-xs text-gray-400">SKU {sku}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{peso(item.productSnapshot.unitPrice)}</p>
                          {sale && (
                            <>
                              <p className="text-xs text-gray-400 line-through">{peso(compareAtPrice!)}</p>
                              <Badge variant="danger">{sale.percentOff}% OFF</Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateQty(item.productId, item.quantity - 1, item.variantId)}
                          className="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none flex-shrink-0"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          type="button"
                          disabled={atMax}
                          onClick={() => updateQty(item.productId, item.quantity + 1, item.variantId)}
                          className="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex-shrink-0"
                        >
                          +
                        </button>
                        {lowStockHint && (
                          <p className="text-[11px] text-amber-600 ml-1.5 whitespace-nowrap">
                            {atMax ? `Only ${stockQuantity} left` : `${stockQuantity} left`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900 text-right">
                          {peso(item.productSnapshot.unitPrice * item.quantity)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.productId, item.variantId)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Remove item"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Mobile-only: promo code + summary breakdown live in-flow above the
              sticky bottom bar (the desktop rail owns this on lg+). */}
          <div className="lg:hidden space-y-4">
            <Card>
              <CardContent className="p-4">
                <details>
                  <summary className="text-sm font-medium text-gray-900 cursor-pointer select-none">
                    {discount ? 'Promo code' : 'Have a promo code?'}
                  </summary>
                  <div className="mt-3">{promoSection}</div>
                </details>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})</span>
                  <span className="font-medium text-gray-900">{peso(subtotal)}</span>
                </div>
                {discount && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount ({discount.code})</span>
                    <span className="font-medium">−{peso(discount.discountAmount)}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-1.5 flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900">{peso(total)}</span>
                </div>
                <p className="text-xs text-gray-400 pt-1">Shipping and COD fees are determined by the seller at booking.</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Desktop: sticky right-rail order summary. */}
        <div className="hidden lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Order summary</h2>

              {promoSection}

              <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})</span>
                  <span className="font-medium text-gray-900">{peso(subtotal)}</span>
                </div>
                {discount && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount ({discount.code})</span>
                    <span className="font-medium">−{peso(discount.discountAmount)}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900">{peso(total)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">Shipping and COD fees are determined by the seller at booking.</p>
              <Button className="w-full" onClick={() => navigate('/checkout')}>
                Proceed to Checkout · {peso(total)}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Mobile-only: compact sticky bottom bar. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3 z-40">
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-base font-bold text-gray-900">{peso(total)}</p>
        </div>
        <Button onClick={() => navigate('/checkout')}>
          Checkout
        </Button>
      </div>
    </div>
  );
}
