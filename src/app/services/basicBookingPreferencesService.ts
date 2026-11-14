/**
 * Basic booking preferences — a dedicated profile/preferences layer for the
 * GGX Basic single-booking flow, deliberately kept separate from `AuthUser`
 * (`contexts/AuthContext.tsx`) so booking-specific defaults (default pickup
 * address, last-used recipient) don't leak into the auth/session model.
 *
 * Mock-backed by localStorage, keyed by account id. Future BFF endpoint:
 * GET/PUT /accounts/:id/booking-preferences.
 */
import type { Address } from '../components/AddressBook';
import { listAddresses, getPreferredAddress as getDefaultSavedAddress } from './addressBookService';
import { loadState, saveState } from '../lib/storage';

interface BasicBookingPreferences {
  defaultPickupAddressId: string | null;
  lastRecipientAddressId: string | null;
}

const KEY_PREFIX = 'basicBookingPreferences.';
const EMPTY: BasicBookingPreferences = { defaultPickupAddressId: null, lastRecipientAddressId: null };

function key(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

function readPrefs(accountId: string): BasicBookingPreferences {
  return loadState<BasicBookingPreferences>(key(accountId), EMPTY);
}

/**
 * Default pickup + last-used recipient addresses for prefilling the booking
 * draft. Falls back to the address book's own preferred address for pickup
 * when no explicit default has been set yet. Phase 1 scope: addresses only —
 * no remembered item details, no shortened journey.
 */
export async function getDefaultBookingAddresses(accountId: string): Promise<{
  pickup: Address | null;
  recipient: Address | null;
}> {
  const prefs = readPrefs(accountId);
  const addresses = await listAddresses(accountId);

  const pickup = prefs.defaultPickupAddressId
    ? addresses.find((a) => a.id === prefs.defaultPickupAddressId) ?? null
    : await getDefaultSavedAddress(accountId);

  const recipient = prefs.lastRecipientAddressId
    ? addresses.find((a) => a.id === prefs.lastRecipientAddressId) ?? null
    : null;

  return { pickup, recipient };
}

export async function setDefaultPickupAddress(accountId: string, addressId: string): Promise<void> {
  saveState(key(accountId), { ...readPrefs(accountId), defaultPickupAddressId: addressId });
}

export async function setLastRecipientAddress(accountId: string, addressId: string): Promise<void> {
  saveState(key(accountId), { ...readPrefs(accountId), lastRecipientAddressId: addressId });
}
