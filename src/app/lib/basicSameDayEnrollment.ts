/**
 * Same Day Delivery enrollment for Basic accounts. Same Day Delivery is a
 * Sales-assessed capability (basic_user_requirements.md §6/§7), not enabled by
 * default, so the home shortcut and the feature page both read this status.
 *
 * Field set and dropdown options mirror GGX's own published SDD lead-gen form
 * (gogoxpress.com/same-day-delivery, "Get started with Same Day Delivery")
 * exactly, per the enhanced Lead-mode page's spec — not invented here.
 *
 * Mock-backed by localStorage, keyed by account id (same pattern as
 * `basicKycProfile.ts`). Approval/rejection is a Sales decision made outside
 * this app, so the only transition this client performs is
 * not_enrolled/rejected -> pending (submit application). Future BFF endpoints:
 * GET /accounts/:id/same-day-enrollment, POST .../applications.
 */
import { loadState, saveState } from './storage';

export type SameDayEnrollmentStatus = 'not_enrolled' | 'pending' | 'approved' | 'rejected';

/** Exact options from the official lead-gen form's "What's your average daily shipment" dropdown. */
export type SameDayAverageDailyShipment = '1-5' | '6-10' | '11-15' | '16-20' | 'more-than-20';

export const SAME_DAY_AVERAGE_DAILY_SHIPMENT_OPTIONS: { value: SameDayAverageDailyShipment; label: string }[] = [
  { value: '1-5', label: '1-5' },
  { value: '6-10', label: '6-10' },
  { value: '11-15', label: '11-15' },
  { value: '16-20', label: '16-20' },
  { value: 'more-than-20', label: 'more than 20' },
];

/** Exact options from the official lead-gen form's "Where is your main pickup location" dropdown — the 17 NCR cities/municipalities, plus its own catch-all. */
export type SameDayPickupLocation =
  | 'caloocan_city' | 'las_pinas_city' | 'makati_city' | 'malabon_city' | 'mandaluyong_city'
  | 'manila_city' | 'marikina_city' | 'muntinlupa_city' | 'navotas_city' | 'paranaque_city'
  | 'pasay_city' | 'pasig_city' | 'pateros' | 'quezon_city' | 'san_juan_city' | 'taguig_city'
  | 'valenzuela_city' | 'outside_metro_manila';

export const SAME_DAY_PICKUP_LOCATION_OPTIONS: { value: SameDayPickupLocation; label: string }[] = [
  { value: 'caloocan_city', label: 'Caloocan City' },
  { value: 'las_pinas_city', label: 'Las Piñas City' },
  { value: 'makati_city', label: 'Makati City' },
  { value: 'malabon_city', label: 'Malabon City' },
  { value: 'mandaluyong_city', label: 'Mandaluyong City' },
  { value: 'manila_city', label: 'Manila City' },
  { value: 'marikina_city', label: 'Marikina City' },
  { value: 'muntinlupa_city', label: 'Muntinlupa City' },
  { value: 'navotas_city', label: 'Navotas City' },
  { value: 'paranaque_city', label: 'Parañaque City' },
  { value: 'pasay_city', label: 'Pasay City' },
  { value: 'pasig_city', label: 'Pasig City' },
  { value: 'pateros', label: 'Pateros' },
  { value: 'quezon_city', label: 'Quezon City' },
  { value: 'san_juan_city', label: 'San Juan City' },
  { value: 'taguig_city', label: 'Taguig City' },
  { value: 'valenzuela_city', label: 'Valenzuela City' },
  { value: 'outside_metro_manila', label: 'Outside Metro Manila' },
];

/** The official form's 6 fields. `accountId` is carried on the stored record (never a form field) — see `submitSameDayApplication`. */
export interface SameDayApplication {
  fullName: string;
  businessName: string;
  mobileNumber: string;
  email: string;
  averageDailyShipment: SameDayAverageDailyShipment | '';
  mainPickupLocation: SameDayPickupLocation | '';
}

export interface SameDayEnrollment {
  status: SameDayEnrollmentStatus;
  application: SameDayApplication | null;
  /** The account this application was submitted for — included in the stored record per spec ("include the registered account ID in the application data without exposing it as a form field"), never rendered as an editable field. */
  accountId: string | null;
  submittedAt: string | null;
}

const NOT_ENROLLED: SameDayEnrollment = { status: 'not_enrolled', application: null, accountId: null, submittedAt: null };

function key(accountId: string): string {
  return `basicSameDayEnrollment.${accountId}`;
}

export function getSameDayEnrollment(accountId: string): SameDayEnrollment {
  return loadState<SameDayEnrollment>(key(accountId), NOT_ENROLLED);
}

/** Submits (or re-submits after a rejection) an application for Sales assessment. */
export function submitSameDayApplication(accountId: string, application: SameDayApplication): SameDayEnrollment {
  const next: SameDayEnrollment = { status: 'pending', application, accountId, submittedAt: new Date().toISOString() };
  saveState(key(accountId), next);
  return next;
}

/** Demo utility only — stands in for Sales' decision, which happens outside this app. */
export function setSameDayEnrollmentStatusForDemo(accountId: string, status: SameDayEnrollmentStatus): SameDayEnrollment {
  const current = getSameDayEnrollment(accountId);
  const next: SameDayEnrollment = { ...current, status };
  saveState(key(accountId), next);
  return next;
}
