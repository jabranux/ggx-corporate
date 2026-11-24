/**
 * Generic "choose a saved address or add a new one" drawer, picker-first —
 * shared by the Accordion booking variant's Pickup slot and its multiple-
 * recipient list (`BookingAccordionFlow.tsx`). Deliberately simpler than
 * `BookingAddressSection.tsx`'s form-first Recipient sheet (no Recent/
 * Address Book nested shortcuts) since the Accordion variant adds recipients
 * one at a time from a single list and is explicitly a comparison prototype,
 * not a production flow — see that file's own header comment.
 *
 * Reuses the same `addressBookService` facade and `Address` model as the
 * Wizard variant, so addresses created here show up there too (and vice
 * versa) — one shared Address Book, never a duplicate store.
 */
import { useEffect, useState } from 'react';
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { Drawer } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { labelColors, getDisplayLabel } from './AddressDisplayCard';
import { LocationCascadeFields } from './LocationCascadeFields';
import type { Address } from './AddressBook';
import { listAddresses, createAddress } from '../services/addressBookService';
import { isCompleteAddress } from './BookingAddressSection';

const EMPTY_NEW_ADDRESS = { name: '', mobileNumber: '', province: '', city: '', barangay: '', otherDetails: '' };
type NewAddressFields = typeof EMPTY_NEW_ADDRESS;

export interface BookingAddressPickerDrawerProps {
  accountId: string;
  open: boolean;
  onClose: () => void;
  title: string;
  /** New-address records are tagged with this label (e.g. "Pickup" / "Recipient") so they read consistently in the shared Address Book. */
  customLabel: string;
  onSelect: (address: Address) => void;
}

export function BookingAddressPickerDrawer({ accountId, open, onClose, title, customLabel, onSelect }: BookingAddressPickerDrawerProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [view, setView] = useState<'list' | 'add'>('list');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<NewAddressFields>(EMPTY_NEW_ADDRESS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listAddresses(accountId).then((list) => { if (active) setAddresses(list); });
    return () => { active = false; };
  }, [accountId, open]);

  const reset = () => {
    setView('list');
    setSearch('');
    setForm(EMPTY_NEW_ADDRESS);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!isCompleteAddress(form)) return;
    setSaving(true);
    try {
      const created = await createAddress(accountId, {
        label: 'custom',
        customLabel,
        name: form.name.trim(),
        mobileNumber: form.mobileNumber.trim(),
        province: form.province,
        city: form.city,
        barangay: form.barangay,
        otherDetails: form.otherDetails.trim(),
        isPreferred: false,
      });
      onSelect(created);
      handleClose();
    } finally {
      setSaving(false);
    }
  };

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
    <Drawer open={open} onClose={handleClose} title={view === 'add' ? `Add a new ${customLabel.toLowerCase()} address` : title} onBack={view === 'add' ? () => setView('list') : undefined}>
      {view === 'list' ? (
        <div className="space-y-3">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or location…"
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
                  onClick={() => { onSelect(addr); handleClose(); }}
                  className="w-full text-left rounded-lg border border-gray-200 p-3 hover:border-blue-400 transition-colors"
                >
                  <Badge variant={labelColors[addr.label] || 'default'} className="text-[10px] px-1.5 py-0 mb-1.5 capitalize">
                    {getDisplayLabel(addr)}
                  </Badge>
                  <p className="text-sm font-medium text-gray-900 truncate">{addr.name} · {addr.mobileNumber}</p>
                  <p className="text-xs text-gray-500 truncate">{[addr.barangay, addr.city].filter(Boolean).join(', ')}</p>
                </button>
              ))}
            </div>
          )}

          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setView('add')}>
            <IconPlus className="w-3.5 h-3.5 mr-1" /> Add new address
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mobile number</label>
              <Input value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} placeholder="+63 917 123 4567" />
            </div>
            <LocationCascadeFields
              province={form.province}
              city={form.city}
              barangay={form.barangay}
              onChange={(province, city, barangay) => setForm({ ...form, province, city, barangay })}
            />
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Other details</label>
              <Input value={form.otherDetails} onChange={(e) => setForm({ ...form, otherDetails: e.target.value })} placeholder="Street, unit, landmark" />
            </div>
          </div>
          <Button size="sm" className="w-full" disabled={saving || !isCompleteAddress(form)} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save and use this address'}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
