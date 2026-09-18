-- GGX Corporate Commerce backend — extensions and shared helpers.
--
-- This is the first migration for the new, dedicated GGX Corporate /
-- Business+ Supabase project (NOT QuadX Bridge/HeyQ's project — Commerce is a
-- GGX product-domain capability and stays out of Bridge entirely).
--
-- Access model: every table below has row level security ENABLED, with no
-- policies granted to `anon`/`authenticated`. GGX Corporate has no Supabase
-- Auth users of its own (its session is a separate signed HMAC cookie — see
-- api/_lib/session.ts) and never calls the public Data API for Commerce, so
-- there is nothing to grant those roles. All reads/writes go through GGX
-- Corporate's own trusted BFF (Vercel serverless functions under api/commerce/**),
-- which connects with a role that bypasses RLS and enforces account/subaccount
-- (tenant) isolation itself in application code — the same trust boundary
-- already used for the Support/Claims/Ops Requests proxies to QuadX Bridge.
-- RLS stays enabled on every table as defense-in-depth for the day a public
-- Data API path is deliberately added (none is today).

create extension if not exists pgcrypto;

-- Shared `updated_at` maintenance, reused by every Commerce table below.
create or replace function commerce_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function commerce_set_updated_at() is
  'Sets updated_at = now() on every UPDATE. Attached per-table via BEFORE UPDATE triggers.';
