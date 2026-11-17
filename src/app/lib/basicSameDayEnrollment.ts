/**
 * Same Day Delivery enrollment for Basic accounts. Same Day Delivery is a
 * Sales-assessed capability (basic_user_requirements.md §6/§7), not enabled by
 * default, so the home shortcut and the feature page both read this status.
 *
 * Mock-backed by localStorage, keyed by account id (same pattern as
 * `basicKycProfile.ts`). Approval/rejection is a Sales decision made outside
 * this app, so the only transition this client performs is
 * not_enrolled/rejected -> pending (submit application). Future BFF endpoints:
 * GET /accounts/:id/same-day-enrollment, POST .../applications.
 */
import { loadState, saveState } from './storage';

export type SameDayEnrollmentStatus = 'not_enrolled' | 'pending' | 'approved' | 'rejected';

export interface SameDayApplication {
  businessName: string;
  estimatedDailyOrders: string;
  coverageArea: string;
  notes: string;
}

export interface SameDayEnrollment {
  status: SameDayEnrollmentStatus;
  application: SameDayApplication | null;
  submittedAt: string | null;
}

const NOT_ENROLLED: SameDayEnrollment = { status: 'not_enrolled', application: null, submittedAt: null };

function key(accountId: string): string {
  return `basicSameDayEnrollment.${accountId}`;
}

export function getSameDayEnrollment(accountId: string): SameDayEnrollment {
  return loadState<SameDayEnrollment>(key(accountId), NOT_ENROLLED);
}

/** Submits (or re-submits after a rejection) an application for Sales assessment. */
export function submitSameDayApplication(accountId: string, application: SameDayApplication): SameDayEnrollment {
  const next: SameDayEnrollment = { status: 'pending', application, submittedAt: new Date().toISOString() };
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
