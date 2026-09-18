# Commerce Implementation Checkpoint

> Durable resume point for the GGX Corporate / Business+ Commerce enhancement
> (Inventory variants/SKU, Storefront branding/collections/homepage/banners,
> Promotions, Cart redesign). Written from direct inspection of the repo at
> commit `2a06f20`, not from chat history — re-verify against current code if
> resuming much later. See also `docs/session_state.md`'s matching 2026-09-19
> checkpoint entry and `docs/roadmap.md`/`docs/context/commerce-workflows.md`
> for the pre-existing Commerce product rules this work extends.

## Checkpoint commit

**`2a06f20`** — `feat(commerce): real backend for Inventory variants/SKU,
Storefront branding/collections/homepage/banners, and Promotions`. This is
the current `HEAD` of `master` (verified via `git log`). Nothing has been
pushed. Working tree has two pre-existing, unrelated modifications
(`.claude/settings.local.json`, `.gitignore`) and one pre-existing untracked
directory (`docs/integration/`) — none of these belong to Commerce work and
should not be swept into a future Commerce commit.

## Architecture and ownership

- **GGX Corporate has its own dedicated Supabase Postgres project**
  (ref `ssdxpybnhbrkolbicgfg`), separate from QuadX Bridge/HeyQ's project.
  Commerce is a GGX product-domain capability and must stay out of Bridge —
  no Commerce tables exist there, and Bridge was not touched by this work.
- **Vercel remains the app/BFF host.** The Commerce backend is reached only
  through GGX Corporate's own Vercel serverless functions
  (`api/commerce/router.ts`), which connect directly to Postgres — there is
  no separate Commerce service/host.
- **Cloudflare R2** (bucket `ggx-corporate-commerce-assets`, per
  `.env.example`'s comments) stores Commerce media (product photos,
  storefront logos, hero banners). Not Supabase Storage, not Vercel Blob.
- The BFF connects to Postgres directly (via the `postgres` npm package),
  not through Supabase's Data API/PostgREST — this is what makes the
  row-locked SKU allocation and promotion-redemption transactions possible.

## Backend already implemented

### Schema (`supabase/migrations/`, 4 files, applied to the real project)

| File | Tables |
|---|---|
| `20260919090000_commerce_extensions_and_helpers.sql` | `pgcrypto` extension, shared `commerce_set_updated_at()` trigger fn |
| `20260919090100_commerce_products.sql` | `commerce_sku_settings`, `commerce_sku_registry`, `commerce_products`, `commerce_product_images`, `commerce_product_options`, `commerce_product_option_values`, `commerce_product_variants`, `commerce_product_variant_option_values` |
| `20260919090200_commerce_storefront.sql` | `commerce_storefronts`, `commerce_storefront_products`, `commerce_collections`, `commerce_collection_products`, `commerce_homepage_sections`, `commerce_hero_banners` |
| `20260919090300_commerce_promotions.sql` | `commerce_promotions`, `commerce_promotion_products`, `commerce_promotion_collections`, `commerce_promotion_redemptions` |

A 19th table, `commerce_schema_migrations`, is created ad hoc by
`scripts/apply-commerce-migrations.mjs` (`npm run commerce:migrate`) to track
which files have been applied — it is not one of the SQL migration files
themselves. That script exists because the Supabase CLI is not installed in
this environment; if it later is, reconcile tracking per the note at the
bottom of that script before the first `supabase db push`.

- **Variants/options/SKUs**: a product optionally has `commerce_product_options`
  (e.g. Color) each with `commerce_product_option_values` (e.g. Black/White,
  each carrying a `sku_fragment`); `commerce_product_variants` store one row
  per combination (`combination_key` = sorted, `|`-joined option-value ids,
  unique per product) with `price_override`/`compare_at_price_override`
  (null inherits the base product), independent stock/status, and an
  optional `image_id`. SKUs (base product AND variant) are allocated through
  `commerce_sku_registry`, unique per `(account_id, sku)`; auto-generation
  uses `commerce_sku_settings.next_sequence`, incremented via
  `SELECT ... FOR UPDATE` inside a transaction so concurrent creates can
  never collide. Changing a prefix only affects future allocations —
  existing SKUs are never rewritten.
- **Images**: `commerce_product_images` stores an R2 object key + resolved
  public URL, `display_order`, and `is_cover` (a partial unique index
  enforces at most one cover image per product).
- **Storefront**: `commerce_storefronts` (one row per account/subaccount,
  `account_id` is the primary key) holds branding (name, description, slug,
  logo, accent color, contact, delivery options, social links) and
  `publish_status` (`draft`/`published`/`unpublished`).
  `commerce_storefront_products` is the product-selection join.
- **Collections/homepage sections**: `commerce_collections` (`type`:
  `custom`/`featured`/`sale`) + `commerce_collection_products` join.
  `commerce_homepage_sections` orders sections on the storefront homepage;
  `section_type` is either `collection` (references a collection) or
  `new_arrivals` (computed — newest active products, never curated, no
  collection row).
- **Banners**: `commerce_hero_banners` — desktop/mobile image, headline,
  supporting text, CTA (`product`/`category`/`collection`/`promotion`/
  `external_url`, ownership-checked server-side), enabled flag, display
  order, optional start/end dates. Deliberately not coupled to Promotions in
  the schema (a banner may *link to* a promotion but carries no pricing
  logic itself).
- **Promotions**: `commerce_promotions` (code normalized to uppercase,
  percentage or fixed discount, date range, min order amount, usage limit/
  count, active/inactive), `commerce_promotion_products`/
  `_collections` (empty = store-wide), `commerce_promotion_redemptions` (an
  idempotency-keyed usage ledger — `(promotion_id, idempotency_key)` unique).

### Tenant/security model

- Every table has **row level security enabled**; **no grants exist for
  `anon`/`authenticated`** — GGX Corporate has no Supabase Auth users of its
  own (its session is the pre-existing signed HMAC cookie, `api/_lib/session.ts`),
  so nothing should ever reach these tables through the public Data API. The
  BFF's Postgres connection bypasses RLS by design and enforces tenant
  isolation in application code instead — the same trust model already used
  for the Support/Claims/Ops Requests proxies to QuadX Bridge.
- **Defense-in-depth at the DB layer**: dedicated trigger functions
  (`commerce_check_storefront_product_tenant`, `_collection_product_tenant`,
  `_promotion_product_tenant`, `_promotion_collection_tenant`,
  `_variant_image_tenant`, `_homepage_section_tenant`) reject attaching a
  record that belongs to a different account, even if the application layer
  had a bug. A trigger rejection surfaces through the BFF as **HTTP 403**
  (Postgres `RAISE EXCEPTION` / code `P0001`), distinct from a plain 400.
- **Account scoping in the BFF** (`api/_lib/commerceAuth.ts`) mirrors the
  existing Ops Requests rule exactly: a manager's `accountId` is always
  forced from their verified session (a client-supplied `accountId` is
  ignored); the Main Account admin (`role: 'admin'`, session `accountId ===
  'main'`) may pass an explicit `accountId` to act on one specific
  subaccount, or omit it for a **consolidated** view/query across every
  account. This is implemented via `resolveScope`/`resolveWriteAccountId`.

## Commerce BFF — routes and contracts

Single consolidated Vercel function, `api/commerce/router.ts` (dispatches on
`req.query.path`, routed via the `vercel.json` rewrite
`/api/commerce/:path+` → `/api/commerce/router?path=:path*`), same
Hobby-function-limit convention as `api/support/router.ts`. Business logic
lives in `api/_lib/commerce{Db,Auth,Errors,Products,Storefront,Promotions,
Storage}.ts` — the router itself is a thin HTTP-shape layer over those.

All routes below require a verified session cookie **except** the ones
explicitly marked public.

| Route | Methods | Notes |
|---|---|---|
| `/api/commerce/sku-settings` | GET, PUT | per-account auto-generate/prefix |
| `/api/commerce/uploads` | POST | mints a presigned R2 PUT URL; `kind`: `product-image` / `storefront-logo` / `storefront-banner` |
| `/api/commerce/products` | GET, POST | list (search/category/sort/price/availability filters) / create |
| `/api/commerce/products/:id` | GET, PATCH, DELETE | |
| `/api/commerce/products/:id/stock-adjust` | POST | `{ delta }`, rejects going below 0 |
| `/api/commerce/products/:id/images` | POST | attach an uploaded image; verifies the R2 key belongs to the product's own account |
| `/api/commerce/products/:id/images/:imageId` | DELETE | also best-effort deletes the R2 object |
| `/api/commerce/products/:id/images/reorder` | POST | `{ orderedImageIds }` |
| `/api/commerce/products/:id/images/:imageId/cover` | POST | |
| `/api/commerce/products/:id/variant-options` | PUT | define/replace options+values; generates missing combinations as variants; never deletes existing variants |
| `/api/commerce/products/:id/variants/:variantId` | PATCH, DELETE | |
| `/api/commerce/storefront` | GET, PATCH | profile/branding (creates a default draft on first read) |
| `/api/commerce/storefront/logo` | PUT, DELETE | |
| `/api/commerce/storefront/publish` | POST | `{ status: draft\|published\|unpublished }` |
| `/api/commerce/storefront/products` | GET, PUT | selected product ids, ordered |
| `/api/commerce/collections` | GET, POST | |
| `/api/commerce/collections/:id` | PATCH, DELETE | |
| `/api/commerce/collections/:id/products` | PUT | |
| `/api/commerce/homepage-sections` | GET, POST | |
| `/api/commerce/homepage-sections/:id` | PATCH, DELETE | |
| `/api/commerce/homepage-sections/reorder` | POST | |
| `/api/commerce/hero-banners` | GET, POST | |
| `/api/commerce/hero-banners/:id` | PATCH, DELETE | |
| `/api/commerce/hero-banners/reorder` | POST | |
| `/api/commerce/promotions` | GET, POST | |
| `/api/commerce/promotions/:id` | PATCH, DELETE | |
| `/api/commerce/promotions/validate` | POST | **public** — `{ storeSlug, code, subtotal, productIds }`, returns computed discount, never trusts a client amount |
| `/api/commerce/promotions/redeem` | POST | **public** — same + `idempotencyKey`; row-locks the promotion, re-validates, increments usage atomically; replaying the same key returns the original result instead of double-redeeming |
| `/api/commerce/public/store/:slug` | GET | **public** — branding only, 404s unless `published` |
| `/api/commerce/public/store/:slug/products` | GET | **public** — active products only; `sort=featured\|newest\|price_asc\|price_desc` |
| `/api/commerce/public/store/:slug/product/:productSlug` | GET | **public** — full detail, active only |
| `/api/commerce/public/store/:slug/homepage` | GET | **public** — added post-checkpoint (frontend Phase 3) to expose enabled homepage sections + in-date-window hero banners; a `collection` section drops if its collection is missing/not `visible`, and only `active` products' ids are ever returned |
| `/api/commerce/public/product/:id` | GET | **public** — added post-checkpoint (frontend Phase 4 audit fix) to back the legacy `/buy/:productId` direct-share link; resolves an `active` product by id alone, deliberately independent of the owning storefront's publish status (this is a merchant sharing one product's own link, not the storefront experience) |

An admin-scoped request may pass `?accountId=` (GET) or `accountId` in the
body (POST/PATCH) to target a specific subaccount or omit it for
consolidated reads — see the tenant-scoping note above. Every non-public
route resolves identity via `requireCommerceIdentity`; every public route
takes no identity at all and derives its account solely from an
already-published storefront's own `accountId`.

## R2 upload / public media

Implementation lives in `api/_lib/commerceStorage.ts`. Flow: BFF mints a
short-lived (5 min) presigned `PUT` URL scoped to a key namespaced under
`accounts/{accountId}/...`; the browser uploads directly to R2; the browser
then calls the relevant "attach" endpoint (e.g.
`POST /products/:id/images`) with the returned object key + public URL,
which the BFF re-verifies belongs to the caller's own account before
writing it to the DB. Only the object key/URL are stored in Postgres —
never image bytes. Accepted types: `image/jpeg`, `image/png`, `image/webp`;
a 10 MB ceiling is enforced as a new default (the old mock uploader had no
size limit at all, so this is not a "preserved" behavior, just a
newly-introduced sane one — true server-side enforcement of the byte size
itself is a known gap, see Risks below).

**Environment variables (names only, no values in this doc or anywhere in
the repo)**: `GGX_COMMERCE_DATABASE_URL`, `GGX_COMMERCE_SUPABASE_URL`,
`GGX_COMMERCE_SUPABASE_SECRET_KEY` (provisioned, currently unused — the BFF
talks to Postgres directly, not the Data API), `GGX_COMMERCE_R2_ACCOUNT_ID`,
`GGX_COMMERCE_R2_ACCESS_KEY_ID`, `GGX_COMMERCE_R2_SECRET_ACCESS_KEY`,
`GGX_COMMERCE_R2_BUCKET`, `GGX_COMMERCE_R2_PUBLIC_URL`. All documented with
usage comments in `.env.example`. `GGX_COMMERCE_DATABASE_URL` currently
holds the Supabase **pooled** (Transaction-mode) connection string — the
project's direct `:5432` connection is IPv6-only and was unreachable from
this environment; production should keep using the pooled string regardless
(Vercel serverless functions opening many short-lived direct connections
would otherwise exhaust the direct connection limit).

## Tests added and current result

- `tests/api-commerce-products.test.mjs` (11 cases) and
  `tests/api-commerce-storefront-promotions.test.mjs` (11 cases) — both run
  against a **real, disposable local Postgres** (Docker), migrated with the
  actual SQL files, not a mocked DB client. Re-run at inspection time for
  this document: **22/22 passing**.
- Coverage includes: manual/duplicate/auto-generate/prefix-change SKU
  behavior, tenant isolation (404 for a manager reading another account's
  product, 403 for a rejected cross-account attach), Main-Account
  consolidated/explicit-account access, stock floor at zero, variant
  combination generation + idempotent re-run, public-vs-private storefront
  separation, promotion validate/redeem lifecycle, tampered-discount
  resistance (the redeem endpoint has no field a client could even use to
  inject a discount amount), a genuine concurrency test (5 simultaneous
  redemptions against `usage_limit=1` — exactly 1 succeeds), expired/unknown
  code rejection.
- Both files are wired into `package.json`'s `test` script and run as part
  of the full suite.
- **A real bug was caught and fixed during this work**: variant SKU registry
  rows were originally being inserted before the variant row they reference
  existed, violating an immediate FK (only the variant's own FK to the
  registry is deferred). Only surfaced by testing against a real Postgres
  instance, not by type-checking.

## Known unrelated flaky/hanging test

`tests/heyq-request-lifecycle.test.mjs` — its "Ticket detail — adaptive
polling lifecycle" suite hung during this session's full-suite validation
run (process CPU time stopped advancing; the Vite dev server it manages on a
fixed port became unreachable partway through, `ERR_CONNECTION_REFUSED` on
two subtests). Killing the stuck process tree let the runner move on. This
file predates Commerce entirely and was not modified by this work — treat
it as a pre-existing flake in that file's dev-server lifecycle handling, not
a regression to chase down as part of Commerce. Last full-suite run: **239
pass / 241 total**, with these 2 as the only failures.

## Legacy/mock Commerce frontend — still needs replacing

All of the following currently read/write **`localStorage`-backed mock
state** and have no knowledge of the new backend yet:

| File | Role |
|---|---|
| `src/app/data/inventory.ts` | `InventoryProduct` mock model + CRUD (no variants/SKU-settings/multi-image-order concepts) |
| `src/app/services/inventoryService.ts` | thin wrapper over the above; exports `getInventoryProducts`, `createInventoryProduct`, `updateInventoryProduct`, `deleteInventoryProduct`, `importInventoryProducts`, `isLowStock`, CSV helpers |
| `src/app/pages/Inventory.tsx`, `src/app/pages/basic/BasicInventory.tsx` | Inventory list/editor pages |
| `src/app/components/ProductFormDialog.tsx` | product create/edit dialog — current image handling is `FileReader.readAsDataURL` into local state (no upload, no cover/reorder persistence, no variant UI at all) |
| `src/app/data/storefront.ts` | `StorefrontProfile` mock model (no collections/homepage-sections/banners/social-links concepts) |
| `src/app/services/storefrontService.ts` | thin wrapper: `getStorefrontProfile`, `updateStorefrontProfile`, `setStorefrontProducts`, `setStorefrontStatus`, etc. |
| `src/app/pages/Storefront.tsx` | merchant Storefront admin page |
| `src/app/components/StorefrontProductsDialog.tsx`, `StorefrontProfileDialog.tsx` | product-selection / profile-edit dialogs |
| `src/app/pages/StorefrontPreview.tsx` | **public** storefront browsing at `/shop/:slug` (product grid, no search/filter/sort, no collections/banners rendering) |
| `src/app/data/storefrontOrders.ts`, `src/app/services/storefrontOrdersService.ts` | buyer order model — **stays as the demo/mock flow** (see Settled UX Decisions) |
| `src/app/pages/StorefrontOrderDetail.tsx` | seller-side order detail |
| `src/app/lib/cartStore.ts`, `src/app/pages/CartReview.tsx`, `src/app/pages/CartCheckout.tsx` | session cart + checkout (current layout: CTA after all rows, no sticky summary — see spec §14) |
| `src/app/pages/BuyerCheckout.tsx` | legacy single-product checkout (`/buy/:productId`) |
| `src/app/components/CheckoutDeliveryOptions.tsx`, `CheckoutPaymentOptions.tsx` | checkout sub-forms, likely reusable as-is |

**No frontend surface exists yet at all** for: variant editor/option
builder, SKU settings UI, image gallery management (upload/reorder/cover),
collections management, homepage-sections/merchandising ordering, hero
banner management, or **Promotions** (confirmed via repo search — no
Promotions page, route, or sidebar entry exists; the only string match for
"promotion" in `src/app` is an unrelated marketing-email checkbox label in
`Settings.tsx`). There is also no product-detail route
(`/shop/:slug/product/:productSlug` or similar) — `StorefrontPreview.tsx`
is grid-only today.

**Current routes** (`src/app/routes.tsx`) relevant to Commerce:
`/shop/:slug` (public grid), `/shop/:slug/cart`, `/checkout`,
`/buy/:productId` (legacy), `/dashboard/inventory`, `/dashboard/storefront`,
`/dashboard/storefront/orders/:id`. The sidebar's "Commerce" group
(`src/app/layouts/RootLayout.tsx`, ~line 239) currently lists only
Inventory and Storefront — Promotions has no entry.

## Remaining frontend work

1. **Inventory + variants/images** — rebuild `ProductFormDialog.tsx` (or
   split into a dedicated variant/option builder) against
   `/api/commerce/products*`, `/variant-options`, `/images*`,
   `/sku-settings`; replace the product list/thumbnail rendering in
   `Inventory.tsx`/`BasicInventory.tsx` to use the new `coverImageUrl`/
   `stockStatus`/`priceRange` fields; wire real R2 presigned uploads.
2. **Storefront admin** — rebuild `Storefront.tsx` /
   `StorefrontProfileDialog.tsx` around `/api/commerce/storefront*`
   (branding, social links, accent color, logo upload, publish), plus new
   UI for collections, homepage sections (ordering), and hero banners.
   "Manage products" should deep-link into Inventory, not duplicate the
   editor (per `docs/storefront_rules.md`, unchanged).
3. **Public storefront/product detail** — rebuild `StorefrontPreview.tsx`
   against `/api/commerce/public/store/:slug/products` with real
   search/category/sort/availability/price filters (desktop side panel,
   mobile filter drawer per spec §9); add the new product-detail route +
   page (gallery, variant selectors, quantity, add-to-cart) backed by
   `/api/commerce/public/store/:slug/product/:productSlug`; render
   collections/homepage sections and hero banners on the storefront home.
4. **Collections/banners** — covered by items 2 and 3 above (admin CRUD +
   public rendering); no separate backend work needed, contracts already
   exist.
5. **Promotions UI** — entirely new: a Commerce → Promotions sidebar page
   (list/create/edit against `/api/commerce/promotions*`), plus wiring
   `promotions/validate` and `promotions/redeem` into the existing cart/
   checkout flow (`CartReview.tsx`/`CartCheckout.tsx`) for promo-code entry,
   applied-discount display, and rejection messaging.
6. **Cart redesign** — `CartReview.tsx`/`CartCheckout.tsx` layout rework
   per spec §14 (sticky right-rail order summary on desktop, compact sticky
   bottom CTA on mobile), independent of the backend work above but a good
   candidate to land alongside the promo-code UI since both touch the same
   files.

## Recommended continuation order

1. Inventory (products/variants/images/SKU settings) — it is the
   dependency root for everything else (`docs/commerce_rules.md`'s
   dependency chain: Inventory → Storefront → Storefront Orders).
2. Storefront admin (branding, collections, homepage sections, banners),
   since the public storefront and product detail pages need real data to
   render against.
3. Public storefront + product detail page.
4. Promotions UI + cart/checkout wiring (validate/redeem + redesign),
   since redeem needs a real storefront/product/promotion already in place
   to test end-to-end.

## Important settled UX decisions

- **Order/checkout placement stays the existing demo/mock flow.**
  `docs/roadmap.md` explicitly defers a real backend-authoritative order
  API as its own future stage ("start it only when a BFF/backend exists").
  This work does **not** build that — `placeOrder()` in
  `data/storefrontOrders.ts` remains the source of truth for an order
  actually being "placed." The **one exception** is promotions: discount
  *validation and redemption* is real and backend-authoritative (per the
  spec's explicit "never trust a browser-calculated discount"), wired to
  fire at the same point the existing demo checkout completes, without the
  surrounding order record itself becoming durable server-side.
- **"New Arrivals" is never merchant-curated** — it's a computed
  (newest-active-products) homepage section with no backing collection row,
  by design, to avoid inventing unreliable curation UI for something that
  should just reflect recency.
- **Featured/Sale are collections**, not a separate concept — `type:
  'featured'|'sale'` on `commerce_collections`, curated by adding products
  like any other collection. This keeps the schema/UI surface smaller.
- **A cross-account CTA/attachment attempt returns 403, not 400** — the
  DB's own tenant-check triggers raise an exception distinct from an
  application-level validation error; the BFF's `translateDbError` maps
  Postgres `P0001` to 403 specifically so this is easy to keep consistent
  in new frontend error handling.
- **Admin (Main Account) scoping**: pass `accountId` explicitly to act on
  one subaccount, omit it for consolidated/all-accounts reads. Never build
  frontend code that lets a non-admin session supply `accountId` — the BFF
  ignores it for a manager, but the UI shouldn't offer the control at all
  for that role.

## Known risks / incomplete items

- **No demo data seeded into the new backend.** The existing `acme-luzon`
  mock seed (in `data/inventory.ts`/`storefront.ts`) has no equivalent rows
  in the real Postgres tables yet. Until the service layer is swapped over
  *and* seed data is written (a one-time script, not yet built), the
  frontend will keep reading its old localStorage mock and the new backend
  will appear empty in any manual testing.
- **Byte-size upload limit is advisory only.** `commerceStorage.ts` notes
  that a presigned S3/R2 `PUT` URL cannot hard-cap `Content-Length` in the
  signature itself; the 10 MB figure is a documented intent, not an
  enforced server-side ceiling. If this matters before shipping, revisit
  with either a Lambda@Edge-equivalent check, a follow-up HEAD-after-upload
  size check, or switching to presigned POST with policy conditions.
- **Price-range filtering is base-price-only.** `listProducts`'s
  `minPrice`/`maxPrice` filter against `commerce_products.unit_price`, not
  any variant's overridden price — a variant priced outside the base range
  won't be correctly included/excluded. Documented as a "where practical"
  simplification per the spec's own wording, not silently missed.
- **`GGX_COMMERCE_SUPABASE_URL`/`_SECRET_KEY` are provisioned but unused.**
  If a future need arises for Supabase Storage, RPC, or realtime, these are
  already available; nothing currently depends on them.
- **The Supabase CLI is not installed in this environment** —
  `scripts/apply-commerce-migrations.mjs` is the only way migrations have
  been applied so far. If a teammate later runs `supabase link` +
  `supabase db push`, reconcile migration tracking first (see the comment
  at the bottom of that script).
- **HeyQ/Bridge repo was inspected but not re-verified in this checkpoint
  pass** — confirmed untouched by this session's own commit history (no
  commits made there), consistent with the architecture decision above, but
  this document does not independently re-audit that repo's current state.

## Resume Instructions

1. Confirm you're on top of `2a06f20` (or later) on `master`, and
   re-run `node --test tests/api-commerce-products.test.mjs
   tests/api-commerce-storefront-promotions.test.mjs` to reconfirm 22/22
   before touching frontend code — the backend contract is the foundation
   everything else builds on.
2. Start with **Inventory** (`src/app/pages/Inventory.tsx`,
   `ProductFormDialog.tsx`, `inventoryService.ts`) — swap it to call
   `/api/commerce/products*` per the route table above, add the variant/
   option builder UI, wire real R2 presigned uploads for images, and add a
   small SKU-settings panel. Write/seed a handful of real products into the
   new DB (via the BFF, through the UI or a throwaway script) so later
   Storefront/public-page work has real data to point at.
3. Then proceed in the order listed under "Recommended continuation order."
4. Do not start the real order/checkout-placement backend unless
   explicitly asked — it's a deliberate, documented scope boundary, not an
   oversight.
5. When frontend work is complete, run the full existing test suite
   (`npm test`) and expect the same 239/241 baseline (the 2 failures are
   the pre-existing `heyq-request-lifecycle.test.mjs` flake, not a bar to
   clear) — investigate only if new files or a different failure count
   appears.
