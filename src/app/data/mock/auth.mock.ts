/**
 * Mock authentication data.
 *
 * `MOCK_AUTH_USERS` supplies the display-only user object `authService`
 * renders after a successful `POST /api/auth/login` (credential verification
 * itself now happens server-side, against the duplicated directory in
 * `api/_lib/demoUsers.ts` — see that file's docblock for why it's a
 * duplicate rather than a shared import). The primary auth context lives in
 * `contexts/AuthContext.tsx` (`DEMO_USERS`); this file mirrors and extends it
 * with richer mock user objects for the service layer.
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

/** Full mock user objects, keyed by email. */
export const MOCK_AUTH_USERS: Record<string, MockAuthUser> = {
  'max@email.com': {
    id: 'user-admin-001',
    name: 'Max Rodriguez',
    email: 'max@email.com',
    role: 'admin',
    accountId: 'main',
    accountName: 'Main Account',
    assignedSubaccountIds: [], // Admin sees all; not restricted to a list.
    permissions: ADMIN_PERMISSIONS,
  },
  'manager@email.com': {
    id: 'user-mgr-001',
    name: 'Rina Lopez',
    email: 'manager@email.com',
    role: 'manager',
    accountId: 'acme-luzon',
    accountName: 'Acme Luzon',
    assignedSubaccountIds: ['acme-luzon'],
    permissions: MANAGER_PERMISSIONS,
  },
};
