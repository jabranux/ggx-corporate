/**
 * commercePromotions — promo codes, eligibility, and authoritative
 * server-side validation/redemption. See section 12 of the Commerce spec:
 * discount calculation and usage-limit enforcement must never trust the
 * browser. `validatePromotion` is read-only (safe to call on every keystroke/
 * cart change); `redeemPromotion` is the only function that mutates
 * `usage_count`, and it does so inside a row-locked transaction so concurrent
 * checkouts can never both squeeze past a usage limit.
 */
import { randomUUID } from 'node:crypto';
import type { ISql } from 'postgres';
import { getCommerceSql } from './commerceDb.js';

type SqlLike = ISql<{}>;
import { CommerceNotFoundError, CommerceValidationError, translateDbError } from './commerceErrors.js';

export type DiscountType = 'percentage' | 'fixed';

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
  status: 'active' | 'inactive';
  productIds: string[];
  collectionIds: string[];
}

function mapPromotion(row: any): Omit<Promotion, 'productIds' | 'collectionIds'> {
  return {
    id: row.id, accountId: row.account_id, name: row.name, code: row.code,
    discountType: row.discount_type, discountValue: Number(row.discount_value),
    startDate: row.start_date, endDate: row.end_date, minOrderAmount: Number(row.min_order_amount),
    usageLimit: row.usage_limit, usageCount: row.usage_count, status: row.status,
  };
}

async function eligibility(accountId: string, promotionId: string): Promise<{ productIds: string[]; collectionIds: string[] }> {
  const sql = getCommerceSql();
  const products = await sql<any[]>`select product_id from commerce_promotion_products where promotion_id = ${promotionId}`;
  const collections = await sql<any[]>`select collection_id from commerce_promotion_collections where promotion_id = ${promotionId}`;
  return { productIds: products.map((p) => p.product_id), collectionIds: collections.map((c) => c.collection_id) };
}

export async function listPromotions(accountId: string): Promise<Promotion[]> {
  const sql = getCommerceSql();
  const rows = await sql<any[]>`select * from commerce_promotions where account_id = ${accountId} order by created_at desc`;
  const out: Promotion[] = [];
  for (const row of rows) {
    const el = await eligibility(accountId, row.id);
    out.push({ ...mapPromotion(row), ...el });
  }
  return out;
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
  status?: 'active' | 'inactive';
  productIds?: string[];
  collectionIds?: string[];
}

function validatePromotionInput(input: PromotionInput): void {
  if (!input.name?.trim()) throw new CommerceValidationError('Promotion name is required.');
  if (!input.code?.trim()) throw new CommerceValidationError('Promo code is required.');
  if (!['percentage', 'fixed'].includes(input.discountType)) throw new CommerceValidationError('discountType must be percentage or fixed.');
  if (!(input.discountValue > 0)) throw new CommerceValidationError('Discount value must be greater than zero.');
  if (input.discountType === 'percentage' && input.discountValue > 100) throw new CommerceValidationError('Percentage discount cannot exceed 100.');
  if (new Date(input.endDate) <= new Date(input.startDate)) throw new CommerceValidationError('End date must be after start date.');
}

export async function createPromotion(accountId: string, input: PromotionInput): Promise<Promotion> {
  validatePromotionInput(input);
  const sql = getCommerceSql();
  const id = randomUUID();
  await sql.begin(async (tx) => {
    try {
      await tx`
        insert into commerce_promotions (id, account_id, name, code, discount_type, discount_value, start_date, end_date, min_order_amount, usage_limit, status)
        values (${id}, ${accountId}, ${input.name.trim()}, ${input.code.trim()}, ${input.discountType}, ${input.discountValue},
                ${input.startDate}, ${input.endDate}, ${input.minOrderAmount ?? 0}, ${input.usageLimit ?? null}, ${input.status ?? 'active'})
      `;
    } catch (err) {
      translateDbError(err, `Promo code "${input.code}" is already in use for this account.`);
    }
    await attachEligibility(tx, accountId, id, input.productIds ?? [], input.collectionIds ?? []);
  });
  const [row] = await sql<any[]>`select * from commerce_promotions where id = ${id}`;
  const el = await eligibility(accountId, id);
  return { ...mapPromotion(row), ...el };
}

async function attachEligibility(tx: SqlLike, accountId: string, promotionId: string, productIds: string[], collectionIds: string[]): Promise<void> {
  await tx`delete from commerce_promotion_products where promotion_id = ${promotionId}`;
  await tx`delete from commerce_promotion_collections where promotion_id = ${promotionId}`;
  for (const productId of productIds) {
    try {
      await tx`insert into commerce_promotion_products (promotion_id, product_id) values (${promotionId}, ${productId})`;
    } catch (err) {
      translateDbError(err, 'One or more selected products are not eligible for this promotion.');
    }
  }
  for (const collectionId of collectionIds) {
    try {
      await tx`insert into commerce_promotion_collections (promotion_id, collection_id) values (${promotionId}, ${collectionId})`;
    } catch (err) {
      translateDbError(err, 'One or more selected collections are not eligible for this promotion.');
    }
  }
}

export async function updatePromotion(accountId: string, promotionId: string, patch: Partial<PromotionInput>): Promise<Promotion> {
  const sql = getCommerceSql();
  const [existing] = await sql<any[]>`select * from commerce_promotions where id = ${promotionId} and account_id = ${accountId}`;
  if (!existing) throw new CommerceNotFoundError('Promotion not found.');

  const merged: PromotionInput = {
    name: patch.name ?? existing.name,
    code: patch.code ?? existing.code,
    discountType: patch.discountType ?? existing.discount_type,
    discountValue: patch.discountValue ?? Number(existing.discount_value),
    startDate: patch.startDate ?? existing.start_date,
    endDate: patch.endDate ?? existing.end_date,
    minOrderAmount: patch.minOrderAmount ?? Number(existing.min_order_amount),
    usageLimit: patch.usageLimit !== undefined ? patch.usageLimit : existing.usage_limit,
    status: patch.status ?? existing.status,
  };
  validatePromotionInput(merged);
  if (merged.usageLimit != null && merged.usageLimit < existing.usage_count) {
    throw new CommerceValidationError(`Usage limit cannot be set below the ${existing.usage_count} time(s) this code has already been used.`);
  }

  await sql.begin(async (tx) => {
    try {
      await tx`
        update commerce_promotions set
          name = ${merged.name.trim()}, code = ${merged.code.trim()}, discount_type = ${merged.discountType},
          discount_value = ${merged.discountValue}, start_date = ${merged.startDate}, end_date = ${merged.endDate},
          min_order_amount = ${merged.minOrderAmount ?? 0}, usage_limit = ${merged.usageLimit ?? null}, status = ${merged.status ?? 'active'}
        where id = ${promotionId}
      `;
    } catch (err) {
      translateDbError(err, `Promo code "${merged.code}" is already in use for this account.`);
    }
    if (patch.productIds !== undefined || patch.collectionIds !== undefined) {
      const currentEl = await eligibility(accountId, promotionId);
      await attachEligibility(tx, accountId, promotionId, patch.productIds ?? currentEl.productIds, patch.collectionIds ?? currentEl.collectionIds);
    }
  });

  const [row] = await sql<any[]>`select * from commerce_promotions where id = ${promotionId}`;
  const el = await eligibility(accountId, promotionId);
  return { ...mapPromotion(row), ...el };
}

export async function deletePromotion(accountId: string, promotionId: string): Promise<void> {
  const sql = getCommerceSql();
  const result = await sql`delete from commerce_promotions where id = ${promotionId} and account_id = ${accountId}`;
  if (result.count === 0) throw new CommerceNotFoundError('Promotion not found.');
}

// ─── Validation / redemption (authoritative, never trusts the browser) ────

export interface CartContext {
  subtotal: number;
  /** Product ids currently in the cart — used to check product/collection eligibility. */
  productIds: string[];
}

export interface DiscountResult {
  promotionId: string;
  code: string;
  discountAmount: number;
  finalSubtotal: number;
}

/** Compute (never trust a client-supplied amount) the discount a promotion
 * would apply to `cart`, or throw a `CommerceValidationError` describing why
 * it doesn't apply (expired, not yet active, inactive, minimum not met,
 * usage limit reached, no eligible items) or `CommerceNotFoundError` for an
 * unknown code — the caller (router) maps both to a clear, safe rejection
 * message; neither ever reveals another account's promotion codes (the
 * lookup is always scoped to `accountId`). */
export async function validatePromotion(accountId: string, code: string, cart: CartContext): Promise<DiscountResult> {
  const sql = getCommerceSql();
  const [promo] = await sql<any[]>`
    select * from commerce_promotions where account_id = ${accountId} and upper(code) = upper(${code.trim()})
  `;
  if (!promo) throw new CommerceNotFoundError('This promo code is not valid.');
  return computeDiscount(promo, cart, await eligibility(accountId, promo.id));
}

async function computeDiscount(promo: any, cart: CartContext, el: { productIds: string[]; collectionIds: string[] }): Promise<DiscountResult> {
  if (promo.status !== 'active') throw new CommerceValidationError('This promo code is no longer active.');
  const now = new Date();
  if (now < new Date(promo.start_date)) throw new CommerceValidationError('This promo code is not active yet.');
  if (now > new Date(promo.end_date)) throw new CommerceValidationError('This promo code has expired.');
  if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) throw new CommerceValidationError('This promo code has reached its usage limit.');
  if (cart.subtotal < Number(promo.min_order_amount)) {
    throw new CommerceValidationError(`This promo code requires a minimum order of ${Number(promo.min_order_amount)}.`);
  }

  if (el.productIds.length > 0 || el.collectionIds.length > 0) {
    const sql = getCommerceSql();
    const eligible = el.productIds.some((id) => cart.productIds.includes(id))
      || (el.collectionIds.length > 0 && cart.productIds.length > 0 &&
          (await sql<any[]>`
            select 1 from commerce_collection_products
            where collection_id = any(${el.collectionIds}) and product_id = any(${cart.productIds}) limit 1
          `).length > 0);
    if (!eligible) throw new CommerceValidationError('This promo code does not apply to the items in your cart.');
  }

  const discountAmount = promo.discount_type === 'percentage'
    ? Math.round((cart.subtotal * Number(promo.discount_value)) / 100 * 100) / 100
    : Math.min(Number(promo.discount_value), cart.subtotal);

  return {
    promotionId: promo.id,
    code: promo.code,
    discountAmount,
    finalSubtotal: Math.max(0, Math.round((cart.subtotal - discountAmount) * 100) / 100),
  };
}

export interface RedeemInput extends CartContext {
  idempotencyKey: string;
  storefrontOrderRef?: string;
}

/**
 * Authoritatively apply a promotion at checkout completion. Row-locks the
 * promotion (`FOR UPDATE`) before re-validating and incrementing
 * `usage_count`, so two concurrent checkouts against the last remaining use
 * of a limited code can never both succeed. Replaying the same
 * `idempotencyKey` for the same promotion returns the ORIGINAL result
 * without redeeming twice — safe to retry a checkout submission that
 * timed out client-side.
 */
export async function redeemPromotion(accountId: string, code: string, input: RedeemInput): Promise<DiscountResult> {
  const sql = getCommerceSql();
  return sql.begin(async (tx) => {
    const [promo] = await tx<any[]>`
      select * from commerce_promotions where account_id = ${accountId} and upper(code) = upper(${code.trim()}) for update
    `;
    if (!promo) throw new CommerceNotFoundError('This promo code is not valid.');

    const [already] = await tx<any[]>`
      select amount_discounted, order_subtotal from commerce_promotion_redemptions
      where promotion_id = ${promo.id} and idempotency_key = ${input.idempotencyKey}
    `;
    if (already) {
      return {
        promotionId: promo.id, code: promo.code,
        discountAmount: Number(already.amount_discounted),
        finalSubtotal: Math.max(0, Number(already.order_subtotal) - Number(already.amount_discounted)),
      };
    }

    const el = await (async () => {
      const products = await tx<any[]>`select product_id from commerce_promotion_products where promotion_id = ${promo.id}`;
      const collections = await tx<any[]>`select collection_id from commerce_promotion_collections where promotion_id = ${promo.id}`;
      return { productIds: products.map((p: any) => p.product_id), collectionIds: collections.map((c: any) => c.collection_id) };
    })();
    const result = await computeDiscount(promo, input, el);

    try {
      await tx`
        insert into commerce_promotion_redemptions (promotion_id, account_id, idempotency_key, storefront_order_ref, order_subtotal, amount_discounted)
        values (${promo.id}, ${accountId}, ${input.idempotencyKey}, ${input.storefrontOrderRef ?? null}, ${input.subtotal}, ${result.discountAmount})
      `;
    } catch (err) {
      translateDbError(err, 'Could not record this promotion redemption.');
    }
    await tx`update commerce_promotions set usage_count = usage_count + 1 where id = ${promo.id}`;
    return result;
  });
}
