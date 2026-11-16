/**
 * Basic booking preferences — a dedicated profile/preferences layer for the
 * GGX Basic single-booking flow, deliberately kept separate from `AuthUser`
 * (`contexts/AuthContext.tsx`) so booking-specific defaults (default pickup
 * address) don't leak into the auth/session model.
 *
 * Deliberately does NOT remember a "last-used recipient" — unlike the
 * pickup address (the account's own single, fixed business location),
 * the recipient varies per shipment, and every new booking must start
 * with it unset, even right after confirming one. See `BookDelivery.tsx`'s
 * module docblock.
 *
 * Mock-backed by localStorage, keyed by account id. Future BFF endpoint:
 * GET/PUT /accounts/:id/booking-preferences.
 */
import type { Address } from '../components/AddressBook';
import { listAddresses, getPreferredAddress as getDefaultSavedAddress } from './addressBookService';
import { loadState, saveState } from '../lib/storage';

interface BasicBookingPreferences {
  defaultPickupAddressId: string | null;
}

const KEY_PREFIX = 'basicBookingPreferences.';
const EMPTY: BasicBookingPreferences = { defaultPickupAddressId: null };

function key(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

function readPrefs(accountId: string): BasicBookingPreferences {
  return loadState<BasicBookingPreferences>(key(accountId), EMPTY);
}

/**
 * Default pickup address for prefilling the booking draft. Falls back to
 * the address book's own preferred address when no explicit default has
 * been set yet. Phase 1 scope: the pickup address only — no remembered
 * recipient, no remembered item details, no shortened journey.
 */
export async function getDefaultBookingAddresses(accountId: string): Promise<{ pickup: Address | null }> {
  const prefs = readPrefs(accountId);
  const addresses = await listAddresses(accountId);

  const pickup = prefs.defaultPickupAddressId
    ? addresses.find((a) => a.id === prefs.defaultPickupAddressId) ?? null
    : await getDefaultSavedAddress(accountId);

  return { pickup };
}

export async function setDefaultPickupAddress(accountId: string, addressId: string): Promise<void> {
  saveState(key(accountId), { ...readPrefs(accountId), defaultPickupAddressId: addressId });
}
