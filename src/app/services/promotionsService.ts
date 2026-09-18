/**
 * Promotions service facade — the HTTP client behind the Commerce →
 * Promotions admin page, plus the PUBLIC promo-code validate/redeem calls
 * used by the storefront cart/checkout flow.
 *
 * Backed by the real Commerce BFF (`/api/commerce/promotions*`, implemented
 * under `api/commerce/router.ts` + `api/_lib/commercePromotions.ts`), the
 * same dedicated Postgres database as Inventory/Storefront — never a mock/
 * localStorage model. Admin list/create/update/delete follow the exact same
 * `getJson`/`postJson`/session-expired convention as `storefrontService.ts`
 * (session-authenticated, `accountId` query param for Main-Account scoping —
 * see `api/_lib/commerceAuth.ts`'s `resolveScope`/`resolveWriteAccountId`).
 *
 * `validatePromotionCode`/`redeemPromotionCode` hit the two PUBLIC routes
 * (`/promotions/validate`, `/promotions/redeem`) instead — no session, a
 * `storeSlug` resolves the account server-side (mirrors
 * `publicStorefrontService.ts`'s no-session convention: never dispatch
 * `SESSION_EXPIRED_EVENT`, fail with a readable message instead of throwing
 * into a buyer-facing page). The discount amount is ALWAYS whatever the
 * server returns — this file never computes a discount itself, per the
 * Commerce spec's "never trust a browser-calculated discount" rule.
 */

import { SESSION_EXPIRED_EVENT } from './heyqCustomerApi';

const COMMERCE_BASE = '/api/commerce';

// ─── Types (mirrors api/_lib/commercePromotions.ts) ────────────────────────

export type DiscountType = 'percentage' | 'fixed';
export type PromotionStatus = 'active' | 'inactive';

export interface Promotion {
  id: string;
  accountId: string;
  name: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  minOrderAmount: number;
  usageLimit: number | null;
  usageCount: number;
  status: PromotionStatus;
  /** Empty = store-wide (applies to every product). */
  productIds: string[];
  /** Empty = no collection-level restriction. */
  collectionIds: string[];
}

export interface PromotionInput {
  name: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  minOrderAmount?: number;
  usageLimit?: number | null;
  status?: PromotionStatus;
  productIds?: string[];
  collectionIds?: string[];
}

export interface DiscountResult {
  promotionId: string;
  code: string;
  discountAmount: number;
  finalSubtotal: number;
}

// ─── Session-authenticated HTTP client (same convention as storefrontService.ts) ──

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function notifySessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch { /* non-JSON error body */ }
  return `Request failed (${res.status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${COMMERCE_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    if (!res.ok) {
      if (res.status === 401) notifySessionExpired();
      return { ok: false, status: res.status, message: await parseErrorMessage(res) };
    }
    if (res.status === 204) return { ok: true, data: undefined as T };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, message: 'Network error. Please try again.' };
  }
}

const getJson = <T>(path: string) => request<T>(path, { method: 'GET' });
const postJson = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const patchJson = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
const deleteReq = <T>(path: string) => request<T>(path, { method: 'DELETE' });

function accountQuery(scopeId: string | undefined): string {
  return scopeId ? `?accountId=${encodeURIComponent(scopeId)}` : '';
}

// ─── Admin — list/create/update/delete ─────────────────────────────────────

export async function listPromotions(scopeId: string | undefined): Promise<Promotion[]> {
  const res = await getJson<{ promotions: Promotion[] }>(`/promotions${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
  return res.data.promotions;
}

export async function createPromotion(scopeId: string, input: PromotionInput): Promise<Promotion> {
  const res = await postJson<{ promotion: Promotion }>(`/promotions${accountQuery(scopeId)}`, input);
  if (!res.ok) throw new Error(res.message);
  return res.data.promotion;
}

export async function updatePromotion(
  scopeId: string | undefined,
  id: string,
  patch: Partial<PromotionInput>,
): Promise<Promotion> {
  const res = await patchJson<{ promotion: Promotion }>(`/promotions/${encodeURIComponent(id)}${accountQuery(scopeId)}`, patch);
  if (!res.ok) throw new Error(res.message);
  return res.data.promotion;
}

export async function deletePromotion(scopeId: string | undefined, id: string): Promise<void> {
  const res = await deleteReq<undefined>(`/promotions/${encodeURIComponent(id)}${accountQuery(scopeId)}`);
  if (!res.ok) throw new Error(res.message);
}

// ─── Public — validate/redeem (buyer-facing, no session) ───────────────────

/** Same fail-safe shape as the admin `ApiResult`, but never dispatches
 * `SESSION_EXPIRED_EVENT` (there is no session on the public storefront) and
 * always surfaces the server's own rejection message verbatim — expired/
 * inactive/usage-limit/min-order/ineligible-items/unknown-code are all real
 * backend rejections, never a client-invented validation rule. */
type PublicResult =
  | { ok: true; data: DiscountResult }
  | { ok: false; message: string };

async function publicPromotionPost(path: string, body: unknown): Promise<PublicResult> {
  try {
    const res = await fetch(`${COMMERCE_BASE}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await parseErrorMessage(res) };
    return { ok: true, data: (await res.json()) as DiscountResult };
  } catch {
    return { ok: false, message: 'Network error. Please try again.' };
  }
}

/** Read-only — safe to call on every cart change/checkout mount to refresh
 * the displayed discount. Never mutates `usage_count`. */
export async function validatePromotionCode(
  storeSlug: string,
  code: string,
  subtotal: number,
  productIds: string[],
): Promise<PublicResult> {
  return publicPromotionPost('/promotions/validate', { storeSlug, code, subtotal, productIds });
}

/**
 * Authoritatively redeem a promo code at checkout completion. `idempotencyKey`
 * must be freshly minted per checkout attempt (see `crypto.randomUUID()` —
 * same convention as `opsRequestsService.submitOpsRequest`); replaying the
 * same key is safe (returns the original result instead of double-redeeming),
 * but a NEW attempt (e.g. the buyer retries after fixing something) should
 * mint a new one. Increments the promotion's usage count row-locked
 * server-side — this is the one real (non-mock) write in the checkout flow.
 */
export async function redeemPromotionCode(
  storeSlug: string,
  code: string,
  subtotal: number,
  productIds: string[],
  idempotencyKey: string,
  storefrontOrderRef?: string,
): Promise<PublicResult> {
  return publicPromotionPost('/promotions/redeem', { storeSlug, code, subtotal, productIds, idempotencyKey, storefrontOrderRef });
}
