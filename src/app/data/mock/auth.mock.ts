/**
 * Auth display types + role-based permissions.
 *
 * No account/email/role mapping lives here — that would ship a full
 * identity→role directory in the browser bundle (a privileged-identity leak,
 * even without a password attached). `authService.ts` builds a `MockAuthUser`
 * from the server's verified `POST /api/auth/login` response and derives
 * permissions from the returned `role` via `permissionsForRole` below, which
 * only encodes what each role *can do* — not who holds which role.
 */

import type { UserRole } from '../../contexts/AuthContext';

export interface MockAuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Canonical account id this user is scoped to. */
  accountId: string;
  accountName: string;
  /** Subaccount ids this user manages (Managers only). */
  assignedSubaccountIds: string[];
  permissions: MockPermissions;
}

export interface MockPermissions {
  canManageUsers: boolean;
  canAccessFinance: boolean;
  canViewAllSubaccounts: boolean;
  canAssignManagers: boolean;
  canGenerateReports: boolean;
  canManagePaymentSettings: boolean;
}

const ADMIN_PERMISSIONS: MockPermissions = {
  canManageUsers: true,
  canAccessFinance: true,
  canViewAllSubaccounts: true,
  canAssignManagers: true,
  canGenerateReports: true,
  canManagePaymentSettings: true,
};

const MANAGER_PERMISSIONS: MockPermissions = {
  canManageUsers: false,
  canAccessFinance: false,
  canViewAllSubaccounts: false,
  canAssignManagers: false,
  canGenerateReports: true,   // operational reports only (scoped to subaccount)
  canManagePaymentSettings: false,
};

/** Permission set for a role. Depends only on the role name — never on which
 * specific account holds it — so this stays safe to ship in the bundle. */
export function permissionsForRole(role: UserRole): MockPermissions {
  return role === 'admin' ? ADMIN_PERMISSIONS : MANAGER_PERMISSIONS;
}
