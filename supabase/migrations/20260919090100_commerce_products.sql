-- Products, images, SKU settings/registry, variant options and variants.
--
-- `account_id` throughout is GGX Corporate's existing account/subaccount scope
-- id (the same string as InventoryProduct.scopeAccountId in the frontend
-- today, e.g. 'acme-luzon' — see docs/account_model.md). There is no local
-- `accounts` table: the account/subaccount model is owned by GGX Corporate's
-- own session/auth layer, not this database, so account_id is a plain
-- verified-server-side string, not a foreign key — every BFF route must
-- resolve it from the caller's session, never trust a client-supplied value.

-- ─── SKU settings & registry ────────────────────────────────────────────────
-- One row per account. `next_sequence` is the atomic allocation counter:
-- the BFF takes it with `SELECT ... FOR UPDATE` inside a transaction before
-- incrementing, so concurrent product/variant creation can never allocate the
-- same number twice. Changing `prefix` only affects FUTURE allocations —
-- existing SKUs already written to `sku_registry`/`products`/`product_variants`
-- are never rewritten.
create table commerce_sku_settings (
  account_id text primary key,
  auto_generate boolean not null default false,
  prefix text not null default '',
  next_sequence bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_sku_settings_prefix_chk check (prefix ~ '^[A-Za-z0-9]{0,12}$'),
  constraint commerce_sku_settings_next_seq_chk check (next_sequence > 0)
);

create trigger commerce_sku_settings_set_updated_at
  before update on commerce_sku_settings
  for each row execute function commerce_set_updated_at();

alter table commerce_sku_settings enable row level security;

-- Uniqueness ledger for every SKU in use (base products AND variants share
-- one namespace per account, matching "SKU must be unique at the correct
-- merchant/account scope"). A manual SKU is uniqueness-checked by inserting
-- here; a unique-violation means "already in use" (409), not a 500.
create table commerce_sku_registry (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  sku text not null,
  product_id uuid null,
  variant_id uuid null,
  created_at timestamptz not null default now(),
  constraint commerce_sku_registry_target_chk
    check (num_nonnulls(product_id, variant_id) = 1),
  constraint commerce_sku_registry_account_sku_uniq unique (account_id, sku)
);

create index commerce_sku_registry_account_idx on commerce_sku_registry (account_id);

alter table commerce_sku_registry enable row level security;

-- ─── Products ────────────────────────────────────────────────────────────
create table commerce_products (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  name text not null,
  slug text not null,
  description text not null default '',
  category text not null default '',
  -- Product status (Draft/Active/Archived) — NOT the stock status, which
  -- stays derived from stock_quantity/low_stock_threshold/unlimited_stock.
  status text not null default 'draft',
  sku text not null,
  has_variants boolean not null default false,
  unit_price numeric(12,2) not null,
  compare_at_price numeric(12,2) null,
  weight numeric(10,3) null,
  length_cm numeric(10,2) null,
  width_cm numeric(10,2) null,
  height_cm numeric(10,2) null,
  stock_quantity integer not null default 0,
  low_stock_threshold integer not null default 0,
  unlimited_stock boolean not null default false,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_products_status_chk check (status in ('draft', 'active', 'archived')),
  constraint commerce_products_unit_price_chk check (unit_price >= 0),
  constraint commerce_products_compare_at_chk
    check (compare_at_price is null or compare_at_price > unit_price),
  constraint commerce_products_stock_chk check (stock_quantity >= 0),
  constraint commerce_products_low_stock_chk check (low_stock_threshold >= 0),
  constraint commerce_products_account_slug_uniq unique (account_id, slug),
  constraint commerce_products_account_sku_fk
    foreign key (account_id, sku) references commerce_sku_registry (account_id, sku) deferrable initially deferred
);

-- The FK above is deferred because a product's own SKU-registry row is
-- inserted in the same transaction as the product itself (registry row must
-- exist by commit, not before the product row is written).

create index commerce_products_account_idx on commerce_products (account_id);
create index commerce_products_account_status_idx on commerce_products (account_id, status);

create trigger commerce_products_set_updated_at
  before update on commerce_products
  for each row execute function commerce_set_updated_at();

alter table commerce_products enable row level security;

-- Registry rows reference their owning product/variant once those rows
-- exist; add the other direction of the FK now that commerce_products exists.
alter table commerce_sku_registry
  add constraint commerce_sku_registry_product_fk
    foreign key (product_id) references commerce_products (id) on delete cascade;

-- ─── Product images ─────────────────────────────────────────────────────
-- Storage location (Cloudflare R2) is recorded as an object key + resolved
-- public URL; image bytes never live in this database.
create table commerce_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references commerce_products (id) on delete cascade,
  account_id text not null,
  r2_object_key text not null,
  url text not null,
  display_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint commerce_product_images_r2_key_uniq unique (r2_object_key)
);

create index commerce_product_images_product_idx on commerce_product_images (product_id, display_order);

-- At most one cover image per product (application code picks the
-- first-by-display_order image as the effective cover when none is marked).
create unique index commerce_product_images_one_cover
  on commerce_product_images (product_id)
  where is_cover;

alter table commerce_product_images enable row level security;

-- ─── Variant options (e.g. Color: Black/White; Size: S/M/L) ─────────────
create table commerce_product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references commerce_products (id) on delete cascade,
  account_id text not null,
  name text not null,
  display_order integer not null default 0,
  constraint commerce_product_options_product_name_uniq unique (product_id, name)
);

create index commerce_product_options_product_idx on commerce_product_options (product_id, display_order);

alter table commerce_product_options enable row level security;

create table commerce_product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references commerce_product_options (id) on delete cascade,
  value text not null,
  -- Short, deterministic suffix fragment used to build readable variant SKUs
  -- (e.g. Black -> BLK, Medium -> M). Merchant-editable; defaults derived
  -- from `value` at creation time by the BFF.
  sku_fragment text not null,
  display_order integer not null default 0,
  constraint commerce_product_option_values_option_value_uniq unique (option_id, value),
  constraint commerce_product_option_values_fragment_chk check (sku_fragment ~ '^[A-Z0-9]{1,8}$')
);

create index commerce_product_option_values_option_idx on commerce_product_option_values (option_id, display_order);

alter table commerce_product_option_values enable row level security;

-- ─── Variants ────────────────────────────────────────────────────────────
create table commerce_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references commerce_products (id) on delete cascade,
  account_id text not null,
  sku text not null,
  -- NULL inherits the base product's value (unit_price / compare_at_price).
  price_override numeric(12,2) null,
  compare_at_price_override numeric(12,2) null,
  stock_quantity integer not null default 0,
  unlimited_stock boolean not null default false,
  status text not null default 'active',
  image_id uuid null references commerce_product_images (id) on delete set null,
  -- Sorted, '|'-joined list of this variant's option_value ids. Enforces
  -- "no two variants of the same product share the same combination" without
  -- a bespoke multi-column exclusion constraint.
  combination_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_product_variants_status_chk check (status in ('active', 'inactive')),
  constraint commerce_product_variants_price_chk check (price_override is null or price_override >= 0),
  constraint commerce_product_variants_compare_at_chk
    check (
      compare_at_price_override is null
      or price_override is null
      or compare_at_price_override > price_override
    ),
  constraint commerce_product_variants_stock_chk check (stock_quantity >= 0),
  constraint commerce_product_variants_product_combination_uniq unique (product_id, combination_key),
  constraint commerce_product_variants_account_sku_fk
    foreign key (account_id, sku) references commerce_sku_registry (account_id, sku) deferrable initially deferred
);

create index commerce_product_variants_product_idx on commerce_product_variants (product_id);

create trigger commerce_product_variants_set_updated_at
  before update on commerce_product_variants
  for each row execute function commerce_set_updated_at();

alter table commerce_product_variants enable row level security;

alter table commerce_sku_registry
  add constraint commerce_sku_registry_variant_fk
    foreign key (variant_id) references commerce_product_variants (id) on delete cascade;

-- Guard: a variant's image must belong to the same product (never let one
-- product's variant point at a different product's photo).
create or replace function commerce_check_variant_image_tenant()
returns trigger
language plpgsql
as $$
begin
  if new.image_id is not null then
    if not exists (
      select 1 from commerce_product_images img
      where img.id = new.image_id and img.product_id = new.product_id
    ) then
      raise exception 'variant image % does not belong to product %', new.image_id, new.product_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger commerce_product_variants_check_image_tenant
  before insert or update on commerce_product_variants
  for each row execute function commerce_check_variant_image_tenant();

create table commerce_product_variant_option_values (
  variant_id uuid not null references commerce_product_variants (id) on delete cascade,
  option_value_id uuid not null references commerce_product_option_values (id) on delete cascade,
  primary key (variant_id, option_value_id)
);

alter table commerce_product_variant_option_values enable row level security;
