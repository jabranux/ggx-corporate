/**
 * Compact Review-step summary cards for the GGX Basic single-booking flow —
 * deliberately NOT `AddressDisplayCard` (used elsewhere for Address Book /
 * Settings, where the fuller multi-row layout is correct). Review needs a
 * much shorter card: name and mobile number sit beside each other (never
 * pushed apart with `justify-between`), the address label sits inline with
 * the section heading, and delivery/item details are summarized concretely
 * instead of a generic "No description · small" fallback.
 *
 * Pickup & Delivery reuses the exact connected-address rail
 * (`AddressRouteRail`) Step 1 (`BookingAddressSection.tsx`) draws between its
 * two editable address rows — same dots, same dashed connector — just
 * read-only here, under a single Edit action for the whole section. Item
 * Details gets its own card (not grouped with addresses/delivery) and reuses
 * Step 2's pouch illustration (`basicPouchSizes.ts`'s `iconUrl`) so the
 * parcel size reads the same way it did when the user picked it.
 */
import { IconMapPin, IconTruckDelivery, IconBuildingStore } from '@tabler/icons-react';
import { Badge } from './ui/Badge';
import { BookingScheduleSummary } from './BookingScheduleSummary';
import { AddressRouteRail } from './BookingAddressSection';
import { getBasicPouchSize } from '../lib/basicPouchSizes';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import { labelColors, getDisplayLabel } from './AddressDisplayCard';
import type { Address } from './AddressBook';
import type { BookingDraft } from '../lib/basicBookingDraft';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function SectionHeader({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <button type="button" onClick={onEdit} className="text-xs font-semibold text-blue-600">Edit</button>
    </div>
  );
}

function CompactAddressRow({ sectionLabel, address }: { sectionLabel: string; address: Address | null }) {
  if (!address) {
    return (
      <div className="flex items-center justify-between gap-2 py-2.5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{sectionLabel}</p>
        <p className="text-sm text-gray-400">Not set</p>
      </div>
    );
  }
  return (
    <div className="py-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{sectionLabel}</p>
        <Badge variant={labelColors[address.label] || 'default'} className="text-[10px] px-1.5 py-0 capitalize">
          {getDisplayLabel(address)}
        </Badge>
      </div>
      <p className="flex flex-wrap items-baseline gap-1.5 text-sm font-medium text-gray-900">
        <span>{address.name}</span>
        <span className="text-gray-300">|</span>
        <span>{address.mobileNumber}</span>
      </p>
      <p className="mt-0.5 flex items-start gap-1 text-xs text-gray-500">
        <IconMapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
        <span>
          {[address.barangay, address.city, address.province].filter(Boolean).join(', ')}
          {address.otherDetails && <span className="block text-gray-400">{address.otherDetails}</span>}
        </span>
      </p>
    </div>
  );
}

export interface BookingReviewSummaryProps {
  draft: BookingDraft;
  onEditAddresses: () => void;
  onEditItem: () => void;
  deliveryEstimateLabel?: string;
}

export function BookingReviewSummary({ draft, onEditAddresses, onEditItem, deliveryEstimateLabel }: BookingReviewSummaryProps) {
  const pouch = getBasicPouchSize(draft.pouchSize);
  const totals = computeBookingTotals(draft);
  const { coveredValue, itemProtection: protectionFee } = totals;

  const DeliveryMethodIcon = draft.firstMile === 'pickup' ? IconTruckDelivery : IconBuildingStore;
  const deliveryMethodLabel = draft.firstMile === 'pickup' ? 'Rider Pickup' : 'Drop-off';

  return (
    <div className="space-y-3">
      <BookingScheduleSummary draft={draft} deliveryEstimateLabel={deliveryEstimateLabel} />

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <SectionHeader label="Pickup & delivery" onEdit={onEditAddresses} />
        <div className="flex gap-3">
          <AddressRouteRail />
          <div className="min-w-0 flex-1 divide-y divide-gray-100">
            <CompactAddressRow sectionLabel="Pickup" address={draft.pickupAddress} />
            <CompactAddressRow sectionLabel="Recipient" address={draft.recipientAddress} />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1.5 border-t border-gray-100 pt-2.5">
          <Badge variant="secondary" className="inline-flex items-center gap-1 text-xs">
            <DeliveryMethodIcon className="w-3.5 h-3.5" />
            {deliveryMethodLabel}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <SectionHeader label="Item details" onEdit={onEditItem} />
        <div className="flex gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-gray-50">
            <img src={pouch.iconUrl} alt={pouch.label} className="h-10 w-10 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{draft.itemDescription}</p>
            <p className="text-xs text-gray-500">{pouch.label} · up to {pouch.maxWeight}</p>
            <div className="mt-1 space-y-0.5 text-xs text-gray-500">
              {draft.merchandiseCod.enabled && (
                <p>COD: {fmtPHP(totals.codAmount)}</p>
              )}
              {!draft.merchandiseCod.enabled && coveredValue > 0 && (
                <p>Declared value: {fmtPHP(coveredValue)}</p>
              )}
              <p>
                Protection: {draft.itemProtectionTier === 'paid' ? `Up to ${fmtPHP(coveredValue)}` : 'Free (up to ₱500)'}
                {protectionFee > 0 && ` · ${fmtPHP(protectionFee)} fee`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
