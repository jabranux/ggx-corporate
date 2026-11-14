/**
 * Address step for the GGX Basic single-booking flow — pickup + recipient.
 * Reuses the shared Address Book model (`components/AddressBook.tsx`'s
 * `Address`) and `AddressDisplayCard` for summaries.
 *
 * Address CRUD for the shared /dashboard/address-book page keeps its own
 * component-local state (a pre-existing gap — see `addressBookService.ts`'s
 * header comment), so this section cannot point users there for a *working*
 * add-address path. Instead it includes its own minimal inline form, writing
 * through the same `addressBookService` this flow already reads from, so
 * there's always a real, working way to add an address rather than a promise
 * that leads nowhere.
 *
 * Pickup keeps a picker-first flow (it's typically one fixed saved
 * location). Recipient defaults to an open inline form instead — most
 * single bookings are to a new or occasional recipient, so starting on an
 * empty form is fewer taps than picker-then-maybe-add. "Recent Addresses"
 * and "Address Book" are secondary shortcuts that prefill the form from an
 * existing address without committing it immediately, so the user can still
 * review or edit before it's used.
 *
 * "Recent Addresses" reuses `listAddresses`' plain list capped to 3 entries —
 * `addressBookService` has no recency/last-used ordering today, so this is a
 * simplification, not true recency, until that service tracks it.
 */
import { useEffect, useState } from 'react';
import { IconMapPin, IconUserCircle, IconPencil, IconPlus, IconClock, IconBook2 } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Drawer } from './ui/Dialog';
import { Input } from './ui/Input';
import { AddressDisplayCard } from './AddressDisplayCard';
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
   * Reports whether the recipient form is open with unsaved edits, so the
   * mobile wizard's page-level Continue button (which lives outside this
   * component and has no visibility into this local form state) can block
   * advancing until the edits are saved or discarded, instead of silently
   * losing them.
   */
  onRecipientFormOpenChange?: (open: boolean) => void;
  /** Same purpose as `onRecipientFormOpenChange`, for the pickup "Add new address" sub-form. */
  onPickupFormOpenChange?: (open: boolean) => void;
  /**
   * Fires on every keystroke/selection in either form (including filling
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

  // Pickup: picker-first (unchanged flow, just the compact icon-button trigger).
  const [pickupPickerOpen, setPickupPickerOpen] = useState(false);
  const [pickupAdding, setPickupAdding] = useState(false);
  const [pickupForm, setPickupForm] = useState<NewAddressFields>(EMPTY_NEW_ADDRESS);
  const [pickupSaving, setPickupSaving] = useState(false);

  // Recipient: open-form-first.
  const [recipientFormOpen, setRecipientFormOpen] = useState(!recipientAddress);
  const [recipientForm, setRecipientForm] = useState<NewAddressFields>(EMPTY_NEW_ADDRESS);
  const [recipientShortcut, setRecipientShortcut] = useState<'recent' | 'book' | null>(null);
  const [recipientExistingMatch, setRecipientExistingMatch] = useState<Address | null>(null);
  const [recipientSaving, setRecipientSaving] = useState(false);

  useEffect(() => {
    let active = true;
    listAddresses(accountId).then((list) => { if (active) setAddresses(list); });
    return () => { active = false; };
  }, [accountId]);

  // Report open/unsaved state up so the page-level wizard Continue button
  // (outside this component) can block advancing instead of discarding edits.
  useEffect(() => {
    onRecipientFormOpenChange?.(recipientFormOpen);
  }, [recipientFormOpen, onRecipientFormOpenChange]);

  useEffect(() => {
    onPickupFormOpenChange?.(pickupAdding);
  }, [pickupAdding, onPickupFormOpenChange]);

  // Both Address and Delivery/Item Details sections mount simultaneously on
  // desktop and mobile (CSS-toggled visibility, not a JS-conditional
  // unmount — same dual-tree pattern as `CartReview.tsx`), so a sibling
  // instance can save/clear the recipient while THIS instance's own
  // `recipientFormOpen` state (seeded once at mount from the initial prop)
  // never gets told to close. Re-deriving it whenever the `recipientAddress`
  // prop reference actually changes keeps a currently-inert instance in
  // sync with whichever instance the user is actually looking at, without
  // clobbering an open edit this same instance's own pencil/shortcut clicks
  // started (those don't change the prop, so this effect won't re-fire).
  useEffect(() => {
    setRecipientFormOpen(!recipientAddress);
  }, [recipientAddress]);

  const closePickupPicker = () => {
    setPickupPickerOpen(false);
    setPickupAdding(false);
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
      closePickupPicker();
    } finally {
      setPickupSaving(false);
    }
  };

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
    setRecipientShortcut(null);
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
      setRecipientFormOpen(false);
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
      setRecipientFormOpen(false);
    } finally {
      setRecipientSaving(false);
    }
  };

  const openRecipientEdit = () => {
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
    }
    setRecipientFormOpen(true);
  };

  const recentAddresses = addresses.slice(0, 3);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <AddressSlot
          icon={IconMapPin}
          label="Pickup address"
          address={pickupAddress}
          onAction={() => setPickupPickerOpen(true)}
        />

        <Drawer
          open={pickupPickerOpen}
          onClose={closePickupPicker}
          title={pickupAdding ? 'Add a new pickup address' : 'Choose a saved address'}
          onBack={pickupAdding ? () => setPickupAdding(false) : undefined}
        >
          {!pickupAdding ? (
            <div className="space-y-2">
              {addresses.length === 0 ? (
                <p className="text-sm text-gray-500">No saved addresses yet.</p>
              ) : (
                addresses.map((addr) => (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => { onPickupChange(addr); closePickupPicker(); }}
                    className="w-full text-left rounded-lg border border-gray-200 p-3 hover:border-blue-400 transition-colors"
                  >
                    <AddressDisplayCard address={addr} />
                  </button>
                ))
              )}
              <div className="pt-1">
                <Button variant="outline" size="sm" onClick={() => setPickupAdding(true)}>
                  <IconPlus className="w-3.5 h-3.5 mr-1" /> Add new address
                </Button>
              </div>
            </div>
          ) : (
            <AddressForm
              form={pickupForm}
              onChange={(f) => { setPickupForm(f); onDirty?.(); }}
              onSave={handleSavePickup}
              saving={pickupSaving}
            />
          )}
        </Drawer>

        <AddressSlot
          icon={IconUserCircle}
          label="Recipient"
          address={recipientAddress}
          onAction={openRecipientEdit}
        />

        {recipientFormOpen && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={recipientShortcut === 'recent' ? 'secondary' : 'outline'}
                size="sm"
                className="text-xs px-2.5 gap-1"
                onClick={() => setRecipientShortcut('recent')}
              >
                <IconClock className="w-3.5 h-3.5" /> Recent Addresses
              </Button>
              <Button
                type="button"
                variant={recipientShortcut === 'book' ? 'secondary' : 'outline'}
                size="sm"
                className="text-xs px-2.5 gap-1"
                onClick={() => setRecipientShortcut('book')}
              >
                <IconBook2 className="w-3.5 h-3.5" /> Address Book
              </Button>
            </div>

            <Drawer open={recipientShortcut === 'recent'} onClose={() => setRecipientShortcut(null)} title="Recent Addresses">
              <AddressShortcutList addresses={recentAddresses} onSelect={fillRecipientFormFrom} />
            </Drawer>
            <Drawer open={recipientShortcut === 'book'} onClose={() => setRecipientShortcut(null)} title="Address Book">
              <AddressShortcutList addresses={addresses} onSelect={fillRecipientFormFrom} />
            </Drawer>

            <AddressForm
              title="Recipient details"
              form={recipientForm}
              onChange={(f) => { setRecipientForm(f); setRecipientExistingMatch(null); onDirty?.(); }}
              onSave={handleSaveRecipient}
              onBack={recipientAddress ? () => setRecipientFormOpen(false) : undefined}
              saving={recipientSaving}
              saveLabel={recipientExistingMatch ? 'Use this address' : 'Save and use this address'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddressSlot({
  icon: Icon,
  label,
  address,
  onAction,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  address: Address | null;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
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
      </div>
      <button
        type="button"
        onClick={onAction}
        aria-label={address ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
      >
        {address ? <IconPencil className="w-4 h-4" /> : <IconPlus className="w-4 h-4" />}
      </button>
    </div>
  );
}

function AddressShortcutList({ addresses, onSelect }: { addresses: Address[]; onSelect: (a: Address) => void }) {
  if (addresses.length === 0) {
    return <p className="text-sm text-gray-500">No saved addresses yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {addresses.map((addr) => (
        <button
          key={addr.id}
          type="button"
          onClick={() => onSelect(addr)}
          className="w-full text-left rounded-lg border border-gray-200 p-2.5 hover:border-blue-400 transition-colors text-sm"
        >
          <span className="font-medium text-gray-900">{addr.name}</span>
          <span className="text-gray-500"> · {[addr.barangay, addr.city].filter(Boolean).join(', ')}</span>
        </button>
      ))}
    </div>
  );
}

function AddressForm({
  title,
  form,
  onChange,
  onSave,
  onBack,
  saving,
  saveLabel = 'Save and use this address',
}: {
  /** Omit when an ancestor (e.g. a `Drawer`'s own header) already shows this title. */
  title?: string;
  form: NewAddressFields;
  onChange: (f: NewAddressFields) => void;
  onSave: () => void;
  onBack?: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {title && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>}
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
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={saving || !isCompleteAddress(form)} onClick={onSave}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
        {onBack && <Button variant="ghost" size="sm" onClick={onBack}>Cancel</Button>}
      </div>
    </div>
  );
}
