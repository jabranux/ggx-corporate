/**
 * earningsService — earnings & settlements facade.
 *
 * Data-returning functions are async to match a real API contract.
 * Currently backed by `data/earnings.ts` (static mock).
 *
 * ── Architecture / ownership ───────────────────────────────────────────────
 * Frontend-facing facade. Settlement values — gross/fees/net, payout amounts,
 * COD totals, settlement status — are OFFICIAL finance values owned by FTX and
 * delivered via the GGX Corporate BFF. The frontend does NOT compute or
 * reconcile them; it renders backend-provided figures (see MOCK_SERVICE_LAYER.md
 * §1b/§1c). Cross-system: a settlement's state reflects upstream Cashinator /
 * fulfillment events reconciled server-side, never inferred in the UI.
 *
 * Future API endpoints:
 *   GET /accounts/me/settlements      → getSettlements
 *   GET /settlements/:id              → getSettlementById
 */

import {
  SETTLEMENTS,
  getSettlement,
  SETTLEMENT_STATUS_CONFIG,
  type Settlement,
  type SettlementStatus,
  type SettlementTransaction,
} from '../data/earnings';

export type { Settlement, SettlementStatus, SettlementTransaction };
// Presentation config (status → label/variant). Not data access.
export { SETTLEMENT_STATUS_CONFIG };

export interface SettlementFilters {
  status?: SettlementStatus | 'all';
  source?: string;
  subaccountId?: string;
}

/**
 * A Basic account is a separate tenant, not a Business+ subaccount — its
 * settlements must never appear in the Business+ Corporate Earnings page's
 * unscoped list (same tenant-isolation rule as transactionService's
 * `isBasicAccountId`). Only reachable by scoping explicitly to the Basic
 * account's own id.
 */
function isBasicAccountId(id: string | undefined): boolean {
  return !!id && id.startsWith('basic-');
}

/** Return settlements, with optional status/source/subaccount filters. */
export async function getSettlements(filters?: SettlementFilters): Promise<Settlement[]> {
  let result = filters?.subaccountId
    ? [...SETTLEMENTS]
    : SETTLEMENTS.filter((s) => !isBasicAccountId(s.subaccountId));
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((s) => s.status === filters.status);
  }
  if (filters?.source && filters.source !== 'all') {
    result = result.filter((s) => s.source === filters.source);
  }
  if (filters?.subaccountId) {
    result = result.filter((s) => s.subaccountId === filters.subaccountId);
  }
  return result;
}

/** Return a single settlement by id, or null. */
export async function getSettlementById(id: string): Promise<Settlement | null> {
  return getSettlement(id) ?? null;
}
