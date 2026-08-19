/**
 * UX Journey Showcase Mode — registry of stakeholder-review journeys.
 *
 * This is an in-memory, presentation-only layer for demoing proposed UX to
 * stakeholders. It reuses existing pages/routes with fixture ids; it does not
 * add new routes, persist state, or touch normal mock/service data. See
 * JourneyContext for the runtime (enter/exit, scenario state, capabilities).
 *
 * Unfinished journeys (Successful Upload, Validation Errors, Partial Success,
 * Subaccount — Payout Required) are intentionally NOT listed here yet. Add
 * them as new JourneyDefinition entries + scenario state when built.
 */

export type JourneyId =
  | 'cod-main-account-payout'
  | 'sdd-cutoff-handling'
  | 'edit-delivery-details';

export interface JourneyDefinition {
  id: JourneyId;
  category: string;
  subcategory?: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  /** Existing app route this journey launches into (reused, never duplicated). */
  route: string;
  /** Short blurb shown in the drawer. */
  description: string;
  /** Compact label for the active-journey indicator, e.g. "COD · Main Account Payout Setup". */
  indicatorLabel: string;
}

// Fixture ids — deliberately outside the real mock datasets (bulk uploads /
// transactions) so a direct/deep link without an active journey resolves to
// the normal "not found" state instead of leaking fixture data.
export const JOURNEY_P1_BATCH_ID = 'journey-cod-payout';
export const JOURNEY_P3_TRACKING_NUMBER = 'GGX-JOURNEY-EDIT-001';

export const JOURNEYS: JourneyDefinition[] = [
  {
    id: 'cod-main-account-payout',
    category: 'Bulk Upload',
    subcategory: 'COD Booking',
    title: 'Main Account — Payout Setup',
    priority: 'P1',
    route: `/dashboard/bulk-uploader/summary/${JOURNEY_P1_BATCH_ID}`,
    description:
      'A COD batch blocked on payout setup — walks through Payment Settings and OTP to a pending bank account.',
    indicatorLabel: 'COD · Main Account Payout Setup',
  },
  {
    id: 'sdd-cutoff-handling',
    category: 'Bulk Upload',
    subcategory: 'SDD',
    title: 'Cutoff Handling',
    priority: 'P2',
    route: '/dashboard/bulk-uploader',
    description: 'Proposed handling for a Same-Day upload started after the 10:00 AM cutoff.',
    indicatorLabel: 'SDD · Cutoff Handling',
  },
  {
    id: 'edit-delivery-details',
    category: 'Transactions',
    title: 'Edit Delivery Details',
    priority: 'P3',
    route: `/dashboard/transactions/${JOURNEY_P3_TRACKING_NUMBER}`,
    description: 'Edit pickup and item details on an unpaid/COD shipment before pickup, with a revised-amount preview.',
    indicatorLabel: 'Transactions · Edit Delivery Details',
  },
];

export function getJourneyDefinition(id: JourneyId | null | undefined): JourneyDefinition | null {
  if (!id) return null;
  return JOURNEYS.find((j) => j.id === id) ?? null;
}

/** Journeys grouped by category → subcategory, in registry order, for the drawer. */
export interface JourneyGroup {
  category: string;
  subgroups: { subcategory: string | null; journeys: JourneyDefinition[] }[];
}

export function groupJourneys(journeys: JourneyDefinition[]): JourneyGroup[] {
  const groups: JourneyGroup[] = [];
  for (const journey of journeys) {
    let group = groups.find((g) => g.category === journey.category);
    if (!group) {
      group = { category: journey.category, subgroups: [] };
      groups.push(group);
    }
    const subKey = journey.subcategory ?? null;
    let subgroup = group.subgroups.find((s) => s.subcategory === subKey);
    if (!subgroup) {
      subgroup = { subcategory: subKey, journeys: [] };
      group.subgroups.push(subgroup);
    }
    subgroup.journeys.push(journey);
  }
  return groups;
}
