# Session State - GGX Corporate

> Lightweight resume/checkpoint file. Detailed June 2026 history was archived to
> `docs/archive/session_log_2026-06.md`.

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
