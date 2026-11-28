// Canonical account / subaccount id map (frontend/mock).
//
// Stable ids are the key used for all visibility/scoping across the app
// (notifications, bulk uploads, batch records, transactions). `name` is display
// text only and must never be used for matching/filtering.
//
// Consumers: SubAccountContext (id↔name bridge), data/notifications.ts,
// data/bulkUploads.ts, data/transactions.ts, pages/BulkUploader.tsx — and
// future Claims / SLA / Analytics filters.

export const MAIN_ACCOUNT_ID = 'main';

export interface AccountRef {
  id: string;
  name: string;
}

// Fixed demo ids. New subaccounts created at runtime should ideally be assigned
// ids from this scheme; until then, the id↔name bridge below resolves known
// demo names to their stable id.
export const ACCOUNTS: AccountRef[] = [
  { id: 'main',             name: 'Main Account' },
  { id: 'acme-corporation', name: 'Acme Corporation' },
  { id: 'acme-luzon',       name: 'Acme Luzon' },
  { id: 'acme-visayas',     name: 'Acme Visayas' },
  // Basic accounts are standalone (no Main/Subaccount hierarchy) but still
  // resolve through this same id<->name bridge so the shared Transactions /
  // Earnings scoping logic (txAccountId, getSettlements' subaccountId filter)
  // works for them unchanged. See api/_lib/demoUsers.ts for the demo user.
  { id: 'basic-jamie-cruz', name: "Jamie's Store" },
];

const idByName = new Map(ACCOUNTS.map((a) => [a.name, a.id]));
const nameById = new Map(ACCOUNTS.map((a) => [a.id, a.name]));

/** Resolve a display name to its stable id (undefined if unknown). */
export function getAccountIdByName(name: string): string | undefined {
  return idByName.get(name);
}

/** Resolve a stable id to its display name (undefined if unknown). */
export function getAccountNameById(id: string): string | undefined {
  return nameById.get(id);
}
