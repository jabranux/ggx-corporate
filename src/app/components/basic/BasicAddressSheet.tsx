import { useEffect, useState } from 'react';
import { IconX, IconMapPin, IconStar, IconSearch } from '@tabler/icons-react';
import {
  getAddresses,
  type BasicAddress,
} from '../../lib/basicAddressBook';
import { cn } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (addr: BasicAddress) => void;
  title?: string;
}

export function BasicAddressSheet({ open, onClose, onSelect, title = 'Address Book' }: Props) {
  const [addresses, setAddresses] = useState<BasicAddress[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setAddresses(getAddresses());
      setSearch('');
    }
  }, [open]);

  const filtered = addresses.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.city.toLowerCase().includes(search.toLowerCase()) ||
      a.province.toLowerCase().includes(search.toLowerCase()),
  );

  if (!open) return null;

  return (
    /* Full-screen modal backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      {/* Sheet panel */}
      <div
        className="relative w-full max-w-[var(--basic-shell-max,none)] mx-auto rounded-t-[24px] bg-white flex flex-col"
        style={{ maxHeight: '82vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
          <p className="text-base font-bold text-gray-900">{title}</p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <IconX className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
        </div>

        {/* Address list */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <IconMapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No addresses found</p>
            </div>
          ) : (
            filtered.map((addr) => (
              <button
                key={addr.id}
                onClick={() => { onSelect(addr); onClose(); }}
                className={cn(
                  'w-full text-left px-4 py-3.5 flex items-start gap-3 active:bg-blue-50 transition-colors cursor-pointer',
                )}
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <IconMapPin className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{addr.name}</p>
                    {addr.isDefaultSender && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-100 rounded-full px-1.5 py-0.5 leading-none">
                        <IconStar className="w-2.5 h-2.5 fill-current" />
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-snug mt-0.5 truncate">
                    {[addr.street, addr.unit, addr.barangay, addr.city, addr.province]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{addr.mobile}</p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Safe-area bottom pad */}
        <div className="h-4 flex-shrink-0" />
      </div>
    </div>
  );
}
