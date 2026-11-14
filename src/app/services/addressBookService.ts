/**
 * Address Book service facade.
 *
 * `components/AddressBook.tsx` owns the full-page Address Book UI (CRUD,
 * search, pickup-location cascade) over the `Address` model, but keeps its
 * list in local component state only — it has no persistence today, a
 * pre-existing gap, not something introduced here. This service gives the
 * Basic single-booking flow (and any future consumer) a service-layer-shaped
 * async read/write surface over the SAME `Address` shape, backed by
 * localStorage per account id so saved addresses survive across sessions.
 *
 * It deliberately does not modify `AddressBook.tsx`. Until that page is
 * given real persistence, its in-memory list and this service's store are
 * independent seeds of the same shape, not one source of truth — flagged in
 * the implementation report, not silently papered over.
 *
 * Future BFF endpoints: GET/POST/PUT/DELETE /accounts/:id/addresses.
 */
import type { Address } from '../components/AddressBook';
import { loadState, saveState } from '../lib/storage';

export type { Address };

const KEY_PREFIX = 'addressBook.';

// Seed content is per-persona, not shared with AddressBook.tsx's own
// SEED_ADDRESSES (that one is Business+ corporate-flavored — "Acme
// Corporation" — which reads wrong for a Basic self-serve seller). Keyed by
// accountId, so each account's first read gets a seed that fits its own
// segment; a Business+ accountId not covered here falls back to
// AddressBook.tsx's own shape-compatible seed via the generic default below.
const BUSINESS_PLUS_SEED_ADDRESSES: Address[] = [
  { id: '1', label: 'office', name: 'Acme Corporation', mobileNumber: '+63 917 123 4567', province: 'Metro Manila', city: 'Makati', barangay: 'Poblacion', otherDetails: '5th Floor, ABC Building, Ayala Avenue', isPreferred: true },
  { id: '2', label: 'home', name: 'Max Rodriguez', mobileNumber: '+63 917 987 6543', province: 'Metro Manila', city: 'Quezon City', barangay: 'Diliman', otherDetails: 'Unit 203, XYZ Residences', isPreferred: false },
];

// Basic self-serve seller persona (matches the demo account "Jamie's Store",
// api/_lib/demoUsers.ts's user-basic-001) — a home-based pickup point and one
// saved recipient, not a corporate office.
// City names must match the GGX locations API's canonical names exactly
// (`lib/locationApi.ts` — e.g. "Pasig City", not "Pasig"): LocationCascadeFields
// renders City/Barangay as native <select>s whose options come from that API,
// so a seed value that doesn't match any option renders as an unselected
// dropdown even though the underlying saved address string is correct —
// caught via manual QA on the Basic single-booking flow's address-prefill
// shortcuts (Recent Addresses / Address Book / Edit), the first UI paths that
// ever pre-fill this cascade from existing data instead of the user picking
// each level from its dropdown (which only ever offers valid API names).
const BASIC_SEED_ADDRESSES: Address[] = [
  { id: '1', label: 'home', name: 'Jamie Cruz', mobileNumber: '+63 917 234 5678', province: 'Metro Manila', city: 'Pasig City', barangay: 'Ugong', otherDetails: "Jamie's Store, Unit 12 Ugong Flea Market", isPreferred: true },
  { id: '2', label: 'other', name: 'Ana Dela Cruz', mobileNumber: '+63 918 876 5432', province: 'Metro Manila', city: 'Mandaluyong City', barangay: 'Addition Hills', otherDetails: 'Lot 4 Block 2, Sampaguita St.', isPreferred: false },
];

function seedAddressesFor(accountId: string): Address[] {
  return accountId === 'basic-jamie-cruz' ? BASIC_SEED_ADDRESSES : BUSINESS_PLUS_SEED_ADDRESSES;
}

function storeKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

function readStore(accountId: string): Address[] {
  return loadState<Address[]>(storeKey(accountId), seedAddressesFor(accountId));
}

function writeStore(accountId: string, addresses: Address[]): void {
  saveState(storeKey(accountId), addresses);
}

/** List every saved address for the account. */
export async function listAddresses(accountId: string): Promise<Address[]> {
  return readStore(accountId);
}

/** Get one address by id, or null if not found. */
export async function getAddress(accountId: string, id: string): Promise<Address | null> {
  return readStore(accountId).find((a) => a.id === id) ?? null;
}

/** The account's preferred/default address, or the first saved address, or null. */
export async function getPreferredAddress(accountId: string): Promise<Address | null> {
  const addresses = readStore(accountId);
  return addresses.find((a) => a.isPreferred) ?? addresses[0] ?? null;
}

export async function createAddress(accountId: string, address: Omit<Address, 'id'>): Promise<Address> {
  const addresses = readStore(accountId);
  const created: Address = { ...address, id: `${Date.now()}` } as Address;
  writeStore(accountId, [...addresses, created]);
  return created;
}

export async function updateAddress(accountId: string, address: Address): Promise<Address> {
  writeStore(accountId, readStore(accountId).map((a) => (a.id === address.id ? address : a)));
  return address;
}

export async function deleteAddress(accountId: string, id: string): Promise<void> {
  writeStore(accountId, readStore(accountId).filter((a) => a.id !== id));
}

export async function setPreferredAddress(accountId: string, id: string): Promise<void> {
  writeStore(accountId, readStore(accountId).map((a) => ({ ...a, isPreferred: a.id === id })));
}
