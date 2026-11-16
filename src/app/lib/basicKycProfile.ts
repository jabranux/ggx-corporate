/**
 * Basic account KYC/profiling answers — the four-question profile used to
 * personalize GGX Corporate's Basic home (service recommendations only; see
 * `basicServiceCatalog.ts`). Deliberately kept separate from `AuthUser`
 * (`contexts/AuthContext.tsx`), same reasoning as
 * `basicBookingPreferencesService.ts`: profiling answers are a product-
 * personalization concern, not part of the auth/session model.
 *
 * Mock-backed by localStorage, keyed by account id, so answers persist across
 * sessions for that account without touching any other account's data.
 * Future BFF endpoint: GET/PUT /accounts/:id/profile.
 *
 * Business rule (basic_user_requirements.md §6): KYC answers may only
 * influence recommendation ordering, never gate access to a feature — see
 * `basicServiceCatalog.ts`'s `getRecommendedServices`, which always returns
 * the full catalog, just reordered/scored.
 */
import { loadState, saveState } from './storage';

export type KycMainUse = 'personal' | 'selling' | 'business' | 'exploring';

export type KycSellingChannel =
  | 'facebook_instagram'
  | 'own_website'
  | 'physical_store'
  | 'shopee_lazada'
  | 'shopify'
  | 'other';

export type KycDailyOrders = '1-5' | '6-20' | '21-50' | '51+' | 'not-sure';

export type KycDeliveryNeeds = 'same-day' | 'nationwide' | 'both' | 'not-sure';

export interface BasicKycAnswers {
  mainUse: KycMainUse;
  /** Only meaningful when `mainUse` is 'selling' or 'business' — empty otherwise. */
  sellingChannels: KycSellingChannel[];
  dailyOrders: KycDailyOrders;
  deliveryNeeds: KycDeliveryNeeds;
}

export interface BasicKycProfile {
  answers: BasicKycAnswers | null;
  /** Set once the 4-question flow is completed (or re-completed on edit). */
  completedAt: string | null;
  /** Set when the home invitation card is dismissed without completing. */
  invitationDismissedAt: string | null;
}

const EMPTY_PROFILE: BasicKycProfile = {
  answers: null,
  completedAt: null,
  invitationDismissedAt: null,
};

function key(accountId: string): string {
  return `basicKycProfile.${accountId}`;
}

export function getKycProfile(accountId: string): BasicKycProfile {
  return loadState<BasicKycProfile>(key(accountId), EMPTY_PROFILE);
}

export function hasCompletedKyc(profile: BasicKycProfile): boolean {
  return profile.completedAt != null && profile.answers != null;
}

/** Saves completed answers. Clears any prior dismissal — once personalized, the invite no longer applies. */
export function saveKycAnswers(accountId: string, answers: BasicKycAnswers): BasicKycProfile {
  const next: BasicKycProfile = {
    answers,
    completedAt: new Date().toISOString(),
    invitationDismissedAt: null,
  };
  saveState(key(accountId), next);
  return next;
}

/** Dismisses the home invitation card without affecting completion state. */
export function dismissKycInvitation(accountId: string): BasicKycProfile {
  const current = getKycProfile(accountId);
  const next: BasicKycProfile = { ...current, invitationDismissedAt: new Date().toISOString() };
  saveState(key(accountId), next);
  return next;
}

/**
 * Wipes the profile back to never-completed/never-dismissed — a demo-only
 * utility (`Settings.tsx`'s "Reset personalization" action) so the home
 * invite card and the full first-time flow can be re-demoed repeatedly
 * without clearing browser storage by hand. Distinct from editing: this
 * discards the saved answers entirely rather than updating them.
 */
export function resetKycProfile(accountId: string): BasicKycProfile {
  saveState(key(accountId), EMPTY_PROFILE);
  return EMPTY_PROFILE;
}

export function mainUseRequiresSellingChannels(mainUse: KycMainUse): boolean {
  return mainUse === 'selling' || mainUse === 'business';
}
