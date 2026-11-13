import { useAuth } from '../contexts/AuthContext';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { MAIN_ACCOUNT_ID } from '../data/accounts';

/**
 * Effective account scope id for data fetching, combining the authenticated
 * user (the single source of truth for role + scoped account id) with the Main
 * Account view switcher. Use this for any page that fetches account-scoped data
 * so role-based scoping is applied consistently (see docs/account_model.md).
 *
 * - **Manager:** hard-scoped to their assigned subaccount — never sees
 *   consolidated/all-account data, regardless of the switcher state.
 * - **Admin on Main Account (no subaccount selected):** `undefined` (consolidated).
 * - **Admin viewing a specific subaccount:** that subaccount's id.
 *
 * Returns `undefined` to mean consolidated / all-account scope.
 */
export function useScopedAccountId(): string | undefined {
  const { user } = useAuth();
  const { subAccountsEnabled, getCurrentAccountId, isMainAccountView } = useSubAccounts();

  // A Basic account is a standalone account outside the Business+
  // Main/Subaccount hierarchy — it must always resolve to its own account id,
  // never `undefined` (consolidated = "every Business+ account"), regardless
  // of the (unrelated, global) subaccounts-enabled flag's state.
  if (user?.accountSegment === 'basic') return user.accountId;

  // A manager is always locked to their own subaccount. AuthContext is the
  // source of truth here — the subaccount switcher is an Admin-only tool and a
  // manager's `currentAccount` is not guaranteed to reflect their scope.
  if (user?.role === 'manager' && user.accountId && user.accountId !== MAIN_ACCOUNT_ID) {
    return user.accountId;
  }

  // Admin: consolidated on the Main Account view, scoped when drilled into a
  // specific subaccount via the switcher.
  if (!subAccountsEnabled || isMainAccountView()) return undefined;
  return getCurrentAccountId() ?? undefined;
}
