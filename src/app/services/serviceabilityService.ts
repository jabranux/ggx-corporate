/**
 * Serviceability check — a reusable interface with a MOCK implementation
 * only. This is NOT production validation.
 *
 * The mock body reuses the same Metro-Manila-only Same-day/On-demand
 * eligibility rule already used by the public checkout
 * (`lib/checkoutEstimates.ts`'s `isMetroManila`), so the Basic booking flow
 * and buyer checkout stay consistent rather than inventing a second rule.
 * Real serviceability is a backend/BFF concern — likely the same contract
 * behind the Rates API / Drop-off Locations API, both of which already name
 * "Basic booking flow" as a future consumer in
 * `docs/context/future-backlog.md`. When that contract exists, only this
 * function's body should need to change — callers keep the same shape.
 */
import type { Address } from '../components/AddressBook';
import type { DeliveryServiceType } from './transactionService';
import { isMetroManila } from '../lib/checkoutEstimates';

export interface ServiceabilityResult {
  serviceable: boolean;
  availableServiceTypes: DeliveryServiceType[];
  reason?: string;
}

export async function checkServiceability(input: {
  address: Pick<Address, 'province'>;
  serviceType: DeliveryServiceType;
}): Promise<ServiceabilityResult> {
  const province = input.address.province?.trim() ?? '';

  if (!province) {
    return {
      serviceable: false,
      availableServiceTypes: ['standard'],
      reason: 'Select a delivery address to check availability.',
    };
  }

  const metro = isMetroManila(province);
  const availableServiceTypes: DeliveryServiceType[] = metro
    ? ['standard', 'same_day', 'on_demand']
    : ['standard'];

  if (!availableServiceTypes.includes(input.serviceType)) {
    return {
      serviceable: true,
      availableServiceTypes,
      reason: 'Same-Day and On-Demand are available for Metro Manila addresses only. Standard delivery is available.',
    };
  }

  return { serviceable: true, availableServiceTypes };
}
