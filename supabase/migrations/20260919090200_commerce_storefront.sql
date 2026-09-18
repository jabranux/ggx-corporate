-- Storefront profile/branding, product selection, collections, homepage
-- sections, and hero banners.

-- ─── Storefront profile & branding ──────────────────────────────────────
-- One storefront per account/subaccount scope (matches today's
-- StorefrontProfile model 1:1 — account_id is both the primary key and the
-- tenant scope).
create table commerce_storefronts (
  account_id text primary key,
  store_name text not null,
  description text not null default '',
  slug text not null,
  logo_r2_key text null,
  logo_url text null,
  accent_color text null,
  contact_email text not null default '',
  contact_number text not null default '',
  delivery_options text[] not null default '{}',
  social_facebook text null,
  social_instagram text null,
  social_tiktok text null,
  social_website text null,
  publish_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_storefronts_publish_status_chk
    check (publish_status in ('draft', 'published', 'unpublished')),
  constraint commerce_storefronts_slug_uniq unique (slug),
  constraint commerce_storefronts_accent_color_chk
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

create trigger commerce_storefronts_set_updated_at
  before update on commerce_storefronts
  for each row execute function commerce_set_updated_at();

alter table commerce_storefronts enable row level security;

-- ─── Storefront product selection ───────────────────────────────────────
create table commerce_storefront_products (
  account_id text not null references commerce_storefronts (account_id) on delete cascade,
  product_id uuid not null references commerce_products (id) on delete cascade,
  display_order integer not null default 0,
  primary key (account_id, product_id)
);

alter table commerce_storefront_products enable row level security;

-- Guard: a storefront may only list its OWN account's products — never
-- another merchant's (see docs §18 "must never attach another merchant's
-- products").
create or replace function commerce_check_storefront_product_tenant()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from commerce_products p
    where p.id = new.product_id and p.account_id = new.account_id
  ) then
    raise exception 'product % does not belong to account %', new.product_id, new.account_id;
  end if;
  return new;
end;
$$;

create trigger commerce_storefront_products_check_tenant
  before insert or update on commerce_storefront_products
  for each row execute function commerce_check_storefront_product_tenant();

-- ─── Collections ─────────────────────────────────────────────────────────
-- 'featured' and 'sale' are merchant-curated system collections (created
-- once per storefront, seeded by the BFF, editable like any collection);
-- 'custom' is a merchant-created collection. "New Arrivals" is intentionally
-- NOT a collection — it's always computed (newest active products), never
-- curated, so it has no row here.
create table commerce_collections (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  name text not null,
  slug text not null,
  description text not null default '',
  type text not null default 'custom',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_collections_type_chk check (type in ('custom', 'featured', 'sale')),
  constraint commerce_collections_account_slug_uniq unique (account_id, slug)
);

create trigger commerce_collections_set_updated_at
  before update on commerce_collections
  for each row execute function commerce_set_updated_at();

alter table commerce_collections enable row level security;

create table commerce_collection_products (
  collection_id uuid not null references commerce_collections (id) on delete cascade,
  product_id uuid not null references commerce_products (id) on delete cascade,
  display_order integer not null default 0,
  primary key (collection_id, product_id)
);

alter table commerce_collection_products enable row level security;

create or replace function commerce_check_collection_product_tenant()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from commerce_collections c
    join commerce_products p on p.account_id = c.account_id
    where c.id = new.collection_id and p.id = new.product_id
  ) then
    raise exception 'product % does not belong to the same account as collection %', new.product_id, new.collection_id;
  end if;
  return new;
end;
$$;

create trigger commerce_collection_products_check_tenant
  before insert or update on commerce_collection_products
  for each row execute function commerce_check_collection_product_tenant();

-- ─── Homepage sections (merchandising / ordering) ───────────────────────
create table commerce_homepage_sections (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references commerce_storefronts (account_id) on delete cascade,
  title text not null,
  section_type text not null,
  collection_id uuid null references commerce_collections (id) on delete cascade,
  display_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_homepage_sections_type_chk check (section_type in ('collection', 'new_arrivals')),
  constraint commerce_homepage_sections_collection_pairing_chk check (
    (section_type = 'collection' and collection_id is not null)
    or (section_type = 'new_arrivals' and collection_id is null)
  )
);

create index commerce_homepage_sections_account_idx on commerce_homepage_sections (account_id, display_order);

create trigger commerce_homepage_sections_set_updated_at
  before update on commerce_homepage_sections
  for each row execute function commerce_set_updated_at();

alter table commerce_homepage_sections enable row level security;

create or replace function commerce_check_homepage_section_tenant()
returns trigger
language plpgsql
as $$
begin
  if new.collection_id is not null and not exists (
    select 1 from commerce_collections c
    where c.id = new.collection_id and c.account_id = new.account_id
  ) then
    raise exception 'collection % does not belong to account %', new.collection_id, new.account_id;
  end if;
  return new;
end;
$$;

create trigger commerce_homepage_sections_check_tenant
  before insert or update on commerce_homepage_sections
  for each row execute function commerce_check_homepage_section_tenant();

-- ─── Hero banners ────────────────────────────────────────────────────────
-- Presentation only — deliberately not coupled to Promotions (a banner may
-- LINK to a promotion via cta_type/cta_target_id, but a promotion's pricing
-- rules never live here).
create table commerce_hero_banners (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references commerce_storefronts (account_id) on delete cascade,
  desktop_image_r2_key text not null,
  desktop_image_url text not null,
  mobile_image_r2_key text null,
  mobile_image_url text null,
  headline text not null,
  supporting_text text null,
  cta_label text null,
  cta_type text null,
  -- Meaning depends on cta_type: product id / category name / collection id /
  -- promotion id. Not a FK (polymorphic) — the BFF validates ownership
  -- server-side against account_id at write time, same pattern as every
  -- other cross-entity reference in this schema.
  cta_target_id text null,
  cta_external_url text null,
  enabled boolean not null default true,
  display_order integer not null default 0,
  start_date timestamptz null,
  end_date timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_hero_banners_cta_type_chk
    check (cta_type is null or cta_type in ('product', 'category', 'collection', 'promotion', 'external_url')),
  constraint commerce_hero_banners_cta_label_chk
    check (cta_type is null or cta_label is not null),
  constraint commerce_hero_banners_cta_external_url_chk
    check (cta_type <> 'external_url' or cta_external_url ~ '^https://'),
  constraint commerce_hero_banners_date_range_chk
    check (start_date is null or end_date is null or end_date > start_date)
);

create index commerce_hero_banners_account_idx on commerce_hero_banners (account_id, display_order);

create trigger commerce_hero_banners_set_updated_at
  before update on commerce_hero_banners
  for each row execute function commerce_set_updated_at();

alter table commerce_hero_banners enable row level security;
