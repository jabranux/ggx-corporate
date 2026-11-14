/**
 * Compact Review-step summary cards for the GGX Basic single-booking flow —
 * deliberately NOT `AddressDisplayCard` (used elsewhere for Address Book /
 * Settings, where the fuller multi-row layout is correct). Review needs a
 * much shorter card: name and mobile number sit beside each other (never
 * pushed apart with `justify-between`), the address label sits inline with
 * the section heading, and delivery/item details are summarized concretely
 * instead of a generic "No description · small" fallback.
 */
import { IconMapPin } from '@tabler/icons-react';
import { Badge } from './ui/Badge';
import { getBasicPouchSize } from '../lib/basicPouchSizes';
import { computeBookingTotals } from '../lib/basicBookingTotals';
import { labelColors, getDisplayLabel } from './AddressDisplayCard';
import type { Address } from './AddressBook';
import type { BookingDraft } from '../lib/basicBookingDraft';

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function ReviewSection({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-blue-600">Edit</button>
      </div>
      {children}
    </div>
  );
}

function CompactAddressRow({ sectionLabel, address }: { sectionLabel: string; address: Address | null }) {
  if (!address) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{sectionLabel}</p>
        <p className="text-sm text-gray-400">Not set</p>
      </div>
    );
  }
  return (
    <div>
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
  onEditDelivery: () => void;
  onEditItem: () => void;
  deliveryEstimateLabel?: string;
}

export function BookingReviewSummary({ draft, onEditAddresses, onEditDelivery, onEditItem, deliveryEstimateLabel }: BookingReviewSummaryProps) {
  const pouch = getBasicPouchSize(draft.pouchSize);
  const totals = computeBookingTotals(draft);
  const { coveredValue, itemProtection: protectionFee } = totals;

  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white">
      <ReviewSection label="Pickup & recipient" onEdit={onEditAddresses}>
        <div className="space-y-2.5">
          <CompactAddressRow sectionLabel="Pickup" address={draft.pickupAddress} />
          <CompactAddressRow sectionLabel="Recipient" address={draft.recipientAddress} />
        </div>
      </ReviewSection>

      <ReviewSection label="Delivery" onEdit={onEditDelivery}>
        <p className="text-sm text-gray-900">
          {draft.firstMile === 'pickup' ? 'Rider Pickup' : 'Drop-off'}
          {draft.serviceType === 'standard' && draft.pickupDate && (
            <> · {new Date(draft.pickupDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</>
          )}
        </p>
        {deliveryEstimateLabel && <p className="text-xs text-gray-500 mt-0.5">{deliveryEstimateLabel}</p>}
      </ReviewSection>

      <ReviewSection label="Item details" onEdit={onEditItem}>
        <p className="text-sm text-gray-900">{draft.itemDescription} · {pouch.label}</p>
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
      </ReviewSection>
    </div>
  );
}
