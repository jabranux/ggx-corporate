/**
 * GGX Basic pouch/parcel sizes — the customer-facing size & dimension
 * reference for the Basic single-booking flow.
 *
 * Values mirror the existing GGX Basic product reference
 * (`src/app/lib/basicBookingTypes.ts`'s `POUCH_OPTIONS`) but are defined
 * fresh here: the legacy `/basic` module stays untouched/isolated, so this is
 * a deliberate, independent copy of the same product values, not an import
 * from that file.
 *
 * Pricing note: these per-size reference prices differ from the Business+
 * bulk-booking `SIZE_FEE` table in `src/app/lib/bookingFees.ts` for the
 * same-named tiers (small/medium/large) — see that file's header comment for
 * the exact mismatch. This is a flagged product discrepancy, not a bug; do
 * not unify the two tables without a product decision.
 */

export type BasicPouchSizeKey = 'small' | 'medium' | 'large' | 'xl' | 'xxl';

export interface BasicPouchSizeDef {
  key: BasicPouchSizeKey;
  label: string;
  dims: string;
  maxWeight: string;
  /** Reference base shipping fee for this size (frontend estimate only). */
  price: number;
  /**
   * Official GGX parcel illustration for this size, loaded directly from
   * gogoxpress.com (same convention as the GGX logo in `BasicLayout.tsx`) —
   * no local asset download. `xl` and `xxl` share the one official box
   * asset; there is no distinct XL/XXL illustration.
   */
  iconUrl: string;
}

const GGX_PARCEL_ICON_BASE = 'https://www.gogoxpress.com/wp-content/themes/ggx/img/';

/** Pouch/box size → official GGX parcel illustration filename, colocated with the size data it illustrates. */
export const BASIC_POUCH_ICON_FILENAME: Record<BasicPouchSizeKey, string> = {
  small: 'parcel-small.svg',
  medium: 'parcel-medium.svg',
  large: 'parcel-large.svg',
  xl: 'parcel-box.svg',
  xxl: 'parcel-box.svg',
};

export const BASIC_POUCH_SIZES: BasicPouchSizeDef[] = [
  { key: 'small',  label: 'Small Pouch',  dims: '24 × 36 cm',      maxWeight: '3 kg',  price: 80,  iconUrl: GGX_PARCEL_ICON_BASE + BASIC_POUCH_ICON_FILENAME.small },
  { key: 'medium', label: 'Medium Pouch', dims: '30.5 × 46 cm',    maxWeight: '5 kg',  price: 100, iconUrl: GGX_PARCEL_ICON_BASE + BASIC_POUCH_ICON_FILENAME.medium },
  { key: 'large',  label: 'Large Pouch',  dims: '40 × 60 cm',      maxWeight: '10 kg', price: 130, iconUrl: GGX_PARCEL_ICON_BASE + BASIC_POUCH_ICON_FILENAME.large },
  { key: 'xl',     label: 'XL Box',       dims: '50 × 40 × 30 cm', maxWeight: '20 kg', price: 180, iconUrl: GGX_PARCEL_ICON_BASE + BASIC_POUCH_ICON_FILENAME.xl },
  { key: 'xxl',    label: 'XXL Box',      dims: '60 × 50 × 40 cm', maxWeight: '30 kg', price: 250, iconUrl: GGX_PARCEL_ICON_BASE + BASIC_POUCH_ICON_FILENAME.xxl },
];

export function getBasicPouchSize(key: BasicPouchSizeKey): BasicPouchSizeDef {
  return BASIC_POUCH_SIZES.find((s) => s.key === key) ?? BASIC_POUCH_SIZES[0];
}
