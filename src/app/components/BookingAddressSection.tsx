/**
 * Address step for the GGX Basic single-booking flow — pickup + recipient.
 * Both addresses render as compact display-only cards; tapping either one
 * opens an address selection/entry overlay (a bottom sheet on mobile, a
 * centered dialog on desktop — `ui/Dialog.tsx`'s `Drawer`), never an
 * inline, permanently-expanded form on the page itself.
 *
 * Reuses the shared Address Book model (`components/AddressBook.tsx`'s
 * `Address`) and the `addressBookService` facade (NOT `AddressBook.tsx`'s
 * own page, which keeps its CRUD list in disconnected component-local state
 * — see that service's header comment). Address CRUD for the shared
 * /dashboard/address-book page is unaffected by this file.
 *
 * Pickup keeps a picker-first flow (it's typically one fixed saved
 * location): the drawer opens straight to "choose a saved address," with
 * "Add new address" as a secondary action.
 *
 * Recipient is form-first instead, on a full-screen sheet (`Drawer`'s
 * `fullScreen` prop) — most single bookings are to a new or occasional
 * recipient, so there is no intermediate "choose how to add a recipient"
 * screen. Tapping the Recipient card always opens straight into the
 * Recipient Details form (prefilled when editing an already-set
 * recipient), with "Recent Addresses" and "Address Book" as shortcuts at
 * the top that populate the SAME form (via nested, non-full-screen
 * Drawers stacked on top) rather than committing immediately — the user
 * can still review or edit before saving.
 */
import { useEffect, useState } from 'react';
import { IconPencil, IconPlus, IconSearch, IconX, IconClock, IconBook2 } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Drawer } from './ui/Dialog';
import { Input } from './ui/Input';
import { labelColors, getDisplayLabel } from './AddressDisplayCard';
import { LocationCascadeFields } from './LocationCascadeFields';
import type { Address } from './AddressBook';
import { listAddresses, createAddress } from '../services/addressBookService';

export interface BookingAddressSectionProps {
  accountId: string;
  pickupAddress: Address | null;
  recipientAddress: Address | null;
  onPickupChange: (a: Address) => void;
  onRecipientChange: (a: Address) => void;
  /**
   * Reports whether a drawer is open on its editable "add/edit" view with
   * unsaved input, so the page-level wizard's Continue button (which lives
   * outside this component and has no visibility into this local state) can
   * block advancing instead of silently losing those edits.
   */
  onRecipientFormOpenChange?: (open: boolean) => void;
  /** Same purpose as `onRecipientFormOpenChange`, for the pickup drawer's "add" view. */
  onPickupFormOpenChange?: (open: boolean) => void;
  /**
   * Fires on every keystroke/selection in either drawer (including filling
   * from a Recent/Address Book shortcut) — lets the page arm its
   * leave-without-saving exit guard as soon as there's something to lose,
   * not only once a save actually commits.
   */
  onDirty?: () => void;
}

const EMPTY_NEW_ADDRESS = { name: '', mobileNumber: '', province: '', city: '', barangay: '', otherDetails: '' };
type NewAddressFields = typeof EMPTY_NEW_ADDRESS;

/** A booking address needs more than just a name to be deliverable — enforced both when saving a new address here and at Confirm Booking. */
export function isCompleteAddress(address: Pick<Address, 'name' | 'mobileNumber' | 'province' | 'city' | 'barangay'> | null): boolean {
  return Boolean(
    address
    && address.name.trim()
    && address.mobileNumber.trim()
    && address.province.trim()
    && address.city.trim()
    && address.barangay.trim(),
  );
}

function abbreviatedLocation(address: Address): string {
  return [address.barangay, address.city].filter(Boolean).join(', ');
}

export function BookingAddressSection({
  accountId,
  pickupAddress,
  recipientAddress,
  onPickupChange,
  onRecipientChange,
  onRecipientFormOpenChange,
  onPickupFormOpenChange,
  onDirty,
}: BookingAddressSectionProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);

  // Pickup: picker-first.
  const [pickupDrawerOpen, setPickupDrawerOpen] = useState(false);
  const [pickupView, setPickupView] = useState<'list' | 'add'>('list');
  const [pickupSearch, setPickupSearch] = useState('');
  const [pickupForm, setPickupForm] = useState<NewAddressFields>(EMPTY_NEW_ADDRESS);
  const [pickupSaving, setPickupSaving] = useState(false);

  // Recipient: form-first, always — the full-screen sheet IS the form, with
  // "Recent Addresses"/"Address Book" as nested overlay shortcuts on top of
  // it (never a separate browse-only screen in front of the form).
  const [recipientDrawerOpen, setRecipientDrawerOpen] = useState(false);
  const [recipientRecentOpen, setRecipientRecentOpen] = useState(false);
  const [recipientBookOpen, setRecipientBookOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientForm, setRecipientForm] = useState<NewAddressFields>(EMPTY_NEW_ADDRESS);
  const [recipientExistingMatch, setRecipientExistingMatch] = useState<Address | null>(null);
  const [recipientSaving, setRecipientSaving] = useState(false);
  // Forces `AddressForm`'s `LocationCascadeFields` to remount whenever a
  // shortcut swaps in a DIFFERENT address while the sheet stays open (the
  // main Drawer never closes between picks — only the nested Recent/Book
  // drawer does). Without this, `LocationCascadeFields` only re-syncs its
  // internal province/city ids from props on its own first mount; picking
  // a second address with a different city (same or different province)
  // would otherwise leave Barangay showing the FIRST address's stale
  // option list, even though the underlying `recipientForm`/save value is
  // already correct.
  const [recipientFormKey, setRecipientFormKey] = useState(0);

  useEffect(() => {
    let active = true;
    listAddresses(accountId).then((list) => { if (active) setAddresses(list); });
    return () => { active = false; };
  }, [accountId]);

  // Report open/unsaved state up so the page-level wizard Continue button
  // (outside this component) can block advancing instead of discarding
  // edits — only the editable "add" view has anything unsaved to lose.
  useEffect(() => {
    onPickupFormOpenChange?.(pickupDrawerOpen && pickupView === 'add');
  }, [pickupDrawerOpen, pickupView, onPickupFormOpenChange]);

  useEffect(() => {
    onRecipientFormOpenChange?.(recipientDrawerOpen);
  }, [recipientDrawerOpen, onRecipientFormOpenChange]);

  const closePickupDrawer = () => {
    setPickupDrawerOpen(false);
    setPickupView('list');
    setPickupSearch('');
    setPickupForm(EMPTY_NEW_ADDRESS);
  };

  const handleSavePickup = async () => {
    if (!isCompleteAddress(pickupForm)) return;
    setPickupSaving(true);
    try {
      const created = await createAddress(accountId, {
        label: 'custom',
        customLabel: 'Pickup',
        name: pickupForm.name.trim(),
        mobileNumber: pickupForm.mobileNumber.trim(),
        province: pickupForm.province,
        city: pickupForm.city,
        barangay: pickupForm.barangay,
        otherDetails: pickupForm.otherDetails.trim(),
        isPreferred: false,
      });
      setAddresses((prev) => [...prev, created]);
      onPickupChange(created);
      closePickupDrawer();
    } finally {
      setPickupSaving(false);
    }
  };

  const closeRecipientDrawer = () => {
    setRecipientDrawerOpen(false);
    setRecipientRecentOpen(false);
    setRecipientBookOpen(false);
    setRecipientSearch('');
    setRecipientForm(EMPTY_NEW_ADDRESS);
    setRecipientExistingMatch(null);
    setRecipientFormKey(0);
  };

  // Always opens straight into the form — prefilled when a recipient is
  // already set (so the user can review/adjust it), blank otherwise (the
  // common case: a new or occasional recipient). Never a separate chooser
  // screen first.
  const openRecipientDrawer = () => {
    if (recipientAddress) {
      setRecipientForm({
        name: recipientAddress.name,
        mobileNumber: recipientAddress.mobileNumber,
        province: recipientAddress.province,
        city: recipientAddress.city,
        barangay: recipientAddress.barangay,
        otherDetails: recipientAddress.otherDetails,
      });
      setRecipientExistingMatch(recipientAddress);
    } else {
      setRecipientForm(EMPTY_NEW_ADDRESS);
      setRecipientExistingMatch(null);
    }
    setRecipientDrawerOpen(true);
  };

  // Populates the form from a Recent/Address Book pick — never commits
  // immediately, so the user can still review or edit before saving. Only
  // closes the nested picker it was called from (callers do that), not
  // the main form sheet.
  const fillRecipientFormFrom = (address: Address) => {
    setRecipientForm({
      name: address.name,
      mobileNumber: address.mobileNumber,
      province: address.province,
      city: address.city,
      barangay: address.barangay,
      otherDetails: address.otherDetails,
    });
    setRecipientExistingMatch(address);
    setRecipientFormKey((k) => k + 1);
    onDirty?.();
  };

  const recipientFieldsMatchExisting = (a: Address | null, form: NewAddressFields) =>
    Boolean(a)
    && a!.name === form.name.trim()
    && a!.mobileNumber === form.mobileNumber.trim()
    && a!.province === form.province
    && a!.city === form.city
    && a!.barangay === form.barangay
    && a!.otherDetails === form.otherDetails.trim();

  const handleSaveRecipient = async () => {
    if (!isCompleteAddress(recipientForm)) return;
    // Picked from Recent/Address Book and left unedited — use the existing
    // address as-is rather than creating a duplicate record.
    if (recipientFieldsMatchExisting(recipientExistingMatch, recipientForm)) {
      onRecipientChange(recipientExistingMatch!);
      closeRecipientDrawer();
      return;
    }
    setRecipientSaving(true);
    try {
      const created = await createAddress(accountId, {
        label: 'custom',
        customLabel: 'Recipient',
        name: recipientForm.name.trim(),
        mobileNumber: recipientForm.mobileNumber.trim(),
        province: recipientForm.province,
        city: recipientForm.city,
        barangay: recipientForm.barangay,
        otherDetails: recipientForm.otherDetails.trim(),
        isPreferred: false,
      });
      setAddresses((prev) => [...prev, created]);
      onRecipientChange(created);
      closeRecipientDrawer();
    } finally {
      setRecipientSaving(false);
    }
  };

  const recentAddresses = addresses.slice(0, 3);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <AddressRouteRail />
          <div className="min-w-0 flex-1 divide-y divide-gray-100">
            <AddressSlot
              label="Pickup address"
              address={pickupAddress}
              onAction={() => setPickupDrawerOpen(true)}
            />
            <AddressSlot
              label="Recipient"
              address={recipientAddress}
              onAction={openRecipientDrawer}
            />
          </div>
        </div>

        <Drawer
          open={pickupDrawerOpen}
          onClose={closePickupDrawer}
          title={pickupView === 'add' ? 'Add a new pickup address' : 'Choose a saved address'}
          onBack={pickupView === 'add' ? () => setPickupView('list') : undefined}
        >
          {pickupView === 'list' ? (
            <AddressBookList
              addresses={addresses}
              search={pickupSearch}
              onSearchChange={setPickupSearch}
              onSelect={(addr) => { onPickupChange(addr); closePickupDrawer(); }}
              onAddNew={() => setPickupView('add')}
            />
          ) : (
            <AddressForm
              form={pickupForm}
              onChange={(f) => { setPickupForm(f); onDirty?.(); }}
              onSave={handleSavePickup}
              saving={pickupSaving}
            />
          )}
        </Drawer>

        <Drawer
          open={recipientDrawerOpen}
          onClose={closeRecipientDrawer}
          title="Recipient Details"
          fullScreen
          footer={
            <Button
              className="w-full"
              disabled={recipientSaving || !isCompleteAddress(recipientForm)}
              onClick={handleSaveRecipient}
            >
              {recipientSaving ? 'Saving…' : recipientExistingMatch ? 'Use this address' : 'Save and use this address'}
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100"
                onClick={() => setRecipientRecentOpen(true)}
              >
                <IconClock className="w-3.5 h-3.5 mr-1.5" /> Recent Addresses
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100"
                onClick={() => setRecipientBookOpen(true)}
              >
                <IconBook2 className="w-3.5 h-3.5 mr-1.5" /> Address Book
              </Button>
            </div>
            <AddressForm
              key={recipientFormKey}
              form={recipientForm}
              onChange={(f) => { setRecipientForm(f); setRecipientExistingMatch(null); onDirty?.(); }}
              onSave={handleSaveRecipient}
              saving={recipientSaving}
              showSaveButton={false}
            />
          </div>

          <Drawer open={recipientRecentOpen} onClose={() => setRecipientRecentOpen(false)} title="Recent Addresses">
            {recentAddresses.length === 0 ? (
              <p className="text-sm text-gray-500">No saved addresses yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recentAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => { fillRecipientFormFrom(addr); setRecipientRecentOpen(false); }}
                    className="w-full text-left rounded-lg border border-gray-200 p-2.5 hover:border-blue-400 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{addr.name} · {addr.mobileNumber}</p>
                    <p className="text-xs text-gray-500 truncate">{abbreviatedLocation(addr)}</p>
                  </button>
                ))}
              </div>
            )}
          </Drawer>

          <Drawer open={recipientBookOpen} onClose={() => setRecipientBookOpen(false)} title="Address Book">
            <AddressBookList
              addresses={addresses}
              search={recipientSearch}
              onSearchChange={setRecipientSearch}
              onSelect={(addr) => { fillRecipientFormFrom(addr); setRecipientBookOpen(false); }}
              onAddNew={() => { setRecipientForm(EMPTY_NEW_ADDRESS); setRecipientExistingMatch(null); setRecipientBookOpen(false); }}
            />
          </Drawer>
        </Drawer>
      </CardContent>
    </Card>
  );
}

/**
 * Route indicator: a blue pickup pin and a red recipient pin joined by a
 * dashed connector, so the two addresses read as one connected journey
 * rather than two disconnected cards. Exported so the read-only Review
 * summary (`BookingReviewSummary.tsx`) can reuse the exact same visual
 * instead of re-implementing it — this file's own editable layout above is
 * otherwise unchanged. Uses `items-stretch`/`flex-1` (not fixed pixel
 * offsets) so the dots stay pinned to the top/bottom of their row
 * regardless of how much the address text wraps.
 */
export function AddressRouteRail() {
  return (
    <div className="flex flex-col items-center">
      <span className="mt-4 h-3 w-3 flex-shrink-0 rounded-full border-2 border-blue-500 bg-blue-100" aria-hidden="true" />
      <span className="my-1 w-px flex-1 border-l-2 border-dashed border-gray-300" aria-hidden="true" />
      <span className="mb-4 h-3 w-3 flex-shrink-0 rounded-full border-2 border-red-400 bg-red-100" aria-hidden="true" />
    </div>
  );
}

function AddressSlot({
  label,
  address,
  onAction,
}: {
  label: string;
  address: Address | null;
  onAction: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAction}
      className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-gray-50 transition-colors first:pt-1 last:pb-1 rounded-md"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {address ? (
          <>
            <p className="text-sm font-medium text-gray-900 truncate">{address.name} · {address.mobileNumber}</p>
            <p className="text-xs text-gray-500 truncate">
              {[address.barangay, address.city, address.province].filter(Boolean).join(', ')}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400">Not set</p>
        )}
      </div>
      <span
        aria-hidden
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 text-gray-500"
      >
        {address ? <IconPencil className="w-4 h-4" /> : <IconPlus className="w-4 h-4" />}
      </span>
    </button>
  );
}

/**
 * Complete, searchable address-selection list: search, label chip,
 * name/mobile, abbreviated location preview, and an "Add new address"
 * action — used as both the pickup drawer's main view and the recipient
 * drawer's "Address Book" sub-view, so there's exactly one such list
 * implementation.
 */
function AddressBookList({
  addresses,
  search,
  onSearchChange,
  onSelect,
  onAddNew,
}: {
  addresses: Address[];
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (a: Address) => void;
  onAddNew: () => void;
}) {
  const filtered = addresses.filter((addr) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      addr.name.toLowerCase().includes(q)
      || addr.city.toLowerCase().includes(q)
      || addr.province.toLowerCase().includes(q)
      || addr.barangay.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or location…"
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <IconX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No saved addresses found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((addr) => (
            <button
              key={addr.id}
              type="button"
              onClick={() => onSelect(addr)}
              className="w-full text-left rounded-lg border border-gray-200 p-3 hover:border-blue-400 transition-colors"
            >
              <Badge variant={labelColors[addr.label] || 'default'} className="text-[10px] px-1.5 py-0 mb-1.5 capitalize">
                {getDisplayLabel(addr)}
              </Badge>
              <p className="text-sm font-medium text-gray-900 truncate">{addr.name} · {addr.mobileNumber}</p>
              <p className="text-xs text-gray-500 truncate">{abbreviatedLocation(addr)}</p>
            </button>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAddNew}>
        <IconPlus className="w-3.5 h-3.5 mr-1" /> Add new address
      </Button>
    </div>
  );
}

function AddressForm({
  form,
  onChange,
  onSave,
  saving,
  saveLabel = 'Save and use this address',
  /** False when the caller renders its own CTA elsewhere (e.g. a `Drawer` `footer`) — the recipient full-screen sheet does this so the button stays reachable regardless of scroll position. */
  showSaveButton = true,
}: {
  form: NewAddressFields;
  onChange: (f: NewAddressFields) => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
  showSaveButton?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <Input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Full name" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mobile number</label>
          <Input value={form.mobileNumber} onChange={(e) => onChange({ ...form, mobileNumber: e.target.value })} placeholder="+63 917 123 4567" />
        </div>
        <LocationCascadeFields
          province={form.province}
          city={form.city}
          barangay={form.barangay}
          onChange={(province, city, barangay) => onChange({ ...form, province, city, barangay })}
        />
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Other details</label>
          <Input value={form.otherDetails} onChange={(e) => onChange({ ...form, otherDetails: e.target.value })} placeholder="Street, unit, landmark" />
        </div>
      </div>
      {showSaveButton && (
        <Button size="sm" className="w-full" disabled={saving || !isCompleteAddress(form)} onClick={onSave}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      )}
    </div>
  );
}
