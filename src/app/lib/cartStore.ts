import { useEffect, useState } from 'react';
import { loadState, saveState } from './storage';

export interface CartItem {
  productId: string;
  /**
   * Selected variant id, when the product has options (Color/Size/etc.).
   * Undefined for a base/non-variant product. Additive field (Commerce
   * Phase 3) — a line is uniquely identified by `productId` + `variantId`,
   * not `productId` alone, so two different variants of the same product
   * can sit in the cart as separate lines instead of merging quantities.
   */
  variantId?: string;
  quantity: number;
  productSnapshot: {
    name: string;
    unitPrice: number;
    images: string[];
    category: string;
    /**
     * Human-readable variant label (e.g. "Black / M"), when this line is a
     * specific variant — additive (Commerce Phase 3). CartReview shows it
     * next to the product name when present; older/non-variant lines simply
     * don't have it.
     */
    variantLabel?: string;
    /** Variant (or base product) SKU — additive (Commerce Phase 3), not yet
     * surfaced by CartReview/CartCheckout; carried through for the upcoming
     * cart-redesign phase to display. */
    sku?: string;
    /** Compare-at price, when the product/variant has one — additive
     * (Commerce Phase 3), not yet rendered by CartReview/CartCheckout (no
     * strikethrough-price UI exists there yet); carried through for the
     * cart-redesign phase. */
    compareAtPrice?: number | null;
    /**
     * Stock available for THIS line's exact product/variant at the moment it
     * was added to the cart — additive (Commerce Phase 4 cart redesign).
     * Used only to cap the cart's own quantity stepper, never to compute a
     * price/discount. Undefined on older/non-backend lines, which the cart
     * treats as uncapped for backward compatibility.
     */
    stockQuantity?: number;
    unlimitedStock?: boolean;
  };
}

/** A cart line's identity — `productId` alone is NOT unique once variants
 * are involved (see `CartItem.variantId`). */
function lineKey(item: Pick<CartItem, 'productId' | 'variantId'>): string {
  return `${item.productId}::${item.variantId ?? ''}`;
}

/** Seller context for the active cart (which store the items came from). */
export interface CartSeller {
  scopeId: string;
  storeName: string;
  slug: string;
}

type Listener = () => void;

let cart: CartItem[] = [];
// Seller context persists (survives the /shop → /checkout navigation + reload) so
// the checkout can gate delivery options and attribute the placed order.
let seller: CartSeller | null = loadState<CartSeller | null>('cartSeller', null);
const listeners = new Set<Listener>();

/** Record which store the current cart belongs to (set when browsing /shop/:slug). */
export function setCartSeller(next: CartSeller | null): void {
  seller = next;
  saveState('cartSeller', seller);
}

export function getCartSeller(): CartSeller | null {
  return seller;
}

/**
 * Applied promo code, persisted (like `seller`) so it survives the
 * /shop/:slug/cart → /checkout navigation. Deliberately just the CODE
 * string — never a cached discount amount. The discount itself is always
 * recomputed by calling `validatePromotionCode` fresh wherever it's
 * displayed (Commerce Phase 4 — "never trust a browser-calculated
 * discount"), so a stale cached amount can never be shown after the cart
 * changes. Cleared automatically after a completed checkout.
 */
let appliedPromoCode: string | null = loadState<string | null>('cartAppliedPromoCode', null);

export function setAppliedPromoCode(code: string | null): void {
  appliedPromoCode = code;
  saveState('cartAppliedPromoCode', appliedPromoCode);
  notify();
}

export function getAppliedPromoCode(): string | null {
  return appliedPromoCode;
}

/** Reactive read of the applied promo code — re-renders when
 * `setAppliedPromoCode` is called, same subscription mechanism as
 * `useCartItems`. */
export function useAppliedPromoCode(): string | null {
  const [code, setCode] = useState<string | null>(() => appliedPromoCode);
  useEffect(() => {
    const listener: Listener = () => setCode(appliedPromoCode);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return code;
}

function notify() {
  listeners.forEach((l) => l());
}

/** The max quantity a line may hold — `null` means uncapped (unlimited
 * stock, or an older/non-backend line with no stock info at all). Never used
 * for pricing, only to keep the cart from letting a buyer add more of a
 * product/variant than the seller actually has. */
function stockCap(snapshot: CartItem['productSnapshot']): number | null {
  if (snapshot.unlimitedStock) return null;
  return typeof snapshot.stockQuantity === 'number' ? snapshot.stockQuantity : null;
}

export function addToCart(item: CartItem): void {
  const key = lineKey(item);
  const existing = cart.find((i) => lineKey(i) === key);
  if (existing) {
    const cap = stockCap(existing.productSnapshot);
    cart = cart.map((i) =>
      lineKey(i) === key
        ? { ...i, quantity: cap != null ? Math.min(i.quantity + item.quantity, cap) : i.quantity + item.quantity }
        : i
    );
  } else {
    const cap = stockCap(item.productSnapshot);
    cart = [...cart, { ...item, quantity: cap != null ? Math.min(item.quantity, cap) : item.quantity }];
  }
  notify();
}

/** `variantId` is optional and defaults to the base-product line (backward
 * compatible with every pre-Phase-3 call site). Pass it whenever the line
 * being removed is a specific variant, or a same-product different-variant
 * line would be removed instead. */
export function removeFromCart(productId: string, variantId?: string): void {
  const key = lineKey({ productId, variantId });
  cart = cart.filter((i) => lineKey(i) !== key);
  notify();
}

/** See `removeFromCart`'s `variantId` note — same reasoning applies here. */
export function updateQty(productId: string, qty: number, variantId?: string): void {
  if (qty <= 0) { removeFromCart(productId, variantId); return; }
  const key = lineKey({ productId, variantId });
  cart = cart.map((i) => {
    if (lineKey(i) !== key) return i;
    const cap = stockCap(i.productSnapshot);
    return { ...i, quantity: cap != null ? Math.min(qty, cap) : qty };
  });
  notify();
}

export function clearCart(): void {
  cart = [];
  notify();
}

export function getCart(): CartItem[] {
  return cart;
}

export function useCartItems(): CartItem[] {
  const [items, setItems] = useState<CartItem[]>(() => cart);
  useEffect(() => {
    const listener: Listener = () => setItems([...cart]);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return items;
}
