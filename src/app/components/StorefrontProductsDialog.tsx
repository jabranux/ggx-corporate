import { ProductPickerDialog } from './ProductPickerDialog';
import type { InventoryProduct } from '../services/inventoryService';

/**
 * Select which Inventory products are listed on the storefront. Thin wrapper
 * around the shared `ProductPickerDialog` — per docs/storefront_rules.md,
 * this stays a selection checklist only (never a product editor); editing a
 * product's own fields deep-links into Inventory (see the picker's link).
 */
export function StorefrontProductsDialog({
  open,
  products,
  selectedIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  products: InventoryProduct[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  return (
    <ProductPickerDialog
      open={open}
      title="Manage storefront products"
      description="Choose which inventory products appear on your storefront. Only active products can be listed."
      products={products}
      selectedIds={selectedIds}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
