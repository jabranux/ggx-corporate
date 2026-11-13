import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useScopedAccountId } from './useAccountScope';
import { resolvePermissions } from '../data/permissions';
import { STANDARD_SCOPE_ID } from '../data/featureEnablement';
import type { AccountType, ModuleAccessContext, ModuleRole } from '../services/businessModulesService';

/**
 * Build the ModuleAccessContext for the current viewer — the input to
 * businessModulesService for resolving module status + CTA. Combines auth role,
 * account type (standard / main / subaccount), the resolved data scope, and the
 * viewer's effective permissions. See docs/contract_module_rules.md.
 */
export function useModuleAccessContext(): ModuleAccessContext {
  const { user } = useAuth();
  const { subAccountsEnabled, isMainAccountView } = useSubAccounts();
  const scopeAccountId = useScopedAccountId();

  return useMemo(() => {
    const role: ModuleRole = user?.role === 'manager' ? 'manager' : 'admin';

    let accountType: AccountType;
    if (user?.accountSegment === 'basic') {
      // A Basic account is always standalone — pin it to 'standard'
      // unconditionally so it can never resolve to 'main'/'subaccount' via
      // SubAccountContext's global (account-independent) switcher state left
      // over from a different login in the same browser.
      accountType = 'standard';
    } else if (role === 'manager') {
      accountType = 'subaccount';
    } else if (!subAccountsEnabled) {
      accountType = 'standard';
    } else if (isMainAccountView()) {
      accountType = 'main';
    } else {
      accountType = 'subaccount';
    }

    // Feature enablement is keyed by scope id. A standard Business+ account (no
    // subaccounts) uses the synthetic standard scope id, since it has no other
    // stable id of its own (it's still 'main', which must stay free for the
    // Main-Account-consolidated bucket once subaccounts are enabled later).
    // A Basic account is NOT a Business+ "standard" account under another
    // name — it's always its own standalone account with a real, stable id —
    // so it must never share that synthetic bucket with any Business+ account
    // (`useScopedAccountId` already resolves `scopeAccountId` to its own id).
    const effectiveScopeId =
      user?.accountSegment === 'basic' ? scopeAccountId
      : accountType === 'standard' ? STANDARD_SCOPE_ID
      : scopeAccountId;

    return {
      accountType,
      role,
      scopeAccountId: effectiveScopeId,
      permissions: resolvePermissions(role),
      // Coverage is validated at booking time against the delivery address; the
      // catalog view does not pre-fail coverage-gated modules.
      serviceCoverageOk: undefined,
      subaccountsEnabled: subAccountsEnabled,
      accountSegment: user?.accountSegment,
    };
  }, [user?.role, user?.accountSegment, subAccountsEnabled, isMainAccountView, scopeAccountId]);
}
