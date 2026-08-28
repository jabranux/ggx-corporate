# GGX Corporate — live Concern Categories integration

QuadX Bridge's live Concern Categories API (`GET /customer/categories`, HeyQ
repo commit `1b591c52af28ab92e264c4e3957313d032e9707c`, "feat: expose live
concern categories API") is now fully wired into GGX Corporate's support/
ticket-creation flow. This was a **Corporate-side-only** task per its brief;
two pre-existing Bridge-side gaps were found during the audit and are
documented (not fixed) below — see "Known Bridge-side limitations."

**2026-08-27 follow-up:** the one remaining audit finding — the live category
fetch had no explicit HTTP-level cache directive, so a browser or intermediate
HTTP cache (distinct from this app's own "no in-memory caching" code) could in
principle have served a stale category list — is fixed. See §14.

## 1. Old category flow (before this task)

The report drawer's "What's the issue?" selector was driven entirely by a
Corporate-side hardcoded catalog — not by anything QuadX Bridge returned:

- `heyqService.ts` hardcoded `HeyQConcernType` (8 fixed keys), `HEYQ_CONCERN_LABELS`,
  and `REPORT_CONCERN_OPTIONS` (the list the `<Select>` rendered).
- `ReportIssueDrawer.tsx` bound the select directly to `REPORT_CONCERN_OPTIONS`
  and defaulted to `'delivery_delay'`.
- `heyqCustomerApi.ts`'s `apiCreateTicket` mapped that Business+ concern key to
  a Bridge concern-type string via a hardcoded `CONCERN_TO_HEYQ` table and sent
  only `concernType` — **`categoryId` was never sent at all**, even though
  Bridge's create-ticket contract already accepted it.
- Nothing in Corporate ever called `GET /customer/categories` — the endpoint
  didn't exist in Corporate's proxy layer.

This is exactly the "second production category catalog" the task's brief
warned against: a fixed, Corporate-only taxonomy with no connection to what
Bridge (and its CategoriesAdmin UI) actually considers valid.

## 2. Final architecture

```
Browser (ReportIssueDrawer)
   │  GET  /api/support/categories
   │  POST /api/support/tickets  { categoryId, ... }
   ▼
Corporate BFF (api/support/**)          — server-only QUADX_BRIDGE_API_KEY
   │  GET  /customer/categories
   │  POST /customer/tickets
   ▼
QuadX Bridge  →  Supabase (public.categories / category_subcategories / tickets)
```

- The browser never calls Bridge directly (unchanged pattern — same proxy
  architecture as tickets/messages, see `api/_lib/bridge.ts`).
- Categories are fetched **fresh on every call, no caching anywhere in
  Corporate** — matching Bridge's own "no caching anywhere in the path"
  contract (`quadx-bridge-concern-categories-api.md` §5 in the HeyQ repo).
- The canonical identity is Bridge's `id` field (e.g. `cat-general`). Corporate
  never invents, substitutes, or falls back to a local id.

## 3. Corporate endpoint added

**`GET /api/support/categories`** (new — `api/support/categories.ts`)

- Requires a verified Corporate session (`requireSessionIdentity`), consistent
  with every other `/api/support/*` route — an unauthenticated caller gets
  nothing from this app's API surface. The resolved identity itself is unused
  for this call: Bridge's categories endpoint has no per-requester identity
  check (categories are product-level, not account-scoped).
- Relays Bridge's `GET /customer/categories` response unchanged (status + body).

**`POST /api/support/tickets`** (existing route, extended —
`api/support/tickets/index.ts`)

- Now requires a `categoryId` in the request body. Missing → `400` before any
  Bridge call.
- **Re-verifies the id against a FRESH `GET /customer/categories` call**
  (`verifyLiveCategoryId`, new helper in `api/_lib/bridge.ts`) before creating
  anything:
  - id not found in the live list → `400`, ticket is **not** created.
  - the verification fetch itself fails/errors → `502`, fail closed, ticket is
    **not** created.
  - id found → the create call proceeds, forwarding the exact `categoryId`
    (never a browser-supplied label, never substituted).
- This server-side re-check is what actually satisfies "invalid/stale
  categories cannot silently become valid writes" — see §9 for why it's
  necessary given a real Bridge-side gap.

## 4. Bridge endpoint consumed

`GET /customer/categories` (HeyQ repo, `docs/migration/
quadx-bridge-concern-categories-api.md`), authenticated the same way as every
other Bridge route (`X-Corporate-Internal-Key`). Response shape consumed
verbatim:

```json
[{ "id": "cat-general", "slug": "general", "name": "General inquiry",
   "description": "...", "requiresTracking": true, "requiresOrderRef": true,
   "subcategories": [{ "id": "sub-gen-info", "name": "General information" }] }]
```

`POST /customer/tickets` (existing route) now additionally receives
`categoryId` in the create payload (previously never sent).

## 5. Canonical category field

Bridge's `id` (e.g. `cat-general`, `cat-delivery`) is the ONLY value Corporate
treats as the category's identity, end to end:

- `ConcernCategory.id` (new type, `heyqCustomerApi.ts`) — what the selector
  renders and what gets submitted.
- `OrderReportInput.categoryId` / `CreateCustomerTicketInput.categoryId` — the
  create-ticket payload field, sent to Bridge unchanged.
- `api/support/tickets/index.ts`'s server-side re-verification checks this
  exact field against Bridge's live list.

Subcategories (`ConcernCategory.subcategories`) are fetched and typed but
**not** exposed in the UI or sent on create — Bridge's own
`create_customer_ticket_bridge` RPC has no subcategory parameter today, so
there is nothing for a selected subcategory to do yet. Left as a documented,
inert field for a future pass rather than built out speculatively.

`requiresTracking` / `requiresOrderRef` are likewise fetched and typed but not
yet enforced in the UI (e.g. requiring a linked transaction before allowing a
category that needs one) — out of scope for "the smallest complete
implementation that proves the end-to-end flow"; flagged as a natural next
step, not implemented here.

## 6. Ticket-create flow (`ReportIssueDrawer.tsx`)

1. On open: resets the form and calls `listConcernCategories()` fresh.
2. **Loading**: category control shows a disabled, spinner-labeled placeholder;
   Submit is disabled.
3. **Ready**: a live `<Select>` of Bridge's active categories, defaulted to the
   first entry; user may change it freely.
4. **Empty** (zero eligible categories returned): a distinct message ("No
   support categories are available right now") — never fabricates one
   locally, Submit stays disabled.
5. **Error** (fetch failed): a distinct message with a "Try again" control that
   re-runs the fetch; Submit stays disabled. Subject/Details/linked
   transactions the user already typed are untouched by any of this.
6. On Submit: **re-fetches categories fresh** and confirms the selected id is
   still present before sending anything. If it isn't (deactivated/removed
   while the drawer was open), the id is cleared, an inline "Your selected
   category is no longer available — please choose again" message appears,
   and the rest of the form (subject/description/linked transactions) is
   preserved untouched — the user reselects and resubmits without retyping
   anything.
7. Only then does `submitOrderReport` → `apiCreateTicket` send the verified
   `categoryId` to the Corporate BFF, which re-verifies it AGAIN server-side
   (§3) before ever calling Bridge's create endpoint — defense in depth against
   a browser that skipped/bypassed the client-side check.

## 7. Obsolete runtime sources retired

Removed from `heyqService.ts` (were the sole production source of selectable
categories, now fully replaced by live data):

- `HeyQConcernType`'s use as a *selection* type, `HEYQ_CONCERN_LABELS`,
  `REPORT_CONCERN_OPTIONS`.
- `heyqCustomerApi.ts`'s `CONCERN_TO_HEYQ` (Business+ concern → Bridge concern
  map, only ever used to build the old create payload).

**Kept, deliberately, as a narrow read-side/wire shim (not a second catalog):**

- `HeyQConcernType` type and `CONCERN_FROM_HEYQ` map — these describe the
  legacy `concernType` field Bridge still returns on a ticket **read**
  (`CustomerTicket.concernType`), unrelated to category selection. Not used by
  any visible UI (the "Issue Type" column reads `issueType`, Bridge's own
  verbatim label) — kept only because it's a real field Bridge's API still
  returns, not something Corporate invented.
- `CATEGORY_ID_TO_CONCERN_TYPE` (new, `heyqCustomerApi.ts`) — a small,
  one-directional, best-effort map from a selected `categoryId` to a legacy
  Bridge concern-type string, sent alongside `categoryId` purely so Bridge's
  own `issueType` label (computed from `concern_type`, not `category_id` — see
  §9) stays meaningful on read. `categoryId` remains the sole
  write-authoritative value; this map never influences it, and a category with
  no obvious legacy equivalent (e.g. `cat-technical`, `cat-returns`,
  `cat-other`) is sent with **no** `concernType` at all rather than a guessed
  one — Bridge applies its own generic label in that case.

## 8. Files changed

**GGX Corporate (this repo):**

- `api/support/categories.ts` — new BFF route.
- `api/support/tickets/index.ts` — server-side `categoryId` requirement +
  live re-verification before create.
- `api/_lib/bridge.ts` — new `verifyLiveCategoryId` helper.
- `src/app/services/heyqCustomerApi.ts` — `ConcernCategory`/`ConcernSubcategory`
  types, `apiListConcernCategories`, `CreateCustomerTicketInput.categoryId`,
  `CATEGORY_ID_TO_CONCERN_TYPE`; removed `CONCERN_TO_HEYQ`.
- `src/app/services/heyqService.ts` — `listConcernCategories`,
  `OrderReportInput.categoryId`; removed `HEYQ_CONCERN_LABELS`,
  `REPORT_CONCERN_OPTIONS`.
- `src/app/services/ticketsService.ts` — re-exports updated.
- `src/app/components/ReportIssueDrawer.tsx` — live category selector with
  loading/ready/empty/error states and submit-time re-verification.
- `tests/helpers.mjs` — `/api/support/categories` stub + `CONCERN_CATEGORIES_FIXTURE`.
- `tests/heyq-adapter.test.mjs` — create-flow tests updated to `categoryId`;
  new `live Concern Categories` describe block.
- `tests/heyq-lifecycle.test.mjs` — DOM flows now wait for the live category
  selector before submitting.
- `docs/migration/ggx-corporate-live-concern-categories.md` — this file.

**HeyQ repo:** none. No Bridge-side code was changed (see §9 — real gaps were
found but are documented, not patched, per this task's Corporate-side scope).

## 9. Known Bridge-side limitations (discovered, not fixed — out of scope)

Two real gaps in Bridge's own contract were found while wiring this up. Both
are worth a follow-up on the HeyQ side; neither blocks Corporate's own
correctness because Corporate compensates for them itself (§3, §7):

1. **`create_customer_ticket_bridge` doesn't validate `categoryId` against the
   canonical table.** `server/supabaseBridge.ts`'s
   `createCustomerTicketInSupabase` validates the incoming `categoryId` against
   the **static** `ticketCategories` array (`src/app/data/catalog.ts`), not the
   live `public.categories` table `GET /customer/categories` actually reads.
   An id that's valid in the live table but absent from the static seed array
   (e.g. a category a platform_admin added later via CategoriesAdmin) would be
   **silently substituted** with `CATEGORY_BY_CONCERN[concernType]` rather than
   rejected — exactly the failure mode this task's brief prohibits. Today this
   is dormant (the live table was seeded as an exact clone of the static
   array), but it's a real latent gap. **Corporate's mitigation**: the BFF's
   own `verifyLiveCategoryId` (§3) re-checks against the *live* table itself
   before ever calling Bridge's create endpoint, so an invalid id never reaches
   Bridge's under-validated path from Corporate.
2. **The customer ticket READ projection doesn't expose `categoryId` at all.**
   `CustomerTicket` (`src/app/models/ticket.ts`) carries `concernType` (legacy)
   and `issueType` (a label derived from `concernType`, not from
   `category_id`) — there is no way for a connecting product to read back the
   canonical category a ticket was actually filed under. This is why §7's
   `CATEGORY_ID_TO_CONCERN_TYPE` shim exists: without it, every ticket created
   through the new live-category flow would display the same generic
   "General inquiry" `issueType` regardless of the real category chosen,
   because Bridge's own label logic never looks at `category_id`.

Recommended follow-up on the HeyQ side: validate `p_category_id` in
`create_customer_ticket_bridge` against `public.categories` (mirroring how
`save_concern_category` already validates `p_default_team_id`), and add
`categoryId` to the customer ticket read projection so `issueType` can be
computed from the real persisted category rather than the legacy field.

## 10. Tests and results

- `npm run typecheck` — clean.
- `npm run build` — clean; `dist/` scanned for `QUADX_BRIDGE_API_KEY` /
  `X-Corporate-Internal-Key` — no matches (secret confirmed server-only).
- `npm test` — **79/79** passing (up from 71 before this task): existing
  suites untouched in outcome, plus 2 new create-flow assertions and 6 new
  `listConcernCategories` tests in `tests/heyq-adapter.test.mjs`, plus the
  `tests/heyq-lifecycle.test.mjs` DOM flows (drawer create end-to-end,
  transaction-linked and unlinked) updated to wait for the live selector and
  still passing unchanged otherwise.
- **Server-side BFF smoke test** (throwaway script, not committed — esbuild-
  bundled `api/support/categories.ts` + `api/support/tickets/index.ts` run
  directly against a real, local, in-process fake Bridge HTTP server): 21/21
  checks passed —
  - unauthenticated categories request → `401`, zero Bridge calls;
  - authenticated request relays the live list unchanged; the Bridge key
    never appears in the response sent to the browser;
  - Bridge network-unreachable → `502` (checked in an isolated child process,
    since `getBridgeConfig()` correctly caches the base URL for the process
    lifetime — a real deployment's env vars are static, so this is expected
    behavior, not a bug worked around);
  - a valid, live `categoryId` create → exactly 2 Bridge calls (verify, then
    create), the canonical id reaches Bridge unchanged, and server-resolved
    identity overrides spoofed `demoAccountId`/`externalUserId`/
    `externalOrgId` fields in the same request;
  - an unknown `categoryId` → `400`, zero create calls;
  - a missing `categoryId` → `400`, zero Bridge calls at all;
  - Bridge erroring during verification → `502`, zero create calls (fail
    closed, not fallback);
  - zero eligible categories → `200` with `[]`, a distinct outcome from a
    fetch failure.

## 11. Live round-trip result

**Not run against a real deployed Bridge** — this environment has no
`QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY` configured (the same recurring
constraint recorded across this project's entire HeyQ integration history in
`docs/migration/ggx-corporate-heyq-live-ticketing.md`, most recently §19–20).

What WAS verified in a real (non-mocked) browser against the actual running
app (`npm run dev`, plain Vite — no Vercel Functions runtime available
locally either):

- Opened Support Tickets → Submit a Ticket with a real signed-in session.
- The category selector correctly rendered its **error** state ("Couldn't
  load support categories" + "Try again") against the real, unreachable
  `/api/support/categories` endpoint (expected: no Vercel Functions runtime
  under plain `vite`, matching the same limitation every prior HeyQ-integration
  session in this project hit for `/api/auth/login` and `/api/support/*`).
  Network tab confirmed the request was actually attempted.
  "Try again" correctly re-attempted the fetch.
  Typed Subject/Details were preserved through the failed load/retry.
- Clicking "Submit report" with the category still unavailable correctly did
  **nothing** — no ticket appeared, no navigation, no success state. This
  directly proves the "invalid/failure states block submission" requirement
  against the REAL button/state wiring, not just a test mock.

Once a real `QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY` are available (see
Deployment below), the full round trip (fetch live categories → select one →
create → retrieve → confirm persisted category → submit an invalid category
and confirm safe rejection) should be run for real; the server-side smoke
test above already proves the BFF logic that round trip depends on.

## 12. Deployment requirements

- **GGX Corporate/Vercel redeploy required** — new route
  (`api/support/categories.ts`) and changed route
  (`api/support/tickets/index.ts`).
- **No new database.**
- **No new Bridge secret** — reuses the existing `QUADX_BRIDGE_URL` /
  `QUADX_BRIDGE_API_KEY`.
- **No Bridge redeploy required** for this task's own scope — the categories
  API it consumes (commit `1b591c52af28ab92e264c4e3957313d032e9707c`) is
  already committed in the HeyQ repo; whether it's actually deployed to the
  live Bridge origin Corporate's env vars point at is unverified in this
  environment (same unresolved question as the rest of this project's Bridge
  integration — see `docs/migration/ggx-corporate-heyq-live-ticketing.md` §15–16).
- **No migration** — no Corporate-side schema exists or changed.
- Not deployed as part of this task, per instruction ("do not deploy yet").

## 13. Blockers

None blocking this task's own completion. Two Bridge-side gaps are
**documented, not fixed** (§9) — Corporate already compensates for both from
its own side. The live round-trip (§11) remains unverified only because no
reachable Bridge URL/key exists in this environment, consistent with every
prior session's blocker on this same project.

## 14. Follow-up audit fix (2026-08-27) — explicit no-store on the live fetch

**Finding:** the live category fetch relied only on this app's own code never
caching a result — it never told the HTTP layer itself (the browser's fetch
cache, or any intermediate cache between the browser and Corporate) not to
cache the response. A browser could in principle have served a previously-
cached `200` for `GET /api/support/categories` without making a new request at
all, which would silently defeat the "always fetch fresh" guarantee §2/§6
describe, independent of any application-level logic.

**Fix — client side** (`src/app/services/heyqCustomerApi.ts`):
`apiListConcernCategories` now passes `cache: 'no-store'` on its `fetch` call.
The shared `getJson` helper (also used by ticket list/detail reads) gained an
optional `cache` parameter that only this call uses — every other caller is
passed unchanged, so ticket read behavior is untouched.

**Fix — server side** (`api/support/categories.ts`): the handler now sets
`Cache-Control: no-store` unconditionally, as the very first line of the
handler — before the method check, the session check, or the Bridge call —
so every response this route can produce (`200` relay, `401` unauthenticated,
`405` wrong method, `500`/`502` on failure) carries it. `relay()` (shared with
every other `/api/support/*` route) was left untouched — it only ever sets
`Content-Type`, so it doesn't clobber this header; no shared/unrelated proxy
logic was changed, and the ticket-creation `categoryId` re-verification added
previously (§3) is unmodified.

**Regression tests added:**

- `tests/heyq-adapter.test.mjs` — the `withStub` harness now also captures
  the `cache` option passed to `window.fetch`; a new test in the "live Concern
  Categories" describe block asserts `listConcernCategories()`'s single
  `/api/support/categories` request carries `cache: 'no-store'`.
- `tests/api-support-categories.test.mjs` (new, committed) — bundles
  `api/support/categories.ts` and `api/_lib/session.ts` with esbuild (now an
  explicit `devDependency`, previously only a transitive one via Vite) and
  calls the real handler against a local fake Bridge HTTP server. Asserts
  `Cache-Control: no-store` is present on both a successful `200` response and
  an unauthenticated `401` response (proving it's set unconditionally, not
  only on the success path). Added to the `test` npm script.

**Validation:**

- Focused: `node --test tests/api-support-categories.test.mjs` — **2/2**
  passing. `node --test tests/heyq-adapter.test.mjs` — **39/39** passing
  (including the new `cache: 'no-store'` assertion).
- Full suite: `npm test` — **82/82** passing (up from 79; +1 client-side +
  2 server-side regression tests for this fix).
- `npm run typecheck` — clean.
- `npm run build` — clean; `dist/` re-scanned for `QUADX_BRIDGE_API_KEY` /
  `X-Corporate-Internal-Key` — no matches.
- No lint step: this repo has no ESLint config/dependency/script (unchanged
  from before this task).
- Not deployed; not re-run against a live Bridge — same environment
  constraint as §11/§13 (no `QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY`
  available here). This fix is HTTP-header/fetch-option-level only and does
  not change what data flows through the existing, already-validated
  request/response path.

**Files changed this pass:** `src/app/services/heyqCustomerApi.ts`,
`api/support/categories.ts`, `tests/heyq-adapter.test.mjs`,
`tests/api-support-categories.test.mjs` (new), `package.json` (new `esbuild`
devDependency + `test` script entry), `package-lock.json`,
`docs/migration/ggx-corporate-live-concern-categories.md` (this file).

## 15. Hierarchical Concern Category Picker (2026-08-29)

Replaced the flat `<Select>` category dropdown in `ReportIssueDrawer` with a hierarchical picker component (`ConcernCategoryPicker.tsx`) that renders parent categories and their subcategories.

- **Component**: `src/app/components/ui/ConcernCategoryPicker.tsx`
  - **Desktop**: Renders an integrated 2-column layout (parent categories on the left, subcategories of the hovered/selected category on the right) within the popover box, avoiding horizontal scrollbars or backdrop overlay clipping.
  - **Mobile (< 640px)**: Inline drill-in view with a top `< Back to categories` navigation control.
  - **Selection Label**: Formatted as `"Parent Category > Subcategory"` when a subcategory is selected, or `"Category Name"` when a top-level category without subcategories is selected.
  - **Accessibility**: Full keyboard / focus management, `role="listbox"` & `role="option"`, `aria-expanded` and `aria-haspopup`, and Escape key to close.
- **BFF / Adapter Updates**:
  - `api/_lib/bridge.ts` (`verifyLiveCategoryId`): Extended live category validation to check subcategory IDs (`c.subcategories.some(s => s.id === categoryId)`) alongside parent IDs.
  - `src/app/services/heyqCustomerApi.ts`: Updated `getConcernTypeHint` to safely look up `CATEGORY_ID_TO_CONCERN_TYPE` without throwing on missing/empty category IDs.
  - `src/app/components/ReportIssueDrawer.tsx`: Replaced `<Select>` with `ConcernCategoryPicker`. Updated category presence checks (`isCategoryOrSubcategoryPresent`) and default selection (`getInitialCategoryId`).
- **Tests**:
  - `tests/hierarchical-category-picker.test.mjs` (new): 3 focused end-to-end tests for desktop flyout, subcategory selection, canonical ID submission, formatted hierarchy label, and mobile drill-in / back navigation.
  - `tests/heyq-adapter.test.mjs`: Added subcategory canonical ID creation assertion.
  - `tests/helpers.mjs`: Updated category stub helper to look up subcategories as well.
- **Validation**:
  - `npm run typecheck`: clean.
  - `npm run build`: clean.
  - `npm test`: **169/169** passing across 52 test suites.
  - Visual browser verification via Playwright screenshot script: verified desktop flyout and mobile drill-in rendering.

