import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  IconBuildingStore, IconShoppingCart, IconPackage, IconCheck, IconArrowLeft, IconMinus, IconPlus,
} from '@tabler/icons-react';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/utils';
import {
  getPublicStore, getPublicStoreProduct,
  type PublicStorefront, type PublicProductDetail, type PublicProductVariant,
} from '../services/publicStorefrontService';
import { addToCart, setCartSeller, useCartItems } from '../lib/cartStore';
import { getSaleInfo } from '../lib/salePricing';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Resolve the exact variant matching every selected option value — order
 * independent, mirrors how the backend's own `combination_key` identifies a
 * variant (sorted option-value ids), without duplicating that key format
 * client-side. Returns undefined until every option has a selection, or if
 * the selected combination has no matching variant row at all. */
function resolveVariant(product: PublicProductDetail, selected: Record<string, string>): PublicProductVariant | undefined {
  if (product.options.length === 0) return undefined;
  const ids = product.options.map((o) => selected[o.id]);
  if (ids.some((id) => !id)) return undefined;
  const idSet = new Set(ids);
  return product.variants.find((v) => v.optionValueIds.length === idSet.size && v.optionValueIds.every((id) => idSet.has(id)));
}

function variantLabel(product: PublicProductDetail, variant: PublicProductVariant): string {
  return product.options
    .map((o) => o.values.find((v) => variant.optionValueIds.includes(v.id))?.value)
    .filter((v): v is string => !!v)
    .join(' / ');
}

/** Cover-image-first gallery ordering — mirrors `ProductImageGallery.tsx`'s
 * own admin-side "starred image is the cover" convention. */
function sortedImages(product: PublicProductDetail) {
  return [...product.images].sort((a, b) => (b.isCover ? 1 : 0) - (a.isCover ? 1 : 0) || a.displayOrder - b.displayOrder);
}

export function StorefrontProductDetail() {
  const { slug, productSlug } = useParams();
  const navigate = useNavigate();

  const [storeLoading, setStoreLoading] = useState(true);
  const [store, setStore] = useState<PublicStorefront | null>(null);
  const [productLoading, setProductLoading] = useState(true);
  const [product, setProduct] = useState<PublicProductDetail | null>(null);

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const cartItems = useCartItems();
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  useEffect(() => {
    let active = true;
    setStoreLoading(true);
    getPublicStore(slug ?? '').then((s) => { if (active) setStore(s); }).finally(() => { if (active) setStoreLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    let active = true;
    setProductLoading(true);
    setProduct(null);
    setQty(1);
    setAdded(false);
    getPublicStoreProduct(slug ?? '', productSlug ?? '')
      .then((p) => {
        if (!active) return;
        setProduct(p);
        if (p) {
          setSelected(Object.fromEntries(p.options.map((o) => [o.id, o.values[0]?.id]).filter(([, v]) => !!v)));
          const images = sortedImages(p);
          setActiveImageId(images[0]?.id ?? null);
        }
      })
      .finally(() => { if (active) setProductLoading(false); });
    return () => { active = false; };
  }, [slug, productSlug]);

  // Real per-product accountId (never exposed by the public branding read) —
  // attributes the placed order the same way the storefront grid page does.
  // Runs off BOTH `store` and `product` (not just the product-load effect
  // above) so a direct product-detail entry — where branding and product
  // load as two independent, differently-timed fetches — never records an
  // empty storeName just because branding hadn't resolved yet when the
  // product did.
  useEffect(() => {
    if (!product || !store) return;
    setCartSeller({ scopeId: product.accountId, storeName: store.storeName, slug: slug ?? '' });
  }, [product, store, slug]);

  const resolvedVariant = useMemo(() => (product ? resolveVariant(product, selected) : undefined), [product, selected]);

  // Keep the main image in sync with a variant's own photo, when it has one.
  useEffect(() => {
    if (resolvedVariant?.imageId) setActiveImageId(resolvedVariant.imageId);
  }, [resolvedVariant]);

  // A quantity chosen for one variant must never silently carry over to a
  // differently-stocked variant (or the base product) — reset to 1 whenever
  // the resolved purchasable line changes.
  useEffect(() => {
    setQty(1);
  }, [resolvedVariant?.id]);

  if (storeLoading || productLoading) return null;

  if (!store || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <IconPackage className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Product not available</h1>
          <p className="text-sm text-gray-500 mt-1">This product is no longer listed, or the store link is invalid.</p>
          {slug && (
            <Link to={`/shop/${slug}`} className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800">
              ← Back to store
            </Link>
          )}
        </div>
      </div>
    );
  }

  const images = sortedImages(product);
  const mainImage = images.find((i) => i.id === activeImageId) ?? images[0];
  const hasOptions = product.options.length > 0;

  // Availability: an options-carrying product with no fully-resolved variant
  // is never purchasable yet (either the buyer hasn't finished picking, or
  // the picked combination genuinely doesn't exist); a resolved variant must
  // also be `active`, not just in stock.
  const available = hasOptions
    ? !!resolvedVariant && resolvedVariant.status === 'active' && (resolvedVariant.unlimitedStock || resolvedVariant.stockQuantity > 0)
    : product.unlimitedStock || product.stockQuantity > 0;
  const unlimited = hasOptions ? (resolvedVariant?.unlimitedStock ?? false) : product.unlimitedStock;
  const stockQuantity = hasOptions ? (resolvedVariant?.stockQuantity ?? 0) : product.stockQuantity;
  const lowStock = hasOptions ? resolvedVariant?.stockStatus === 'low_stock' : product.stockStatus === 'low_stock';

  const price = hasOptions
    ? (resolvedVariant ? resolvedVariant.priceOverride ?? product.unitPrice : product.priceRange?.min ?? product.unitPrice)
    : product.unitPrice;
  // A variant's null override means "inherit the base product's compare-at
  // price" (same convention as its price_override), not "no compare-at price
  // at all" — mirrors `price` a few lines up, which already inherits this way.
  const compareAt = hasOptions ? (resolvedVariant ? resolvedVariant.compareAtPriceOverride ?? product.compareAtPrice : product.compareAtPrice) : product.compareAtPrice;
  const isFromPrice = hasOptions && !resolvedVariant && !!product.priceRange && product.priceRange.min !== product.priceRange.max;
  // A "from ₱X" range price has no single before/after pair to show a sale for.
  const sale = !isFromPrice ? getSaleInfo(price, compareAt) : null;

  const selectionIncomplete = hasOptions && !resolvedVariant && product.options.some((o) => !selected[o.id]);
  const combinationUnavailable = hasOptions && !resolvedVariant && !selectionIncomplete;

  const accentStyle = store.accentColor ? { backgroundColor: store.accentColor } : undefined;

  const handleAdd = () => {
    if (!available) return;
    addToCart({
      productId: product.id,
      variantId: resolvedVariant?.id,
      quantity: qty,
      productSnapshot: {
        name: product.name,
        unitPrice: price,
        images: mainImage ? [mainImage.url] : [],
        category: product.category,
        variantLabel: resolvedVariant ? variantLabel(product, resolvedVariant) : undefined,
        sku: resolvedVariant?.sku ?? product.sku,
        compareAtPrice: compareAt,
        stockQuantity,
        unlimitedStock: unlimited,
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {accentStyle && <div className="h-1 w-full" style={accentStyle} />}
      {/* Storefront identity header — Product Detail is still part of the
          merchant's own store, not a generic GGX page, so it carries the same
          logo/name/accent branding as the storefront grid, plus an explicit
          route back to it (whole block is a link, with a labeled "Back to
          store" line so it doesn't read as just a logo). */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <Link to={`/shop/${slug}`} className="group flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
              style={accentStyle ?? { backgroundColor: '#2563eb' }}
            >
              {store.logoUrl
                ? <img src={store.logoUrl} alt={store.storeName} className="w-full h-full object-cover" />
                : <IconBuildingStore className="w-5 h-5 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{store.storeName}</p>
              <p className="text-xs text-gray-400 group-hover:text-gray-600 flex items-center gap-1 transition-colors">
                <IconArrowLeft className="w-3 h-3" /> Back to store
              </p>
            </div>
          </Link>
          {cartCount > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/shop/${slug}/cart`)}
              className="relative inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <IconShoppingCart className="w-4 h-4" />
              Cart
              <span
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center"
                style={accentStyle ?? { backgroundColor: '#2563eb' }}
              >
                {cartCount}
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gallery */}
        <div>
          <div className="aspect-square rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
            {mainImage
              ? <img src={mainImage.url} alt={product.name} className="w-full h-full object-cover" />
              : <IconPackage className="w-16 h-16 text-gray-300" />}
          </div>
          {images.length > 1 && (
            <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImageId(img.id)}
                  className={cn(
                    'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors',
                    activeImageId === img.id ? 'border-blue-500' : 'border-transparent hover:border-gray-300',
                  )}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-xs text-gray-400">{product.category}</p>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">{product.name}</h1>

          <div className="flex items-center gap-2 mt-3">
            {!available ? (
              <Badge variant="danger">Out of stock</Badge>
            ) : lowStock ? (
              <Badge variant="warning">Low stock</Badge>
            ) : (
              <Badge variant="success">In stock</Badge>
            )}
            {resolvedVariant && <span className="text-xs text-gray-400">SKU {resolvedVariant.sku}</span>}
            {!hasOptions && <span className="text-xs text-gray-400">SKU {product.sku}</span>}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-2xl font-bold text-gray-900">
              {isFromPrice ? 'From ' : ''}{peso(price)}
            </span>
            {sale && (
              <>
                <span className="text-sm text-gray-400 line-through">{peso(compareAt!)}</span>
                <Badge variant="danger">{sale.percentOff}% OFF</Badge>
              </>
            )}
          </div>
          {sale && <p className="text-xs text-emerald-700 font-medium mt-1">Save {peso(sale.amountOff)}</p>}

          {product.description && <p className="text-sm text-gray-600 mt-4 whitespace-pre-line">{product.description}</p>}

          {hasOptions && (
            <div className="mt-6 space-y-4">
              {product.options.map((option) => (
                <div key={option.id}>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">{option.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((value) => {
                      const isSelected = selected[option.id] === value.id;
                      return (
                        <button
                          key={value.id}
                          type="button"
                          onClick={() => setSelected((prev) => ({ ...prev, [option.id]: value.id }))}
                          className={cn(
                            'px-3.5 h-9 rounded-lg border text-sm font-medium transition-colors',
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                          )}
                        >
                          {value.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {combinationUnavailable && (
                <p className="text-xs text-red-600">This combination isn&apos;t available. Try a different selection.</p>
              )}
            </div>
          )}

          {/* Quantity */}
          <div className="mt-6">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Quantity</p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <IconMinus className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center text-sm font-medium">{qty}</span>
              <button
                type="button"
                disabled={!unlimited && qty >= stockQuantity}
                onClick={() => setQty((q) => (unlimited ? q + 1 : Math.min(stockQuantity, q + 1)))}
                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <IconPlus className="w-3.5 h-3.5" />
              </button>
              {!unlimited && available && lowStock && (
                <span className="text-xs text-amber-600 ml-2">Only {stockQuantity} left</span>
              )}
            </div>
          </div>

          <div className="mt-6">
            {!available ? (
              <button
                type="button" disabled
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-sm font-medium h-11 px-6 cursor-not-allowed"
              >
                {combinationUnavailable ? 'Unavailable' : 'Out of stock'}
              </button>
            ) : added ? (
              <button
                type="button" disabled
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white text-sm font-medium h-11 px-6 cursor-default"
              >
                <IconCheck className="w-4 h-4" /> Added to cart
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                style={accentStyle}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium h-11 px-6 transition-colors"
              >
                <IconShoppingCart className="w-4 h-4" /> Add to cart
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
