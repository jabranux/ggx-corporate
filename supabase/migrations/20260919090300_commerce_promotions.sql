-- Promotions: promo codes, product/collection eligibility, and an atomic
-- usage ledger. Discount calculation itself happens in the BFF (never the
-- browser) — see api/commerce/promotions/* — but usage-limit enforcement is
-- race-safe only because it happens inside a DB transaction here
-- (`SELECT ... FOR UPDATE` on the promotion row before incrementing
-- usage_count), not in application memory.

create table commerce_promotions (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  name text not null,
  code text not null,
  discount_type text not null,
  discount_value numeric(12,2) not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  min_order_amount numeric(12,2) not null default 0,
  usage_limit integer null,
  usage_count integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_promotions_discount_type_chk check (discount_type in ('percentage', 'fixed')),
  constraint commerce_promotions_discount_value_chk check (discount_value > 0),
  constraint commerce_promotions_percentage_range_chk
    check (discount_type <> 'percentage' or discount_value <= 100),
  constraint commerce_promotions_date_range_chk check (end_date > start_date),
  constraint commerce_promotions_min_order_chk check (min_order_amount >= 0),
  constraint commerce_promotions_usage_limit_chk check (usage_limit is null or usage_limit > 0),
  constraint commerce_promotions_usage_count_chk check (usage_count >= 0),
  constraint commerce_promotions_usage_within_limit_chk
    check (usage_limit is null or usage_count <= usage_limit),
  constraint commerce_promotions_status_chk check (status in ('active', 'inactive')),
  -- Case-insensitive uniqueness per account ("ACME10" and "acme10" collide).
  constraint commerce_promotions_account_code_uniq unique (account_id, code)
);

-- Enforced separately from the unique constraint above because we want
-- lookups ("does this code exist for this account?") to be case-insensitive
-- too, not just collision-safe at write time.
create unique index commerce_promotions_account_code_upper_uniq
  on commerce_promotions (account_id, upper(code));

create index commerce_promotions_account_status_idx on commerce_promotions (account_id, status);

create trigger commerce_promotions_set_updated_at
  before update on commerce_promotions
  for each row execute function commerce_set_updated_at();

alter table commerce_promotions enable row level security;

-- Normalize codes to uppercase at write time so display/lookup never has to
-- guess a casing convention.
create or replace function commerce_normalize_promotion_code()
returns trigger
language plpgsql
as $$
begin
  new.code = upper(trim(new.code));
  return new;
end;
$$;

create trigger commerce_promotions_normalize_code
  before insert or update on commerce_promotions
  for each row execute function commerce_normalize_promotion_code();

-- ─── Eligibility (empty on both = store-wide) ───────────────────────────
create table commerce_promotion_products (
  promotion_id uuid not null references commerce_promotions (id) on delete cascade,
  product_id uuid not null references commerce_products (id) on delete cascade,
  primary key (promotion_id, product_id)
);

alter table commerce_promotion_products enable row level security;

create or replace function commerce_check_promotion_product_tenant()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from commerce_promotions pr
    join commerce_products p on p.account_id = pr.account_id
    where pr.id = new.promotion_id and p.id = new.product_id
  ) then
    raise exception 'product % does not belong to the same account as promotion %', new.product_id, new.promotion_id;
  end if;
  return new;
end;
$$;

create trigger commerce_promotion_products_check_tenant
  before insert or update on commerce_promotion_products
  for each row execute function commerce_check_promotion_product_tenant();

create table commerce_promotion_collections (
  promotion_id uuid not null references commerce_promotions (id) on delete cascade,
  collection_id uuid not null references commerce_collections (id) on delete cascade,
  primary key (promotion_id, collection_id)
);

alter table commerce_promotion_collections enable row level security;

create or replace function commerce_check_promotion_collection_tenant()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from commerce_promotions pr
    join commerce_collections c on c.account_id = pr.account_id
    where pr.id = new.promotion_id and c.id = new.collection_id
  ) then
    raise exception 'collection % does not belong to the same account as promotion %', new.collection_id, new.promotion_id;
  end if;
  return new;
end;
$$;

create trigger commerce_promotion_collections_check_tenant
  before insert or update on commerce_promotion_collections
  for each row execute function commerce_check_promotion_collection_tenant();

-- ─── Usage ledger ────────────────────────────────────────────────────────
-- `storefront_order_ref` is a breadcrumb (the demo StorefrontOrder id, e.g.
-- "SO-2026-0002"), not a foreign key — GGX Corporate's order/checkout
-- placement stays the existing demo/mock flow (see docs/roadmap.md's
-- "Deferred Production-Only Items"); only promotion validation/redemption is
-- real and authoritative in this pass. `idempotency_key` prevents a retried
-- checkout submission from redeeming the same code twice, same convention as
-- the Ops Requests proxy's Idempotency-Key header.
create table commerce_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references commerce_promotions (id) on delete cascade,
  account_id text not null,
  idempotency_key text not null,
  storefront_order_ref text null,
  order_subtotal numeric(12,2) not null,
  amount_discounted numeric(12,2) not null,
  redeemed_at timestamptz not null default now(),
  constraint commerce_promotion_redemptions_amount_chk check (amount_discounted >= 0),
  constraint commerce_promotion_redemptions_idempotency_uniq unique (promotion_id, idempotency_key)
);

create index commerce_promotion_redemptions_promotion_idx on commerce_promotion_redemptions (promotion_id);

alter table commerce_promotion_redemptions enable row level security;
