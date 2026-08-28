# Session State - GGX Corporate

> Lightweight resume/checkpoint file. Detailed June 2026 history was archived to
> `docs/archive/session_log_2026-06.md`.

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
