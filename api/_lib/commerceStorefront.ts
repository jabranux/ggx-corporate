/**
 * commerceStorefront — Storefront profile/branding, product selection,
 * collections, homepage sections, and hero banners. See
 * docs/storefront_rules.md for the model this extends.
 *
 * Same trust boundary as `commerceProducts.ts`: every function takes an
 * already-verified `accountId`/`ScopeSelection` resolved by the router from
 * the signed session, and the DB's own tenant-check triggers (added in the
 * migrations) back up every cross-entity attachment as defense-in-depth.
 */
import { randomUUID } from 'node:crypto';
import { getCommerceSql } from './commerceDb.js';
import { CommerceNotFoundError, CommerceValidationError, translateDbError } from './commerceErrors.js';
import type { ScopeSelection } from './commerceAuth.js';
import { objectKeyBelongsToAccount } from './commerceStorage.js';

export type PublishStatus = 'draft' | 'published' | 'unpublished';

export interface StorefrontProfile {
  accountId: string;
  storeName: string;
  description: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
  contactEmail: string;
  contactNumber: string;
  deliveryOptions: string[];
  social: { facebook: string | null; instagram: string | null; tiktok: string | null; website: string | null };
  publishStatus: PublishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StorefrontProfileInput {
  storeName?: string;
  description?: string;
  slug?: string;
  contactEmail?: string;
  contactNumber?: string;
  deliveryOptions?: string[];
  accentColor?: string | null;
  social?: Partial<{ facebook: string | null; instagram: string | null; tiktok: string | null; website: string | null }>;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'store';
}

function mapStorefront(row: any): StorefrontProfile {
  return {
    accountId: row.account_id,
    storeName: row.store_name,
    description: row.description,
    slug: row.slug,
    logoUrl: row.logo_url,
    accentColor: row.accent_color,
    contactEmail: row.contact_email,
    contactNumber: row.contact_number,
    deliveryOptions: row.delivery_options,
    social: {
      facebook: row.social_facebook,
      instagram: row.social_instagram,
      tiktok: row.social_tiktok,
      website: row.social_website,
    },
    publishStatus: row.publish_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Get the scope's storefront, creating a default draft profile if none
 * exists yet — mirrors the old mock's `ensureProfileForScope` so an
 * enabled-but-unconfigured storefront is never blank. */
export async function ensureStorefront(accountId: string, defaultStoreName: string): Promise<StorefrontProfile> {
  const sql = getCommerceSql();
  const existing = await sql<any[]>`select * from commerce_storefronts where account_id = ${accountId}`;
  if (existing[0]) return mapStorefront(existing[0]);

  let slug = slugify(defaultStoreName || accountId);
  for (let n = 2; ; n++) {
    const clash = await sql<any[]>`select 1 from commerce_storefronts where slug = ${slug}`;
    if (clash.length === 0) break;
    slug = `${slugify(defaultStoreName || accountId)}-${n}`;
  }
  const [row] = await sql<any[]>`
    insert into commerce_storefronts (account_id, store_name, slug)
    values (${accountId}, ${defaultStoreName || 'My Store'}, ${slug})
    on conflict (account_id) do nothing
    returning *
  `;
  if (row) return mapStorefront(row);
  // Lost a create race to a concurrent request — re-read.
  const [again] = await sql<any[]>`select * from commerce_storefronts where account_id = ${accountId}`;
  return mapStorefront(again);
}

export async function getStorefront(scope: ScopeSelection, accountId: string): Promise<StorefrontProfile> {
  if (scope.mode === 'single' && scope.accountId !== accountId) throw new CommerceNotFoundError('Storefront not found.');
  const sql = getCommerceSql();
  const [row] = await sql<any[]>`select * from commerce_storefronts where account_id = ${accountId}`;
  if (!row) throw new CommerceNotFoundError('Storefront not found.');
  return mapStorefront(row);
}

/** Public read — no session/scope required. Only ever returns a PUBLISHED
 * storefront; anything else 404s (never leaks draft/unpublished existence). */
export async function getPublicStorefront(slug: string): Promise<StorefrontProfile> {
  const sql = getCommerceSql();
  const [row] = await sql<any[]>`select * from commerce_storefronts where slug = ${slug} and publish_status = 'published'`;
  if (!row) throw new CommerceNotFoundError('Store not found.');
  return mapStorefront(row);
}

export async function updateStorefront(accountId: string, patch: StorefrontProfileInput): Promise<StorefrontProfile> {
  const existing = await ensureStorefront(accountId, patch.storeName ?? accountId);
  const sql = getCommerceSql();

  let slug = existing.slug;
  if (patch.slug !== undefined) {
    const candidate = slugify(patch.slug);
    if (candidate !== existing.slug) {
      const clash = await sql<any[]>`select 1 from commerce_storefronts where slug = ${candidate} and account_id <> ${accountId}`;
      if (clash.length) throw new CommerceValidationError(`Store URL "${candidate}" is already taken.`);
      slug = candidate;
    }
  }
  if (patch.accentColor && !/^#[0-9A-Fa-f]{6}$/.test(patch.accentColor)) {
    throw new CommerceValidationError('Accent color must be a hex color like #1A73E8.');
  }

  try {
    const [row] = await sql<any[]>`
      update commerce_storefronts set
        store_name = ${patch.storeName?.trim() ?? existing.storeName},
        description = ${patch.description ?? existing.description},
        slug = ${slug},
        contact_email = ${patch.contactEmail ?? existing.contactEmail},
        contact_number = ${patch.contactNumber ?? existing.contactNumber},
        delivery_options = ${patch.deliveryOptions ?? existing.deliveryOptions},
        accent_color = ${patch.accentColor !== undefined ? patch.accentColor : existing.accentColor},
        social_facebook = ${patch.social?.facebook !== undefined ? patch.social.facebook : existing.social.facebook},
        social_instagram = ${patch.social?.instagram !== undefined ? patch.social.instagram : existing.social.instagram},
        social_tiktok = ${patch.social?.tiktok !== undefined ? patch.social.tiktok : existing.social.tiktok},
        social_website = ${patch.social?.website !== undefined ? patch.social.website : existing.social.website}
      where account_id = ${accountId}
      returning *
    `;
    return mapStorefront(row);
  } catch (err) {
    translateDbError(err, 'Could not update the storefront.');
  }
}

export async function setStorefrontLogo(accountId: string, image: { r2ObjectKey: string; url: string } | null): Promise<StorefrontProfile> {
  await ensureStorefront(accountId, accountId);
  if (image && !objectKeyBelongsToAccount(image.r2ObjectKey, accountId)) {
    throw new CommerceValidationError('That image does not belong to this account.');
  }
  const sql = getCommerceSql();
  const [row] = await sql<any[]>`
    update commerce_storefronts set logo_r2_key = ${image?.r2ObjectKey ?? null}, logo_url = ${image?.url ?? null}
    where account_id = ${accountId}
    returning *
  `;
  return mapStorefront(row);
}

export async function setPublishStatus(accountId: string, status: PublishStatus): Promise<StorefrontProfile> {
  await ensureStorefront(accountId, accountId);
  const sql = getCommerceSql();
  const [row] = await sql<any[]>`update commerce_storefronts set publish_status = ${status} where account_id = ${accountId} returning *`;
  return mapStorefront(row);
}

// ─── Product selection ────────────────────────────────────────────────────

export async function getStorefrontProductIds(accountId: string): Promise<string[]> {
  const sql = getCommerceSql();
  const rows = await sql<any[]>`
    select product_id from commerce_storefront_products where account_id = ${accountId} order by display_order asc
  `;
  return rows.map((r) => r.product_id);
}

export async function setStorefrontProducts(accountId: string, productIds: string[]): Promise<string[]> {
  await ensureStorefront(accountId, accountId);
  const sql = getCommerceSql();
  await sql.begin(async (tx) => {
    await tx`delete from commerce_storefront_products where account_id = ${accountId}`;
    for (let i = 0; i < productIds.length; i++) {
      try {
        await tx`insert into commerce_storefront_products (account_id, product_id, display_order) values (${accountId}, ${productIds[i]}, ${i})`;
      } catch (err) {
        translateDbError(err, 'One or more selected products could not be added to this storefront.');
      }
    }
  });
  return getStorefrontProductIds(accountId);
}

// ─── Collections ──────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  accountId: string;
  name: string;
  slug: string;
  description: string;
  type: 'custom' | 'featured' | 'sale';
  visible: boolean;
  productIds: string[];
}

function mapCollection(row: any): Omit<Collection, 'productIds'> {
  return {
    id: row.id, accountId: row.account_id, name: row.name, slug: row.slug,
    description: row.description, type: row.type, visible: row.visible,
  };
}

export async function listCollections(accountId: string): Promise<Collection[]> {
  const sql = getCommerceSql();
  const rows = await sql<any[]>`select * from commerce_collections where account_id = ${accountId} order by created_at asc`;
  const productRows = await sql<any[]>`
    select cp.collection_id, cp.product_id from commerce_collection_products cp
    join commerce_collections c on c.id = cp.collection_id
    where c.account_id = ${accountId}
    order by cp.display_order asc
  `;
  return rows.map((row) => ({
    ...mapCollection(row),
    productIds: productRows.filter((p) => p.collection_id === row.id).map((p) => p.product_id),
  }));
}

export interface CollectionInput { name: string; description?: string; type?: 'custom' | 'featured' | 'sale'; visible?: boolean; }

export async function createCollection(accountId: string, input: CollectionInput): Promise<Collection> {
  if (!input.name?.trim()) throw new CommerceValidationError('Collection name is required.');
  const sql = getCommerceSql();
  const base = slugify(input.name);
  let slug = base;
  for (let n = 2; ; n++) {
    const clash = await sql<any[]>`select 1 from commerce_collections where account_id = ${accountId} and slug = ${slug}`;
    if (clash.length === 0) break;
    slug = `${base}-${n}`;
  }
  const [row] = await sql<any[]>`
    insert into commerce_collections (id, account_id, name, slug, description, type, visible)
    values (${randomUUID()}, ${accountId}, ${input.name.trim()}, ${slug}, ${input.description ?? ''}, ${input.type ?? 'custom'}, ${input.visible ?? true})
    returning *
  `;
  return { ...mapCollection(row), productIds: [] };
}

export async function updateCollection(accountId: string, collectionId: string, patch: Partial<CollectionInput>): Promise<Collection> {
  const sql = getCommerceSql();
  const [existing] = await sql<any[]>`select * from commerce_collections where id = ${collectionId} and account_id = ${accountId}`;
  if (!existing) throw new CommerceNotFoundError('Collection not found.');
  const [row] = await sql<any[]>`
    update commerce_collections set
      name = ${patch.name?.trim() ?? existing.name},
      description = ${patch.description ?? existing.description},
      visible = ${patch.visible ?? existing.visible}
    where id = ${collectionId}
    returning *
  `;
  const productIds = (await sql<any[]>`select product_id from commerce_collection_products where collection_id = ${collectionId} order by display_order asc`).map((r) => r.product_id);
  return { ...mapCollection(row), productIds };
}

export async function deleteCollection(accountId: string, collectionId: string): Promise<void> {
  const sql = getCommerceSql();
  const result = await sql`delete from commerce_collections where id = ${collectionId} and account_id = ${accountId}`;
  if (result.count === 0) throw new CommerceNotFoundError('Collection not found.');
}

export async function setCollectionProducts(accountId: string, collectionId: string, productIds: string[]): Promise<Collection> {
  const sql = getCommerceSql();
  const [existing] = await sql<any[]>`select * from commerce_collections where id = ${collectionId} and account_id = ${accountId}`;
  if (!existing) throw new CommerceNotFoundError('Collection not found.');
  await sql.begin(async (tx) => {
    await tx`delete from commerce_collection_products where collection_id = ${collectionId}`;
    for (let i = 0; i < productIds.length; i++) {
      try {
        await tx`insert into commerce_collection_products (collection_id, product_id, display_order) values (${collectionId}, ${productIds[i]}, ${i})`;
      } catch (err) {
        translateDbError(err, 'One or more selected products could not be added to this collection.');
      }
    }
  });
  return { ...mapCollection(existing), productIds };
}

// ─── Homepage sections ─────────────────────────────────────────────────────

export interface HomepageSection {
  id: string;
  title: string;
  sectionType: 'collection' | 'new_arrivals';
  collectionId: string | null;
  displayOrder: number;
  enabled: boolean;
}

export async function listHomepageSections(accountId: string): Promise<HomepageSection[]> {
  const sql = getCommerceSql();
  const rows = await sql<any[]>`
    select id, title, section_type, collection_id, display_order, enabled
    from commerce_homepage_sections where account_id = ${accountId} order by display_order asc
  `;
  return rows.map((r) => ({ id: r.id, title: r.title, sectionType: r.section_type, collectionId: r.collection_id, displayOrder: r.display_order, enabled: r.enabled }));
}

export interface HomepageSectionInput {
  title: string;
  sectionType: 'collection' | 'new_arrivals';
  collectionId?: string | null;
  enabled?: boolean;
}

export async function createHomepageSection(accountId: string, input: HomepageSectionInput): Promise<HomepageSection> {
  await ensureStorefront(accountId, accountId);
  if (!input.title?.trim()) throw new CommerceValidationError('Section title is required.');
  if (input.sectionType === 'collection' && !input.collectionId) throw new CommerceValidationError('A collection section requires collectionId.');
  if (input.sectionType === 'new_arrivals' && input.collectionId) throw new CommerceValidationError('New Arrivals is computed automatically and cannot reference a collection.');
  const sql = getCommerceSql();
  const [{ next }] = await sql<any[]>`select coalesce(max(display_order), -1) + 1 as next from commerce_homepage_sections where account_id = ${accountId}`;
  try {
    const [row] = await sql<any[]>`
      insert into commerce_homepage_sections (id, account_id, title, section_type, collection_id, display_order, enabled)
      values (${randomUUID()}, ${accountId}, ${input.title.trim()}, ${input.sectionType}, ${input.collectionId ?? null}, ${next}, ${input.enabled ?? true})
      returning id, title, section_type, collection_id, display_order, enabled
    `;
    return { id: row.id, title: row.title, sectionType: row.section_type, collectionId: row.collection_id, displayOrder: row.display_order, enabled: row.enabled };
  } catch (err) {
    translateDbError(err, 'Could not create the homepage section.');
  }
}

export async function reorderHomepageSections(accountId: string, orderedSectionIds: string[]): Promise<HomepageSection[]> {
  const sql = getCommerceSql();
  const existing = await listHomepageSections(accountId);
  const idsMatch = orderedSectionIds.length === existing.length && existing.every((s) => orderedSectionIds.includes(s.id));
  if (!idsMatch) throw new CommerceValidationError('The section order must include every section exactly once.');
  await sql.begin(async (tx) => {
    for (let i = 0; i < orderedSectionIds.length; i++) {
      await tx`update commerce_homepage_sections set display_order = ${i} where id = ${orderedSectionIds[i]} and account_id = ${accountId}`;
    }
  });
  return listHomepageSections(accountId);
}

export async function updateHomepageSection(accountId: string, sectionId: string, patch: { title?: string; enabled?: boolean }): Promise<HomepageSection> {
  const sql = getCommerceSql();
  const [row] = await sql<any[]>`
    update commerce_homepage_sections set
      title = coalesce(${patch.title?.trim() ?? null}, title),
      enabled = coalesce(${patch.enabled ?? null}, enabled)
    where id = ${sectionId} and account_id = ${accountId}
    returning id, title, section_type, collection_id, display_order, enabled
  `;
  if (!row) throw new CommerceNotFoundError('Homepage section not found.');
  return { id: row.id, title: row.title, sectionType: row.section_type, collectionId: row.collection_id, displayOrder: row.display_order, enabled: row.enabled };
}

export async function deleteHomepageSection(accountId: string, sectionId: string): Promise<void> {
  const sql = getCommerceSql();
  const result = await sql`delete from commerce_homepage_sections where id = ${sectionId} and account_id = ${accountId}`;
  if (result.count === 0) throw new CommerceNotFoundError('Homepage section not found.');
}

// ─── Hero banners ──────────────────────────────────────────────────────────

export interface HeroBanner {
  id: string;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  headline: string;
  supportingText: string | null;
  ctaLabel: string | null;
  ctaType: 'product' | 'category' | 'collection' | 'promotion' | 'external_url' | null;
  ctaTargetId: string | null;
  ctaExternalUrl: string | null;
  enabled: boolean;
  displayOrder: number;
  startDate: string | null;
  endDate: string | null;
}

function mapBanner(row: any): HeroBanner {
  return {
    id: row.id, desktopImageUrl: row.desktop_image_url, mobileImageUrl: row.mobile_image_url,
    headline: row.headline, supportingText: row.supporting_text, ctaLabel: row.cta_label,
    ctaType: row.cta_type, ctaTargetId: row.cta_target_id, ctaExternalUrl: row.cta_external_url,
    enabled: row.enabled, displayOrder: row.display_order, startDate: row.start_date, endDate: row.end_date,
  };
}

export async function listHeroBanners(accountId: string): Promise<HeroBanner[]> {
  const sql = getCommerceSql();
  const rows = await sql<any[]>`select * from commerce_hero_banners where account_id = ${accountId} order by display_order asc`;
  return rows.map(mapBanner);
}

export interface HeroBannerInput {
  desktopImage: { r2ObjectKey: string; url: string };
  mobileImage?: { r2ObjectKey: string; url: string } | null;
  headline: string;
  supportingText?: string | null;
  ctaLabel?: string | null;
  ctaType?: HeroBanner['ctaType'];
  ctaTargetId?: string | null;
  ctaExternalUrl?: string | null;
  enabled?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

/** Server-side ownership check for a banner's CTA target — a banner may only
 * ever point at THIS account's own product/collection/promotion (never
 * another merchant's), and never at an unapproved external URL. */
async function assertCtaTargetOwnership(accountId: string, ctaType: HeroBanner['ctaType'], targetId: string | null | undefined, externalUrl: string | null | undefined): Promise<void> {
  if (!ctaType) return;
  const sql = getCommerceSql();
  if (ctaType === 'external_url') {
    if (!externalUrl || !/^https:\/\//i.test(externalUrl)) throw new CommerceValidationError('External URL must be an https:// link.');
    return;
  }
  if (!targetId) throw new CommerceValidationError('A CTA target is required for this CTA type.');
  if (ctaType === 'product') {
    const [row] = await sql<any[]>`select 1 from commerce_products where id = ${targetId} and account_id = ${accountId}`;
    if (!row) throw new CommerceValidationError('That product does not belong to this account.');
  } else if (ctaType === 'collection') {
    const [row] = await sql<any[]>`select 1 from commerce_collections where id = ${targetId} and account_id = ${accountId}`;
    if (!row) throw new CommerceValidationError('That collection does not belong to this account.');
  } else if (ctaType === 'promotion') {
    const [row] = await sql<any[]>`select 1 from commerce_promotions where id = ${targetId} and account_id = ${accountId}`;
    if (!row) throw new CommerceValidationError('That promotion does not belong to this account.');
  }
  // 'category' targets a free-text category name, not an owned entity — nothing to verify.
}

export async function createHeroBanner(accountId: string, input: HeroBannerInput): Promise<HeroBanner> {
  await ensureStorefront(accountId, accountId);
  if (!input.headline?.trim()) throw new CommerceValidationError('Headline is required.');
  if (!objectKeyBelongsToAccount(input.desktopImage.r2ObjectKey, accountId)) throw new CommerceValidationError('That image does not belong to this account.');
  if (input.mobileImage && !objectKeyBelongsToAccount(input.mobileImage.r2ObjectKey, accountId)) throw new CommerceValidationError('That image does not belong to this account.');
  await assertCtaTargetOwnership(accountId, input.ctaType ?? null, input.ctaTargetId, input.ctaExternalUrl);

  const sql = getCommerceSql();
  const [{ next }] = await sql<any[]>`select coalesce(max(display_order), -1) + 1 as next from commerce_hero_banners where account_id = ${accountId}`;
  try {
    const [row] = await sql<any[]>`
      insert into commerce_hero_banners (
        id, account_id, desktop_image_r2_key, desktop_image_url, mobile_image_r2_key, mobile_image_url,
        headline, supporting_text, cta_label, cta_type, cta_target_id, cta_external_url,
        enabled, display_order, start_date, end_date
      ) values (
        ${randomUUID()}, ${accountId}, ${input.desktopImage.r2ObjectKey}, ${input.desktopImage.url},
        ${input.mobileImage?.r2ObjectKey ?? null}, ${input.mobileImage?.url ?? null},
        ${input.headline.trim()}, ${input.supportingText ?? null}, ${input.ctaLabel ?? null},
        ${input.ctaType ?? null}, ${input.ctaTargetId ?? null}, ${input.ctaExternalUrl ?? null},
        ${input.enabled ?? true}, ${next}, ${input.startDate ?? null}, ${input.endDate ?? null}
      )
      returning *
    `;
    return mapBanner(row);
  } catch (err) {
    translateDbError(err, 'Could not create the banner.');
  }
}

export async function updateHeroBanner(accountId: string, bannerId: string, patch: Partial<HeroBannerInput>): Promise<HeroBanner> {
  const sql = getCommerceSql();
  const [existing] = await sql<any[]>`select * from commerce_hero_banners where id = ${bannerId} and account_id = ${accountId}`;
  if (!existing) throw new CommerceNotFoundError('Banner not found.');
  if (patch.ctaType !== undefined) await assertCtaTargetOwnership(accountId, patch.ctaType, patch.ctaTargetId ?? existing.cta_target_id, patch.ctaExternalUrl ?? existing.cta_external_url);

  try {
    const [row] = await sql<any[]>`
      update commerce_hero_banners set
        headline = ${patch.headline?.trim() ?? existing.headline},
        supporting_text = ${patch.supportingText !== undefined ? patch.supportingText : existing.supporting_text},
        cta_label = ${patch.ctaLabel !== undefined ? patch.ctaLabel : existing.cta_label},
        cta_type = ${patch.ctaType !== undefined ? patch.ctaType : existing.cta_type},
        cta_target_id = ${patch.ctaTargetId !== undefined ? patch.ctaTargetId : existing.cta_target_id},
        cta_external_url = ${patch.ctaExternalUrl !== undefined ? patch.ctaExternalUrl : existing.cta_external_url},
        enabled = ${patch.enabled ?? existing.enabled},
        start_date = ${patch.startDate !== undefined ? patch.startDate : existing.start_date},
        end_date = ${patch.endDate !== undefined ? patch.endDate : existing.end_date}
      where id = ${bannerId}
      returning *
    `;
    return mapBanner(row);
  } catch (err) {
    translateDbError(err, 'Could not update the banner.');
  }
}

export async function deleteHeroBanner(accountId: string, bannerId: string): Promise<void> {
  const sql = getCommerceSql();
  const result = await sql`delete from commerce_hero_banners where id = ${bannerId} and account_id = ${accountId}`;
  if (result.count === 0) throw new CommerceNotFoundError('Banner not found.');
}

export async function reorderHeroBanners(accountId: string, orderedBannerIds: string[]): Promise<HeroBanner[]> {
  const sql = getCommerceSql();
  const existing = await listHeroBanners(accountId);
  const idsMatch = orderedBannerIds.length === existing.length && existing.every((b) => orderedBannerIds.includes(b.id));
  if (!idsMatch) throw new CommerceValidationError('The banner order must include every banner exactly once.');
  await sql.begin(async (tx) => {
    for (let i = 0; i < orderedBannerIds.length; i++) {
      await tx`update commerce_hero_banners set display_order = ${i} where id = ${orderedBannerIds[i]} and account_id = ${accountId}`;
    }
  });
  return listHeroBanners(accountId);
}
