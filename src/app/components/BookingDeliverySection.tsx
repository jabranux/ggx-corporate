/**
 * Delivery step for the GGX Basic single-booking flow: pickup vs drop-off,
 * service type via the shared `CheckoutDeliveryOptions` component, and
 * pickup-date scheduling for Standard/Same-Day. Entitlement/geography gating
 * comes from the mock `serviceabilityService` (NOT production validation).
 *
 * Same-Day is offered only through the dedicated SDD single-booking flow
 * (`lockedServiceType="same_day"`, set by `BookDelivery.tsx`/
 * `BookingAccordionFlow.tsx` when rendered from `SameDayDeliveryPage.tsx`'s
 * Single mode) — never as a third option alongside Standard/On-Demand in the
 * regular Standard Delivery flow, where `lockedServiceType` is omitted and
 * behavior is unchanged from before SDD existed as a single-booking service.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconTruckDelivery, IconBuildingStore, IconBolt, IconMapPin, IconCircleCheckFilled, IconCalendarEvent } from '@tabler/icons-react';
import { Card, CardContent } from './ui/Card';
import { Drawer } from './ui/Dialog';
import { CheckoutDeliveryOptions } from './CheckoutDeliveryOptions';
import { checkServiceability } from '../services/serviceabilityService';
import { getFeatureStateSync } from '../services/featureEnablementService';
import { classifyRegion } from '../lib/checkoutEstimates';
import {
  getEligiblePickupDates, estimateDeliveryDateRange,
  STANDARD_PICKUP_CUTOFF_HOUR, SAME_DAY_PICKUP_CUTOFF_HOUR,
} from '../lib/basicPickupScheduling';
import { DROPOFF_LOCATIONS } from '../data/dropoffLocations';
import type { Address } from './AddressBook';
import type { FirstMile } from '../lib/basicBookingDraft';
import type { DeliveryServiceType } from '../services/transactionService';
import { cn } from '../lib/utils';

export interface BookingDeliverySectionProps {
  accountId: string;
  recipientAddress: Address | null;
  firstMile: FirstMile;
  onFirstMileChange: (v: FirstMile) => void;
  serviceType: DeliveryServiceType;
  onServiceTypeChange: (v: DeliveryServiceType) => void;
  pickupDate: string | null;
  onPickupDateChange: (v: string) => void;
  /**
   * Locks the service type to a single value (currently only ever
   * `'same_day'`) — hides the Standard/On-Demand picker entirely (Standard
   * Delivery must never be selectable from the SDD flow, per spec) while
   * still showing the serviceability-gated `CheckoutDeliveryOptions` card so
   * an out-of-coverage recipient sees why. When set, a non-metro recipient is
   * never silently downgraded to Standard (the unlocked flow's own fallback)
   * — `onServiceabilityChange` reports `false` instead, so the caller can
   * block Confirm.
   */
  lockedServiceType?: DeliveryServiceType;
  onServiceabilityChange?: (serviceable: boolean) => void;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function BookingDeliverySection({
  accountId,
  recipientAddress,
  firstMile,
  onFirstMileChange,
  serviceType,
  onServiceTypeChange,
  pickupDate,
  onPickupDateChange,
  lockedServiceType,
  onServiceabilityChange,
}: BookingDeliverySectionProps) {
  const [metroOnly, setMetroOnly] = useState(false);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [dropoffLocationsOpen, setDropoffLocationsOpen] = useState(false);

  // On-Demand is an enabled-only capability for Basic (same gate
  // `BulkSpreadsheet.tsx` checks via `getFeatureStateSync('on_demand', ...)`
  // for Business+) — never offered by default. A locked service type (SDD's
  // single-booking flow) replaces the whole picker with that one option.
  const onDemandEnabled = getFeatureStateSync('on_demand', accountId).enabled;
  const allowedOptions = useMemo<DeliveryServiceType[]>(
    () => (lockedServiceType ? [lockedServiceType] : (onDemandEnabled ? ['standard', 'on_demand'] : ['standard'])),
    [lockedServiceType, onDemandEnabled],
  );

  useEffect(() => {
    if (!recipientAddress?.province) {
      setMetroOnly(false);
      setNote(undefined);
      onServiceabilityChange?.(true);
      return;
    }
    let active = true;
    checkServiceability({ address: recipientAddress, serviceType }).then((res) => {
      if (!active) return;
      const effectiveAvailable = res.availableServiceTypes.filter((t) => allowedOptions.includes(t));
      setMetroOnly(effectiveAvailable.includes('on_demand') || effectiveAvailable.includes('same_day'));
      setNote(res.reason);
      if (!effectiveAvailable.includes(serviceType)) {
        if (lockedServiceType) {
          // Never silently fall back to Standard here — it must not become
          // selectable inside the locked SDD flow. Report unserviceable
          // instead so the caller blocks Confirm with a clear reason.
          onServiceabilityChange?.(false);
        } else {
          // The previously selected service type can become unavailable when
          // the recipient address changes (e.g. On-Demand selected for Metro
          // Manila, then the recipient moves to Cebu) or when entitlement
          // doesn't cover it — fall back automatically instead of leaving an
          // unavailable selection confirmable.
          onServiceTypeChange('standard');
        }
      } else {
        onServiceabilityChange?.(true);
      }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientAddress, serviceType, allowedOptions, lockedServiceType]);

  const region = recipientAddress?.province ? classifyRegion(recipientAddress.province) : 'unknown';

  const pickupCutoffHour = serviceType === 'same_day' ? SAME_DAY_PICKUP_CUTOFF_HOUR : STANDARD_PICKUP_CUTOFF_HOUR;

  // Not memoized with an empty dep array: that would freeze "today"/cutoff
  // eligibility at this component's first mount. Recomputing each render is
  // cheap (a handful of date objects) and keeps the chips correct if the
  // page is left open across midnight or the (mock) cutoff hour.
  const eligibleDates = getEligiblePickupDates(5, pickupCutoffHour);
  const deliveryEstimate = useMemo(() => {
    if ((serviceType !== 'standard' && serviceType !== 'same_day') || !pickupDate) return null;
    const [y, m, d] = pickupDate.split('-').map(Number);
    return estimateDeliveryDateRange(new Date(y, m - 1, d), serviceType, region);
  }, [serviceType, pickupDate, region]);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'pickup' as FirstMile, label: 'Rider Pickup', icon: IconTruckDelivery, description: 'We pick up your parcel.' },
            { key: 'dropoff' as FirstMile, label: 'Drop-off', icon: IconBuildingStore, description: 'Drop off at a location.' },
          ]).map(({ key, label, icon: Icon, description }) => {
            const selected = firstMile === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => onFirstMileChange(key)}
                className={cn(
                  'relative flex flex-col gap-1.5 rounded-xl border-2 px-3 py-3 text-left transition-colors',
                  selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                {selected && (
                  <IconCircleCheckFilled className="absolute right-2.5 top-2.5 w-4 h-4 text-blue-600" aria-hidden="true" />
                )}
                <Icon className={cn('w-5 h-5 flex-shrink-0', selected ? 'text-blue-600' : 'text-gray-400')} />
                <span className={cn('text-sm font-semibold', selected ? 'text-blue-900' : 'text-gray-900')}>{label}</span>
                <span className="text-xs text-gray-500 leading-snug">{description}</span>
              </button>
            );
          })}
        </div>

        {/* Shown when there's a real choice to make (On-Demand enabled), or
            when locked to a single option that still needs to surface
            serviceability (e.g. SDD disabled with a clear reason outside
            Metro Manila) — only the common unlocked single-option case (On-
            Demand gated off, plain Standard) skips it as noise. */}
        {(allowedOptions.length > 1 || lockedServiceType) && (
          <CheckoutDeliveryOptions
            options={allowedOptions}
            value={serviceType}
            onChange={onServiceTypeChange}
            region={region}
            metroOnly={metroOnly}
          />
        )}
        {note && <p className="text-xs text-gray-500">{note}</p>}

        {/* Drop-off has no rider and no pickup date to choose — scheduling
            info above is pickup-specific, so it's replaced entirely by
            access to drop-off locations, regardless of service type. */}
        {firstMile === 'dropoff' ? (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setDropoffLocationsOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <IconMapPin className="w-4 h-4 flex-shrink-0" />
              View drop-off locations
            </button>

            <Drawer
              open={dropoffLocationsOpen}
              onClose={() => setDropoffLocationsOpen(false)}
              title="Drop-off locations"
            >
              {DROPOFF_LOCATIONS.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No drop-off locations are available right now.</p>
              ) : (
                <div className="space-y-3">
                  {DROPOFF_LOCATIONS.map((loc) => (
                    <div key={loc.id} className="rounded-lg border border-gray-200 p-3">
                      <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-600">
                        <IconMapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                        <span>{loc.address}</span>
                      </p>
                      {loc.contact && <p className="mt-1 text-xs text-gray-500">{loc.contact}</p>}
                      {loc.hours && <p className="mt-0.5 text-xs text-gray-500">{loc.hours}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Drawer>
          </div>
        ) : (serviceType === 'standard' || serviceType === 'same_day') ? (
          <div className="pt-1">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <IconCalendarEvent className="w-4 h-4 text-gray-400" />
              Pickup date
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
              {eligibleDates.map((date) => {
                const iso = toIsoDate(date);
                const selected = pickupDate === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPickupDateChange(iso)}
                    className={cn(
                      'relative flex-shrink-0 rounded-xl border-2 px-3.5 py-2 text-center transition-colors',
                      selected ? 'border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('block text-[10px] uppercase tracking-wide', selected ? 'text-blue-100' : 'text-gray-400')}>
                      {date.toLocaleDateString('en-PH', { weekday: 'short' })}
                    </span>
                    <span className="block text-sm font-semibold">
                      {date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Pickup dates exclude Sundays and public holidays.
              {serviceType === 'same_day' && ` Same-day booking cutoff is ${SAME_DAY_PICKUP_CUTOFF_HOUR > 12 ? SAME_DAY_PICKUP_CUTOFF_HOUR - 12 : SAME_DAY_PICKUP_CUTOFF_HOUR}:00 PM.`}
            </p>
            {deliveryEstimate && <p className="mt-1 text-xs text-gray-600">{deliveryEstimate.label}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
            <IconBolt className="w-4 h-4 text-violet-600 flex-shrink-0" />
            <p className="text-sm text-violet-800">Pickup today, within 40 minutes of booking.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
