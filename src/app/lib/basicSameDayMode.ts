/**
 * SDD prototype switch — Lead | Single | Bulk (spec: "Implement a prototype
 * switch and enhance the Same-Day Delivery experience for the Basic
 * account"). This is a STAKEHOLDER-FACING PROTOTYPING CONTROL, not a
 * customer-facing service selector or a real enrollment/entitlement state —
 * it simply picks which of the three simulated destinations "Same Day
 * Delivery" currently leads to:
 *  - 'lead':   not enrolled — the promotional + enrollment page
 *              (`SameDayDeliveryPage.tsx`'s Lead content; real status still
 *              comes from `basicSameDayEnrollment.ts`).
 *  - 'single': simulates an approved, SDD-enabled account — a dedicated
 *              single-booking flow (reuses `BookDelivery.tsx`, locked to
 *              Same-Day).
 *  - 'bulk':   simulates an approved, SDD-enabled account — redirects to the
 *              Bulk Uploader with Same-Day pre-selected.
 *
 * Deliberately persisted (localStorage, keyed by account id — same pattern as
 * `basicSameDayEnrollment.ts`), unlike the Wizard/Accordion booking switcher
 * (`BookingUxSwitcher.tsx`), because this one changes where OTHER pages (the
 * home shortcut, the services catalog) navigate to — it needs to survive
 * navigating away and back, not just reset-on-visit. Future BFF: none — this
 * entire file is removed once Lead/Single/Bulk stop being three separate
 * simulated prototypes and SDD has one real, backend-driven entitlement flow.
 */
import { loadState, saveState } from './storage';

export type SameDayPrototypeMode = 'lead' | 'single' | 'bulk';

const DEFAULT_MODE: SameDayPrototypeMode = 'lead';

function key(accountId: string): string {
  return `basicSameDayMode.${accountId}`;
}

export function getSameDayMode(accountId: string): SameDayPrototypeMode {
  return loadState<SameDayPrototypeMode>(key(accountId), DEFAULT_MODE);
}

export function setSameDayMode(accountId: string, mode: SameDayPrototypeMode): void {
  saveState(key(accountId), mode);
}
