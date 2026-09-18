/**
 * Permission keys for GGX Business+ modular features.
 *
 * Frontend/mock representation of granular permissions. In production these are
 * resolved per user by the backend and delivered with the session; here they are
 * derived from role + context as a stand-in. UI must gate on permission keys
 * (presentation show/hide) — the authoritative enforcement is backend-owned.
 *
 * See docs/contract_module_rules.md and docs/inventory_rules.md / storefront_rules.md.
 */

export type PermissionKey =
  // Inventory
  | 'inventory.view'
  | 'inventory.create'
  | 'inventory.edit'
  | 'inventory.delete'
  | 'inventory.adjustStock'
  | 'inventory.import'
  | 'inventory.export'
  // Storefront
  | 'storefront.view'
  | 'storefront.configure'
  | 'storefront.publish'
  | 'storefront.unpublish'
  | 'storefront.manageProducts'
  | 'storefront.viewOrders'
  | 'storefront.managePromotions'
  // Delivery service types
  | 'service.onDemand.use'
  // Module activation / requesting (account-level)
  | 'modules.activate'
  | 'modules.request';

export const INVENTORY_PERMISSIONS: PermissionKey[] = [
  'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
  'inventory.adjustStock', 'inventory.import', 'inventory.export',
];

export const STOREFRONT_PERMISSIONS: PermissionKey[] = [
  'storefront.view', 'storefront.configure', 'storefront.publish',
  'storefront.unpublish', 'storefront.manageProducts', 'storefront.viewOrders',
  'storefront.managePromotions',
];

/**
 * Resolve effective permissions for a viewer from role + context.
 *
 * Demo policy (replaceable by backend-delivered permissions):
 *  - Admin: full set, plus account-level module activation/requesting.
 *  - Manager: scoped read/manage of inventory & storefront for their assigned
 *    subaccount, can use On-Demand, but CANNOT activate/request global modules.
 *
 * `role` is the AuthContext role ('admin' | 'manager').
 */
export function resolvePermissions(role: 'admin' | 'manager'): PermissionKey[] {
  if (role === 'admin') {
    return [
      ...INVENTORY_PERMISSIONS,
      ...STOREFRONT_PERMISSIONS,
      'service.onDemand.use',
      'modules.activate',
      'modules.request',
    ];
  }
  // Manager — scoped to their assigned subaccount; no global module activation.
  return [
    'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.adjustStock',
    'storefront.view', 'storefront.viewOrders',
    'service.onDemand.use',
  ];
}

/** True when the permission set includes the key. */
export function hasPermission(permissions: PermissionKey[], key: PermissionKey): boolean {
  return permissions.includes(key);
}
