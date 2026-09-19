/**
 * Shared "is this actually on sale, and by how much" math for every
 * buyer-facing surface that shows a price (storefront grid, product detail,
 * cart, checkout order summary) — one formula so the percent/amount shown
 * next to a struck-through compare-at price never drifts between pages.
 *
 * A product is "on sale" only when `compareAtPrice` is set AND genuinely
 * higher than the effective selling price — never a derived/manual
 * percentage or amount (per the Commerce pricing model: `compareAtPrice` is
 * the merchant-entered "original" price, `unitPrice`/`price` is what the
 * buyer actually pays).
 */
export interface SaleInfo {
  percentOff: number;
  amountOff: number;
}

export function getSaleInfo(price: number, compareAtPrice: number | null | undefined): SaleInfo | null {
  if (compareAtPrice == null || compareAtPrice <= price) return null;
  return {
    percentOff: Math.round(((compareAtPrice - price) / compareAtPrice) * 100),
    amountOff: compareAtPrice - price,
  };
}
