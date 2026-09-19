# Session State - GGX Corporate

> Lightweight resume/checkpoint file. Detailed June 2026 history was archived to
> `docs/archive/session_log_2026-06.md`.

## Commerce production UX/bug-fix pass (2026-09-19)

First hands-on-production-testing pass over the Commerce feature landed in the
prior session (Inventory, Storefront admin, public storefront, cart/checkout).
Root-caused and fixed the reported bugs, added dirty-form protection, redesigned
product pricing around an explicit "On sale" state, and closed several public-
storefront UX gaps. Commit `0c21958`.

- **Root cause for the accidental-dismiss AND Photos/Variants-tab-closes-modal
  bugs was the same line**: `ui/Dialog.tsx`'s backdrop `onClick={onClose}` closed
  on any click that reached it — including a click-drag that starts inside the
  modal (e.g. across a tab trigger, or while scrolling a horizontally-scrollable
  `TabsList`) and releases outside the panel. The browser fires that `click` on
  the nearest common ancestor of the mousedown/mouseup targets, which is the
  backdrop `div` itself, even though the interaction never touched it directly —
  confirmed by reproducing it with a literal drag gesture against the
  pre-fix code. Fixed by requiring the SAME element for both `mousedown` and
  `click` before treating it as a real backdrop click. `Dialog` also gained
  Escape-to-close (didn't exist before at all), restricted to the topmost open
  dialog via a small id stack (a Codex finding — a naive global listener let one
  Escape press close a nested dialog's parent too, e.g. a picker opened from
  inside another dialog).
- **Dirty-form protection** — new `hooks/useDiscardChangesGuard.ts`, applied to
  `ProductFormDialog`, `StorefrontBannerDialog`, `StorefrontProfileDialog`, and
  `StorefrontCollectionDialog`: backdrop click, Escape, and the Cancel/Close
  button all funnel through one `requestClose()` that only prompts ("Discard
  changes? / Keep editing / Discard changes") when the live form differs from
  its last-saved snapshot; a successful save updates that snapshot so closing
  right after never prompts. `StorefrontHomepageSectionDialog`/
  `StorefrontProductsDialog` were left as-is (lightweight picker/quick-add forms
  with little free-text to lose).
- **Inventory reload-on-close bug**: `Inventory.tsx`'s dialog `onClose` called
  `reload()` unconditionally, refetching the product list even when Add Product
  was cancelled untouched. Removed — every real mutation already triggers
  `onSaved` → `reload` from inside `ProductFormDialog` itself.
- **SKU settings reachable from Add Product**: when auto-generate is off, a
  "SKU settings" link next to the SKU field opens the existing
  `SkuSettingsPanel` in a nested, elevated `Dialog` that never touches the
  in-progress product form's state.
- **Pricing redesign** (`ProductFormDialog.tsx`): default state shows one "Item
  price"; toggling "On sale" turns that value into "Original price" and asks
  for a new "Sale price", with a computed "`X% off · Save ₱Y`" preview and
  validation (sale > 0, sale < original — an invalid/incomplete on-sale state
  blocks save entirely). Maps onto the existing `unitPrice`/`compareAtPrice`
  columns with no schema change (`unitPrice` = the effective/sale price,
  `compareAtPrice` = the struck-through original) — loading an existing product
  whose `compareAtPrice` is already genuinely higher than `unitPrice` opens
  straight into the on-sale UI. Stock is now its own subsection (Unlimited
  stock / Stock qty / Low-stock alert at) instead of being interleaved with
  pricing fields in one four-column row.
- **Buyer-facing sale display** — new `lib/salePricing.ts` (`getSaleInfo`)
  shared by the storefront product grid, product detail, cart, and checkout
  order summary: struck-through original price + "X% OFF" badge everywhere a
  sale applies; product detail additionally shows "Save ₱Y" where space
  permits. Normal (non-sale) products are unaffected.
- **Public storefront** (`StorefrontPreview.tsx`): added a compact "View
  product" eye-icon action beside Add to cart on every product card; replaced
  the Min/Max price number inputs and the Availability dropdown with a new
  `ui/PriceRangeSlider.tsx` (two native `<input type="range">` thumbs, no new
  dependency) whose bounds are derived from the real catalog and which only
  commits into the real server-side filter on drag-release/keyup, plus
  available-first / unavailable-after grouping with an "Available again soon"
  divider (unavailable products stay browsable but never outrank in-stock ones
  regardless of sort).
- **Product Detail header** (`StorefrontProductDetail.tsx`): now carries the
  storefront's own logo/name/accent branding with an explicit "← Back to
  store" line, replacing a bare arrow + store name; the now-redundant "Sold by
  [Store] · Cash on Delivery" card was removed.
- **Checkout promo controls** (`CartCheckout.tsx`): the Order Summary now shows
  its own promo code input + Apply when none is applied yet (previously only
  Cart could apply a code; Checkout could only display/remove one already
  applied there). Still calls the same server-authoritative
  `validatePromotionCode`/`redeemPromotionCode` — no client-side discount math,
  and redemption still only fires once, at place-order. A Codex-flagged race
  (placing an order while a promo `Apply` was still in flight could leave a
  stale/incorrect promo state after the cart was cleared) is fixed: order
  placement is blocked while a promo validation is pending, and an
  `orderPlacedRef` guard drops a promo-apply response that resolves after
  placement has started.
- **Investigated, not reproduced**: the reported "returning from Product Detail
  can show 'No products match your filters'" bug. Extensive live testing
  (repeated Storefront → Product → Storefront cycles, browser Back, and the
  in-app back link, against the real backend) always recovered correctly once
  the fetch settled. The task's own hint ("price-slider bounds/state") pointed
  at a real, avoidable failure mode — a slider whose just-loaded default bounds
  get auto-committed as a real `minPrice`/`maxPrice` filter before the catalog
  has loaded would filter out every product — so the new `PriceRangeSlider`
  integration deliberately keeps a draft/commit split (dragging updates a local
  display value; only drag-release/keyup writes into the real filter state)
  specifically to avoid that. No other deterministic cause was found in the
  effect/state guards, which already use the same `active`-flag-per-effect
  pattern as the rest of this codebase.
- **Codex CLI audit**: one `codex review --uncommitted` pass found 2 issues (P2
  each), both fixed and re-verified live — the nested-dialog Escape bug and the
  checkout promo race, both described above.
- **Verified against the real Commerce Postgres backend** via a throwaway local
  harness (esbuild-bundled `api/auth`/`api/commerce` handlers over plain Node
  `http`, proxied from Vite — not committed, deleted after use, same spirit as
  prior sessions' "throwaway esbuild-bundled local server"): drag-out no longer
  closes/reloads Inventory; dirty-guard confirm/keep-editing/discard behave
  correctly including through a nested SKU-settings round-trip; an on-sale
  product created end-to-end (₱1,000 → ₱800, 20% off) shows correct sale math
  through storefront grid → product detail → cart → checkout; a promo code
  applied directly in Checkout discounts correctly and is visibly distinct from
  the product's own sale discount.
- `npm run typecheck` and `npm run build` clean. Full suite **230/230** passing
  (`npm test`); 24 pre-existing commerce-backend test cases (in
  `tests/api-commerce-products.test.mjs`/`tests/api-commerce-storefront-promotions.test.mjs`)
  were cancelled in this sandbox — its `docker --version` CLI check passes but
  there is no reachable Docker daemon, so their `before()` hook's `docker run`
  fails; unrelated to this session's frontend-only changes (no backend/API
  files were touched).
- **Not done / deferred**: image upload wasn't exercised this session (no
  `GGX_COMMERCE_R2_*` credentials in this sandbox's `.env.local`); variant
  generation/editing wasn't re-exercised (out of scope — no variant-facing
  code changed). Committed only (`0c21958`) — not pushed, per this repo's
  standing rule.

## Commerce Enhancement — all 4 phases complete, Codex-audited, pending commit (2026-09-19)

Full Commerce enhancement spec now implemented end-to-end: Inventory
variants/SKU (Phase 1), Storefront branding/collections/homepage/banners
(Phase 2), public storefront + product detail (Phase 3), and Promotions UI +
cart/checkout promo wiring + cart redesign (Phase 4). One Codex CLI audit
pass (`codex exec -s read-only` over the full uncommitted diff) found 13
issues (3 High, 8 Medium, 2 Low) — all fixed, re-verified (typecheck/build
clean, backend tests 24/24, full suite 253/253, targeted browser re-checks).
See `docs/commerce/COMMERCE_IMPLEMENTATION_CHECKPOINT.md` for the full
backend/route contract (now including two post-checkpoint additive public
routes added during this pass — `/public/store/:slug/homepage` and
`/public/product/:id` — see below).

- **Codex findings and fixes** (file:line refers to the pre-fix diff Codex reviewed):
  - **High** — `addToCart`/`updateQty` (`cartStore.ts`) didn't cap quantity
    at real stock, so repeated adds or a variant switch could carry an
    invalid quantity into checkout; now clamped at the line's own
    `stockQuantity`/`unlimitedStock`, and `StorefrontProductDetail.tsx`
    resets its qty stepper to 1 whenever the resolved variant changes.
  - **High** — placed orders (`CartCheckout.tsx` → `placeStorefrontOrder`)
    dropped `variantId`/`variantLabel`/`sku`, making two different variants
    of the same product indistinguishable to the seller; `StorefrontOrderItem`
    gained those as additive fields, threaded through, and now rendered on
    `StorefrontOrderDetail.tsx`.
  - **High** — the legacy `/buy/:productId` share link (`BuyerCheckout.tsx`)
    broke for anonymous buyers once `inventoryService.getInventoryProduct`
    became session-authenticated in Phase 1; fixed with a new public backend
    route (`GET /api/commerce/public/product/:id`, no session, no storefront-
    publish requirement — see `getPublicProductById`'s docblock in
    `api/_lib/commerceProducts.ts`) and `Inventory.tsx`'s "share" action now
    copies the real `/shop/:slug/product/:slug` link instead of the broken one.
  - **Medium** (all fixed) — `CartCheckout.tsx` read the AUTHENTICATED
    `getStorefrontProfile` for delivery options (401s for a signed-out buyer,
    or leaks a logged-in manager's own store) → switched to the public
    `getPublicStore`; promo redemption minted a fresh idempotency key on
    every click, so a retry after an ambiguous (e.g. network) failure could
    double-consume a usage-limit-1 code → the key is now stable per
    cart+promo "attempt" (`getIdempotencyKey` in `CartCheckout.tsx`); the new
    `getPublicStorefrontHomepage` (added this session, see below) could leak
    an archived/draft product's id via a collection's `productIds` → now
    joined against `commerce_products.status = 'active'`;
    `ProductAttachDialog.tsx`/`SpreadsheetBookingGrid.tsx` (bulk booking)
    used a variant-carrying product's own (meaningless) base stock, both
    over- and under-blocking attachment → treated like unlimited stock, same
    as the dialog's pre-existing "checked but not reserved" model;
    `StorefrontPreview.tsx`'s `category`-type hero banner CTA resolved to no
    destination → now filters the grid + scrolls to it; `Storefront.tsx`'s
    init `Promise.all` had no `.catch`, so an Inventory API failure left a
    silent, unrecoverable "Switch to a subaccount" state → added an error
    state with Retry; `ProductPickerDialog.tsx` permanently disabled an
    already-selected-but-since-archived product, with no way to deselect it
    → deselection is always allowed, only new selection requires `active`;
    the mobile filter drawer had no focus trap/restore → added, same pattern
    as `ReadyRowsDrawer.tsx`.
  - **Low** (both fixed) — a direct product-detail entry could record an
    empty `storeName` on the cart seller (branding/product load as two
    independently-timed fetches) → the seller-attribution effect now depends
    on both; a variant's `null` `compareAtPriceOverride` was treated as "no
    compare-at price" instead of "inherit the base product's" (inconsistent
    with how `price_override` already inherits) → fixed to match.
- **Two small additive backend routes added post-checkpoint** (by the
  session orchestrator, not a phase agent — both read-only, both tested):
  `GET /api/commerce/public/store/:slug/homepage` (`getPublicStorefrontHomepage`,
  `api/_lib/commerceStorefront.ts`) — the original checkpoint's public-route
  table didn't include a way to publicly read homepage sections/hero
  banners at all, which Phase 3 correctly flagged as a real backend gap
  rather than a frontend oversight; and `GET /api/commerce/public/product/:id`
  (`getPublicProductById`, `api/_lib/commerceProducts.ts`) for the
  `/buy/:productId` fix above. Both covered by new cases in
  `tests/api-commerce-storefront-promotions.test.mjs` (backend suite now
  24 cases across the two files, up from 22).

- **Phase 4 additions**: new `src/app/services/promotionsService.ts` (admin
  CRUD + public `validatePromotionCode`/`redeemPromotionCode`, same
  session/no-session conventions as `storefrontService.ts`/
  `publicStorefrontService.ts`); new Commerce → Promotions admin page
  (`src/app/pages/Promotions.tsx` + `src/app/components/PromotionDialog.tsx`,
  reuses `ProductPickerDialog`) at `/dashboard/promotions`, gated on
  Storefront's own enablement (new permission key
  `storefront.managePromotions`); promo-code entry lives on the cart page
  (`CartReview.tsx`) via `validate`, redemption fires at `CartCheckout.tsx`'s
  place-order step via `redeem` (fresh `crypto.randomUUID()` idempotency key
  per attempt) immediately before the existing mock `placeOrder()` call —
  redeem failure aborts the mock order too, so the two never disagree.
  `cartStore.ts` gained two more additive pieces: `appliedPromoCode`
  (persisted, code-only — the discount amount itself is always re-fetched
  from the server, never cached) and `stockQuantity`/`unlimitedStock` on
  `CartItem.productSnapshot` (caps the cart's own qty stepper).
  `data/storefrontOrders.ts` gained additive `promoCode`/`discountAmount`
  fields on `PlaceOrderInput`/`StorefrontOrder`.
- **Cart redesign** (`CartReview.tsx`): desktop two-column grid with a
  sticky right-rail Order Summary (subtotal/discount/total/promo/CTA);
  mobile collapses to one column with a fixed bottom bar (total + Checkout)
  and the promo code in a `<details>` disclosure. Line items show
  SKU/variant label/compare-at price and cap "+" at real stock.
- **Verified in a real browser** against the actual Postgres/R2 backend (via
  a throwaway esbuild-bundled local server per the checkpoint doc's
  suggested pattern, deleted after use — never committed): created a real
  promotion through the new admin UI, applied it in the redesigned cart at
  both desktop and 375px widths, completed checkout, confirmed the
  promotion's `usage_count` incremented server-side, and confirmed a second
  redemption attempt past its `usage_limit` is rejected with the server's
  own message. Test-only promotion row deleted afterward; no other backend
  data changed except one product variant's stock (bumped from 0 so a
  variant line could be exercised in the cart — left in place, harmless).
- `npm run typecheck` and `npm run build` clean;
  `tests/api-commerce-products.test.mjs` +
  `tests/api-commerce-storefront-promotions.test.mjs` still 23/23.
- **Not done / deferred**: no new automated frontend tests were added for
  Phase 4 (verification was manual/browser-based, matching how Phases 1-3
  were verified per this doc); `StorefrontOrderDetail.tsx` was not touched
  (per scope) so the placed-order detail view doesn't yet render
  `promoCode`/`discountAmount` even though the fields now exist on the
  order record.

<details>
<summary>Original Phase 1-3 checkpoint (backend + Phases 1-3 frontend), kept for history</summary>

Implementing the full Commerce enhancement spec (Inventory variants/SKU,
Storefront branding/collections/homepage/banners, Cart redesign, Promotions).
**Backend foundation is complete and verified; frontend work has not started
yet** — this entry is a mid-task checkpoint, not a finished feature.

- **Architecture decision (explicit user direction, overriding this repo's
  general mock-first Commerce stance for this task only):** Commerce now has
  a REAL backend — a dedicated Supabase Postgres project
  (`ssdxpybnhbrkolbicgfg`), separate from QuadX Bridge/HeyQ's own project.
  Commerce is a GGX product-domain capability, not a Bridge/CS one — Bridge
  was NOT touched and gets no new tables. Media (product photos, storefront
  logos, hero banners) lives in Cloudflare R2 (bucket
  `ggx-corporate-commerce-assets`), not Supabase Storage or Vercel Blob.
- **New env vars** (`.env.example`): `GGX_COMMERCE_DATABASE_URL` (Postgres
  connection — currently the pooled Transaction-mode string; the project's
  direct :5432 connection is IPv6-only and unreachable from IPv4-only
  networks, discovered while wiring this up), `GGX_COMMERCE_SUPABASE_URL`/
  `_SECRET_KEY` (provisioned, currently unused — the BFF talks to Postgres
  directly for real transactions/row-locking, not the Data API),
  `GGX_COMMERCE_R2_*` (account id, access key, secret key, bucket, public
  URL — verified with a real put/get/delete round trip against the live
  bucket).
- **Schema** (`supabase/migrations/*.sql`, 4 files, applied to the real
  project): `commerce_products`, `commerce_product_images`,
  `commerce_product_options`/`_option_values`, `commerce_product_variants`/
  `_variant_option_values`, `commerce_sku_settings`/`_sku_registry`,
  `commerce_storefronts`, `commerce_storefront_products`,
  `commerce_collections`/`_collection_products`, `commerce_homepage_sections`,
  `commerce_hero_banners`, `commerce_promotions`/`_promotion_products`/
  `_promotion_collections`/`_promotion_redemptions`. RLS enabled on every
  table with no grants to `anon`/`authenticated` (GGX has no Supabase Auth
  users — the BFF connects with a role that bypasses RLS and enforces
  tenant isolation in application code, same trust model as the existing
  Bridge proxies); DB triggers additionally reject cross-account attachment
  (storefront/collection/promotion → another account's product) as
  defense-in-depth. SKU allocation is concurrency-safe (row-locked
  per-account counter); changing a SKU prefix never renames existing SKUs.
  `scripts/apply-commerce-migrations.mjs` (`npm run commerce:migrate`)
  applies un-applied migration files idempotently — used because the
  Supabase CLI isn't installed in this environment.
- **BFF** (`api/commerce/router.ts` + `api/_lib/commerce{Db,Auth,Errors,
  Products,Storefront,Promotions,Storage}.ts`), same consolidated-router/
  Hobby-function-limit convention as `api/support/router.ts`: full CRUD for
  products/variants/images/SKU settings, storefront profile/branding/logo/
  publish/product-selection, collections, homepage sections, hero banners,
  and promotions (`validate`/`redeem` are public routes scoped by
  `storeSlug`, since checkout runs as the buyer, not an authenticated
  merchant — discount math is always server-computed, never trusts a
  client-supplied amount). Public storefront reads
  (`/api/commerce/public/store/:slug[/products|/product/:slug]`) never
  require a session and only ever resolve a `published` store / `active`
  products. Account/subaccount scoping mirrors the existing Ops Requests
  pattern: a manager's `accountId` is always forced from their verified
  session; the Main Account admin may pass an explicit `accountId` (single
  account) or none (`consolidated`, every account) — never trusted from a
  non-admin caller.
- **Scope boundary, decided not asked** (documented here so it isn't
  mistaken for an oversight): real order/checkout placement stays exactly
  where `docs/roadmap.md` already has it — an explicitly deferred,
  demo/mock, frontend-only flow (`placeOrder()` in
  `data/storefrontOrders.ts`) — building a full backend-authoritative order
  system is a separate, much larger initiative this task doesn't ask for
  and the roadmap explicitly gates behind "start it only when a BFF/backend
  exists" as its own future stage. The ONE exception is promotions: promo
  code validation/redemption is real and backend-authoritative
  (`commerce_promotion_redemptions`, idempotency-keyed, row-locked usage
  limits) because the task spec requires it explicitly ("never trust a
  discount calculated only by the browser") — it's wired to fire at the
  same point the existing demo checkout completes, without the surrounding
  order record itself becoming durable server-side yet.
- **Tests**: 2 new files, both against a REAL disposable local Postgres
  (Docker) migrated with the actual SQL files — not a mock DB —
  `tests/api-commerce-products.test.mjs` (11 cases: SKU manual/duplicate/
  auto-generate/prefix-change-doesn't-rename, tenant isolation, admin
  cross-account access, stock floor, variant generation + combination
  uniqueness + idempotent re-run) and
  `tests/api-commerce-storefront-promotions.test.mjs` (11 cases: public/
  private storefront separation, collection/banner cross-tenant rejection,
  full promotion validate/redeem lifecycle, tampered-discount resistance,
  concurrent usage-limit race — exactly 1 of 5 simultaneous redemptions
  against `usage_limit=1` succeeds — expired/unknown code rejection).
  22/22 passing. A real bug was caught and fixed this pass: variant SKU
  registry rows were being inserted before the variant row they reference
  existed (FK ordering), only surfaced by testing against a real DB, not by
  type-checking or code review.
- **Validated**: `npm run typecheck` clean, `npm run build` clean, full
  existing suite re-run for regressions: **239/241** (2 failures are a
  pre-existing, unrelated hang in `tests/heyq-request-lifecycle.test.mjs`'s
  dev-server lifecycle — confirmed via process CPU time not advancing,
  fixed by killing the stuck process tree so the runner moved on; not
  caused by this session's changes, and not touched by it).
- **Not started yet**: all frontend work (variant editor UI, SKU settings
  UI, image gallery management wired to R2 presigned uploads, storefront
  grid search/filter/sort, product detail page/route, collections/homepage
  merchandising UI, hero banner management, promotions UI, cart redesign),
  swapping `inventoryService.ts`/`storefrontService.ts`/
  `storefrontOrdersService.ts` from localStorage mock to the new BFF, the
  Codex CLI audit pass, and demo-data seeding into the new DB (the existing
  `acme-luzon` mock seed data has no equivalent rows in the real backend
  yet — the frontend still reads its old localStorage mock until the
  service layer is swapped).
- **Nothing pushed yet** — commit only, per this repo's standing rule (push
  only on explicit instruction). HeyQ/Bridge repo: inspected, confirmed no
  changes needed or made (Commerce is intentionally isolated from it — see
  the architecture decision above).

</details>

## Most Recent Work — fixed production 404s on /api/support/* and /api/ops-requests/* (2026-09-18)

The Hobby-function-limit consolidation two entries below (`9625557`) merged
several routes into two catch-all files using Vercel's filesystem
`[...path].ts` convention. That convention turned out broken on this
project's deployment (framework "vite", not Next.js): live production was
returning `404` for every real route under `/api/support/*` and
`/api/ops-requests/*` (`GET /api/support/tickets` → 404, `GET
/api/support/categories` → 404, reported by the user from
`ggx-corporate.vercel.app`'s browser console). Confirmed via the Vercel MCP
plugin against the live deployment (`get_runtime_errors` showed no invocation
at all; direct `curl` showed a single-segment path like `/api/support/categories`
reaching the function with an empty `req.query.path` — falling through to the
handler's own `{"error":"Not found"}` — while a two-segment path like
`/api/support/tickets/:id` never reached the function at all, a platform-level
`404 NOT_FOUND`). The bare `/api/ops-requests` route (`index.ts`, not a
catch-all) was unaffected the whole time.

- **Fix**: dropped the filesystem catch-all convention for these two routes
  in favor of explicit `vercel.json` rewrites, which Vercel documents as
  reliably populating route-segment query params:
  - `api/support/[...path].ts` → `api/support/router.ts` (plain filename).
  - `api/ops-requests/[...path].ts` → `api/ops-requests/router.ts` (plain filename).
  - `vercel.json` gained two rewrites ahead of the existing SPA fallback:
    `/api/support/:path+` → `/api/support/router?path=:path*` and
    `/api/ops-requests/:path+` → `/api/ops-requests/router?path=:path*`.
  - Both files' `pathSegments()` now also splits a `/`-joined string (what
    the rewrite's wildcard capture sends), not just an array (what a direct
    test-harness call sends) — handles either representation.
  - Public URLs, function count (still 5), and every handler's business
    logic are unchanged.
- **Tests updated**: `tests/api-support-categories.test.mjs`,
  `tests/api-support-typing.test.mjs`, `tests/api-ops-requests.test.mjs` —
  esbuild entry points retargeted to the renamed files (they call the handler
  directly with `query: { path: [...] }`, so the array-vs-string change
  doesn't affect them).
- **Not yet re-verified against production** — this fix has not yet been
  deployed/tested against `ggx-corporate.vercel.app`. Next session (or this
  one, once deployed) should re-run the `curl` checks against
  `/api/support/categories`, `/api/support/tickets`, `/api/support/tickets/:id`,
  `/api/ops-requests/catalog`, and `/api/ops-requests/:id/updates` to confirm
  all now route correctly instead of 404ing.

## Most Recent Work — Bulk Upload Review: "View all ready rows" now opens an in-page drawer (2026-09-18)

Replaced the "View all ready rows" **page navigation** on the Review Before
Booking screen with an **in-page right-side drawer**, so reviewing the full
Ready-to-book set no longer leaves the Review page (or its in-progress edits,
scroll position, and upload-exit protection) behind.

- **New**: `src/app/components/ReadyRowsDrawer.tsx` — a right-side drawer
  (desktop: ~65vw capped at 980px; mobile: full width) showing the batch's
  full current "Ready to book" row set, with search (recipient, mobile, item,
  location, reference ID) and Previous/Next pagination (50 rows/page, reusing
  the shared `Pagination` component). It takes the row list as a prop — no
  fetch of its own, no duplicate dataset — always the SAME live data
  `BulkUploadSummary.tsx` already computed (`readyFromFlaggedRows` /
  `spreadsheetRows` / `validBaseCount`, memoized as `readyRowsForDrawer`).
  Accessibility: Escape closes it, Tab is trapped inside it while open, and
  focus moves to/from the triggering CTA on open/close (all found missing by
  the Codex audit below, then added).
- **`BulkUploadSummary.tsx`**: the header "Ready to book" CTA now reads
  **"View all {count} ready rows →"** and opens the drawer (`<button>`, not a
  `<Link>` — no route change). The duplicate bottom CTA (shown when
  `readyCount > VALID_ORDERS.length`) is removed — one CTA only, per the
  task's own instruction. The already-booked/paymentMode path is unchanged
  (still a real "View all in Transactions" deep link — those rows are real
  Transactions already).
- **Removed**: the dedicated `BulkUploadReadyRows.tsx` page and its
  `bulk-uploader/ready/:id` route (`routes.tsx`) — fully superseded by the
  drawer, so kept out rather than left as dead/orphaned reachable-by-URL code.
  `docs/context/bulk-booking.md` and inline comments in
  `data/bulkUploads.ts`/`BulkUploadSummary.tsx` referencing the old page were
  updated to point at the drawer instead.
- Because opening/closing the drawer is pure client state (no route change),
  `useUploadExitGuard`'s `useBlocker` (which only fires when
  `currentLocation.pathname !== nextLocation.pathname`) never fires for it —
  the existing "Leave bulk upload?" confirmation still fires correctly for
  genuine navigation away from the uploader. No changes were needed to the
  guard itself.
- **Tests**: `tests/bulk-upload-lifecycle.test.mjs`'s first case rewritten —
  asserts exactly one CTA button (not a link) with "View all N ready rows"
  copy, that clicking it does not change the URL, that the drawer's empty-
  search state renders, and that closing it does not trigger "Leave bulk
  upload?" and leaves the URL unchanged.
- **Validated**: `npm run typecheck` clean, `npm run build` clean,
  `tests/bulk-upload-lifecycle.test.mjs` 5/5. One Codex CLI audit pass
  (`codex exec -s read-only`, scoped to the staged diff only) found 3 issues,
  all fixed: the drawer had no Escape/focus-trap/focus-restore (added); two
  stale doc/comment references to the deleted dedicated Ready Rows page
  (`data/bulkUploads.ts`, `BulkUploadSummary.tsx`) — updated to name the
  drawer instead. No functional/state-wiring issues found.
- **No database migration** — this is a frontend presentation/state change
  only (same `localStorage`-backed mock state Bulk Upload already used); none
  was needed. No QuadX Bridge (HeyQ) changes — unrelated to this feature.

## Most Recent Work — fixed production deploys: Vercel Hobby's 12-function limit (2026-09-18)

Production had been failing to deploy for the last 3 pushes (`77ad915`
ops-requests, `24a7e86` Merchant ID, `e7c63fa` bulk-upload lifecycle — all
`ERROR` in Vercel) with no visible symptom locally, since `npm run build`
succeeds fine and the failure only happens at Vercel's post-build deploy
step. Diagnosed via the Vercel MCP plugin
(`get_deployment`/`get_deployment_build_logs`), not from the build log's own
chunk-size warning the user initially flagged (that warning is benign and
present in every build, including all the successful ones before this).

- **Root cause**: `errorCode: "exceeded_serverless_functions_per_deployment"`
  — Vercel's Hobby plan caps a deployment at 12 Serverless Functions; each
  file under `api/*.ts` becomes its own function. This repo had grown to 16
  route files (crossed the limit exactly at the `ops-requests` commit, which
  added 4 new routes), so every deploy since has failed at Vercel's
  `patchBuild` step.
- **Fix (user chose "consolidate routes in code" over upgrading to Pro or a
  one-off redeploy)**: merged sibling route files into fewer handlers using
  Vercel's dynamic catch-all convention, each new file dispatching internally
  on the `action`/`path` route segment(s) — **public URLs are unchanged**, no
  frontend changes needed. Went from 16 functions to 5:
  - `api/auth/[action].ts` — merges `login.ts`/`logout.ts`/`quick-login.ts`.
  - `api/claims/[claimId]/[action].ts` — merges `sync.ts`/`state.ts`/`messages.ts`
    (`claimId` stays its own route segment, unchanged; only `action` is new).
  - `api/ops-requests/[...path].ts` — merges `catalog.ts`/`[id].ts`/`[id]/updates.ts`.
    `index.ts` (list/create) stays its own file — a required catch-all can't
    match zero path segments, so the bare `/api/ops-requests` route needs its
    own exact-path file.
  - `api/support/[...path].ts` — merges `categories.ts` + all 5
    `tickets/**` route files (list/create/detail/messages/typing/typing-subscribe).
  - Every merged handler's internal logic (auth checks, Bridge relaying,
    subaccount authorization, error handling) is copied verbatim — this is a
    routing-shell change only, not a rewrite of any business logic.
- **Tests updated** (not new — the existing esbuild-bundled route tests
  reference handler files by path, since there's no live Vercel Functions
  runtime in this dev environment): `tests/api-auth-quick-login.test.mjs`,
  `tests/api-claims.test.mjs`, `tests/api-ops-requests.test.mjs`,
  `tests/api-support-categories.test.mjs`, `tests/api-support-typing.test.mjs`
  now point their esbuild entry points at the consolidated files and pass the
  right `req.query.action`/`req.query.path` to reach the intended branch.
  Every other test file only references `/api/...` URL strings (fetch stubs),
  which are unaffected by the file move.
- **Validated**: `npm run typecheck` clean, `npm run build` clean, full suite
  **230/230** (`npm test`, unchanged count — no tests added/removed, just
  retargeted). Function count confirmed via `find api -name "*.ts" ! -path
  "*/_lib/*"`: 5 (well under the 12 limit, with headroom for future routes).
- **Known, not fixed this pass**: a handful of source-file doc comments
  elsewhere (`AuthContext.tsx`, `Login.tsx`, `heyqCustomerApi.ts`,
  `heyqTypingRealtime.ts`, the `api/_lib/*` files, several `docs/migration/*`
  entries) still name the old per-route file paths (e.g.
  `api/support/tickets/[id]/typing.ts`) in prose — harmless (not functional),
  left as-is rather than scope-creeping a doc sweep into this fix; update
  opportunistically if touching those files again.
- Committed and pushed to both remotes (`origin`/jabranux,
  `james`/jamesabran) at the user's request, since the whole point was
  restoring production deploys.

## Most Recent Work — Bulk Upload review & batch-details lifecycle correctness (2026-09-18)

Fixed the "Ready to book" ↔ Transaction lifecycle boundary in Bulk Upload and
aligned Completed Batch Details with the main Transactions page. Upload row →
validated/Ready to book → batch processed/booked → real Transaction created
is now enforced end to end instead of being implied by copy alone.

- **`BulkUploadSummary.tsx` (Review Before Booking)**: "Ready to book" no
  longer claims rows were "created as Awaiting payment" — copy now reads "X
  orders passed validation and are ready to book." The "View all in
  Transactions" / "View all X in transactions page" links are replaced with
  **View all ready rows**, linking to a new dedicated page, for every state
  except an already-processed (`awaiting-payment`) batch, where the deep link
  into Transactions is accurate (those rows are real Transactions already).
  **Completing booking now transitions the upload record's status**
  (`needs-review` → `awaiting-payment` if the chosen payment method settles
  later, or straight to `completed` for prepaid card/e-wallet/online banking)
  — previously `handleCompleteBooking` never updated the record at all, so a
  booked batch stayed "Needs Review" in Recent Uploads forever.
- **New page**: `BulkUploadReadyRows.tsx` (`/dashboard/bulk-uploader/ready/:id`)
  — a dedicated, paginated view of a batch's current Ready-to-book rows. It
  does **not** copy row data: it reads the same live per-batch classification
  the Review page produces (`data/bulkUploads.ts`'s new `BatchRowsState`,
  keyed by batch id, persisted via `loadState`/`saveState`), so fixing rows on
  the Review page and coming back here always reflects the current count.
- **`BulkUploadCompleted.tsx` (Completed Batch Details)**: the "Created
  transactions" table now reads real records via a new
  `transactionService.getTransactionBatchById()` (same underlying data the
  Transactions "By Batch" view uses) instead of a hand-fabricated row list.
  Columns aligned to the main Transactions table's terminology: **Tracking
  Number | Recipient | Destination | Service Type | Status | Date** — no
  `Name`/`Item Name`/`Amount`, no `Source` (page context already implies Bulk
  Upload), no `Actions` (rows are clickable straight into
  `/dashboard/transactions/:tracking`, reusing the existing "By Batch"
  pattern). New shared `ServiceTypeBadge` component (was a page-local
  `ServiceTypeCell` in `Transactions.tsx`) keeps the badge identical on both
  pages.
- **`transactionService.ts`**: booked (`awaiting-payment`/`completed`) session
  Bulk Upload batches are now synthesized into real `Transaction` records on
  demand (`synthesizedBulkBatchTransactions`/`buildTransactionsFromBulkBatch`),
  mirroring the existing storefront-order synthesis pattern — never a second
  hand-synced list. Pre-booking (`needs-review`) batches stay fully invisible
  to `getTransactions()`/`getTransactionBatches()`, so pre-processing rows
  never leak into the main Transactions page. `getTransactionById` now also
  resolves these synthesized rows (a booked bulk transaction is clickable from
  Transactions but wasn't resolvable on its own detail page before this fix).
- **`data/bulkUploads.ts`**: new `BatchRowsState` (`readyRows`/`reviewRows`
  snapshots, persisted) is the single source of truth `BulkUploadSummary`
  writes and `BulkUploadReadyRows`/`transactionService` read — count formula:
  `totalValidCount = record.validRows (base, no-issue-from-the-start) +
  readyRows.length (promoted from Fixes/Needs review) + reviewRows.length
  (still-flagged but bookable)`. `SPREADSHEET_BATCH_ROWS` is now persisted too
  (was session-only — a reload used to silently replace a booked spreadsheet
  batch's real recipient/item data with sample filler).
- **New**: `canViewBulkUploadBatch()` — the same account/subaccount scope rule
  every other surface follows (Main Account sees consolidated data; a manager
  only sees their own subaccount's batches), wired into all three bulk-upload
  detail pages (Summary, Ready Rows, Completed). Missing before this pass —
  found by the Codex audit below.
- **Codex CLI audit** (`codex review --uncommitted`, one pass): 5 findings, all
  fixed — (P1) a manager could view another subaccount's batch (recipient
  names/mobile numbers) via a direct Ready Rows URL; (P1) `getTransactionById`
  didn't resolve synthesized bulk transactions (404 on detail nav); (P1)
  `SPREADSHEET_BATCH_ROWS` not persisted (reload replaced real data with
  filler); (P1) reopening an `awaiting-payment` batch for payment undercounted
  — `validBaseCount` didn't include rows promoted from Fixes/Needs review at
  booking time; (P2) the two pre-existing seed "completed" batches
  (`UPLOAD-2026-05-18-002`/`-001`) showed contradictory totals against their
  linked transaction batch's `reportedCounts` — reconciled. Fixing the P1
  undercount also surfaced a genuine race condition in this session's own new
  code (not from Codex directly, found via the regression test written for
  the fix): the row-classification push effect could fire once before the
  batch record's real status was known, using the generic canned mock
  scenario and clobbering a real `awaiting-payment` batch's stored
  classification — fixed with a `recordLoaded` gate.
- **Known, pre-existing, NOT fixed this pass** (out of scope — the same gap
  exists in `TransactionDetails.tsx` and other detail-by-id pages this session
  never touched, so a full authorization pass belongs to a separate task, not
  this one): no page-level check prevents a signed-in user from guessing
  another account's URL for pages this session didn't touch. The Bulk Upload
  detail pages specifically ARE now guarded (see `canViewBulkUploadBatch`
  above).
- **Tests**: new `tests/bulk-upload-lifecycle.test.mjs` (5 cases — Review page
  copy/CTA correctness, a needs-review batch never leaks into Transactions,
  booking synthesizes the correct total from real promoted-row data and
  resolves on its own detail page, and the payment-mode reopen undercount
  regression). Registered in `package.json`'s `test` script.
- **Validated**: `npm run typecheck` clean, `npm run build` clean, full suite
  **230/230** (`npm test`, up from 225 — the 5 new tests). Not pushed (project
  rule: push only on explicit instruction).
- **No database migration**: this feature is entirely GGX Corporate frontend
  mock/session state (`localStorage` via `lib/storage.ts`, same pattern as
  the rest of Bulk Upload) — no backend/DB involved, so none was needed or
  introduced. **No QuadX Bridge (HeyQ) changes** — Bulk Upload/Transactions
  are unrelated to that integration; none were made.

## Most Recent Work — Ops Requests wired to QuadX Bridge's real Ops Request POC (2026-09-05)

Replaced the Operations Requests feature's in-memory mock submission/retrieval
with a real integration against QuadX Bridge's newly-shipped Ops Request POC
(HeyQ repo commit `b36e9f2`, `docs/handoffs/phase2-ops-request-poc.md`) — the
existing 3 categories / 11 request types and category-specific submission
forms in `OperationsRequests.tsx`/`OpsRequestDetail.tsx` are unchanged; only
the data layer underneath them was swapped.

- **New BFF proxy routes** (`api/ops-requests/`), same
  `requireSessionIdentity`/`bridgeFetch` boundary every other proxy route
  uses: `catalog.ts` (GET, relays Bridge's fixed catalog, currently unused by
  the UI but exposed for parity), `index.ts` (GET list + POST create, POST
  requires an `Idempotency-Key` header — GGX has no backend DB of its own, so
  the browser mints a fresh `crypto.randomUUID()` per submit, same convention
  ticket/message creation already uses), `[id].ts` (GET one, by Bridge's
  internal uuid or its human-readable `requestNumber` e.g. `OPR-2026-0001`),
  `[id]/updates.ts` (GET the client-visible history — Bridge's own
  projection already excludes internal Ops/Sales coordination, assignment,
  and internal notes; this route is a pure relay).
- **`api/_lib/bridge.ts`**: new one-way category/subtype mapping helpers
  (`mapOpsCategoryToBridge`/`mapOpsCategoryFromBridge`/`mapOpsSubtypeToBridge`),
  same pattern as the existing `mapClaimReasonToBridge`. GGX's own keys
  (`supply`, `other_packaging`, `high_volume_dispatch`,
  `warehouse_coordination`) differ cosmetically from Bridge's canonical
  catalog keys (`supply_request`, `other_packaging_supplies`,
  `high_volume_dispatch_coordination`, `warehouse_branch_coordination`) —
  translated at the write boundary only; GGX's UI/type unions never changed.
  `pickup_support`'s 5 subtypes were already identical, no mapping needed.
- **`opsRequestsService.ts`**: rewritten from an in-memory array to a real
  HTTP client (same `getJson`/`postJson` + `SESSION_EXPIRED_EVENT` pattern as
  `claimBridgeService.ts`). Bridge's opaque `requestData` JSON carries GGX's
  own category-specific fields plus `subaccountId`/`subaccountName`/
  `createdBy` verbatim (Bridge has no subaccount concept — the Main
  Account/subaccount/manager scoping rule stays entirely client-side,
  filtering the flat list Bridge returns, same as before). `id` is now
  Bridge's own `requestNumber` (`OPR-YYYY-NNNN`, replacing the old mock's
  locally-generated `OPS-YYYY-NNNN`). New `getOpsRequestUpdates()` export
  backs a new "Updates" card on the detail page.
- **Status vocabulary is now Bridge's own settled lifecycle, not a separate
  GGX vocabulary**: `OpsRequestStatus` narrowed from the old 7-value mock
  enum (`submitted/in_review/coordinating/scheduled/completed/declined/cancelled`)
  to Bridge's exact 5 (`submitted/in_review/in_progress/completed/rejected`)
  — `OperationsRequests.tsx`'s status filter/summary counts and
  `OpsRequestDetail.tsx`'s timeline/terminal-state branch updated to match.
  Bridge's internal Sales/AM "needs input" intervention flag during In
  Review is deliberately never surfaced as a separate status — such a
  request still shows simply "In Review" (task's own instruction).
- **`createdBy`** now comes from the real signed-in user (`useAuth()`'s
  `user.name`) instead of a hardcoded `'Max Rodriguez'` string.
- **Server-side subaccount authorization** (`api/ops-requests/index.ts`/`[id].ts`/`[id]/updates.ts`):
  Bridge's Ops Request POC has no subaccount entity of its own — every
  request for `ggx` lives in ONE pinned Bridge account
  (`OPS_REQUESTS_ACCOUNT_EXTERNAL_ID = 'ggx-corporate'`, `api/_lib/bridge.ts`).
  Three rounds of Codex CLI review on this session's own diff (`codex review
  --uncommitted`) found the real consequence of that: using each GGX login's
  own `externalOrgId` (`main` for the admin, `acme-luzon` for the manager,
  `api/_lib/demoUsers.ts`) as the Bridge scoping key would have silently
  split ONE demo corporate account's requests into two disjoint Bridge
  accounts (breaking "Main Account sees consolidated data"), and relying on
  the browser's own subaccount filter for anything else — the manager could
  simply call `/api/ops-requests` directly and read (or, on create, forge
  attribution for) another subaccount's data. Fixed: every Ops Request
  Bridge call now pins `externalOrgId` to the one shared constant
  (consolidation restored), while GGX's own subaccount scoping is enforced
  **server-side** in the BFF against each row's opaque
  `requestData.subaccountId` — a manager's list is filtered before it ever
  reaches the browser, `GET /:id` and `/:id/updates` 404 (never 403, same
  "don't reveal existence" convention every other proxy route uses) for a
  request outside their subaccount, and `POST`'s `requestData.subaccountId`/
  `subaccountName`/`createdBy` are forced from the verified session (never
  the client-supplied value) unless the caller is the Main Account admin,
  who already has unrestricted cross-subaccount access in this app's
  permission model and whose explicit subaccount-selector choice is trusted.
  New `requireSessionIdentityWithName`/`resolveDisplayName`/
  `resolveAccountName` (`api/_lib/bridge.ts`/`demoUsers.ts`) resolve the
  caller's real name/subaccount server-side for this, never trusting a
  client-supplied `requestedByName`/`accountName`.
- **Other Codex-found regressions fixed in the same passes**: a failed
  submission was silently shown as "Request submitted" (`submitOpsRequest`
  returns `null` on failure, the handler ignored it) — now shows a retryable
  error banner with the form preserved; a retried failed submission minted a
  fresh idempotency key each time (risking a real duplicate Ops Request if
  Bridge's first response was merely lost) — the key is now minted once per
  submission attempt and reused across retries; direct navigation between
  two request detail URLs could transiently render the previous request's
  data under the new id — state resets synchronously on `id` change; a list
  load failure rendered as "No operations requests" — now a distinct
  retryable failure card (`OpsRequestsUnavailableError`); switching
  subaccount view twice quickly could let the earlier (now-stale) fetch
  overwrite the newer one — a generation-counter guard, same pattern
  `activeTicketsRequestRef` uses elsewhere in this codebase.
- **Tests**: `tests/api-ops-requests.test.mjs` (new, 23 cases, esbuild-bundled
  against a real local fake Bridge HTTP server — auth gate on all 4 routes,
  category/subtype mapping for all 3 categories including the ones that
  differ from Bridge's keys, Idempotency-Key requirement, 404 propagation,
  and the full subaccount-authorization matrix: admin consolidated list,
  manager scoped list, manager 404 on another subaccount's request/updates,
  manager's forged `requestData` overridden server-side, admin's explicit
  subaccount choice trusted). Registered in `package.json`'s `test` script.
- **Validated**: `npm run typecheck` clean, `npm run build` clean (`dist/`
  scanned, no Bridge key/header string present), new test file 23/23, full
  suite **225/225** (up from 217 pre-existing). Four Codex CLI review passes
  (`codex review --uncommitted`) across this session: first found the
  silent-success-on-failure bug (fixed); second found the two P1 subaccount-
  authorization gaps above plus a stale-list race (fixed); third/final pass
  clean, no findings.
- **Known limitation, not a bug**: Bridge's own seeded demo Ops Requests
  (`scripts/supabase-seed-ops-requests.mjs` in the HeyQ repo, account
  `bp-org-metro-merchant`) live under a different Bridge account-external-id
  than the `ggx-corporate` constant this integration pins to — an
  intentionally separate namespace (that account is Bridge's own internal
  Ops/Sales staff demo data, not tied to any specific GGX Biz+ login). GGX's
  demo accounts will see an empty list until they submit their own requests
  (which then round-trip correctly, consolidated/scoped exactly as described
  above) rather than Bridge's pre-seeded 10-request staff demo set.
- **Still blocked on live round-trip validation**: no `QUADX_BRIDGE_URL`/
  `QUADX_BRIDGE_API_KEY` configured in this environment (same recurring
  constraint as every prior HeyQ-integration session in this project) — the
  route-level tests above exercise the real handler code against a
  local fake Bridge, not the actual hosted deployment, which per the Bridge
  team's status report was not deployed (app deploy) this pass either.

## Most Recent Work — Claim Details status timeline enhancement (2026-09-04)

UX flow change on top of the Claims ↔ QuadX Bridge integration below: the
"Where is my claim now?" status timeline in `ClaimDetail.tsx` now renders the
5 permanent lifecycle nodes (Claim Filed, Pending Approval, Approved,
Processing, Settled) plus a conditional On Hold node, with color rules that
emphasize only the current state. Bridge stays the source of truth; no
lifecycle rule changed.

- **`ClaimDetail.tsx`**: `ClaimTimeline` rewritten — `buildTimelineSteps`
  inserts the On Hold node only while `status === 'on_hold'` (always right
  after Processing, before Settled — Bridge's `finance_hold_claim` only ever
  reaches `on_hold` from `approved`/`processing`, both of which count as
  "processing started," so this placement is unconditional, not branchy).
  `nodeVisual` maps each node to `done` (green) / `processing` (amber,
  current) / `onhold` (orange, current) / `active` (blue, current — the
  pre-existing treatment, kept for Claim Filed/Pending Approval/Approved) /
  `future` (gray) / and `settled`-as-current also renders green per the
  task's own "all completed, including Settled, are green" spec (no blue
  ring on the terminal state). Denied still renders the pre-existing red
  "Claim Denied" box (regression-checked, unchanged). The refund banner card
  now has a dedicated On Hold state ("Refund On Hold," orange, no "3–5
  business days" ETA copy) instead of reusing the Approved/Processing copy.
  Added `data-testid="claim-timeline"` (test-only, zero visual effect) so
  the new DOM tests can scope queries without colliding with the Claim
  Summary card's own `font-medium` text.
- **Real API gap found and closed, with permission from the task's own
  scope note** ("...unless a missing API field prevents GGX from rendering
  the required state"): Bridge's customer-facing `GET /customer/claims/:reference`
  deliberately never returned `hold_reason` (staff-only, by original
  design — see `docs/migration/quadx-bridge-claims-customer-api.md`), but
  the task requires showing "Placed on hold due to [reason]." **Sibling
  HeyQ repo** (`supabase/functions/quadx-bridge/index.ts`,
  `getCustomerClaim`): now returns `holdReason`, gated server-side to
  `status === 'on_hold'` only (defense-in-depth on top of
  `finance_resume_claim` already nulling `claims.hold_reason` in the DB the
  moment a hold clears) — read-only projection change, no RPC/capability/
  lifecycle rule touched. Contract doc updated to match. Codex review of
  this repo's uncommitted diff: no findings.
- **`claimBridgeService.ts`**: `ClaimBridgeState.holdReason: string | null`,
  re-gated client-side too (never trust the network hop alone — a stale/
  tampered response claiming a hold reason for a non-on_hold status is
  discarded).
- **Real bug found by Codex and fixed**: `bridgeResult` (and therefore
  `holdReason`) wasn't reset when `claim?.id` changed — direct navigation
  between two claim detail URLs (same mounted route component, only the
  `:id` param changes) could transiently render the PREVIOUS claim's hold
  reason under the NEW claim's id until the fresh fetch resolved, a
  cross-claim data leak. Fixed: `setBridgeResult('loading')` synchronously
  at the top of the id-keyed Bridge-sync effect, before the async
  `ensureClaimLinked` call.
- **Missing/long hold reason handling**: no reason → generic fallback
  ("Placed on hold. See Claim Updates & Messages below for details.");
  long reason → wraps (`break-words`), never clipped.
- **Tests**: `tests/claim-detail-timeline.test.mjs` (new, 11 cases, DOM-level
  against the real running app — Pending Approval/Approved/Processing/
  Settled node states and colors, Rejected regression, On Hold with/without/
  with-a-long reason, resumed-to-Processing removes the On Hold node
  entirely, banner ETA-copy check, 375px mobile layout with no horizontal
  overflow). `tests/api-claims.test.mjs` — `holdReason` added to the fake
  Bridge fixture + one new relay-through assertion for an on-hold claim.
  Registered in `package.json`'s `test` script.
- **Validated**: `npm run typecheck` clean, `npm run build` clean, full
  suite **202/202** (`npm test`, up from 191 — 11 new timeline tests + 1 new
  claims-proxy test). Two Codex CLI review passes (GGX Corporate
  `--uncommitted`, HeyQ `--uncommitted`): GGX pass found the `bridgeResult`
  stale-claim bug above (fixed) plus two findings in an unrelated,
  pre-existing untracked doc (`docs/integration/heyq-oms-contract.md`, not
  part of this task — left alone); HeyQ pass found nothing.
- **Out of scope, left untouched, per the task's own instructions**:
  Bridge's `claims_log_customer_visible_activity` trigger still never
  projects `on_hold`/resumed transitions into the customer-visible
  `ticket_activities` feed ("stays an internal Finance detail" — a Phase 1
  design decision predating this task). This means "Claim Updates &
  Messages" today shows no historical hold entries at all; the task only
  said such history "can remain" there if present, not that it must be
  added — nothing here needed changing.

## Most Recent Work — GGX ↔ QuadX Bridge Claims integration (2026-09-03)

Wired GGX's Claims feature to QuadX Bridge's real internal Claims Phase 1
system (structured `public.claims` table + approve/reject/Finance RPCs,
shipped this cycle but 100% internal/staff-session-only before this pass —
no external HTTP surface existed). Full write-up:
`docs/migration/ggx-corporate-quadx-bridge-claims-integration.md` (GGX side)
and `docs/migration/quadx-bridge-claims-customer-api.md` (HeyQ/Bridge side,
in the sibling HeyQ repo).

- **HeyQ/Bridge repo** (new migration
  `20260917093000_quadx_bridge_claims_external.sql` + two new routes in
  `supabase/functions/quadx-bridge/index.ts`): additive `claims.
  external_reference`/`source` columns + a partial unique index (the
  idempotency guarantee), a new `create_external_claim_bridge` RPC
  (service_role-only — structurally separate from every staff-session
  Phase 1 RPC, which are untouched), and a trigger that projects claim
  status transitions into `ticket_activities` as `visibility =
  'customer_visible'` rows (covers both staff-filed and portal-filed claims
  without editing `approve_claim`/`reject_claim`/`finance_*_claim`'s bodies
  at all). New routes: `POST /customer/claims` (idempotent file-or-link,
  reuses the existing `create_customer_ticket_bridge` RPC for the ticket
  with an explicit `cat-claims` category), `GET /customer/claims/:reference`
  (public claim state — never returns `rejection_reason`/`hold_reason`/
  `finance_reference`/`reviewed_by`/`processed_by`, enforced server-side by
  the query shape itself, not by GGX hiding fields).
- **GGX Corporate repo**: new `api/claims/[claimId]/{sync,state,messages}.ts`
  BFF routes (same `requireSessionIdentity`/`bridgeFetch` boundary the
  support-ticket proxy already established — no new auth mechanism), new
  `src/app/services/claimBridgeService.ts` (same `HeyQResult`-style pattern
  as `heyqCustomerApi.ts`). `ClaimDetail.tsx`'s old dead-end "Questions
  about this claim? → Open Support Ticket" link (it never actually linked
  to anything) is replaced with a "Claim Updates & Messages" card: a merged
  chronological timeline (claim status events + the linked ticket's public
  message thread) plus a reply composer, refreshed on a plain 25s poll
  (paused while the tab is hidden) — deliberately not new realtime
  infrastructure. A separate small "Related ticket: Open/…" badge keeps
  claim status and ticket status visibly independent (an Approved claim
  next to an Open ticket is expected, not a bug).
- **Idempotency / legacy claims**: GGX's own claim reference (`CLM-1008`)
  IS the idempotency key throughout — no separate "remember the Bridge id"
  step (GGX has no backend DB of its own). `ensureClaimLinked` runs both
  eagerly (right after filing, `TransactionDetails.tsx`) and lazily (every
  `ClaimDetail.tsx` mount) — covers the 8 pre-existing seed claims
  (`CLM-1001`–`CLM-1008`) automatically, first view links them once,
  every view after that just re-reads.
- **Status mapping — no "For Finance Review" anywhere** (confirmed absent
  from both codebases before and after this pass): Bridge's
  `pending_approval|approved|on_hold|rejected|processed` maps to GGX's
  existing `in-review|approved|approved|denied|settled` (labels relabeled
  to "Under Review"/"Rejected"/etc. to match the task's required wording —
  the `ClaimStatus` union keys themselves are unchanged). `on_hold` is
  deliberately not a distinct public status.
- **Deferred, documented as a dependency, not built this pass**: real
  evidence/attachment upload — Bridge has no working attachment
  infrastructure anywhere (every write route already 400s an `attachments`
  payload); the two new claims routes follow the identical convention.
- **Validated**: `npm run typecheck` clean, `npm run build` clean (`dist/`
  scanned, no Bridge secret/header string present), new
  `tests/api-claims.test.mjs` (11/11, esbuild-bundled against a real local
  fake Bridge HTTP server — identity-spoofing rejection, reason mapping,
  attachment-payload rejection, server-side ticket-id resolution for
  replies, 404 propagation), full existing suite re-run for regressions
  from the `CLAIM_STATUS_META` label changes.
- **Operational dependency, not a code gap**: `app_settings.claims_enabled`
  is `false` for `ggx` on Bridge by default — `POST /customer/claims` fails
  closed (`409` → GGX's `claims_disabled` state) until an operator with
  Supabase access runs `set_claims_enabled('ggx', true)`. Live round-trip
  validation was not run in this environment (no `QUADX_BRIDGE_URL`/
  `QUADX_BRIDGE_API_KEY` configured here — the same recurring constraint as
  every prior HeyQ-integration session in this project).
- Committed in both repos — GGX Corporate `45a93dc`, HeyQ (QuadX Bridge)
  `bac6ac2` — not pushed per this project's standing rule (push only on
  explicit instruction).

## Most Recent Work — Transaction Details: active-ticket indicator on the support/report CTA (2026-08-29)

Transaction Details' "Report an issue" (general card) and On-Demand "Contact
support" button now check for an existing active support ticket linked to
that tracking number before offering a fresh report, so a user can't
accidentally file a duplicate without noticing one already exists.

- **New:** `getActiveTicketsByTrackingNumber()` (`ticketsService.ts`) — ONE
  `listMyTickets()` fetch, mapped to `Map<trackingNumber, ActiveTicketLink[]>`,
  filtered by the existing canonical `isPermanentlyClosed` lifecycle rule (a
  resolved ticket still inside its 24h reopen window counts as active; closed
  or reopen-window-elapsed does not — no new lifecycle logic invented).
  Short-TTL (15s) request-dedup cache, same pattern as the concern-categories
  cache, keyed by requester identity (`externalUserId:externalOrgId`) so a
  Quick-Login account switch within the TTL can never read a previous
  account's tickets. `invalidateActiveTicketsCache()` is called centrally
  from `ReportIssueDrawer.tsx` on every successful submit (not duplicated
  per-caller), so Support Tickets / Support Ticket Detail / Transaction
  Details all get a fresh read on their next check.
- **`TransactionDetails.tsx`:** no active ticket → unchanged "Report an
  issue" / "Contact support" CTAs. One or more active tickets → the general
  card shows "Active support ticket" (reference + status) or "N active
  tickets for this transaction", with **View Ticket(s)** (primary — the
  single ticket, or `/dashboard/support-tickets?search=<tracking>` for
  several, since "which one" would be arbitrary) and **Create New Ticket**
  (secondary — opens the same drawer, preselected). The On-Demand button
  swaps label to View Ticket(s) directly (kept single-button; the full
  context/copy lives in the general card on the same page). A request-
  generation ref (`activeTicketsRequestRef`) guards against the mount-time
  lookup and a post-submit refresh resolving out of order; state is cleared
  immediately on an `id` change so a new transaction never briefly shows the
  previous one's ticket.
- **`SupportTickets.tsx`:** now syncs `searchQuery` fully (set-or-clear) from
  a new `?search=` param — the deep-link target for "View Tickets" (plural).
  Reuses the page's existing search box (already matches `trackingNumbers`)
  instead of a second filter path.
- **Tests:** new `tests/transaction-active-ticket.test.mjs` (7 cases: no
  ticket, only-permanently-closed, one active, multiple active + deep link,
  Create New Ticket still works, post-submit refresh with no stale state,
  and an explicit N+1 assertion — one On-Demand transaction renders BOTH
  support CTAs from exactly one `GET /api/support/tickets` call). Updated
  `tests/heyq-lifecycle.test.mjs`'s two report-drawer tests: their fixture
  order already had an active ticket linked, so the correct entry point is
  now "Create New Ticket", not "Report an issue" — this is the new feature
  working as intended, not a regression. Wired the new test file into
  `package.json`'s `test` script (repo convention: explicit file list).
- **Validated:** `npm run typecheck` clean, `npm run build` clean, full suite
  **179/179** (`npm test`, up from 172). Two Codex CLI audit passes: the
  first found 3 real issues (cache not scoped to requester — cross-account
  leak risk on a Quick-Login switch; no refresh after creating a ticket
  without navigating away; `?search=` never cleared) — all fixed. The
  second pass found 3 more (stale ticket state briefly shown when navigating
  directly between two transactions; ticket creation from Support Tickets /
  Support Ticket Detail didn't invalidate the cache; a slow mount-time
  lookup could race a post-submit refresh and win) — all fixed (state clear
  on `id` change, centralized invalidation in the drawer, shared request-
  generation guard). Third Codex pass: clean, no findings.
- Not pushed yet this session (pending explicit instruction per project
  rules) — see the commit/push status at the point this file was last
  updated for the exact state.

## Most Recent Work — Hierarchical Concern Category Picker (2026-08-29)

Completed the hierarchical Concern Category picker in GGX Corporate (`ReportIssueDrawer.tsx` / `ConcernCategoryPicker.tsx`).
Full write-up: `docs/migration/ggx-corporate-live-concern-categories.md` §15.

- **Component**: `src/app/components/ui/ConcernCategoryPicker.tsx`
  - **Desktop**: Integrated 2-column layout (parent categories on left, subcategories of hovered/selected parent on right) within popover box.
  - **Mobile (< 640px)**: Inline drill-in navigation view with a top `< Back to categories` button.
  - **Selected Label**: Formatted as `"Parent Category > Subcategory"` when a subcategory is selected, or `"Parent Category"` for top-level leaves.
- **BFF / Validation**:
  - `api/_lib/bridge.ts` (`verifyLiveCategoryId`): Validates subcategory IDs alongside parent category IDs against live taxonomy.
  - `src/app/services/heyqCustomerApi.ts`: `getConcernTypeHint` handles missing/empty category IDs safely.
- **Validation**:
  - `npm run typecheck`: clean.
  - `npm run build`: clean.
  - `npm test`: **169/169** passing across 52 test suites.
  - Codex audit reviewed and cleared.

## Most Recent Work — hosted Quick Login intentionally re-enabled for stakeholder testing (2026-08-28)

Reverses §21's deploy-tier gate on the Login page's Quick Login cards
("Main Account" / "Subaccount"). This is a deliberate, stakeholder-requested
product decision for the hosted test app, not a regression of §21's audit
fix — full write-up and updated response-status table:
`docs/migration/ggx-corporate-heyq-live-ticketing.md` §22.

- **Removed**: `isPubliclyReachable()`/`PUBLICLY_REACHABLE_VERCEL_ENVS` and the
  404 short-circuit in `api/auth/quick-login.ts`; the `SHOW_QUICK_LOGIN`
  (`!import.meta.env.PROD`) conditional in `src/app/pages/Login.tsx`. Quick
  Login now behaves identically on local dev, `vercel dev`, and every hosted
  Vercel tier (Preview and Production).
- **Unchanged (still the security boundary)**: `resolveQuickLoginUser`
  (`api/_lib/demoUsers.ts`) still only maps the two fixed scopes
  (`'main'` → seeded admin, `'subaccount'` → seeded manager) — no arbitrary
  user/account id accepted, no credential ever reaches the frontend, same
  signed `ggx_session` cookie flow (`createSessionToken`/`buildSessionCookie`)
  as manual password login. QuadX Bridge / HeyQ untouched.
- **Tests updated**: `tests/api-auth-quick-login.test.mjs` — the two
  "disabled on production/preview/NODE_ENV=production" cases now assert the
  endpoint stays enabled (200 + session cookie) in those environments.
  `tests/login-quick-login.test.mjs` — the "gated to non-production builds"
  source assertion now asserts `SHOW_QUICK_LOGIN` no longer appears in
  `Login.tsx` at all.
- **Validated**: `npm run typecheck` clean; focused suite
  (`tests/api-auth-quick-login.test.mjs` + `tests/login-quick-login.test.mjs`)
  **14/14** green, including the browser-driven Login page flow for both
  Quick Login cards. Codex found no implementation issues on review.
- **Known accepted risk**: the hosted app can now mint a real signed session
  for either seeded demo account with no password from anyone who can reach
  the URL. Acceptable for the current stakeholder-testing purpose because the
  scope→user mapping is fixed and non-arbitrary; revisit before any real
  customer data lives behind these demo accounts.
- Committed and pushed to `origin/master` — see the `GGX_AGENT_STATUS` block
  at the end of this file for the final commit reference.

## Most Recent Work — typing presence: event-driven RECEIVER shipped (Supabase Realtime Broadcast, replacing the 3s poll) (2026-08-27)

HEYQ/QuadX Bridge shipped the companion architecture this session's earlier
audit (below) identified as the blocker: commit `ac5b685`
(`docs/migration/typing-realtime-broadcast-authorization.md` in the HeyQ
repo) — `POST /customer/tickets/:id/typing/subscribe` mints a short-lived
(~300s), RECEIVE-ONLY, ticket-scoped Supabase Realtime Authorization token
for a private broadcast channel (`ticket:<id>:agent_typing`), using
Supabase's "Broadcast from Database" + private-channel "Realtime
Authorization" primitives — no `service_role`, no broad Supabase session,
no custom WebSocket server. This session wires GGX up to it, replacing the
3s `GET /typing` poll entirely.

- **New**: `src/app/services/heyqTypingRealtime.ts` — the Realtime
  connection state machine (`connectAgentTypingRealtime`): mints a
  credential → `await setAuth(token)` → subscribes to the private channel;
  refreshes the token ~60s before its own expiry on the SAME open channel
  (no resubscribe, invisible to the indicator); on `CHANNEL_ERROR`/
  `TIMED_OUT`/`CLOSED`, fully tears down (`AWAITED` `disconnect()` — an
  unawaited one raced a resubscribe in early testing and is now a documented
  pitfall) and reconnects with capped backoff; single-flight/duplicate-
  subscription guarded; `stop()` idempotent. Test-injectable client factory
  (`__setSupabaseClientFactoryForTests` for direct unit tests, plus a
  `window.__ggxTestSupabaseClientFactory` seam for DOM-level tests that
  can't win the React-mount race against a direct setter call) — no real
  Supabase project or WebSocket server needed for any test in this pass.
- **`useTicketConversation.ts`**: the dedicated 3s agent-typing poll effect
  is REMOVED and replaced by a Realtime subscription: opened only while the
  ticket is non-terminal, closed and reopened around tab hidden/visible
  (hidden also clears `agentTyping` — an indicator can't be trusted with no
  live channel left to confirm/clear it; becoming visible reconnects but
  never marks typing on its own, only a genuine broadcast does), closed the
  moment a ticket resolves MID-SESSION (not just at mount) via a small
  status-watching effect, and reopened the instant a reply reopens a
  terminal ticket (`restartTypingRealtimeRef`, same pattern the old
  `restartTypingPollRef` used). The raw broadcast still feeds the EXISTING
  `RemoteTypingTracker` unchanged — a typing event still only ever updates
  the local indicator, never a ticket refetch.
- **Sender constants retuned** (`typingPresence.ts`) to HEYQ's new lease
  (server TTL 15s, up from 6s): `REMOTE_TYPING_STALE_MS` 8s→15s (now mirrors
  HEYQ's own authoritative TTL, the true self-heal ceiling for a
  dropped/missed broadcast — no longer paced against a retired poll
  interval); `CUSTOMER_TYPING_THROTTLE_MS` 2s→4s (matches HEYQ's own
  send-throttle, sparse relative to the 15s TTL — "do not make traffic more
  frequent than necessary"). `CUSTOMER_TYPING_STOP_DEBOUNCE_MS` (10s) was
  already correct, unchanged.
- **Dead client code removed** (GGX-only — HEYQ/Bridge's own `GET
  /customer/tickets/:id/typing` route is untouched server-side, GGX simply
  no longer calls it): `getTypingStatus`/`apiGetTypingStatus`, and the `GET`
  handler in `api/support/tickets/[id]/typing.ts` (now POST-only). New:
  `subscribeToAgentTyping`/`apiSubscribeToAgentTyping` and a new proxy
  route, `api/support/tickets/[id]/typing/subscribe.ts` (POST-only,
  identical identity/ownership rules as every other route in this proxy —
  session-verified identity only, Bridge 404-not-403 semantics).
- **New dependency**: `@supabase/supabase-js` (browser Realtime client
  only — no server-side Supabase usage in GGX; the proxy still only ever
  holds `QUADX_BRIDGE_API_KEY`).
- **Two real issues found only by testing against actual browser/module
  timing** (not visible from code review — see `heyqTypingRealtime.ts`'s
  docblock and `tests/heyq-typing.test.mjs`'s reconnect test): an
  unawaited `realtime.disconnect()` during reconnect let a freshly
  resubscribed channel get silently torn down moments later; and
  `setAuth(token)` must be re-applied immediately before EVERY
  (re)subscribe, never assumed to persist.
- **Tests**: `tests/heyq-typing.test.mjs` — added a full pure-logic suite
  for `heyqTypingRealtime.ts` (setAuth-before-subscribe, duplicate-
  subscription prevention, malformed-payload safety, token refresh on the
  same client, reconnect ordering, idempotent stop — 6 tests, no real
  Supabase/WebSocket), and rewrote the DOM-level suite around a fake
  Realtime client instead of a GET-poll fetch stub (12 tests: broadcast
  delivery, setAuth-before-subscribe end-to-end, no-refetch-on-typing,
  failed-subscribe-never-blocks, unmount teardown, hidden/visible
  lifecycle incl. "no auto-typing-on-reconnect", resolved/closed pause +
  resume, and resolving MID-SESSION closes the subscription). Existing
  pure-logic `typingPresence.ts` coverage (throttle/debounce/stale-expiry)
  is unchanged — it already read its constants from the module's own
  exports, not hardcoded values, so needed no edits despite the retune.
  `tests/api-support-typing.test.mjs` — removed the GET-route tests
  (dead route), added a new suite for `typing/subscribe.ts` (route/method,
  identity-from-session-only, no service-role leakage, 404-not-403,
  405 on other methods).
- **Validated**: `npm run typecheck` clean, `npm run build` clean, full
  suite **148/148** across 46 suites (`npm test`); the two typing files
  standalone **39/39** (13 route-level + 26 client/DOM), re-run for
  stability. Not deployed, not pushed, not committed to git yet pending
  final review.

## Most Recent Work — typing presence: event-driven receiver evaluated and ruled out; sender-side hardening shipped (2026-08-27)

Audited the full typing/presence path (`typingPresence.ts`,
`useTicketConversation.ts`, `heyqCustomerApi.ts`, `ticketsService.ts`, the
`/api/support/tickets/[id]/typing` proxy) to see whether the 3s
"keep asking if the other side is typing" receiver poll could be replaced
with an event-driven Supabase Realtime subscription, per the audit's request.
GGX/HeyQ/Bridge were read; **only GGX source was changed** (HEYQ/Bridge/
Supabase untouched, as instructed).

- **Realtime investigation (read-only, against HeyQ's deployed contract —
  `HeyQ/docs/migration/live-typing-canonical-contract.md` +
  `HeyQ/supabase/migrations/20260829100000_ticket_typing_state.sql`):**
  HEYQ's own agent-side receiver already consumes this exact server state
  (`public.ticket_typing_state`) via Supabase Realtime `postgres_changes` —
  but that table's RLS grants `select` **only to the `authenticated` role**
  (a real Supabase Auth session bound to a staff `profiles` row); `service_role`
  (full CRUD, bypasses RLS entirely) is the only other grantee. GGX customers
  never hold a Supabase Auth session — identity here is GGX's own signed
  session cookie + a Bridge-resolved `externalUserId`/`externalOrgId`
  (`requireSessionIdentity`), so there is **no credential the browser could
  present** to subscribe directly: not `anon` (no policy grants it), not
  `authenticated` (nothing to mint a valid JWT from for an external customer
  identity), and never `service_role` (would bypass RLS on every table in the
  database, not just this one — a full trust-boundary break, explicitly
  disallowed). Broadcast and Presence have the identical gap: no ticket-scoped
  Realtime Authorization/token-issuance mechanism exists today for a customer
  identity, and QuadX Bridge is a stateless Edge Function with no persistent
  connection to participate in a broadcast channel of its own (same reason
  HEYQ's own design doc gives for not using Broadcast on the staff side).
  **Conclusion: none of the three mechanisms (Broadcast / Presence /
  `postgres_changes`) can be wired from GGX today without either exposing a
  Supabase credential to the browser or building new companion
  infrastructure** — a scoped Realtime token-issuance route (new Bridge
  endpoint) plus a channel-authorization policy keyed to
  `(ticket, externalUserId)` (new Supabase migration). Per the task's
  instruction, this is **not invented as a workaround**; the 3s receiver poll
  stays exactly as-is, and the finding above is the exact companion-change
  ask for a future HEYQ/Bridge/Supabase session.
- **Sender-side hardening (safe, local-only, shipped this pass):**
  `CUSTOMER_TYPING_STOP_DEBOUNCE_MS` raised from 3s to the spec's explicit
  **10s** inactivity value (`typingPresence.ts`) — the 6s server TTL still
  self-heals the remote indicator sooner if this explicit stop is ever late
  or lost, so this was a UX-value fix, not a correctness one. Added two
  immediate-stop triggers that were missing from the original WIP:
  **composer blur** (`onBlur` on the reply textarea in
  `SupportTicketDetail.tsx`, calling the hook's existing `stopTyping()`) and
  **tab hidden / window blur** (`useTicketConversation.ts`'s typing effect —
  `document.hidden` and a new `window` `blur` listener both call
  `customerEmitter.stopNow()` immediately, rather than waiting out the 10s
  debounce). Returning to the tab/window was already correct — nothing calls
  `onInputChange`/resends `start` on focus/visibility-restore, confirmed by a
  new test. Send/clear/ticket-change/unmount stops, the throttled ~2s
  keepalive-while-typing, and the poll's own single-flight/pause/resume
  behavior were already correct and are unchanged.
- **New tests** (`tests/heyq-typing.test.mjs`, DOM-level, real fetch-stubbed
  proxy): composer blur stops immediately: tab-hidden stops immediately;
  window-blur stops immediately; returning to a visible tab does not resend
  `start` without a new keystroke. All existing pure-logic and DOM typing
  tests pass unchanged (the inactivity test asserts against the
  now-10s `CUSTOMER_TYPING_STOP_DEBOUNCE_MS` constant, not a hardcoded value,
  so it needed no edit).
- **Validated:** `npm run typecheck` clean, `npm run build` clean, full suite
  **132/132** (up from 128 — the 4 new tests above), `tests/heyq-typing.test.mjs`
  standalone **16/16**. Not deployed, not pushed, not committed to git yet
  pending final review.

## Most Recent Work — live typing presence finished against the deployed QuadX Bridge contract (2026-08-27)

Resumed and finished the preserved GGX typing/presence WIP now that HEYQ/QuadX
Bridge ships the canonical Supabase-backed typing contract (HeyQ's
`docs/migration/live-typing-canonical-contract.md`). Commit `d7e0e31`.

- **Verified the exact deployed contract** against HeyQ's canonical doc + the
  live `quadx-bridge/index.ts` source (read-only, HeyQ repo untouched):
  `POST /customer/tickets/:id/typing` (body `{ externalUserId, externalOrgId,
  state: 'start'|'stop' }` → `{ typing: boolean }`) and `GET
  /customer/tickets/:id/typing?externalUserId=&externalOrgId=` → `{ typing:
  boolean }`, 6s server-side TTL, `:id` strictly the ticket **UUID** (a
  human-readable reference 404s). The preserved WIP's proxy
  (`api/support/tickets/[id]/typing.ts`) already matched this 1:1 — route,
  method, body/query shape, response relay, UUID usage (`ticket.id`, the same
  field `[id].ts`'s GET already uses), and identity sourced only from
  `requireSessionIdentity` (never trusted from the request) — so no proxy
  contract changes were needed, only its stale "not shipped yet" docblock.
- **Two real gaps found and fixed in `useTicketConversation.ts`'s dedicated
  3s agent-typing poll** (customer-side send/throttle logic was already
  correct): (1) no `isPolling` guard — a visibility-change bounce could fire
  a second `getTypingStatus` GET while one was still in flight, unlike the
  main ticket-detail poll's existing single-flight guard; (2) never paused
  for a resolved/closed ticket (an "inactive" conversation) the way the
  ticket-detail poll already does — now shares that pause condition via a
  ref (`ticketStatusForTypingRef`, updated without restarting the effect) and
  resumes immediately, via a new `restartTypingPollRef`, when a reply reopens
  the ticket — mirroring the existing `restartPollingRef` pattern exactly.
  The customer's own typing signal is deliberately NOT paused for a terminal
  ticket, since replying to one reopens it.
- **Sender (customer) values, unchanged from the WIP, confirmed correct**:
  throttled `start` (~1 per 2s, comfortably inside the 6s TTL), inactivity
  `stop` after 3s, force-stop on send/clear/ticket-change/unmount.
- **401/403 preserved for free**: `apiSendTypingSignal`/`apiGetTypingStatus`
  go through the same shared `post`/`getJson` helpers every other ticket call
  uses, so a 401 still clears the session (`SESSION_EXPIRED_EVENT`) and a 403
  does not — no typing-specific code needed to write this rule twice.
- **New test**: `tests/api-support-typing.test.mjs` — esbuild-bundles the real
  `[id]/typing.ts` handler (same approach as
  `tests/api-support-categories.test.mjs`) against a local fake Bridge HTTP
  server; asserts the exact route/method/body/query shape, UUID passthrough,
  spoofed-identity rejection, 401-before-Bridge, 400 on a malformed state, and
  405 on other methods. `tests/heyq-typing.test.mjs` (already-committed WIP)
  gained one more DOM case for the new terminal-pause/resume behavior.
- **Validated**: `npm run typecheck` clean; full suite **128/128** (`npm
  test`, including both new/updated typing test files). Manual browser
  verification of the indicator was not run in this pass (no dev server
  session opened) — the DOM-level Playwright coverage in `heyq-typing.test.mjs`
  drives the actual rendered "Customer Support is typing…" bubble end to end
  against a fetch-stubbed proxy, including its appearance/clearing and the
  new pause/resume case.
- **Not deployed; not pushed.** No source-side blocker remains — the proxy
  contract is confirmed correct against the live Bridge implementation. Live
  round-trip verification still needs `QUADX_BRIDGE_URL`/
  `QUADX_BRIDGE_API_KEY` configured in a real environment (same recurring
  blocker as every prior HeyQ-integration session on this project) and a GGX
  Vercel redeploy once pushed.

## Most Recent Work — ticket-detail polling: stale-reply race fixed (2026-08-27)

Codex's final audit of the adaptive-polling work below (commit `9ccead5`)
found a real P1: a detail GET already in flight when a reply reopens a
resolved/closed ticket could resolve AFTER that reply, overwriting the
just-reopened status and cancelling the 15s cadence the reply had just
re-armed. Commit `5dcc289`.

- **Fix:** a per-effect epoch counter in `useTicketConversation.ts`, bumped
  whenever a confirmed reply calls `restartPollingRef`. A poll snapshots the
  epoch before its GET and re-checks it after; if superseded, the response is
  discarded entirely (no merge, no reschedule) — the reply's own schedule is
  left standing.
- **New test:** `heyq-request-lifecycle.test.mjs` races a deliberately
  delayed stale poll against a reply that reopens a resolved ticket (bespoke
  self-mutating fetch stub, not the shared static fixture — the reply needs
  to actually flip status). Asserts the reopened status sticks and the 15s
  cadence survives. Full suite **106/106**, typecheck clean, build clean.
- **Process note for future sessions:** don't pipe a long-running background
  test command through `tail` — it buffers ALL output until the process
  exits, so a genuinely-progressing run looks indistinguishable from a hung
  one for its entire duration. Redirect to a plain log file (`> file.log
  2>&1`) and `Read`/`tail` that file instead. Separately, killing the
  Bash-tool's tracked wrapper does not reliably kill a deeply nested
  `npm`/`node --test`/`vite` child-process tree on Windows — verify and, if
  needed, `Stop-Process` the actual child PIDs directly.

## Most Recent Work — ticket-detail adaptive polling (2026-08-27)

Replaced `useTicketConversation`'s fixed 5s ticket-detail poll with an
adaptive 15s cadence. Observed latency (~6s cold, ~1.3–1.4s on a `304`) made
the old 5s fixed interval too aggressive and, being a plain `setInterval`,
theoretically able to stack a slow request behind an in-flight one.

- **New cadence:** request-completes → wait 15s → next poll, via a
  `setTimeout` chain re-armed in each poll's own `finally` (never a fixed
  `setInterval`) — single-flight by construction, not just by an `isPolling`
  guard. Commit `9ccead5`.
- **New:** `isTerminalTicketStatus` (`heyqService.ts`, re-exported via
  `ticketsService.ts`) — `resolved`/`closed` pause the cadence entirely; a
  reply that reopens one (existing behavior, unchanged) resumes it
  immediately via a small `restartPollingRef` the hook exposes from its
  polling effect to `submit`.
- **Unchanged:** hidden-tab pause + one immediate refresh on visibility
  restore (now re-arming a 15s cadence instead of a 5s one), the post-reply
  confirmation GET, initial-load behavior, UUID routing, and every BFF/Bridge
  contract.
- **Tests:** `tests/heyq-request-lifecycle.test.mjs` — retimed existing
  detail-poll coverage to 15s and added single-flight (slow-request,
  `__detailDelayMs`) and terminal-status (new resolved-ticket fixture)
  coverage. `tests/heyq-realtime.test.mjs`'s detail-poll test retimed to
  match (was asserting on the old 5s cadence). Full suite **105/105**,
  typecheck clean, build clean.

## Most Recent Work — live Concern Categories: HTTP no-store audit fix (2026-08-27)

Closed the single remaining audit finding on the live Concern Categories work
below: the live category fetch had no explicit HTTP-level cache directive.
Full write-up: `docs/migration/ggx-corporate-live-concern-categories.md` §14.

- `heyqCustomerApi.ts`'s `apiListConcernCategories` now sends `cache:
  'no-store'` on its fetch (via a new optional param on the shared `getJson`
  helper — every other caller unaffected). `api/support/categories.ts` now
  sets `Cache-Control: no-store` unconditionally as the handler's first line,
  covering every response it can produce (200/401/405/500/502). Ticket
  creation's server-side category re-verification and every other
  support/Bridge route were left untouched.
- **New committed regression tests**: `tests/api-support-categories.test.mjs`
  (esbuild-bundles the real handler + session lib, calls it against a local
  fake Bridge, asserts the header on both a 200 and a 401) + one new
  `heyq-adapter.test.mjs` assertion on the client fetch's `cache` option.
  `esbuild` (previously only a transitive Vite dep) is now an explicit
  `devDependency`, pinned to its already-resolved `0.25.12`.
- **Validated:** focused (`tests/api-support-categories.test.mjs` 2/2,
  `heyq-adapter.test.mjs` 39/39), full suite `npm test` **82/82** (up from
  79), `npm run typecheck` clean, `npm run build` clean (dist/ re-scanned, no
  secret). No lint step (repo has none). Not deployed; live round-trip still
  blocked on the same missing `QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY` as
  every prior session on this project.

## Most Recent Work — live Concern Categories wired end-to-end (2026-08-26)

Completed the Corporate-side integration of QuadX Bridge's live Concern
Categories API (HeyQ commit `1b591c52af28ab92e264c4e3957313d032e9707c`). Full
write-up: `docs/migration/ggx-corporate-live-concern-categories.md`.

- **New:** `GET /api/support/categories` (BFF proxy, session-gated, no
  caching) and `verifyLiveCategoryId` (`api/_lib/bridge.ts`) — `POST
  /api/support/tickets` now requires a `categoryId` and re-verifies it against
  a fresh Bridge fetch before creating anything (400 on unknown/missing, 502
  fail-closed if verification itself can't reach Bridge).
- **Report drawer** (`ReportIssueDrawer.tsx`) now loads categories live with
  explicit loading/ready/empty/error states and re-verifies the selection
  immediately before submit, clearing (never silently substituting) a
  selection that went stale while the drawer was open.
- **Retired** the hardcoded `REPORT_CONCERN_OPTIONS`/`HEYQ_CONCERN_LABELS`
  catalog in `heyqService.ts` that used to drive category selection — replaced
  by `listConcernCategories()`. `apiCreateTicket` now sends the canonical
  `categoryId`; a small one-way `CATEGORY_ID_TO_CONCERN_TYPE` shim still sends
  a best-effort legacy `concernType` label alongside it, only because Bridge's
  own ticket-read `issueType` label is keyed off the legacy field, not
  `category_id` (a documented Bridge-side gap, not fixed here — see the
  handoff doc's §9).
- **Found two real Bridge-side gaps, documented but NOT fixed** (out of this
  task's Corporate-only scope): (1) Bridge's own `create_customer_ticket_bridge`
  path validates `categoryId` against a static reference array, not the live
  `public.categories` table `GET /customer/categories` actually reads — an id
  valid in the live table but absent from the static seed would be silently
  substituted rather than rejected (dormant today since the seed is an exact
  clone, but a real latent gap); Corporate's own fresh re-verification closes
  this from its side regardless. (2) The customer ticket READ projection
  never exposes `categoryId` at all — only the legacy `concernType`/`issueType`.
- **Validated:** `npm run typecheck`, `npm run build` (dist/ scanned, Bridge
  key confirmed absent), `npm test` **79/79** (up from 71 — 2 create-flow
  updates + 6 new category tests). A throwaway esbuild-bundled smoke script
  exercised the two BFF route handlers directly against a real local fake
  Bridge HTTP server: 21/21 checks passed (auth gate, live relay, secret never
  leaked, unreachable-Bridge fail-closed, valid/invalid/missing categoryId,
  spoofed-identity override, empty-vs-failure distinction) — not committed.
  Also manually verified in a real browser (`npm run dev`) that the drawer's
  error state renders and correctly blocks submission against the actually
  unreachable `/api/support/categories` (no Vercel Functions runtime under
  plain Vite in this environment — same recurring constraint as every prior
  HeyQ-integration session on this project).
- **Not deployed; live round-trip not run** — no `QUADX_BRIDGE_URL`/
  `QUADX_BRIDGE_API_KEY` configured in this environment (same blocker
  recorded across this project's entire HeyQ history). Requires a Corporate/
  Vercel redeploy once pushed; no new secret, database, or migration needed.

## Most Recent Work — production reply 503 diagnosed and fixed (2026-08-26)

`npm run e2e:prod` against live production (`https://ggx-corporate.vercel.app`)
started passing for real this session (env vars now set, per §19.5's
operator steps) — first run: 15 passed, 2 failed, both on the reply path
(`503`). Full trace + fix: `docs/migration/ggx-corporate-heyq-live-ticketing.md`
§20.

- Traced the real request end to end: Vercel runtime logs showed Corporate's
  proxy relaying Bridge's own `503` unchanged (not a Corporate-side error
  path) → the HeyQ Edge Function's `addCustomerMessage` maps any
  `add_customer_message_bridge` RPC error to a generic `503` → the RPC's
  `p_message_id` parameter is `uuid`-typed (it doubles as the inserted
  message row's PK) → reproduced directly against the hosted DB (read-only
  `select '<value>'::uuid`, via the Supabase CLI which was already
  authenticated in this environment) and got the exact error:
  `22P02: invalid input syntax for type uuid`.
- **Root cause**: `scripts/prod-e2e-validation.mjs` was sending
  `` `${RUN_TAG}-msg-1}` `` as `X-Bridge-Message-Id` — a non-UUID string. The
  real app always sends `crypto.randomUUID()` for this header
  (`useTicketConversation.ts`), so no real caller had ever hit this; it was
  a test-script defect, not an app/Bridge/schema defect. Fix: generate a real
  UUID in the script. No `api/`, Edge Function, or migration changes needed.
- Re-ran `npm run e2e:prod` against production: **17 passed, 0 failed**
  (resolved-ticket auto-reopen still `[SKIP]` by design — needs a real
  pre-resolved ticket). Cleaned up all 4 `GGX-E2E-*` test tickets created
  across both runs directly via the Supabase CLI (scoped delete by exact id,
  confirmed zero orphaned rows — all referencing FKs are `ON DELETE
  CASCADE`/`SET NULL`).
- Production auth-hardening work (§18/§19) is now fully live-validated
  end-to-end, including the reply path. No known blockers remain on this
  task.

## Most Recent Work — public demo credentials removed from frontend (2026-08-26)

Closed the last item from the production-auth audit: `Login.tsx` was
publicly handing out the working demo password, and a leftover unused
`DEMO_USERS`/`MOCK_AUTH_USERS` email→role→account table shipped a full
identity directory in the bundle. Full write-up:
`docs/migration/ggx-corporate-heyq-live-ticketing.md` §19.

- Removed `DEMO_PASSWORD`, the demo quick-fill buttons, and the
  credential-echoing alert from `Login.tsx`; generic "Invalid email or
  password" message now. Removed the unused `DEMO_USERS` export from
  `AuthContext.tsx`. Replaced `auth.mock.ts`'s email-keyed `MOCK_AUTH_USERS`
  with `permissionsForRole(role)` (permissions are a function of role only,
  not identity); `authService.ts` now builds the display user entirely from
  `POST /api/auth/login`'s server-confirmed response instead of a local
  lookup table. No change to server-side auth (`api/_lib/session.ts`,
  `demoUsers.ts`, `bridge.ts` untouched — §18's work stands as-is).
- Validated: `npm run typecheck` clean, `npm run build` clean, `npm test`
  71/71, and a bundle credential scan (`grep` over a fresh `dist/`) confirms
  the demo password string is fully gone; the one harmless remaining
  match is a pre-existing, unrelated display fallback in `RootLayout.tsx`
  (not a credential or identity mapping — see §19.4 for why it was left).
- **New finding this pass**: this session had read access to the linked
  Vercel project via the Vercel MCP plugin (unlike every prior session,
  which had none at all) — confirmed the current production deployment is
  built from `ed7a0ee`, one commit behind `1c0e237` (§18's server-auth fix)
  and this session's own commit, so `/api/auth/login` 404s on production
  today (route doesn't exist in that build yet — expected, not a bug).
  Still **no tool available to read or set actual env var values** (no
  env-var tool in the plugin, no Vercel CLI installed) — `SESSION_SECRET`/
  `QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY` on Production remain unverified.
- **Still blocked**: per this project's "do not push unless instructed"
  rule, `1c0e237` and this session's commit were NOT pushed. Operator needs
  to: push to `origin/master`, set the three Production env vars in the
  Vercel dashboard, confirm the resulting deploy is `READY`, then run
  `E2E_BASE_URL=https://ggx-corporate.vercel.app npm run e2e:prod`. See
  §19.5 for the full sequence.

## Most Recent Work — server-verified support identity (2026-08-26)

Closed the last security blocker from the audit trail: the support proxy's
`demoAccountId` was forgeable (a caller could send another valid demo
account's id and be served as that account). Full write-up:
`docs/migration/ggx-corporate-heyq-live-ticketing.md` §18.

- Corporate had NO server-verifiable session at all before this — login was
  100% client-side (`localStorage`, no cookie/token/network call). Added the
  smallest thing that fixes that: `POST /api/auth/login` validates
  credentials server-side (`api/_lib/demoUsers.ts`) and sets a signed,
  httpOnly, expiring cookie (`api/_lib/session.ts`, HMAC-SHA256, 12h TTL,
  `SESSION_SECRET` env var — new required var, see `.env.example`).
  `/api/support/**` now derives identity ONLY from that cookie
  (`requireSessionIdentity` in `api/_lib/bridge.ts`) — `demoAccountId`,
  `externalUserId`, `externalOrgId` from the request are read and discarded,
  never trusted. `api/_lib/demoIdentity.ts` removed, replaced by
  `demoUsers.ts` (credential check + verified-id → Bridge-identity mapping)
  + `session.ts` (token mint/verify).
- Client (`authService.ts`, `heyqService.ts`, `heyqCustomerApi.ts`) updated:
  login/logout now call the real endpoints; ticket read/write functions no
  longer take or send any identity parameter (travels invisibly via the
  browser's automatic same-origin cookie).
- Validated two ways: 35 direct-import unit checks (token tamper/expiry/
  forged-account rejection, fail-closed on missing `SESSION_SECRET`) + a
  17-check real-HTTP smoke test through the actual handler code against a
  throwaway fake Bridge (cross-account isolation, idempotency, forged-field
  rejection, logout). `npm test`: 71/71 (up from 70 — one test's URL regex
  needed updating for the now query-string-free requests, not a behavior
  change). Typecheck/build clean; `dist/` scanned, no secrets present.
- Restored `scripts/prod-e2e-validation.mjs` — referenced in §17.2 but never
  actually committed (confirmed via `git log --all`, a doc/reality mismatch,
  not a deleted file). Rebuilt to authenticate legitimately through the new
  login endpoint; uses only the app's own public POC demo credentials, no
  secrets. `npm run e2e:prod` (with `E2E_BASE_URL` set) runs it.
- **Still blocked**: no Vercel access in this environment (same recurring
  constraint — see §16.5) to set `SESSION_SECRET` on the real deployment or
  rerun `prod-e2e-validation.mjs` against live `/api/support/**`. Whoever has
  Vercel access needs to set it (fresh random value, e.g. `openssl rand
  -base64 48`) alongside the existing Bridge env vars, then run the script.

## Most Recent Work — dedicated production Bridge key configured (2026-08-26)

Replaced §15's throwaway validation key with a purpose-generated production
secret. Full write-up: `docs/migration/ggx-corporate-heyq-live-ticketing.md` §16.

- Generated 256 bits of fresh randomness (not reused from any existing
  Supabase/app secret), set via `supabase secrets set QUADX_BRIDGE_API_KEY=...
  --project-ref rwzwktrepfgsooerpyjx` — the Bridge Edge Function's own secret
  store. Never printed, never committed, local scratchpad copy deleted right
  after configuring it.
- Re-confirmed fail-closed against the live hosted URL: missing key → 401,
  wrong key → 401, the new key → 200 (minimal non-mutating smoke test).
- **Corporate/Vercel side still NOT configured** — no Vercel CLI/linked
  project available in this environment (same as every prior pass). Per
  instruction, did not expose the secret as a workaround. Whoever has Vercel
  access needs to set `QUADX_BRIDGE_URL` + `QUADX_BRIDGE_API_KEY` there — see
  §16.5 for the recommended approach (rotate to a new value they choose
  themselves, since Supabase secrets can't be read back out via the CLI).

## Most Recent Work — QuadX Bridge deployed as a Supabase Edge Function (2026-08-26)

The "no hosted Bridge exists" blocker from the previous session is resolved.
Full write-up: `docs/migration/ggx-corporate-heyq-live-ticketing.md` §15.

- **New, in the HeyQ repo** (commit `736b948`): `supabase/functions/quadx-bridge/index.ts`
  — a self-contained Deno Edge Function porting the 4 routes Corporate's
  proxy actually calls (list/get/create/reply), same atomic RPCs, same auth
  contract, same idempotency headers, same fail-closed rules. Deployed to
  HeyQ's own linked Supabase project (`rwzwktrepfgsooerpyjx`).
  **Production Bridge URL:**
  `https://rwzwktrepfgsooerpyjx.supabase.co/functions/v1/quadx-bridge`.
- **Zero Corporate code changes** — only `QUADX_BRIDGE_URL`'s env VALUE needs
  to point here now. `.env.example` updated with the production URL comment.
- **Validated twice**, both via Corporate's real unchanged proxy handlers
  with real network calls: once against a local mirror, once against the
  actual hosted deployment. All 17 checks passed both times (full round
  trip, resolved-ticket auto-reopen, both idempotency paths verified by real
  row counts, cross-account isolation, spoofed-identity rejection, bad/missing
  key fail-closed).
- **Found and fixed a real bug**: the hosted database's migration history
  claimed the idempotency-key column existed, but it didn't (drift, cause
  unconfirmed). Re-applied the exact (idempotent) migration directly against
  hosted to fix it — not an Edge Functions problem, would have broken the
  Node Bridge too; the Edge Function work just surfaced it.
- Regression (typecheck/build/71 tests) green, no Corporate source changed.
  All test data cleaned up on both local and hosted; generated secret not
  stored anywhere in either repo.
- **Still open:** no Vercel access available to actually set the two env
  vars on Corporate's deployment or to smoke-test its real `/api/support/**`
  HTTP routes end-to-end — someone with Vercel access needs to do that next.

## Most Recent Work — Live end-to-end validation against a real Bridge (2026-08-26)

No hosted/reachable QuadX Bridge deployment exists (Railway decommissioned,
no Vercel Functions deployment of it either — reconfirmed). What IS real and
reachable: the Supabase project the Bridge writes to
(`rwzwktrepfgsooerpyjx`), migration-synced locally via `supabase start`
(already running, linked). Full write-up: `docs/migration/ggx-corporate-heyq-live-ticketing.md` §14.

- Ran HeyQ's own unmodified `server/index.ts` locally, WITHOUT `--dev` (auth
  gate enforced like production), against that local-mirrored real Postgres.
  Drove Corporate's real `api/support/tickets/*.ts` handlers with real,
  un-stubbed `fetch` against it — the most faithful "live" round trip
  possible without a hosted Bridge URL.
- **All passed:** full round trip (create → CSR reply simulated in Postgres →
  poll picks it up → more replies → resolved-ticket reply auto-reopens via
  the real RPC, no explicit Reopen used); both idempotency paths (create +
  reply, verified by real row counts); all 8 cross-account/negative checks
  (unknown account, spoofed identity ignored — verified in Postgres, not just
  the response — cross-account 404s, bad/missing key fail-closed, key absent
  from bundle); attachment payload still 400 pre-Bridge.
- One test ticket was created (tagged `GGX-CORP-LIVE-E2E-<ts>`) and fully
  deleted afterward; the Bridge server process was stopped; three throwaway
  validation scripts were deleted — nothing new committed to the test suite.
- Regression: typecheck, dedicated `api/**` check, build (secret still
  absent from `dist/`), full suite (71/71) all green — no source files
  changed in this task, docs only.
- **Still blocking:** a genuinely hosted Bridge URL + key, from whoever
  operates the real deployment, to re-run this same round trip against it
  and smoke-test the actual Vercel-routed `/api/support/**` paths (this pass
  called the handler functions directly, not through a live HTTP listener).

## Most Recent Work — POC identity correction + Reopen removal (2026-08-26)

Narrow corrective pass on the Corporate support proxy responding to a Codex
re-audit of `b9795cb`. Full write-up: `docs/migration/ggx-corporate-heyq-live-ticketing.md` §13.

- **P1 fixed — requester identity was browser-forgeable.** Every
  `/api/support/*` route used to read `externalUserId`/`externalOrgId`
  straight off the browser-controlled request and forward them to Bridge
  as-is. Now the browser sends only an opaque `demoAccountId` (the app's
  existing mock-session user id, e.g. `user-admin-001`); a new
  `api/_lib/demoIdentity.ts` maps it to a Bridge identity via an allowlist
  built from `MOCK_AUTH_USERS` (the SAME dataset `authService.ts` already
  uses — imported, not duplicated), and every route discards + ignores any
  `externalUserId`/`externalOrgId`/`demoAccountId` the request also carries
  before building the Bridge payload. Unknown/missing `demoAccountId` → `400`,
  Bridge never called. Explicitly NOT production auth — still deferred.
- **P2 fixed — explicit Reopen was knowingly non-functional.** It called
  Bridge's legacy in-memory reopen route, which can't find a Bridge-created
  ticket. Removed entirely (proxy route, `apiReopenMyTicket`,
  `reopenMyTicket`, `reopenTicket`, the hook's `reopen`, the UI button).
  Replying to a resolved ticket still reopens it automatically via the
  working Supabase RPC path — unchanged, still the supported way.
- **Validated:** `npm run typecheck`, a dedicated `api/**` TS check, `npm run
  build` (secret still absent from `dist/`), `npm test` (71/71) all green; a
  throwaway manual smoke script directly confirmed identity resolution,
  fail-closed behavior, and spoofed-field rejection against the real handlers.
- **Still not run — live E2E.** No `QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY`
  configured in this environment; a live round trip and a live cross-account
  negative test against the real Bridge remain outstanding.

## Most Recent Work — Corporate support proxy / BFF for QuadX Bridge (2026-08-26)

Built the minimum server-side proxy so the browser stops calling QuadX
Bridge/Railway/HeyQ directly and never holds `QUADX_BRIDGE_API_KEY`. Full
write-up: `docs/migration/ggx-corporate-heyq-live-ticketing.md` §11.

- **New:** `api/_lib/bridge.ts` + `api/support/tickets/{index,[id],[id]/messages,[id]/reopen}.ts`
  — Vercel serverless functions (zero-config `/api/**`, no new deps) that
  attach `X-Corporate-Internal-Key: $QUADX_BRIDGE_API_KEY` server-side and
  forward to QuadX Bridge (`$QUADX_BRIDGE_URL`, unset by default — see below).
- **Frontend:** `heyqCustomerApi.ts` now calls same-origin `/api/support/*`
  instead of `${VITE_HEYQ_API_URL}/api/customer/*`. Ticket creation/reply lost
  their `files` param (attachments disabled — Bridge is text-only);
  `useTicketConversation.ts` no longer opens a WebSocket (REST 5s polling
  only); reply retries now reuse a UUID `tempId` as `X-Bridge-Message-Id` so
  Bridge's atomic RPC dedupes them; ticket creation sends a fresh
  `Idempotency-Key` per call. `AttachmentInput` unwired from the report drawer
  and reply composer.
  **Dormant, not deleted:** the realtime WebSocket client and
  `buildAttachmentUrl`/`getAttachmentUrl` — unused by the running app, still
  pointed at the legacy Railway origin, kept in case a future Bridge contract
  adds realtime/attachments.
- **Validated:** `npm run typecheck`, `npm run build` (confirmed the key never
  reaches `dist/`), `npm test` (70/70) all green; a throwaway manual smoke
  script directly exercised all four route handlers (see §11.8 of the handoff).
- **Not validated — no reachable Bridge URL found.** Neither this repo nor the
  HeyQ repo documents a currently-deployed, reachable QuadX Bridge HTTP origin
  (Railway was explicitly decommissioned per `HeyQ/.env.example`).
  `QUADX_BRIDGE_URL` is left unset by default; the proxy fails closed until a
  real one is supplied. A live end-to-end round trip (ticket in HeyQ, CSR
  reply, idempotent retry, etc.) is therefore still outstanding — next step is
  `CODEX_GGX_HEYQ_END_TO_END_REAUDIT` once that URL + the key are available in
  a real deployment.
- **Known Bridge-side gap (not fixed here, out of scope):** the explicit
  "Reopen ticket" button proxies to `/tickets/:id/reopen`, which QuadX
  Bridge's own implementation still runs against HeyQ's legacy in-memory
  store rather than the Supabase RPC path — it will not find a Bridge-created
  ticket. Replying to a resolved ticket already reopens it via the working RPC
  path, so this only affects the standalone button.

### Follow-up re-audit — NOT CLEARED (2026-08-26)

- Re-ran `npm run typecheck`, a dedicated TypeScript check over every `api/**`
  function, `npm run build` (including a `dist/` secret/header-token scan),
  and `npm test` (**70/70 green**). Vercel's current documentation confirms
  that filesystem functions take precedence over a catch-all rewrite, so the
  `/api/support/**` route layout is valid.
- This environment has neither `QUADX_BRIDGE_URL` nor
  `QUADX_BRIDGE_API_KEY`; no live proxy/Bridge round trip or cross-account
  negative test could run.
- Release remains blocked even after configuration is supplied: the proxy
  accepts `externalUserId` and `externalOrgId` from browser query/body fields.
  It therefore does not derive requester scope from a server-verified session;
  a caller can select a different identity when invoking the same-origin proxy.
  This is a P1 authorization gap, not merely a missing live-test input.
- The visible explicit Reopen action is also not release-ready: it calls the
  documented legacy in-memory Bridge route and cannot reopen a
  Supabase/Bridge-created ticket. Hide/remove that action until HeyQ provides
  an authoritative reopen route; replying remains the supported reopen path.
- Full disposition and release gates: `docs/migration/ggx-corporate-heyq-live-ticketing.md` §12.

## Most Recent Work — OMS-shaped sample order data (2026-08-24)

Reworked the Transactions/order sample data to be patterned after a real OMS
order payload instead of a flat row with a single current status. Full
write-up, field-by-field mapping, and scenario coverage:
`docs/context/oms-sample-data.md`.

- **New adapter boundary:** `data/omsOrders.ts` (OMS-shaped mock: events[],
  fees, breakdown, parcel, addresses, consignor/consignee, metadata incl.
  `pricing_type`/`service_fees_payor`/`transaction_scenario`) →
  `lib/omsOrderMapper.ts` (normalizer) → `data/transactions.ts`'s existing
  `Transaction` model (unchanged shape + 2 optional fields) → UI unchanged.
  `data/transactions.ts` now owns only a small `ATTRIBUTION` table (subaccount/
  batch/source per tracking number) — OMS has no concept of that.
- All 29 existing tracking numbers/recipients/subaccounts kept. Each order now
  carries a real, chronological `events` history (11 reusable scenario
  generators) instead of a synthetic single-status timeline — covers
  successful delivery, delivery after a failed-attempt retry, failed→
  for_return/out_for_return/return_in_transit, full return, cancelled-before-
  pickup, and a recovered pickup-failure. `TransactionStatus` gained
  `'cancelled'` (blast radius: 2 `byStatus` literals in
  `transactionService.ts`, 1 now-exhaustive switch in `onDemandDelivery.ts`,
  1 filter option, 1 dashboard rollup — all updated).
- Dataset-wide variation: COD vs. non-COD, buyer- vs. seller-paid service
  fees, 7 shipment types, 3 pricing types, 3 OMS services, 2 consignor
  payment-terms profiles, insured vs. uninsured.
- **Validated:** `npm run typecheck`, `npm run build`, `npm test` (70/70) all
  green. Not pushed.

## Most Recent Work — P1 payout account rules corrected: no Pending state (2026-08-19)

Second correction pass on the COD Main Account Payout Setup UX Journey (P1) —
removes an incorrectly-introduced Pending/verification state.

- **Product rule change:** a successfully added payout account is immediately
  usable. There is no Pending state, no separate verification step, no fake
  external verification, and no delayed COD activation. `JourneyContext`'s
  `codPayout: { status: 'none' | 'pending' }` slot is replaced by
  `payoutAccounts: JourneyPayoutAccount[]` (`id`, `bank`, `accountName`,
  `accountNumber`, `isDefault`) with `addPayoutAccount` / `updatePayoutAccountName`
  / `removePayoutAccount`. The array shape is deliberate: it leaves room for a
  future multi-account/default-selection UI without building one now — the
  first account added always becomes `isDefault: true` automatically.
- **Account-number validation (new):** `lib/journeyPayoutValidation.ts` —
  `isValidPayoutAccountNumber(bank, accountNumber)` requires exactly 13
  characters for this POC (bank-agnostic on purpose; `bank` stays in the
  signature so a future per-bank backend rule is a body-only change).
  `PayoutSetupDrawer` shows an inline error and disables Continue until valid,
  matching the app's existing disabled-until-valid form pattern — scoped to
  the journey drawer only; Payment Settings' real Add Bank Account dialog is
  unchanged.
- **Success state:** `PayoutSetupDrawer`'s success panel is now an account
  preview card (bank icon, bank name, masked number via the same
  `•••• •••• •••• 1234` format `payoutBankService` already uses, account
  holder name) with **Default** + **Added** badges — no Pending badge, no
  Pending copy. Values come from the submitted form state, not hardcoded.
  Closing the drawer returns to Bulk Upload without auto-completing the
  booking (unchanged from the prior correction).
- **COD eligibility (`BulkUploadSummary.handleCompleteBooking`):** for P1,
  `eligible = journey.payoutAccounts.some((a) => a.isDefault)` — no payout
  account → blocked; first account added → default → COD proceeds. No
  `pending`/`verified` transition exists to model.
- **PaymentSettings** journey-bank mapping updated to the new shape (`status`
  is always `'verified'` for journey accounts — there's no other state to
  represent); edit/remove/add handlers renamed to the new context API.
  Non-journey Payment Settings behavior is unchanged.
- **Tests:** `tests/journey-mode.test.mjs` — new `journeyPayoutValidation`
  logic suite, and the P1 DOM test rewritten to assert: invalid length blocks
  Continue with an inline error, exactly-13 succeeds, the success card shows
  bank/masked-number/account-name/Default/Added with zero "Pending" text
  anywhere, closing the drawer does NOT auto-complete the booking, and a
  second Complete Booking click now succeeds with no re-prompt. **70/70**
  full suite, typecheck + build green.

## Most Recent Work — UX Journey Showcase Mode corrections (2026-08-19)

Two stakeholder-driven corrections on top of the initial Journey Showcase Mode
build below.

- **P1 payout setup is now inline, never leaves Bulk Upload.** The COD Main
  Account Payout Setup journey's "Setup Account" CTA no longer navigates to
  `/dashboard/payment-settings`. New `components/journeys/PayoutSetupDrawer.tsx`
  is a right-side drawer reusing the same bank fields and the existing
  `OtpDialog` (Bank / Account Name / Account Number → OTP → Pending), rendered
  directly on `BulkUploadSummary`. Submission still only writes to
  `JourneyContext.codPayout` (never `payoutBankService`) and COD stays blocked
  after Pending — unchanged rule, just a different presentation.
  `PayoutSetupRequiredDialog` gained an optional `manageLabel` prop (default
  unchanged, "Open Payment Settings") so the journey can say "Set Up Payout
  Account" without affecting its other caller (`BulkSpreadsheet.tsx`). Also
  fixed a real bug this surfaced: the Bulk Upload exit-guard (unsaved-progress
  prompt) was intercepting "Exit Journey" clicks since the presenter now never
  leaves the review page mid-journey; the guard is now disarmed while the P1
  journey is active (its batch is fixture-only, nothing real to lose).
  `payment-settings`'s `AdminRoute allowJourneyOverride` capability grant is
  left in place (unused by this flow now, but still correct — a Main Account
  admin capability reasonably extends to that route too) and Payment Settings
  itself is fully unchanged outside Journey Mode.
- **Floating Journey controls regrouped bottom-right.** The active-journey
  indicator no longer sits bottom-LEFT (where it could sit under the sidebar);
  `JourneyShell` now renders a single bottom-right control group: a small
  "UX Journey: …" label pill stacked above `[Exit Journey] [UX Journeys]`.
  Both remain visible above normal content; stacking (drawer z-60, floating
  controls z-40, under normal `Dialog`s at z-50 as intended) is unchanged.
- **Tests:** `tests/journey-mode.test.mjs` updated in place (15 tests now) —
  P1's flow rewritten to assert the inline drawer and same-route assertion
  (`must stay on Bulk Upload — no navigation to Payment Settings`), a new
  standalone "Payment Settings stays Admin-only, no journey active" isolation
  check, and all `Exit`-button locators renamed to `Exit Journey`. Full suite
  **69/69**, typecheck + build green.

## Most Recent Work — UX Journey Showcase Mode (2026-08-19)

Lightweight, dashboard-scoped, **in-memory** stakeholder-review layer. Reuses
existing pages/routes with fixture ids; never persists, never mutates
AuthContext/SubAccountContext/localStorage/normal mock data. Removable by
deleting `src/app/contexts/JourneyContext.tsx`, `src/app/components/journeys/`,
`src/app/data/journeyRegistry.ts`, `src/app/data/journeyTransactionFixture.ts`,
`src/app/lib/transactionEditEligibility.ts`, `src/app/lib/journeyPricing.ts`,
`tests/journey-mode.test.mjs`, and reverting the small hooks added to
`RootLayout`, `RouteGuards`, `routes.tsx`, `PaymentSettings`,
`BulkUploadSummary`, `BulkUploader`, `TransactionDetails`.

- **Shell:** `JourneyContext` (registry + enter/exit + per-journey scenario
  state/capabilities) mounted inside `RootLayout` (dashboard-scoped only).
  `JourneyShell` renders the floating "UX Journeys" CTA, the launch drawer
  (`docs/context` — Bulk Upload → COD Booking / SDD, Transactions), and the
  active-journey indicator with Exit. Entering a journey navigates to an
  **existing route** with a fixture id (no new routes) and snapshots the
  pre-journey route for Exit to restore.
- **P1 — COD · Main Account Payout Setup:** launches
  `/dashboard/bulk-uploader/summary/journey-cod-payout` with a clean, all-COD
  fixture batch (`JOURNEY_P1_ROWS` in `BulkUploadSummary.tsx`). `AdminRoute`
  gained an opt-in `allowJourneyOverride` prop (wired ONLY on the
  `payment-settings` route) so this journey's `mainAccountAdmin` scenario
  capability can reach Payment Settings as any signed-in role, in-memory only
  — every other `AdminRoute` usage and normal-mode behavior is untouched.
  Payout bank state lives in `JourneyContext.codPayout` (None → Pending only,
  no fake Verify), never in `payoutBankService`.
- **P2 — SDD · Cutoff Handling:** launches `/dashboard/bulk-uploader`, forces
  Same-Day/pickup and a deterministic (non-clock) post-cutoff fixture time +
  next pickup date, and shows a proposed cutoff banner. Upload/Import buttons
  branch to a journey-local simulated outcome dialog instead of calling
  `addUpload`/`createUploadRecord` — Recent Uploads is never touched.
- **P3 — Transactions · Edit Delivery Details:** launches
  `/dashboard/transactions/GGX-JOURNEY-EDIT-001`, a fixture transaction
  (`data/journeyTransactionFixture.ts`) outside the real seed. Edit eligibility
  is a narrow, pure, unit-tested helper (`lib/transactionEditEligibility.ts`:
  blocked at Picked Up+ or already-paid). `EditDeliveryDrawer` edits pickup
  address/date, item name, pouch size, COD amount, and item protection, with a
  revised-amount preview (`lib/journeyPricing.ts` — flat per-size fee + the
  existing Item Protection formula; not a new pricing engine). Confirm saves
  only into `JourneyContext.editDelivery`; Exit discards it.
- **Isolation:** every journey is gated on BOTH the active journey id AND its
  own fixture id/route, so deep-linking a fixture id with no active journey
  falls through to normal behavior (default review rows / "not found") —
  covered by tests. Fixed a real z-index bug found by testing: the floating
  CTA (z-40) was briefly above normal `Dialog`s (z-50), which could have
  blocked buttons in any modal app-wide; lowered before shipping.
- **Tests:** `tests/journey-mode.test.mjs` (new, 14 tests) — eligibility/pricing/
  registry logic, shell open/launch/exit-returns-route, P1 admin-override +
  isolation, P2 simulated-outcome + no-persistence, P3 edit/preview/confirm/
  discard-on-exit + isolation. Full suite **68/68** (`npm test`), typecheck +
  production build green.

## Most Recent Work — Centralized COD payout eligibility (2026-08-16)

- Payout bank accounts are now **Main Account-owned**. `payoutBankService` is
  the shared finance/BFF seam used by Payment Settings and both Bulk Booking
  paths; it resolves a batch/subaccount scope to its Main Account payout owner.
- Only OTP-gated Payment Settings mutates payout bank details. New accounts are
  `pending` and cannot satisfy COD eligibility until the finance verification
  state becomes `verified`.
- File-upload review and in-app spreadsheet COD guards now block with a shared
  `PayoutSetupRequiredDialog`. Main Account admins in Main Account view can go
  to Payment Settings; Subaccount users see guidance to contact their Main
  Account admin. Neither flow collects payout details or auto-completes a COD
  booking after enrollment.
- Validated with `npm run typecheck` and `npm run build`; the repository's test
  script remains HeyQ-integration-only and does not cover these pages.

## Most Recent Work — Brand Guidelines page in the Design System (2026-07-30)

New top-level **Brand** section in the DS reference with a single page,
`/design-system/brand-guidelines`.

- **Assets** now ship as static files under `public/brand/` so downloads work on
  any Vercel deployment with no backend: `public/brand/logos/*` (five variants —
  `full-color`, `full-color-border`, `black`, `white`, `grayscale` — each as
  `.svg` + `.png`, renamed to kebab-case from the "GGX Logos" pack) and
  `public/brand/usage/*` (clear-space diagram + six improper-usage crops
  extracted at 300 dpi from pages 3 and 7 of the GoGo Xpress Brand Guidelines
  PDF). Reference JPGs are deliberately **not** distributed.
- **New files:** `src/design-system/data/brandAssets.ts` (asset manifest +
  provenance comment) and `src/design-system/pages/brand/BrandGuidelinesPage.tsx`
  (hero, Logos grid with per-format download buttons, Logo usage docs).
- **Wiring:** `DSNavConfig.ts` gains a `Brand` group before Foundations,
  `DSAppShell.tsx` gains the `brand-guidelines` route, `DSLayout.tsx` gains the
  `Brand` header link + active-section mapping. DS `ChangelogPage` entry added.
- Download buttons are driven off optional `svg`/`png` fields — a missing format
  disables only its own button. No ZIP, search, filtering, or modal previews.
- Validated: `npm run build` green; Playwright pass at 375/1440 in light + dark
  with 0 px horizontal overflow and no failed/4xx asset requests.

## Most Recent Work — Multi-transaction reports across Business+ + HeyQ (2026-07-17)

"Submit a Ticket" (Support Tickets) now opens the **existing Report an Issue
drawer in place** — no redirect to HeyQ / `/contact`. One ticket can link **many**
transactions. Full write-up: `docs/heyq_integration.md` → "Multiple transactions
per ticket".

- **Business+ drawer/combobox:** `components/TransactionMultiSelect.tsx` (new,
  shared) — searchable multi-select over `listAuthorizedTransactions` (account-
  scoped through OMS; searches tracking #/recipient/destination); removable chips;
  duplicate prevention; each result shows tracking · status · destination/recipient.
  `ReportIssueDrawer` reworked: `preselected` + `onSubmitted` props (was `order`);
  Transaction Details preselects the current transaction, Support Tickets starts
  empty; unlinked submission allowed; attachment flow preserved; success shows the
  ticket id, closes, refreshes the list, stays in-app.
- **Business+ service:** `submitOrderReport` takes `externalOrderIds: string[]`,
  authorizes EACH via `getAuthorizedOrder` (refuses the whole submission if any is
  out of scope), builds a `linkedTransactions` array; `apiCreateTicket` sends
  `linkedTransactions`; `CustomerTicket` + `SupportTicket` carry the collection;
  list rows show first + "+N more" and keep every number searchable.
- **HeyQ:** `Ticket`/`CustomerTicket` gain `linkedTransactions?: LinkedOrder[]`
  (+ `linkedOrdersOf` helper); `linkedOrder` mirrors the first for back-compat. OMS
  stays source of truth; snapshots minimal. Server create (`businessPlusContext.
  linkedTransactions`), customer projection, `POST /customer/tickets` route, and
  `searchCorpus`/`trackingNumbersFor` (all numbers searchable, list item
  `trackingNumbers`) updated. Agent UI: new `LinkedTransactionsPanel` (count
  heading, ≤3 compact rows tracking·status·origin→destination, "View all", per-
  transaction modal reusing `LinkedOrderPanel` — one at a time, never leaving the
  ticket; primary/originating shown first). `TicketTable` shows "+N more".
- **Tests:** Business+ **54/54** (`npm test`) — new adapter multi/unlinked/whole-
  refusal/single-ticket/response-mapping + DOM drawer-opens-without-nav, preselect,
  combobox search/multi-select/duplicate-prevention, unlinked submit. HeyQ
  **307/307** (`vitest run`) incl. new `server/businessPlusMultiTransaction.test.ts`
  (creation, back-compat, unlinked, projection, list display + all-tracking search).
  Both typecheck + build green; HeyQ lint clean; Business+ has no ESLint.
- **Not pushed/redeployed at write time** unless noted below in git.

## Most Recent Work — Ticket attachments across Business+ + HeyQ (2026-07-17)

Attachment support added end to end for the support flow. **HeyQ owns validation,
storage, and authorization** (it owns attachments); Business+ stages files with a
mirrored client policy and downloads through authorized URLs. Full write-up:
`docs/heyq_integration.md` → "Attachments".

- **Shared policy** `src/app/lib/attachmentPolicy.ts` (both repos, kept in sync):
  extension+MIME allowlist, 5-file / 10-MB caps, double-extension + MIME-mismatch
  rejection, previewable-type list; HeyQ adds byte-level encrypted-zip rejection.
- **HeyQ backend (repo `../HeyQ`):** new `server/attachments.ts` (in-memory blob
  store keyed by a safe server-generated object key + metadata in the seed store)
  and `server/multipart.ts` (dependency-free parser). Reply/create routes accept
  multipart and validate BEFORE creating anything (atomic — no orphaned message or
  record). New routes: consolidated list + identity-scoped download/preview
  (`attachment` disposition + `nosniff` by default; inline only for images/PDFs).
  `TicketAttachment` model + `MockAttachment.id`. Agent composer, ChatThread
  (download links + inline preview), `ticketService` upload helpers.
- **Business+:** `components/AttachmentInput.tsx` (shared picker), Report drawer +
  ticket reply composer upload files (multipart via `heyqCustomerApi`), messages
  render downloadable chips + inline preview, a deduped **consolidated attachments**
  card derived from the conversation, and live attachments carry their id through
  `projectRealtimeMessage` so a file attached on the other side is downloadable
  without a refresh.
- **Tests:** HeyQ `server/attachments.test.ts` (+15: creation/reply/agent uploads,
  5-file & 10-MB caps, blocked ext, MIME mismatch, double extension, encrypted zip,
  no-orphan-on-failure, authorized + cross-ticket download). Business+
  `tests/heyq-attachments.test.mjs` (+6: shared policy, multipart create/reply,
  identity-scoped URL, realtime id passthrough). HeyQ **302/302** + lint clean;
  Business+ **50/50**. Both typecheck + build green.
- **Not pushed/redeployed at write time** (see git); the live Railway HeyQ API must
  redeploy for the deployed E2E path.

## Most Recent Work — HeyQ realtime live conversations (2026-07-16)

Business+ ticket conversations now update **live** over HeyQ's realtime WebSocket
channel. HeyQ stays the system of record; Business+ is a customer subscriber to a
single authorized ticket. Contract consumed: `HeyQ/docs/realtime-conversations.md`
(commit `adfb134`). Full write-up: `docs/heyq_integration.md` → "Live conversations".

- **New seam (no new service/infra):** `services/heyqRealtimeClient.ts` (reusable
  protocol client — auth via minted token, subscribe/unsubscribe one ticket,
  reconnect w/ capped backoff + token re-mint, typing, customer-safe event
  filtering) and `hooks/useTicketConversation.ts` (dedup by event/message id,
  `createdAt` ordering, optimistic send + retry, reconnect refetch, typing throttle,
  live status/updated meta). Token/URL/projection added to `heyqCustomerApi` +
  `heyqService` (`getRealtimeToken`, `getHeyQRealtimeUrl`, `projectRealtimeMessage`,
  `apiMintRealtimeToken`); attachments metadata added to the message allowlist.
- **Endpoint:** `wss://<api-origin>/api/realtime` from the SAME `VITE_HEYQ_API_URL`
  (https→wss). Token is single-use, ticket-scoped, minted over REST per connect.
- **UI:** `SupportTicketDetail` rewritten around the hook — live incoming replies,
  optimistic/pending + failed-with-retry bubbles, "Customer Support is typing…",
  Live/Reconnecting pill, attachment chips; system messages stay centered/quiet.
  `SupportTickets` list gets focus+poll refresh, recent-activity sort, and an
  unread dot/count (client-side `lib/ticketReadState.ts`, per requester).
- **Security:** subscribes only to the bound ticket (never by ticket id alone),
  consumes only customer routes/events, drops `assignment_changed`/internal notes,
  no credentials in the URL/logs. HeyQ still owns persistence/authz/lifecycle.
- **Tests:** +10 in `tests/heyq-realtime.test.mjs` (service seam, client lifecycle/
  filtering/reconnect, and DOM: live reply, dedup, typing, optimistic reconcile).
  Business+ **44/44** (`npm test`), typecheck + production build green.
- **Deployed E2E note:** the stubbed integration drives the REAL client against the
  documented frame shapes; a true two-app Railway/Vercel E2E requires HeyQ's
  realtime build live on Railway. HeyQ was NOT changed in this task.

## Most Recent Work — HeyQ deployed integration (2026-07-15)

Support now reads/writes the **deployed HeyQ API** (Railway), not the in-process
mock. Full contract: `docs/heyq_integration.md`.

- **Seam split:** `services/heyqCustomerApi.ts` (new) is the HTTP client behind
  `services/heyqService.ts`. `listMyTickets`/`getMyTicket` → `GET /api/customer/
  tickets(/:id)`; `replyToMyTicket`/`reopenMyTicket` → `POST /api/tickets/:id/
  {messages,reopen}` then re-read the customer view. Responses map to the existing
  `CustomerTicket` by an explicit field allowlist (agent data can't leak even from
  a bad response). **`data/heyqTickets.ts` (the mock) was deleted.**
- **Config:** `VITE_HEYQ_API_URL` (API origin, default the Railway URL) is
  separate from `VITE_HEYQ_URL` (HeyQ frontend, for opening pages, default
  `heyq.vercel.app`). Both have deployed defaults; see `.env.example`.
- **Submission unchanged:** the `/contact` handoff (`startOrderHandoff` →
  `heyq.vercel.app/contact?order=<id>`) still creates the ticket server-side in
  HeyQ. OMS side (`transactionService`) unchanged — order auth, snapshot, live
  status are still local/OMS.
- **Portal deep-link removed:** HeyQ's customer surface issues no portal token, so
  the "View / Open in GGX Support" portal links now open the **in-app** ticket
  detail (the mirror) with working reply/reopen.
- **HeyQ side (repo `../HeyQ`, commit `429469d`):** agent/internal API routes are
  gated from the customer origin (403); CORS split into env-driven agent vs
  customer origin lists (`HEYQ_FRONTEND_ORIGIN` / `HEYQ_BUSINESS_PLUS_ORIGIN`;
  `ggx-corporate.vercel.app` + `localhost:18010` allowed by default).
- **Tests:** Business+ 32/32 (`npm test`, focused fetch-stubbed adapter + UI).
  HeyQ 177/177 (`npm test`, incl. new `server/http.test.ts`). Both typecheck +
  build green. Business+ has no ESLint; HeyQ lint clean.
- **NOT pushed/redeployed.** The live Railway API still runs pre-change code
  (verified: it currently blocks the Business+ origin via CORS and leaves agent
  routes open — exactly what these commits fix). Full deployed E2E needs a push so
  Railway/Vercel redeploy. New behavior was verified against a local production
  run of the HeyQ API.

## Prior Work — HeyQ support integration via mock adapter (2026-07-15)

Support ran on **HeyQ** through an in-process mock adapter (now superseded by the
deployed integration above). Full contract: `docs/heyq_integration.md`.

- **OMS equivalent reused:** `services/transactionService.ts` (its docblock already
  names OMS as the source system). Stable order id = the **tracking number**. No
  new order abstraction was created.
- **The seam:** `services/heyqService.ts` — the only Business+ ↔ HeyQ integration
  point, over a mock HeyQ backend (`data/heyqTickets.ts`). Swap its bodies for
  `fetch()` when HeyQ ships an API; callers don't change.
- **Transaction details:** the existing `Need Help?` banner now hands the order off
  to HeyQ (`/contact?order=<tracking>`); `Send a Report` → `Get Help With This
  Order`. The in-app report modal is gone (HeyQ owns ticket capture).
- **Support Tickets page:** extended in place. `Submit a Ticket` opens HeyQ with no
  order; the table/cards/search/filters read real HeyQ tickets; `View` opens the
  token-scoped HeyQ requester portal. Statuses aligned to HeyQ's six.
- **Removed:** `data/supportTickets.ts` (the old Zendesk-era local ticket store).
  Business+ now holds no ticket state of its own.
- **Boundary enforced:** internal notes, agent identity, escalation, tier and SLA
  never cross into Business+ (asserted in tests). Delivery status, ticket status
  and escalation are three independent dimensions.
- **Tests:** `tests/` — Node's built-in runner (`npm test`) driving the existing
  `playwright` dep. 31 tests: adapter contract + full cross-system lifecycle +
  responsive. **No new test framework or dependency.**
- **HeyQ:** one additive compat change (Business+ order rows appended to its mock
  catalogue) + 2 brittle assertions made seed-derived. HeyQ stays 169/169 green.
- **Note:** this repo has **no ESLint** (no config/dep/script), so no lint step ran.

## Current State - Updated 2026-06-26

- **Stage:** `/design-system` documentation site is complete. All component/pattern gaps
  addressed. No active app feature work in progress. Working tree is clean.
- **Branch:** `master`.
- **Build/typecheck status:** green (`83135fc`).
- **Push status:** pushed to both `origin` (jabranux/ggx-corporate) and `james`
  (jamesabran/ggx-corporate). Both remotes at `83135fc`.
- **Working tree note:** `.claude/settings.local.json` is local config; leave it
  alone unless explicitly asked. QA scripts/dirs are gitignored locally.

## Most Recent Product Truth

- Account Add-ons and Integrations IA are decided. Account Add-ons lives under
  Account Management; Integrations stay separate.
- In-app Spreadsheet remains a secondary path under Bulk Upload; it has no sidebar
  item and is not a separate product.
- Inventory product attachment is grid-only for bulk booking. It uses the product
  picker when Inventory is enabled and does not deduct or reserve stock.
- Storefront now has demo checkout surfaces from later sessions: direct product
  checkout, session cart, cart review, and cart checkout. Real order placement,
  cart persistence, stock deduction/reservation, and final fee/payment contracts
  remain backend-owned.
- Item Protection: the spreadsheet fee preview shows a frontend estimate
  (`max(declaredValue − 500, 0) × 1%`) as a conditional line item when any valid
  row has a declared value above ₱500. The booking confirmation dialog rolls it
  into the estimated total (not broken out separately). Authoritative Item
  Protection fee contract and location-based delivery rate computation remain
  deferred to backend/BFF integration.

- Custom Reports gating is done and the current UX flow is acceptable for now.
  Saved templates and scheduled exports remain deferred/backend-owned.
- Custom Reports now respects account context: the Subaccount column/filter only
  appears for Main Account view with Subaccounts enabled; On-Demand options and
  rows are hidden when On-Demand is not enabled for the active scope; templates
  are sanitized so unavailable columns/options cannot be reintroduced; CSV export
  matches applicable visible columns; and Subaccount filtering prefers canonical
  ID filtering.

## Most Recent Work — Design System completion (2026-06-26)

`/design-system` route is now a full living documentation site. Final state:

- **Foundations:** Colors, Design Tokens (radius scale + 21 semantic color tokens + font stack), Spacing & Layout, Typography
- **Components:** 29 shadcn/GGX-SHADCN primitives (Accordion → Tooltip)
- **GGX Components & Patterns (12 entries):** Access Denied, Address Display Card,
  Checkout Delivery Options, Delivery Status Badge, Empty State, Enablement Gate,
  Filter Bar, Location Cascade, Module Card, OTP Dialog, Payment Options, Stat Card
- **Icons page**
- **Overview** includes contributing guide (4-step how-to-add)
- Dead code (`DesignSystemPage.tsx`) removed
- Build green; both remotes at `83135fc`

**Next:** Figma alignment pass — sync new DS patterns and verify token values in GGX-SHADCN.

### Bank Logos (2026-07-10)

- **Figma architecture (permanent):** Bank Logos in GGX-SHADCN is a **single
  component set** with each bank as a `Bank=<key>` variant. A doc-page reorg
  briefly split the variants into separate entry-card components; the user
  manually restored the component set. Never split it or change its
  architecture; payout screens swap banks via one instance property.
- Web DS: new Foundations page `/design-system/foundations/bank-logos`
  (`pages/foundations/BankLogosPage.tsx` + `data/bankLogos.ts`), nav entry after
  Icons, Foundations overview card, search, per-entry SVG download.
- 38 approved SVGs exported clean from Figma into `src/assets/banks/`
  (150×150 viewBox, transparent bg, kebab-case filenames). Imported with
  `?no-inline` so every logo ships as a real downloadable file.
- Brand names verified (notable: `maribank` = MariBank, formerly SeaBank PH;
  `lulu` = LuLu Money; `chinatrust` = CTBC Bank (Philippines)).

---

## Most Recent Feature Work — Basic User Demo

- Route group `/basic` added as a standalone mobile-first demo layer (no auth
  gate, no Business+ sidebar). Entry point: `/basic`.
- `BasicLayout` — light blue app shell, GGX logo header (no "Basic" branding),
  5-tab bottom nav (Home / Rewards / Ship / Transactions / Account).
- `BasicDashboard` — GGX app-aligned: bold welcome, service tiles (2×2 large),
  horizontal Explore-more row, activity card (COD + shipment stats), recent
  orders below fold.
- `GrowingNudgeCard` — promo-banner style matching GGX app carousel: gradient
  left panel + star icon + bold text + CTA link + pagination dots.
- `HVMNudge` page — "You may qualify for special business pricing" with benefit
  list, 3-step process, Request review and Talk to Sales CTAs with demo success
  states.
- `BasicSegmentContext` — `basic | growing` demo-only state (default: `growing`
  so nudge shows on first load). Change default in context to demo `basic` state.
- No auth gate, no backend calls — all mock/static. Safe to remove the whole
  `/basic` route group without touching Business+ dashboard.

### Refinement pass (aligned to `basic_user_requirements.md`)

- **Same-Day Delivery is no longer a default Basic service.** Removed it from the
  home service tiles and from the booking-flow default. In `BasicDeliver` it is
  shown as an eligibility-gated row that routes to the Growing nudge
  (`/basic/qualify`) instead of being bookable. Matches the doc rule: SDD is an
  enabled-only capability, surfaced as a Growing → HVM nudge.
- **"Prepaid Packs" / "Sulit Bundles" standalone framing removed.** The doc treats
  packs as booking-measurement only. Home tiles now lead with the free Basic
  toolkit (Standard Delivery, Bulk Upload [Free], Sell Online, Track Order);
  Save & Earn now surfaces Vouchers, buyer Promo Codes, and a Volume-Pricing
  Growing nudge (→ `/basic/qualify`).
- **Desktop responsiveness:** `BasicLayout` now centers the app shell in a
  phone-width frame (`max-w-[480px]`) on tablet/desktop with a neutral backdrop;
  bottom nav is pinned to that frame. Mobile (375px) layout is unchanged.
- **Branding:** softened the account "GGX Basic" badge/footer to normal GGX
  branding ("Basic" plan label; "GoGo Xpress · Basic account"). Header already
  used the GoGo Xpress logo.
- Growing remains a nudge-only layer (segment context default `growing`); no new
  feature tier. Business+ `/dashboard` routes and public surfaces
  (`/track`, `/shop`, `/buy`, `/checkout`) untouched.

### Basic-native deep pages (keep sellers inside BasicLayout)

- New routes under `/basic/*`, all rendered inside `BasicLayout` (mobile-first,
  375px; phone-width frame on desktop). No auth gate, all mock/static:
  - `orders` + `orders/:id` — bookings/transaction history with quick filters,
    status timeline, COD summary, track + get-help actions.
  - `bulk` — Bulk Upload (Free) with dropzone, template download, recent batches.
  - `store` — Sell Online hub: storefront card, stats, Inventory / Promo Codes /
    Connect Shopify (Shopify folded in here — no `/dashboard/shopify` link).
  - `inventory` — product list with stock badges (stock is reference-only, not
    reserved/deducted — matches product rules).
  - `earnings` — payout summary (available / processing / collected), payout
    history, **payout bank enrollment + management dialog**. No contract billing
    or enterprise finance controls.
  - `support` — live chat / call / help topics / tickets.
  - `settings` — profile, address book, payout account, security, notification
    toggles. No enterprise/role controls.
  - `same-day` — Same-Day **sales/lead handoff** page (hero, highlights, lead
    form, "Request Same-Day access" / "Get in touch with Sales", success state).
    Same-Day is NOT bookable in Basic.
- Shared mock data in `pages/basic/basicMockData.ts` (orders list ↔ detail).
- All Basic deep CTAs (home tiles, Explore, Save & Earn, Account, bottom-nav
  "Orders") now point to `/basic/*`. Bottom nav tab renamed Transactions → Orders.
- Booking "Same-Day" option in `BasicDeliver` now routes to `/basic/same-day`
  (was `/basic/qualify`). Account screen no longer links into `/dashboard`.
- Intentional cross-over kept: `HVMNudge` ("Preview / Explore GGX Business+")
  still links to `/dashboard` — it is the dedicated upgrade/qualification context
  where showing the upgrade target is the point. Everyday Basic stays in `/basic`.

### Polish pass — fully self-contained Basic

- **No more Basic → `/dashboard` crossover.** `HVMNudge` "Explore / Preview
  Business+" links now point to a new Basic-native page `BasicBusinessPreview`
  (`/basic/business-preview`): a showcase of what Business+ offers (special
  pricing, Same-Day/on-demand, priority support, contracted billing) framed as a
  nudge/lead-capture; CTAs hand off to `/basic/qualify`. It is NOT a tier
  dashboard. Only a descriptive code comment now mentions `/dashboard`.
- **Basic booking now has a real review step.** `BasicDeliver` is controlled
  (recipient/contact/address/COD) and adds a rider-pickup vs drop-off choice;
  "Review booking" routes to `BasicBookingReview` (`/basic/deliver/review`) via
  navigation state. Review shows service type, handoff, delivery summary,
  payment/fees (estimated, frontend-only), and a Confirm CTA that routes to an
  order detail. Standard stays default; Same-Day still not bookable.
- **Store stubs are intentional.** `BasicStore` Promo Codes ("Coming soon") and
  Connect Shopify ("Express interest") now open a small in-page dialog with a
  notify/express-interest acknowledgement instead of self-routing. They never
  touch `/dashboard`.
- New page titles in `BasicLayout`: "GGX Business+", "Review Booking".

## Most Recent Feature Work — Basic booking flow redesign (2026-06-17)

Complete rewrite of the Standard Delivery booking flow to match the original compact GGX flow.

### Phase 4 — compact GGX-style flow (replaces Phase 2/3 wizard)

- `BasicDeliver` (Delivery Main Page at `/basic/deliver`) — compact glass cards over fixed
  aurora background: sender address card (tap → address book sheet), receiver address card
  (tap → receiver form), first-mile card (pickup/dropoff 2-up), Add Item Details CTA card
  (appears only after receiver is filled), schedule/estimate note. No form fields visible
  on this page; no "Step x of x".
- `BasicReceiver` — receiver address form (no step indicator); on save → returns to Delivery
  page with `receiverJustSaved: true`; if `editReturn` → returns to Review Details.
- `BasicItemDetailsDrawer` (new shared component) — bottom-drawer with slide-up animation,
  backdrop blur, close handle; contains: item name, pouch size carousel, COD toggle +
  amount, item protection (free / full). Closable without saving; reopenable from CTA card.
  Auto-opens when user returns from receiver save.
- `BasicBookingScreen` at `/basic/deliver/booking` — Review Details page (compact card-based):
  schedule card, address summary card with EDIT CTAs, inline first-mile card, item summary
  card with EDIT (opens drawer inline), receiver payable breakdown section (COD + shipping if
  receiver pays), fixed bottom bar with payment details (fee-payer toggle + payment method,
  expandable), promo code, total, and "Confirm Booking" CTA.
- `BasicLayout` — bottom nav hidden on all `/basic/deliver/*` routes; main `pb` reduced
  during booking; page title updated: "Standard Delivery" (was "Sender Details"),
  "Review Details" (was "Book Delivery").
- `basicBookingTypes.ts` — added `ItemState` interface export.

### Hard rules (permanent, from user)

- No partner couriers (Angkas, pandago, Grab). GGX is the only service. No courier selector.
- Always "Sulit Bundles" — never "Prepaid Packs" or "GOGO Packs".
- No `declaredValue` field in Basic booking. Protection is derived from COD amount only.
- No real payment integration — demo/mock behavior only.
- Keep all booking inside the Basic mobile shell and Basic routes.
- No "Step x of x" text anywhere in the booking flow.
- Bottom nav hidden during booking (`/basic/deliver/*`).
- Item Details shown only after receiver address is filled.
- Payment method options driven by fee-payer selection (sender vs receiver).
- Receiver payable summary shown only when COD is on or receiver pays shipping.

## Most Recent Feature Work — Bulk Upload field-name unification (2026-06-15)

- **Single source of truth for field labels:** `BULK_FIELD_LABELS` in
  `data/bulkTemplate.ts` is now consumed by the column mapper (`BulkColumnMapper`),
  the in-app spreadsheet grid (`BOOKING_COLUMNS` in `lib/bookingValidation`), the
  failed-orders retry table (`BulkUploadSummary`), and the download template. Same
  field → same name everywhere (Name, Mobile, City / Municipality, Declared Item
  Value, Insure full item value?, Recipient Pays Fees; Landmarks / Promo Code /
  Reference ID carry "(Optional)").
- **Consistent required/optional treatment:** removed red asterisks from the
  spreadsheet grid and failed-orders headers; optional fields are marked only by
  "(Optional)". Grid required flags follow the model, with two intentional
  exceptions: **COD Amount** is conditionally required (only when COD = Yes), and
  **Item Name** (grid `productSku`) is satisfied by attached Inventory products.
- **Item Protection Fee** is no longer a template/mappable field — it remains only
  as a derived, read-only display in the failed-orders table fee column.
- **Mapper aliases** keep older uploaded headers auto-mapping (Recipient Name,
  Mobile Number, City/Municipality, Declared Value, Item Protection, Promo code,
  Ref ID, etc.). The `MOCK_CUSTOM_HEADERS` in `BulkUploader` intentionally keep
  old/varied names to exercise aliasing.
- Build/typecheck green. Not pushed.

## Most Recent Feature Work — Saved mapping scope + Order attribution (2026-06-15)

- **Saved column-mapping templates are scope-aware (mock).**
  `lib/columnMappingTemplates` keys templates by header signature **and**
  `scopeAccountId`; `findTemplateForHeaders(headers, scopeAccountId)` prefers the
  active scope's own templates, then account-level `shared` ones. `BulkColumnMapper`
  takes `scopeAccountId` (passed from `BulkUploader` via `uploadAccount.accountId`),
  restores a matching saved mapping on load (banner + "Use auto-match instead"),
  and upserts on Confirm. Real cross-account sharing UI + backend persistence
  remain deferred.
- **Order attribution model (mock).** `OrderAttribution` on transactions
  (accountScope, sourceType, bookingMethod, connectedStore, integrationId,
  createdBy). Helpers/labels: `SOURCE_TYPE_LABEL`, `BOOKING_METHOD_LABEL`,
  `bookingMethodGroup` (both bulk methods → `bulk_upload`).
  - Transactions list: short **Source** column + **Source filter**; Subaccount
    column is ownership-only (the old "- Shopify" concatenation was removed).
  - Transaction detail: "Order Source & Attribution" card.
  - Custom Reports: selectable + exportable **Source** column.
  - Seeded GoBenta (Storefront Checkout) + Product Checkout (Single Product
    Checkout) demo rows and a created-by example.
  - Still pending: analytics breakdowns by source/booking-method, and the
    dedicated Storefront-vs-Product-checkout analytics split.
- Build/typecheck green. Not pushed.

## Most Recent Feature Work — On-Demand Delivery MVP (2026-06-15)

Premise: the order already exists before OD booking; delivery mode/quote may be
set outside the app; no full quote/estimate flow yet. On-Demand is an Account
Add-on that unlocks OD booking + OD transaction visibility.

- **Add-on gating (already in place, verified).** `on_demand` is a subaccount-
  scoped `FeatureId` in `data/featureEnablement.ts`, seeded enabled only for
  `acme-luzon`; all other scopes default off and discover it in Account Add-ons.
  Both Bulk Upload paths (`BulkUploader`, `BulkSpreadsheet`) gate the On-Demand
  service-mode button: locked copy now reads "Immediate, direct pickup &
  delivery — enable in Add-ons" and routes to `/dashboard/account-add-ons`;
  selectable + bookable when enabled.
- **Transactions list (already in place).** Single violet On-Demand service badge
  (Standard = blue, Same-Day = orange, On-Demand = violet) + Service Type filter.
- **NEW — OD progress model.** `getOnDemandProgress()` + `ON_DEMAND_STAGES` in
  `data/transactions.ts` (re-exported via `transactionService`). Courier-style
  stages: Booking confirmed → Looking for driver → Driver assigned → Picked up →
  En route → Delivered, with a mocked ETA + failed/returned exception state.
  Demo/presentation only (dispatch/ETA are backend-owned).
- **NEW — shared `OnDemandTracker` component** (`components/OnDemandTracker.tsx`):
  `OnDemandBadge`, `OnDemandMapPlaceholder` (placeholder live map, no real map
  integration), `OnDemandRoute` (pickup/drop-off), `OnDemandTimeline` (stepper).
  Reused by both the detail page and public tracking for visual consistency.
- **NEW — Transaction detail OD section** (`TransactionDetails.tsx`): shown only
  when `serviceType === 'on_demand'`. Map placeholder, pickup/delivery addresses,
  current status + ETA, progress timeline, CTAs: Track live delivery (opens
  `/track/:id`), Contact support (reuses report modal), Cancel booking (reuses
  `claimsService` cancel; enabled only for `pending`, mocked).
- **NEW — public `/track` OD state** (`TrackingPage.tsx`): OD tracking numbers
  render `OnDemandTrackingResult` (status hero, placeholder map, route cards,
  timeline, support CTA) instead of the standard result. No buyer app required.
- **NEW — seed row** `GGX-2026-90011` (pending On-Demand, Acme Luzon) so the
  early-stage progress + cancel-before-pickup CTA are demoable.
- **Intentional boundary:** booking still records to Bulk Upload history (mock);
  the Transactions list reads the static transaction seed, same as Standard/
  Same-Day. No live append-to-transactions store was added (would touch non-OD
  flows). OD is demonstrated across all surfaces via the seed.
- Build + typecheck green. Not pushed.

## Most Recent Feature Work — OD ↔ Storefront checkout + seller acceptance (2026-06-15)

Connected On-Demand to Storefront checkout and seller order acceptance, with a
clean **order-status vs delivery-status** separation (fixes the old confusing
"pending but already booked" GGX-2026-90011 seed).

- **Product-model correction.** New **Storefront Order** domain
  (`data/storefrontOrders.ts` + `services/storefrontOrdersService.ts`): buyer
  commerce order with its own status (`awaiting_acceptance` → `accepted` |
  `rejected`), separate from the delivery Transaction. A delivery is created only
  on seller acceptance (tracking assigned; OD starts "Looking for driver").
- **Granular OD delivery lifecycle** (`data/onDemandDelivery.ts`): Looking for
  driver → Driver assigned → Preparing order → Ready for rider pickup → Handed
  over to rider → Picked up → En route → Delivered (+ cancelled), each with ETA +
  rider map position. `getOnDemandProgress(stage)`, `deliveryStageFromStatus`,
  `statusFromDeliveryStage`, `nextDeliveryStage`. The old status-derived OD
  progress block was removed from `data/transactions.ts`.
- **Mock map** `components/OnDemandMap.tsx`: styled city-map background, pickup +
  drop-off pins, dotted route, rider marker that moves with the stage (searching →
  near pickup → between → at drop-off), ETA chip + status chip. Replaces the old
  plain placeholder. Reused by seller transaction detail + public tracking.
- **Buyer checkout** (`BuyerCheckout` `/buy`, `CartCheckout` `/checkout`): new
  `CheckoutDeliveryOptions` picker; On-Demand appears only when the seller scope
  has the OD add-on enabled. Placing an order creates a Storefront Order
  (`awaiting_acceptance`) and shows "Awaiting seller acceptance" + a Track link.
  Seller scope threaded via `cartStore` seller context (set in `StorefrontPreview`).
- **Seller surface** `StorefrontOrders` (`/dashboard/storefront/orders`) +
  `StorefrontOrderDetail` (`/:id`), in the Commerce sidebar group. Queue shows
  buyer orders **separate** from Transactions; detail shows buyer/order/delivery
  summary, Accept / Reject, and a demo "Advance" control for the OD lifecycle +
  the mock map.
- **Transaction detail** (`TransactionDetails`): OD section now uses `OnDemandMap`
  + stage-driven `resolveOnDemandProgress`; shows linked storefront-order context;
  header badge shows the OD stage label (no ambiguous "Pending").
- **Public tracking** (`TrackingPage`): accepts `GGX-…` or `SO-…`; pre-acceptance
  shows "Waiting for seller to accept your order"; post-acceptance shows OD
  progress + mock map.
- **Service merge:** `transactionService` synthesizes accepted-order deliveries
  into the list + by-tracking lookups (not written to the static seed).
- **Seed cleanup:** removed pending OD row GGX-2026-90011 from the transaction
  seed; reintroduced cleanly as accepted storefront order SO-2026-0002 (linked
  delivery GGX-2026-90011, "Driver assigned"), plus awaiting-acceptance order
  SO-2026-0001. Both on Acme Luzon (OD + Storefront enabled).
- Build + typecheck green. Not pushed. Docs: `storefront_rules.md` updated.

## Most Recent Feature Work — Checkout UX + Transactions IA cleanup (2026-06-15)

Polish pass on top of the OD ↔ storefront model (model unchanged).

- **Checkout layout** (`BuyerCheckout`, `CartCheckout`): desktop 65/35 grid
  (`lg:grid-cols-[1.85fr_1fr]`) — details + payment left, sticky order summary
  right; mobile stays single-column. BuyerCheckout product is now a compact header.
- **Friendly delivery labels** (`lib/checkoutEstimates.ts` + `CheckoutDeliveryOptions`):
  buyers see timing/value copy, never STD/SDD/OD. Standard is region-based
  (Metro 1–2d / Luzon 3–5d / VisMin 5–7d, else "depends on location"), Same-day
  "Within the day", On-demand "Within 40 minutes". Internal keys unchanged.
- **Payment options** (`CheckoutPaymentOptions`): COD (live) + online/prepaid
  (coming soon, disabled); delivery-fee handling (buyer pays vs seller absorbs).
  Summary shows item subtotal · delivery fee (mock estimate) · total to collect
  (COD). `feePayer` feeds the order `codTotal`.
- **Transactions IA:** removed the standalone **Storefront Orders** sidebar item +
  list route + page (`pages/StorefrontOrders.tsx` deleted). The queue is now a
  **Store Orders** tab inside Transactions (`components/StoreOrdersPanel.tsx`),
  alongside **Deliveries**. Tabs show **only when Inventory/Storefront is enabled**
  for the scope; non-commerce accounts get the normal deliveries page (no tabs).
  Tab state syncs to `?view=store-orders`; order detail back-nav + the deleted
  route redirect there. Order detail route `/dashboard/storefront/orders/:id` kept.
- **Status copy:** new buyer-order display status (`storeOrderDisplay`) —
  Awaiting seller acceptance → Accepted → Preparing → Ready for pickup → Out for
  delivery → Completed / Cancelled — keeps Store Order status visually distinct
  from delivery status and avoids ambiguous "Pending" in the orders queue.
- Build + typecheck green. Not pushed. Docs: `storefront_rules.md` updated.

## Most Recent Feature Work — Checkout + Transactions demo fixes (2026-06-15)

Targeted demo fixes (no model/IA redesign).

- **OD transaction entitlement (Transactions):** On-Demand rows now only show
  where the OD add-on is enabled for the current scope. Feature gating in
  `Transactions` uses the module-access scope (`useModuleAccessContext().scopeAccountId`,
  which maps a standard account to its synthetic scope id) — so a Main/standard
  account with OD disabled shows no OD rows, and the On-Demand service-type filter
  option is hidden. OD support is unchanged where enabled (Acme Luzon).
- **Inventory exposes Store Orders:** the commerce-tab check uses the same
  module-access scope, fixing the standard-account case where Inventory was
  enabled at `STANDARD_SCOPE_ID` but the tab checked the wrong scope. Works
  immediately + after refresh (feature state persists).
- **Metro-only SDD/OD checkout eligibility:** new `isMetroManila()` in
  `lib/checkoutEstimates`. In `BuyerCheckout` + `CartCheckout`, Same-day/On-demand
  are selectable only for Metro Manila addresses; otherwise the cards are shown
  disabled with "Available for Metro Manila deliveries only." A fallback effect
  resets the selection to Standard when the address isn't Metro, so fee/total stay
  correct. Standard is always available.
- **Checkout layout:** Delivery option moved out of the Delivery details card into
  its own card with an H2 heading matching "Payment options"; option cards stay
  `grid-cols-1 sm:grid-cols-2` (stack < 640px, side-by-side ≥ 640px). 65/35 layout
  + sticky summary preserved.
- Build + typecheck green. Not pushed.

## Current Priority

Backend integration remains the next major app stage:

1. Auth/session hydration.
2. Transactions and claims.
3. Everything else.

Swap mock service bodies for real BFF/fetch integration only as the final
production stage, after a BFF exists.

## Standing Constraints

- Keep the product bulk-first.
- Preserve Main Account/Subaccount/Manager scoping.
- Use GGX SHADCN/shared components and tokens first.
- Preserve Upload File behavior when touching spreadsheet booking.
- No new dependencies without explicit approval.
- No destructive git actions.
- Commit stable milestones; do not push unless explicitly asked.

## Documentation Risks

- The exact checkout route set and persistence details are documented from session
  notes, not re-verified against source during this Markdown-only cleanup.
- Some historical Figma notes remain archived and may not reflect current app
  state.
- Real BFF endpoint shapes are still provisional until backend contracts exist.

```
GGX_AGENT_STATUS
task: hosted-quick-login-enablement
status: COMPLETE
date: 2026-08-28
scope: GGX Corporate only — QuadX Bridge / HEYQ not modified
change: removed the Vercel deploy-tier gate (server + client) on the Login
  page's Quick Login cards; Main Account and Subaccount Quick Login are now
  available on every environment, including hosted Preview/Production
security_boundary_preserved: yes — resolveQuickLoginUser (api/_lib/demoUsers.ts)
  still only maps 2 fixed scopes to 2 fixed demo users; no arbitrary
  user/account selection; no credentials in the frontend; same signed
  ggx_session flow as manual login
files_changed: api/auth/quick-login.ts, src/app/pages/Login.tsx,
  tests/api-auth-quick-login.test.mjs, tests/login-quick-login.test.mjs,
  docs/session_state.md, docs/migration/ggx-corporate-heyq-live-ticketing.md
validated: npm run typecheck clean; focused suite 14/14 green
  (tests/api-auth-quick-login.test.mjs + tests/login-quick-login.test.mjs);
  Codex review — no implementation issues found
committed: yes
pushed: yes — origin/master
commit: HEAD of origin/master at push time (see `git log -1 origin/master`
  for the exact hash)
known_risk: hosted app can mint a signed session for either seeded demo
  account with no password; acceptable for stakeholder-testing purposes only,
  revisit before real customer data is reachable from these accounts
next_step: none required to ship this change; optional follow-up is a
  time-boxed or referer-scoped guard if the hosted app moves past
  stakeholder testing
```
