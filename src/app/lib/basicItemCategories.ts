/**
 * "What are you sending?" category chips for the GGX Basic Accordion booking
 * variant's Item Details section (`BookingItemDetailsSection.tsx`) — replaces
 * the Wizard's free-text item description with a single-select category,
 * falling back to a free-text field only for "Others". See that component's
 * own docblock for how the selected category becomes the booking's
 * `itemDescription` value.
 */
export type BasicItemCategory = 'documents' | 'food' | 'clothing' | 'electronics' | 'fragile' | 'medical' | 'others';

export const BASIC_ITEM_CATEGORIES: { key: BasicItemCategory; label: string }[] = [
  { key: 'documents', label: 'Documents' },
  { key: 'food', label: 'Food' },
  { key: 'clothing', label: 'Clothing' },
  { key: 'electronics', label: 'Electronics' },
  { key: 'fragile', label: 'Fragile' },
  { key: 'medical', label: 'Medical' },
  { key: 'others', label: 'Others' },
];

export function getBasicItemCategoryLabel(key: BasicItemCategory): string {
  return BASIC_ITEM_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
