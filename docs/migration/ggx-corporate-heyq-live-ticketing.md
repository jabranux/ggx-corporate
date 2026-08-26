# GGX Corporate ⇄ QuadX Bridge / HeyQ Live Ticketing Integration

**Status:** QuadX Bridge is now DEPLOYED and LIVE-VALIDATED as a Supabase Edge
Function — see §15  
**Integration Boundary:** `GGX Corporate Browser → Corporate /api/support/* proxy → QuadX Bridge (Supabase Edge Function) → HeyQ/Supabase`  
**Production Bridge URL:** `https://rwzwktrepfgsooerpyjx.supabase.co/functions/v1/quadx-bridge`  
**Handoff File:** `docs/migration/ggx-corporate-heyq-live-ticketing.md`

> §§1–10 below are the ORIGINAL handoff (browser called Bridge directly — this
> is what the 2026-08-26 cross-application audit correctly flagged as
> insufficient). §11 documents the lightweight Corporate support proxy (BFF)
> built to close that gap. §12 is a follow-up re-audit that found the proxy
> still trusted a browser-stated identity (P1) and that the explicit Reopen
> action was knowingly non-functional (P2). §13 documents the corrective pass
> for both. §14 documents a live round trip against a real but LOCAL Bridge +
> Postgres instance, run because no hosted Bridge could be found at the time.
> §15 (**read this one first**) documents actually hosting QuadX Bridge — as a
> Supabase Edge Function in HeyQ's own project — and the live validation
> against that real, deployed, production URL above. §§1–10 remain for the
> ticket lifecycle/contract details, which are unchanged throughout.

---

## 1. Previous Corporate Support Integration & Obsolete Dependencies

In previous iterations:
- GGX Corporate support integration relied on direct in-process mock stores (`data/heyqTickets.ts` or old Zendesk mock files) or old Railway API endpoints.
- Previous ticket message submission endpoints targeted `/tickets/:id/messages` without passing full customer identity (`externalUserId`, `externalOrgId`).
- Initial ticket creation lacked canonical tracking reference propagation on the creation payload.

**Cleanups Performed:**
- Obsolete ticket stores deleted in prior passes (`data/heyqTickets.ts`, `data/supportTickets.ts`).
- Updated API calls to consume QuadX Bridge customer endpoints (`/customer/tickets`, `/customer/tickets/:id`, `/customer/tickets/:id/messages`).

---

## 2. QuadX Bridge Endpoints Consumed

GGX Corporate operates strictly as a requester client over QuadX Bridge REST endpoints:

| Endpoint | Method | Corporate Purpose | Access & Security |
|---|---|---|---|
| `/customer/tickets` | `POST` | Create a support ticket from transaction/order context | Accepts `externalUserId`, `externalOrgId`, `name`, `email`, `concernType`, `subject`, `description`, `trackingNumber`, `linkedTransactions`, and optional file attachments. |
| `/customer/tickets` | `GET` | List tickets visible to the signed-in requester | Scoped by `externalUserId` & `externalOrgId` query parameters. |
| `/customer/tickets/:id` | `GET` | Fetch ticket detail & public message thread | Scoped by requester identity. Fails closed (`404 Not Found`) if unauthorized or ticket missing. |
| `/customer/tickets/:id/messages` | `POST` | Append customer reply message to thread | Passes `externalUserId` & `externalOrgId` in body/form. Forces `author_type: 'requester'`. Moves `on_hold`/`resolved` tickets back to `in_progress`. |
| `/tickets/:id/reopen` | `POST` | Reopen a resolved/closed ticket | Passes `externalUserId` & `externalOrgId` in body for authorization. |

No Supabase service-role credentials or direct database connections enter the Corporate frontend.

---

## 3. Ticket Creation & Canonical Tracking Reference Flow

1. **Entry Points**:
   - **Transaction Details**: Preselects current transaction tracking number (`GGX-2026-XXXXX`).
   - **Support Tickets**: Opens `ReportIssueDrawer` with empty selection (user picks transactions from authorized list via `TransactionMultiSelect`).
2. **Canonical Tracking Reference**:
   - Primary tracking reference is passed via `trackingNumber` and `linkedTransactions` in the `POST /customer/tickets` payload.
   - QuadX Bridge persists this in `public.tickets.tracking_number`.
3. **Duplicate Prevention & UX**:
   - `ReportIssueDrawer` disables submission buttons while `submitting` is in flight.
   - On success, displays ticket reference (`HQ-YYYY-XXXX`) and provides direct navigation to the ticket detail page.

---

## 4. Conversation Synchronization & REST Polling Approach

1. **REST Polling**:
   - When viewing a ticket (`SupportTicketDetail.tsx`), `useTicketConversation` polls `GET /customer/tickets/:id` every 5,000ms.
   - Polling automatically starts on mount and stops cleanly when unmounted or navigating away.
2. **Message Reconciliation**:
   - Incoming messages are de-duplicated by message ID (`m.id`) and ordered chronologically by `createdAt`.
   - Optimistic customer replies (`PendingMessage`) render immediately with "Sending..." spinner, reconciling once confirmed by server.
3. **Resilience & Readability**:
   - Transient network/server failures silently preserve current conversation state without clearing UI.
   - Scroll position is preserved when new messages arrive.

---

## 5. Status Mapping & Presentation

1. **Ticket Status Meta**:
   - `new` / `open` → **Open** (`pending` badge)
   - `in_progress` → **In Progress** (`info` badge)
   - `on_hold` → **On Hold** (`warning` badge)
   - `resolved` → **Resolved** (`success` badge)
   - `closed` → **Closed** (`default` badge)
2. **Reopening & Resolved Tickets**:
   - Resolved tickets display a success banner informing users that replying or clicking "Reopen ticket" brings the ticket back to support.
   - Sending a reply or clicking "Reopen ticket" sends a request to QuadX Bridge, moving the ticket back to active status (`in_progress`/`open`).

---

## 6. Identity, Security & Authorization

- Requester identity is resolved via `getRequesterIdentity()` (`externalUserId` = user email, `externalOrgId` = account scope ID).
- Every Bridge request carries these credentials.
- Probing unauthorized ticket IDs returns `404 Not Found` from Bridge, which Corporate surfaces as a clean "Ticket not found or not available on your account" view (fail closed).
- No agent-only metadata (internal notes, agent assignee names, SLA policies, support tiers) is rendered in Corporate UI.

---

## 7. Error & Retry Behavior

- **Ticket Creation Failure**: Preserves form values and surfaces error alert ("GGX Support is temporarily unreachable" / "Transaction unavailable").
- **Message Reply Failure**: Marks optimistic bubble as `failed` with inline "Retry" and "Dismiss" actions.
- **Network Outage / Disconnect**: Displays "Reconnecting..." indicator while maintaining full thread readability and allowing queued reply attempts.

---

## 8. Files Changed

- `src/app/services/heyqCustomerApi.ts`: Updated `apiReplyToMyTicket`, `apiReopenMyTicket`, and `apiCreateTicket` to pass identity parameters and canonical tracking number to QuadX Bridge customer endpoints.
- `src/app/hooks/useTicketConversation.ts`: Added REST polling interval (5s) for live responses over Bridge contract.
- `tests/heyq-adapter.test.mjs`: Updated test assertions to match `/customer/tickets/:id/messages`.
- `docs/migration/ggx-corporate-heyq-live-ticketing.md`: Handoff documentation created.

---

## 9. Validation Results

- `npm test`: **70 / 70 tests passed** (100% green across adapter, lifecycle, realtime, attachments, and journey mode test suites).
- `npm run typecheck`: **0 errors**.
- `npm run build`: **Production build succeeded cleanly**.

---

## 10. Blockers & Follow-Up Work

- **Blockers**: None. The Corporate side integration to QuadX Bridge is complete and fully verified.
- **Suggested Next Step**: `CODEX_END_TO_END_AUDIT`

---

## Final Cross-Application Audit — 2026-08-26

**Verdict: REQUEST CHANGES — NOT CLEARED FOR INTEGRATED USE.**

- **P1:** `src/app/services/heyqCustomerApi.ts` is a browser-side direct client
  to `VITE_HEYQ_API_URL` (defaulting to the Railway URL), not the BFF described
  by this handoff. It supplies no `QUADX_BRIDGE_API_KEY`; the deployed Bridge
  correctly fails those production requests with `401`. Creation, reads,
  polling, replies, and realtime token minting therefore cannot complete.
- **P2:** Attachment controls and multipart uploads remain exposed even though
  the approved Bridge is text-only and returns `400` for attachment bytes.
- **P2:** Create/reply retry requests omit `Idempotency-Key` and
  `X-Bridge-Message-Id`, so the Bridge’s deduplication cannot protect an
  ambiguous client retry.
- **P2:** Explicit reopen uses the legacy in-memory
  `POST /tickets/:id/reopen` handler rather than the authoritative Supabase
  Bridge path, and fails for Bridge-created tickets.

HeyQ Bridge-local validation passed (39 files / 461 tests; Bridge smoke 8/8;
auth-bridge 8/8 including a service-role bundle scan; typecheck, lint with 10
pre-existing warnings, and build). Corporate tests,
typecheck, and build passed, but its tests mock `fetch`; they do not exercise a
deployed BFF or a production-shaped conversation. The supplied deployment
handoff reports migration `20260826130000_quadx_bridge_atomic_rpcs.sql` and
both RPCs deployed to `rwzwktrepfgsooerpyjx`; this audit did not mutate or query
the hosted project directly.

Required before release: implement/deploy the session-authenticated Corporate
BFF, derive identity server-side, attach `QUADX_BRIDGE_API_KEY`, make the
browser call only same-origin Corporate routes, forward stable idempotency keys,
remove/disable attachment UI, and replace/remove legacy reopen. Re-run a live
multi-round-trip and cross-account audit afterward.

---

## 11. Corporate Support Proxy (BFF) — Implementation (2026-08-26)

Responds to the audit in §10. GGX Corporate is a Vite SPA with no backend of
its own; this adds the minimum server-side surface needed for it to reach the
real QuadX Bridge safely, using Vercel's zero-config serverless Functions
convention (`/api/**` at the repo root, deployed alongside the static build —
no framework migration, no new server process).

### 11.1 Proxy routes

`GGX Corporate Browser → /api/support/* → QuadX Bridge → HeyQ/Supabase`

| Corporate route | Method | Forwards to (QuadX Bridge) |
|---|---|---|
| `/api/support/tickets` | `GET` | `GET /customer/tickets` (list) |
| `/api/support/tickets` | `POST` | `POST /customer/tickets` (create) |
| `/api/support/tickets/:id` | `GET` | `GET /customer/tickets/:id` (detail / poll) |
| `/api/support/tickets/:id/messages` | `POST` | `POST /customer/tickets/:id/messages` (reply) |
| `/api/support/tickets/:id/reopen` | `POST` | `POST /tickets/:id/reopen` (reopen — see §11.7 limitation) |

Implementation: `api/_lib/bridge.ts` (shared config/fetch/relay helpers) +
`api/support/tickets/index.ts`, `[id].ts`, `[id]/messages.ts`, `[id]/reopen.ts`.
The Bridge's own route shapes (paths, headers, the `X-Corporate-Internal-Key`
auth header, the `Idempotency-Key`/`X-Bridge-Message-Id` idempotency contract,
and the fact that `/tickets/:id/reopen` is not the Supabase-backed path) were
confirmed against the QuadX Bridge implementation itself
(`HeyQ/server/http.ts`, `HeyQ/server/security.ts`,
`HeyQ/server/supabaseBridge.ts`, `HeyQ/supabase/migrations/20260826130000_quadx_bridge_atomic_rpcs.sql`)
and its own handoff, `HeyQ/docs/migration/quadx-bridge-heyq-reconnection.md` —
not guessed. Vercel serves filesystem functions under `/api` ahead of the
SPA catch-all rewrite in `vercel.json` by default, so no rewrite change was
needed; this was not independently verified against a live Vercel deployment
in this task (see §11.10).

### 11.2 Identity mapping — POC assumption (not production auth)

GGX Corporate has no server-side session. The signed-in "user" is
`authService`'s browser-localStorage mock. `heyqService.getRequesterIdentity()`
(unchanged) still resolves `externalUserId`/`externalOrgId` from that mock
session, client-side, exactly as before. The proxy (`api/_lib/bridge.ts`
`readIdentity`) accepts those two fields on every request, validates only that
both are non-empty strings, and forwards them to Bridge — it does **not**
verify them against a real session, because none exists yet.

What the proxy DOES change: the browser can no longer construct an arbitrary
Bridge request (any path, any header, the secret itself). It can only call
these five fixed Corporate routes with a plain JSON body; the proxy is the only
thing that turns that into an actual Bridge call, and the only thing that ever
holds `QUADX_BRIDGE_API_KEY`. That is a real (if narrow) improvement over the
prior state, but it is explicitly **not** authentication — a real session,
verified server-side, is deferred to production (see §11.9).

### 11.3 Bridge secret handling

- Read once, server-side only: `process.env.QUADX_BRIDGE_API_KEY`
  (`api/_lib/bridge.ts:getBridgeConfig`). Never referenced from `src/`, never a
  `VITE_`-prefixed variable, never committed (`.env.example` documents it as a
  placeholder only).
- Attached as `X-Corporate-Internal-Key` on every outbound Bridge call
  (`bridgeFetch`) — the header QuadX Bridge's own `isAllowedCorporateBridgeCaller`
  checks first.
- Missing/empty key (or missing `QUADX_BRIDGE_URL`) fails closed: the route
  returns `500` with a clear, specific message (which env var, why) and never
  attempts the Bridge call. Verified in `_smoke_proxy_tmp.mjs` (throwaway,
  deleted after use — see §11.8) and confirmed absent from the browser bundle:
  `grep -rl QUADX_BRIDGE_API_KEY dist/` after `npm run build` returns nothing.

### 11.4 Frontend changes

- `src/app/services/heyqCustomerApi.ts`: `apiListMyTickets`, `apiGetMyTicket`,
  `apiReplyToMyTicket`, `apiReopenMyTicket`, `apiCreateTicket` now call
  same-origin `/api/support/*` (relative — no origin to configure) instead of
  `${VITE_HEYQ_API_URL}/api/customer/*` on the legacy Railway origin. No other
  browser code calls Bridge/Railway for these operations.
- Removed the multipart/`files` upload path from `apiCreateTicket` /
  `apiReplyToMyTicket` (see §11.6) — creation/reply are JSON-only now.
- `heyqService.ts` / `ticketsService.ts`: `submitOrderReport`/`OrderReportInput`
  and `replyToMyTicket`/`replyToTicket` lost their `files` parameter;
  `replyToMyTicket`/`replyToTicket` gained an optional `messageId` used for
  idempotency (see §11.5).
- **Dormant, intentionally left in place, not deleted:** `getHeyQApiBaseUrl()` /
  `VITE_HEYQ_API_URL`, the realtime WebSocket path (`heyqRealtimeClient.ts`,
  `getHeyQRealtimeUrl`, `apiMintRealtimeToken`/`getRealtimeToken`), and
  `buildAttachmentUrl`/`getAttachmentUrl`. Nothing in the running app calls any
  of them — `useTicketConversation.ts` no longer constructs a `WebSocket` at
  all — so they never reach Bridge/Railway from the browser; they're kept as
  documented dead code rather than deleted, in case a future Bridge contract
  adds realtime or attachments. Every one of these is called out with a
  "DORMANT" comment at its definition.

### 11.5 Idempotency forwarding

- **Create** (`apiCreateTicket`): a fresh `crypto.randomUUID()` is generated
  per call and sent as `Idempotency-Key`. Bridge's `create_customer_ticket_bridge`
  RPC dedupes on this value (a `text` column, any string).
- **Reply** (`apiReplyToMyTicket` / `useTicketConversation`): the optimistic
  message's `tempId` — now a real `crypto.randomUUID()` (Bridge's message-id
  column is `uuid`-typed, so it must be one) — is sent as `X-Bridge-Message-Id`
  on send AND reused verbatim on `retry(tempId)`. Bridge's
  `add_customer_message_bridge` RPC dedupes on this id, so a retried reply
  cannot create a second message.
- Nothing new was built in Corporate beyond generating/threading these two
  identifiers — the dedup logic itself is entirely Bridge/Supabase-side (the
  atomic RPCs), exactly as instructed.

### 11.6 Attachment limitation

The Bridge contract is text-only; attachment bytes are rejected with `400`.
Per instruction, no attachment storage/infrastructure was built. Instead:

- `apiCreateTicket` / `apiReplyToMyTicket` no longer accept a `files` parameter
  at all — there is no code path left that can send one.
- The proxy defensively rejects any request whose body carries a non-empty
  `attachments` array with a `400` **before** calling Bridge
  (`api/_lib/bridge.ts:hasAttachmentPayload`), so a future/rogue caller still
  gets a clean, immediate rejection rather than a round trip.
- The attachment picker (`AttachmentInput`) is unwired from both call sites —
  the Report an Issue drawer and the ticket reply composer — and replaced with
  a short "Attachments aren't available in this demo integration yet" note.
  `AttachmentInput.tsx` and `attachmentPolicy.ts` are left in the codebase,
  unused, rather than deleted (same "dormant, not deleted" treatment as §11.4).
- Historical attachment **display** (downloading/previewing an attachment
  already on a message) was left as-is (`AttachmentList`/`ConsolidatedAttachments`
  in `SupportTicketDetail.tsx`) — it only renders when a message carries an
  attachment `id`, which no Bridge-backed ticket will ever have, so it is
  correct-but-unreachable rather than a live gap.

### 11.7 Known limitation: explicit "Reopen ticket" vs. the legacy in-memory store

`POST /tickets/:id/reopen` is still proxied (the current UI still calls it,
and it remains part of the documented customer contract), but per the QuadX
Bridge implementation this route runs against HeyQ's **legacy in-memory**
ticket store (`server/tickets.ts`), not the Supabase-backed atomic-RPC path
the rest of this contract uses — so it will not find a Bridge/Supabase-created
ticket. This is a **Bridge-side** gap (out of this task's scope to fix — no
HeyQ change was made), not a Corporate proxy defect; it is called out in code
comments at `api/support/tickets/[id]/reopen.ts` and
`heyqCustomerApi.ts:apiReopenMyTicket`.

It does not block the reopen *behavior* end-to-end: replying to a
`resolved`/`on_hold` ticket already reopens it automatically through the
working Supabase RPC path (`add_customer_message_bridge`), which is what the
existing "This ticket has been resolved… replying below or reopening will
bring it back" banner already tells the user. The explicit **button** is a
known non-functional affordance against a live Bridge until HeyQ adds a
Bridge-backed reopen RPC.

### 11.8 Validation performed

- `npm run typecheck` — 0 errors (the `/api` directory is outside `tsconfig.app.json`'s
  `include`, so it is not part of this check by design — the API routes are a
  separate Vercel-built target, same as the rest of a Vite+Vercel-Functions project).
- `npm run build` — succeeds; confirmed `grep -rl QUADX_BRIDGE_API_KEY dist/`
  and `grep -rl X-Corporate-Internal-Key dist/` both return nothing (item 10).
- `npm test` — **70/70 passing** (adapter, lifecycle, realtime, attachments,
  journey-mode suites), including new/updated coverage for this change:
  - ticket reads/writes go to `/api/support/*`, never an absolute Bridge/Railway URL;
  - two separate `apiCreateTicket` calls each carry their own, different `Idempotency-Key`;
  - a retried reply forwards the SAME `X-Bridge-Message-Id`;
  - `apiCreateTicket`/`apiReplyToMyTicket` send JSON only, never multipart;
  - the ticket detail page's "Live" status and message sync now come from the
    5-second REST poll — a test double throws if `useTicketConversation` ever
    constructs a `WebSocket` again, and a repeated poll of unchanged data does
    not duplicate a message;
  - optimistic-reply reconciliation still passes unchanged.
- **Manual smoke test** (throwaway script, `--experimental-strip-types`, not
  committed) directly invoked all four route handlers with a stubbed
  `global.fetch` and confirmed: missing-env → `500` with a specific message;
  a configured GET forwards to the exact Bridge path with
  `X-Corporate-Internal-Key` attached and relays the response body/status
  unchanged; POST create forwards `Idempotency-Key`; an attachment payload is
  rejected with `400` **without** calling Bridge; POST reply forwards
  `X-Bridge-Message-Id`; POST reopen forwards to `/tickets/:id/reopen`; a
  Bridge network failure surfaces as `502`. This is the only exercise these
  new `/api` files got, since neither `tsc -b` nor `vite build` type-checks or
  bundles them (by design — see the point above) and no live Vercel deployment
  was available in this task.
- **Not performed — live Bridge round trip.** Per §10's audit and this task's
  own research, no single, currently-reachable QuadX Bridge base URL was found
  documented anywhere in either repo (`HeyQ/.env.example` states the Railway
  deployment was deliberately decommissioned and "the owner has said not to
  reactivate it"; the Bridge reconnection handoff describes Supabase RPCs
  deployed but does not name a reachable HTTP origin for the Bridge server
  itself). `QUADX_BRIDGE_URL` is therefore left unset by default
  (`.env.example`) and the proxy fails closed until whoever deploys Corporate
  supplies it. **Items 4–13 of the task's validation checklist involving a
  real deployed Bridge (ticket appears in HeyQ, CSR reply round-trips, etc.)
  could not be executed and remain open** — the code path is implemented and
  unit/smoke-verified against the exact contract QuadX Bridge's own source
  defines, but not against a live instance.

### 11.9 Production auth — explicitly deferred

Per instruction, no new authentication/session system was built. Deferred to
a real production pass:

- A verifiable, server-side session for GGX Corporate (replacing the
  browser-localStorage mock in `authService.ts`).
- Deriving `externalUserId`/`externalOrgId` from THAT session inside
  `api/_lib/bridge.ts`, instead of trusting client-supplied fields.
- Per-request authorization beyond "both identity fields are present."

### 11.10 Also not verified in this task

- That Vercel's function-vs-rewrite precedence (§11.1) behaves as documented
  on an actual deployment of this project — no live Vercel deployment was
  available. If it does not, `vercel.json`'s catch-all rewrite would need an
  explicit `/api/(.*)` exclusion.
- A cross-account negative-authorization test against a live Bridge (§10's
  "Required resolution" item 4) — blocked by §11.8's "not performed" item.

---

**Suggested next step:** `CODEX_GGX_HEYQ_END_TO_END_REAUDIT`, once
`QUADX_BRIDGE_API_KEY` and a confirmed, reachable `QUADX_BRIDGE_URL` are
available in a real deployment environment to re-run the live round trip this
task could not execute.

---

## 12. Follow-up Re-audit — 2026-08-26

**Verdict: REQUEST CHANGES — NOT CLEARED FOR INTEGRATED RELEASE.**

This re-audit reviewed commit `b9795cb` directly. It does not change the
implementation.

### 12.1 Evidence collected

- `npm run typecheck` passed.
- A separate TypeScript check over all five `api/**` files passed. Those files
  are outside the app `tsconfig` and need this explicit check.
- `npm run build` passed. A scan of `dist/` found neither
  `QUADX_BRIDGE_API_KEY` nor `X-Corporate-Internal-Key`.
- `npm test` passed: **70/70** tests.
- Vercel's current project-configuration documentation states that the
  filesystem is considered before rewrites. The root `api/**` functions
  therefore take precedence over this project's `/(.*) → /index.html` SPA
  catch-all. This still needs deployment smoke coverage, but it is no longer
  an unsupported routing assumption.
- This environment has neither `QUADX_BRIDGE_URL` nor
  `QUADX_BRIDGE_API_KEY` configured. A live ticket create/list/reply/CSR-reply
  round trip, idempotent retry, and cross-account negative test could not run.

### 12.2 P1 — requester identity remains forgeable

The proxy correctly keeps `QUADX_BRIDGE_API_KEY` server-side and constrains
the browser to fixed support routes. However, every route reads
`externalUserId` and `externalOrgId` directly from browser-controlled query
parameters or JSON (`api/_lib/bridge.ts:readIdentity` and its callers). A
caller can invoke the same-origin route with a different identity value; the
proxy forwards it while authenticating to Bridge with the Corporate internal
key. No server session, signed token, or server-side scope lookup binds those
values to the requester.

That means the BFF is a secret-hiding proxy, not the session-authenticated BFF
required by the previous P1 audit. A live cross-account test is still needed,
but the source alone establishes that Corporate cannot prevent the attempted
identity substitution. Do not release this customer-ticket surface until the
proxy derives both identity values from a verified server-side session (and
does not accept client overrides).

### 12.3 P2 — explicit reopen is knowingly non-functional

`SupportTicketDetail` still exposes the explicit Reopen action whenever the
ticket allows it. That action reaches `/api/support/tickets/:id/reopen`, which
intentionally forwards to Bridge's legacy in-memory HeyQ handler. Per §11.7,
that handler cannot find a ticket created through Bridge's Supabase RPC path.

Do one of the following before release:

1. Hide/remove the explicit Reopen control and adjust its copy to say that a
   reply reopens the ticket; or
2. Have HeyQ ship an authoritative Bridge-backed reopen endpoint, then update
   Corporate to use it and cover it in the live round trip.

### 12.4 Remaining live-release gates

1. Deploy Corporate with a confirmed reachable `QUADX_BRIDGE_URL` and the
   server-only `QUADX_BRIDGE_API_KEY`.
2. Implement server-verified Corporate auth/session hydration and derive
   Bridge identity and account scope inside the proxy.
3. Verify live: create a ticket, list/read it, reply, retry the same reply
   idempotently, receive a CSR reply through the five-second poll, and verify
   that a separate account receives no ticket content or write access.
4. Smoke-test the Vercel deployment's `/api/support/**` routes rather than
   relying only on local handler stubs.
5. Resolve or remove the explicit reopen affordance.

---

## 13. POC Identity Correction & Reopen Removal (2026-08-26)

Narrow corrective pass responding to §12.2 (P1: forgeable requester identity)
and §12.3 (P2: knowingly non-functional Reopen). Scope was deliberately
narrow, per instruction: fix only these two applicable Corporate issues. No
production auth/session system was built, Corporate account management was
not redesigned, HeyQ/the deployed Bridge's security model were not touched,
attachments remain unimplemented, and no new ticket-lifecycle behavior was
added.

### 13.1 POC server-side identity mapping (fixes §12.2)

**Before:** every `/api/support/*` route read `externalUserId`/`externalOrgId`
directly off the browser-controlled query/body and forwarded them to Bridge
as-is. A caller could invoke the same-origin route with a different identity
and the proxy would authenticate it to Bridge with the Corporate secret
regardless — a secret-hiding proxy, not an identity-authorizing one.

**After:** the browser sends only an opaque `demoAccountId` — the stable `id`
field already on the app's mock session user (`MockAuthUser.id`, e.g.
`user-admin-001`), returned by the new `heyqService.getDemoAccountId()`
(reads `authService.getSessionContext().user.id`). It is NOT
`externalUserId`/`externalOrgId`, and carries no more information than "which
of the app's two fixed demo accounts is currently signed in."

**Server-side mapping — new file `api/_lib/demoIdentity.ts`:**

```ts
resolveDemoIdentity(demoAccountId: unknown): { externalUserId; externalOrgId } | null
```

It builds a `Map<id, {externalUserId, externalOrgId}>` from
`MOCK_AUTH_USERS` — the SAME dataset `src/app/services/authService.ts` is
already backed by (imported directly, not duplicated, so a demo account added
there is automatically valid here with nothing else to keep in sync). Today
that's exactly two entries:

| `demoAccountId` | → `externalUserId` | → `externalOrgId` | Demo role |
|---|---|---|---|
| `user-admin-001` | `max@email.com` | `main` | Admin |
| `user-mgr-001` | `manager@email.com` | `acme-luzon` | Manager |

**`api/_lib/bridge.ts:requireDemoIdentity(res, demoAccountId)`** is now the
ONLY identity path every route may use: it calls `resolveDemoIdentity` and
either returns the resolved `{externalUserId, externalOrgId}` or writes a
`400` and returns `null` (caller returns immediately). Every route
(`api/support/tickets/index.ts`, `[id].ts`, `[id]/messages.ts`) explicitly
destructures and **discards** any `demoAccountId`/`externalUserId`/
`externalOrgId` the request body also carries before building the Bridge
payload — the server-resolved identity is spread in last, so it always wins;
nothing from the client can override or merge into it.

**Client side:** `heyqCustomerApi.ts`'s `apiListMyTickets`, `apiGetMyTicket`,
`apiReplyToMyTicket`, `apiCreateTicket` now take `demoAccountId: string`
instead of a `HeyQRequesterIdentity` object; `heyqService.ts`'s
`listMyTickets`/`getMyTicket`/`replyToMyTicket`/`submitOrderReport` resolve it
via `getDemoAccountId()`. `heyqService.getRequesterIdentity()` (the old
`{externalUserId, externalOrgId}` shape) still exists but is now scoped to
**local-only** uses that never cross the wire to Bridge: OMS order
authorization (`getAuthorizedOrder`, `listAuthorizedTransactions`,
`getLiveOrderStatus`) and the dormant realtime/attachment helpers (unchanged,
out of scope — see §11.4).

**Explicitly NOT production authentication** (per instruction, not built):
there is no session token, signature, or expiry on `demoAccountId` — it is
exactly as forgeable as `externalUserId` was; a caller can still send a
*different demo account's* id and act as them. What changed is narrower: the
browser can no longer invent a Bridge identity that isn't one of this
deployment's fixed demo accounts, and the mapping now happens server-side
against a server-owned table instead of being echoed back from the request.
This is sufficient **only** for a controlled demo environment with a small,
fixed, non-sensitive account set. Real production identity still requires a
verified server-side session (replacing `authService.ts`'s
browser-localStorage mock) feeding `api/_lib/demoIdentity.ts`'s role — see
`demoIdentity.ts`'s own docblock for the full boundary statement.

### 13.2 Reopen removal (fixes §12.3)

Per §12.3/§11.7, `POST /tickets/:id/reopen` only works against HeyQ's legacy
in-memory store, never a Bridge/Supabase-created ticket — the explicit
"Reopen ticket" button was knowingly non-functional for every real ticket.
Rather than leave it or modify Bridge/HeyQ to preserve it (out of scope), it
was removed:

- **Deleted:** `api/support/tickets/[id]/reopen.ts` (the proxy route),
  `apiReopenMyTicket` (`heyqCustomerApi.ts`), `reopenMyTicket`
  (`heyqService.ts`), `reopenTicket` (`ticketsService.ts`), the `reopen`
  callback and its entry in `TicketConversation` (`useTicketConversation.ts`),
  and the "Reopen ticket" button + `handleReopen` + unused
  `IconRotateClockwise` import (`SupportTicketDetail.tsx`).
- **Preserved — the actual supported lifecycle:** replying to a
  `resolved`/`on_hold` ticket still reopens it automatically, because that
  goes through Bridge's atomic `add_customer_message_bridge` RPC (the working
  Supabase-backed path) rather than the broken legacy route. The resolved-
  ticket banner now reads "…replying below will bring it back to our support
  team" (dropped "…or reopening"). The `canReopen` field is still read from
  Bridge and mapped through (`CustomerTicket.canReopen`) — it's just no
  longer wired to a UI action, since it was reused as pure data rather than
  stripped from the type.
- HeyQ/the deployed Bridge were not modified — this is a Corporate-only
  removal of a non-functional affordance, not a workaround built to keep it
  alive.

### 13.3 Environment readiness (unchanged from §11.3, restated)

`QUADX_BRIDGE_URL` / `QUADX_BRIDGE_API_KEY` remain server-only env vars
(`.env.example`), never hardcoded, never `VITE_`-prefixed. This environment
still has neither configured, so automated tests remain mocked/stubbed at the
`window.fetch` layer (client-side) and at `global.fetch` (a throwaway
Node smoke script directly invoking the real route handlers — see §13.4).
**Live E2E against the deployed Bridge was NOT executed and must not be
reported as such** — it requires those two values from whoever operates the
real deployment.

### 13.4 Validation performed

- `npm run typecheck` — 0 errors.
- A dedicated TypeScript check over `api/_lib/*.ts` + all three remaining
  `api/support/tickets/**` route files (`--strict --jsx react-jsx`, since
  `demoIdentity.ts` now reaches into `src/app/data/mock/auth.mock.ts`) — 0
  errors. This directory is still outside `tsconfig.app.json`'s `include` by
  design (a separate Vercel-built target), so it needs this explicit check.
- `npm run build` — succeeds; `grep -rl QUADX_BRIDGE_API_KEY dist/` and
  `grep -rl X-Corporate-Internal-Key dist/` both return nothing.
- `npm test` — **71/71 passing**, including:
  - the read/write URL now carries `demoAccountId` (`user-admin-001` for the
    admin session), never `externalUserId`/`externalOrgId`;
  - signing in as the manager demo account maps to its own `demoAccountId`
    (`user-mgr-001`) on the same read call — "switching among legitimately
    supported demo accounts still works" (validation item 5);
  - the create POST body carries `demoAccountId` and explicitly does NOT
    carry `externalUserId`/`externalOrgId`;
  - idempotency coverage (`Idempotency-Key` per create,
    `X-Bridge-Message-Id` reused on reply retry) re-verified against the new
    `demoAccountId`-based call signatures;
  - a resolved, `canReopen: true` fixture ticket (`HQ-10230`) renders no
    button matching `/reopen/i` and no "…or reopening" banner text.
- **Manual smoke test** (throwaway script, `--experimental-strip-types`, not
  committed) directly invoked the real route handlers with a stubbed
  `global.fetch` and confirmed: a known `demoAccountId` (admin) resolves to
  `max@email.com`/`main` while spoofed `externalUserId`/`externalOrgId` query
  params alongside it are ignored; the manager account resolves to its own
  identity; an unknown `demoAccountId` → `400`, Bridge never called; a
  *missing* `demoAccountId` → `400`, Bridge never called; a POST create with
  a spoofed identity in the body still resolves the identity server-side, the
  spoofed fields are dropped, `demoAccountId` itself never leaks into the
  Bridge payload, and `Idempotency-Key` is still forwarded; the same holds for
  GET-one and POST-reply (`X-Bridge-Message-Id` still forwarded); and
  `api/support/tickets/[id]/reopen.ts` no longer exists as a module at all.
- **Not performed — live Bridge round trip.** Same blocker as §11.8/§12.1:
  this environment has neither `QUADX_BRIDGE_URL` nor `QUADX_BRIDGE_API_KEY`
  configured, and no reachable Bridge origin is documented anywhere in either
  repo. A live cross-account negative test (§12.4 item 3) — confirming a
  *live* Bridge actually refuses a mismatched identity, not just that
  Corporate no longer offers one — remains outstanding and requires those
  values from a real deployment.

### 13.5 Remaining gates (supersedes §12.4 items 2 and 5)

1. Deploy Corporate with a confirmed reachable `QUADX_BRIDGE_URL` and
   `QUADX_BRIDGE_API_KEY` (unchanged from §12.4 item 1).
2. ~~Implement server-verified Corporate auth/session hydration~~ — narrowed
   by this pass to the extent in scope: the proxy no longer trusts a
   browser-stated identity, via the POC demo-account allowlist in §13.1. A
   REAL production session (replacing `authService.ts`'s mock) is still a
   separate, larger piece of future work — deliberately not built here.
3. Verify live (unchanged from §12.4 item 3): create, list/read, reply, retry
   idempotently, receive a CSR reply through the five-second poll, and verify
   a separate account receives no content/write access to another's ticket —
   this time also confirming Bridge itself rejects a mismatched
   `externalUserId`/`externalOrgId`, since Corporate can no longer construct
   one in the first place to test the negative case client-side.
4. Smoke-test the Vercel deployment's `/api/support/**` routes (unchanged
   from §12.4 item 4).
5. ~~Resolve or remove the explicit reopen affordance~~ — DONE (§13.2).

---

## 14. Live End-to-End Validation (2026-08-26)

### 14.1 What "deployed Bridge" actually resolved to

No hosted, reachable QuadX Bridge HTTP endpoint exists. This was re-confirmed
in this pass: HeyQ's `server/` (the Bridge implementation) has no Railway
deployment (`.env.example`: "Railway is not running… the owner has said not
to reactivate it") and no Vercel Functions deployment (HeyQ's `vercel.json`
is SPA-rewrites only, same as Corporate's). What **is** genuinely established
and reachable is the **Supabase project the Bridge writes to** —
`rwzwktrepfgsooerpyjx` ("QuadX Bridge") — with the atomic-RPC migration
(`20260826130000_quadx_bridge_atomic_rpcs.sql`) confirmed applied on **both**
its local mirror and the linked remote project (`supabase migration list`
shows `local == remote` for that migration id).

Given that, this validation ran the Bridge's own unmodified server code
(`HeyQ/server/index.ts`, i.e. `server/http.ts` + `server/supabaseBridge.ts` —
no HeyQ changes) as a real HTTP process, **without** the `--dev` flag so its
authentication gate is enforced exactly as `npm start` (Railway) would run
it, backed by the `supabase start` Postgres instance that mirrors that same
linked, migrated project. Corporate's real `api/support/tickets/*.ts`
handlers made real, un-stubbed network calls to that Bridge process. This is
the most faithful "live" round trip achievable without a hosted Bridge
deployment — real request/response HTTP, real auth enforcement, real
Postgres rows, real atomic RPCs — but it is **not** a hosted/production
deployment, and a genuinely hosted round trip (item 4 in §13.5) is still not
done.

### 14.2 Environment configuration status

- `QUADX_BRIDGE_URL` and `QUADX_BRIDGE_API_KEY` were set **only** as
  process-local server-side environment variables for this validation run —
  never written to a committed file, never `VITE_`-prefixed. `.env.example`'s
  existing placeholders are unchanged (still blank). No secret value is
  recorded anywhere in this repo or in this document.
- Confirmed (regression run, §14.7): `grep -rl QUADX_BRIDGE_API_KEY dist/`
  and `grep -rl X-Corporate-Internal-Key dist/` after `npm run build` both
  return nothing — the key never reaches the browser bundle.
- Confirmed: the only Bridge-related string in the built browser bundle is
  the literal, relative `/api/support` — the browser targets only same-origin
  proxy routes, never a Bridge/Railway origin.
- This machine's environment does not carry these two values as a standing
  configuration (no `.env.local` in this repo, no linked Vercel project) —
  they were exported only for the lifetime of this validation's local Bridge
  process and the scripts that drove it, and are gone now. **A real
  deployment still needs these two values supplied by whoever operates the
  actual QuadX Bridge / owns the Vercel project**, which this task could not
  discover or provision.

### 14.3 Live round trip — result: PASS (all 8 steps)

One real ticket was created, driven end-to-end, and deleted afterward
(tracking number pattern `GGX-CORP-LIVE-E2E-<timestamp>`, clearly tagged,
not a real demo-data fixture). Reference `HQS-2026-0116-2738` — Bridge's own
generated id, gone from the database now (§14.9).

| # | Step | Result |
|---|---|---|
| 1 | Select an existing demo Corporate account (admin, `demoAccountId=user-admin-001`) | PASS — Bridge stored `requester_external_user_id='max@email.com'`, `requester_external_org_id='main'`, sourced entirely server-side |
| 2 | Report an issue against a real tracking-number-shaped reference | PASS — `POST /api/support/tickets` → real Bridge → real Postgres row |
| 3 | Corporate BFF maps `demoAccountId` server-side | PASS — verified directly in Postgres, not just in the HTTP response |
| 4 | Ticket created through the deployed(-equivalent) Bridge | PASS — inserted via Bridge's real `create_customer_ticket_bridge` RPC |
| 5 | Ticket appears in HeyQ | PASS — row present in `public.tickets`, visible via Bridge's own `GET /customer/tickets/:id` |
| 6 | Canonical tracking number preserved | PASS — `tracking_number` column matches exactly |
| 7 | Initial customer text appears correctly | PASS — first message body matches verbatim |
| 8 | Second customer reply from Corporate | PASS — `POST /api/support/tickets/:id/messages` |
| 9 | Reply appears in HeyQ | PASS — present in `ticket_messages`, returned on next read |
| 10 | CSR/TL reply (simulated by inserting an `author_type='agent'` row directly into `ticket_messages`, exactly as HeyQ's own agent app would) | PASS |
| 11 | Corporate receives the agent reply via its existing 5-second-poll GET | PASS — `GET /api/support/tickets/:id` returned the CSR message, `from:'support'` |
| 12 | Another Corporate response | PASS — thread reached 4 real messages with no loss across the sequence |
| 13 | HeyQ receives it | PASS — confirmed via the same GET/DB check |
| 14 | Resolved-ticket reply follows the supported automatic reopen | PASS — ticket status set to `resolved` directly, then a customer reply flipped it back to `in_progress` via Bridge's real RPC — **no explicit Reopen action was used or needed** |

### 14.4 Cross-account negative tests — result: PASS (all 8)

| Check | Result |
|---|---|
| Unknown `demoAccountId` fails before Bridge is called | PASS — `400`, zero Bridge HTTP calls (instrumented) |
| Spoofed `externalUserId` in the request body is ignored | PASS — Postgres row shows the real, server-derived value, not the spoofed one |
| Spoofed `externalOrgId` in the request body is ignored | PASS — same check, both create and reply |
| Demo account A cannot read demo account B's ticket | PASS — admin's ticket, read as `user-mgr-001` → real Bridge `404` (ownership check) |
| Demo account A cannot reply to demo account B's ticket | PASS — same, on the reply route → real Bridge `404` |
| Invalid Bridge secret fails closed | PASS — a wrong `QUADX_BRIDGE_API_KEY` gets a real `401` from the running Bridge process, relayed unchanged by the proxy |
| Missing Bridge secret fails closed | PASS — proxy itself refuses with `500` **before** any Bridge call (instrumented — zero calls) |
| Browser never receives the Bridge key | PASS — §14.2's bundle scan |

### 14.5 Idempotency — result: PASS (both)

- **Create retry:** the exact same `Idempotency-Key` sent twice → Bridge's
  `create_customer_ticket_bridge` RPC returned the SAME ticket id both times;
  row count for that tracking number stayed at 1.
- **Message retry:** the exact same `X-Bridge-Message-Id` sent twice → row
  count in `ticket_messages` for that ticket was unchanged after the retry
  (verified by direct count query before/after).

### 14.6 Polling behavior — result: PASS (data path); unmount/failure-recovery unchanged and separately covered

- **New replies appear without a full-page refresh:** proven directly —
  §14.3 steps 10–11 show a CSR reply landing in Postgres and then appearing
  on the next `GET` the poll makes, with no page reload involved.
- **Repeated polls don't duplicate messages:** proven directly — the same
  ticket was read multiple times across the sequence (steps 3, 6, 7, 11, 13)
  and the message count only ever grew by exactly the messages actually
  added, confirmed by an explicit `assert.equal(msgs.length, 4, …)` mid-run.
- **Polling stops on unmount / recovers from a transient failure:** these are
  pure client-side React lifecycle concerns in `useTicketConversation.ts`
  (the `useEffect` cleanup clearing `setInterval`, and the poll's try/catch
  preserving state on a failed fetch) — independent of which backend answers
  the `GET`, and already covered by the existing automated test suite
  (`heyq-realtime.test.mjs`'s polling describe block), which is unchanged and
  still green in §14.7. Not re-proven against the live Bridge specifically,
  since there is nothing backend-specific about that behavior to prove.

### 14.7 Attachment contract — result: PASS

`POST /api/support/tickets` with a non-empty `attachments` array under this
live configuration (real key, real reachable Bridge) still returns `400`
**and never reaches Bridge at all** (instrumented — zero Bridge calls) — the
proxy's own text-only guard, unchanged. No attachment storage was built or
attempted.

### 14.8 Regression — result: PASS

- `npm run typecheck` — 0 errors.
- Dedicated `api/**` TypeScript check (`--strict --jsx react-jsx`, since
  `api/_lib/demoIdentity.ts` reaches into `src/app/data/mock/auth.mock.ts`)
  — 0 errors.
- `npm run build` — succeeds; secret/header absent from `dist/`, only
  same-origin `/api/support` paths present (§14.2).
- `npm test` — **71/71 passing** (adapter, lifecycle, realtime, attachments,
  journey-mode suites) — unchanged from the prior pass; no test files were
  modified in this task, since this task's own live validation ran as
  throwaway scripts outside the committed test suite (§14.9).

### 14.9 Method notes / what was NOT committed

- The live round trip and negative tests ran from three throwaway Node
  scripts (`_live_e2e_tmp.mjs` + two standalone bad-key/no-key checks run as
  separate processes to avoid `api/_lib/bridge.ts`'s intentional per-process
  config cache), executed with `node --experimental-strip-types` against the
  real, unmodified `api/support/tickets/*.ts` handler files. All three were
  deleted after use — nothing new was added to the test suite or the repo.
- The local Bridge server process (`HeyQ/server/index.ts`, no `--dev`) was
  started for this validation and stopped afterward; nothing about HeyQ's
  code was modified.
- The one test ticket created (§14.3) and all its messages/status events were
  deleted from Postgres after validation — the database was left exactly as
  found (114 pre-existing tickets, unrelated to this task, untouched).
- No `SUPABASE_SERVICE_ROLE_KEY` was configured or needed for any of this —
  `supabaseBridge.ts`'s own well-known local-dev fallback key was used
  against the local mirror, exactly as HeyQ's own deployment smoke test
  (`quadxBridgeDeploymentSmoke.test.ts`) already does.

### 14.10 Remaining blocker

The **only** remaining gap is that no hosted QuadX Bridge deployment could be
located or reached — this validation exercised the real Bridge code and a
real, migration-synced Postgres database, but not a publicly reachable
production/staging URL. Whoever owns the actual deployed Bridge (Railway,
Vercel, or otherwise) needs to supply Corporate's deployment with:

- `QUADX_BRIDGE_URL` — that Bridge's real reachable origin
- `QUADX_BRIDGE_API_KEY` — the shared secret that Bridge instance enforces

Once both are set as server-only environment variables on Corporate's actual
hosting platform (never `VITE_`-prefixed, never committed — matching
`.env.example`), this task's round trip should be re-run one more time
against that specific hosted pair to close out the last gate in §13.5 item 1
(and item 4 — smoke-testing the real Vercel-routed `/api/support/**` paths,
which this validation also could not exercise since it called the handler
functions directly rather than through an actual Vercel/`vercel dev` HTTP
listener). No further Corporate-side code changes are anticipated unless that
run surfaces something new.

---

## 15. QuadX Bridge Hosted as a Supabase Edge Function (2026-08-26)

§14's blocker — no hosted, reachable QuadX Bridge existed anywhere — is
resolved. Rather than stand up a new host (Railway is explicitly
decommissioned per the HeyQ repo's own `.env.example`: "the owner has said
not to reactivate it"), QuadX Bridge is now hosted as a **Supabase Edge
Function inside HeyQ's own Supabase project** (`rwzwktrepfgsooerpyjx`,
already the project the Bridge's RPCs and schema live in). This required
**zero changes to GGX Corporate's application code** — only its
`QUADX_BRIDGE_URL` environment *value* changes, because Corporate's proxy
already treated the Bridge origin as fully configurable.

### 15.1 What was built (HeyQ repo)

- **`supabase/functions/quadx-bridge/index.ts`** (new, ~440 lines) — a
  self-contained Deno Edge Function faithfully porting the FOUR routes
  Corporate's proxy actually calls and §14 actually validated:
  `GET /customer/tickets`, `GET /customer/tickets/:id`,
  `POST /customer/tickets`, `POST /customer/tickets/:id/messages`. Same
  request/response shapes, same `X-Corporate-Internal-Key`/`Authorization:
  Bearer` auth contract (constant-time key comparison), same
  `Idempotency-Key`/`X-Bridge-Message-Id` idempotency headers, same
  `create_customer_ticket_bridge`/`add_customer_message_bridge` atomic RPCs,
  same fail-closed ownership checks (404 on any mismatch), same attachment
  rejection (400, before touching Bridge/the RPCs at all), same
  message→status mapping (`not found`→404, `unauthenticated`→401,
  `unavailable`→503). Ported from `server/customer.ts` +
  `server/supabaseBridge.ts` + the Bridge-specific half of
  `server/security.ts`; those files are **unmodified**.
- **Self-contained by design**, matching this repo's own established Edge
  Function convention (`supabase/functions/ai-review`,
  `supabase/functions/admin-users` — both explicitly "faithfully ported",
  zero cross-directory imports from `src/`/`server/`): the small slice of
  ticket/team-catalog constants it needs (`CONCERN_TYPE_LABELS`, the
  concern→category default map, the 4-team catalog + its fixed UUID
  convention from `src/app/lib/teamIds.ts`) are inlined with a note pointing
  back to the source of truth, rather than imported.
- **Deliberately NOT ported** (not part of Corporate's active/validated
  contract — porting them would be new surface, not a migration):
  - `/customer/tickets/:id/attachments*` and `/customer/realtime/token` —
    Corporate's attachment UI and realtime WebSocket client are both already
    dormant/unwired (see `heyqCustomerApi.ts`'s module docblock in the
    Corporate repo).
  - the legacy `/tickets/:id/reopen` route — Corporate already removed its
    own call to it (§13.2); it only ever worked against HeyQ's in-memory
    store, never a Bridge/Supabase ticket.
  - the non-atomic multi-step fallback `createCustomerTicketInSupabase` /
    `addCustomerMessageInSupabase` fall back to when their RPC call itself
    errors. The atomic RPCs are the ONLY path §14 (and §15.4 below)
    exercised and validated for idempotency/atomicity; an RPC failure here
    surfaces as a clean `503` instead.
- **`supabase/config.toml`**: `[functions.quadx-bridge]` with
  `verify_jwt = false` (this function authenticates itself via the shared
  Bridge key, not a Supabase Auth JWT — same reasoning already documented
  for `[functions.ai-review]`/`[functions.admin-users]`), and
  `QUADX_BRIDGE_API_KEY = "env(QUADX_BRIDGE_API_KEY)"` added to
  `[edge_runtime.secrets]` for local-dev parity with the hosted secret.
- Committed to the HeyQ repo at `736b948` (`supabase/functions/quadx-bridge/`
  + the `config.toml` diff only — the repository's large amount of *other*
  pre-existing uncommitted work in `server/*` was left exactly as found; it
  predates this task and this task's scope did not include reviewing or
  committing it).

### 15.2 Secrets — never exposed to Corporate or its browser bundle

- `SUPABASE_SERVICE_ROLE_KEY` is **never** configured, held, or transmitted
  by GGX Corporate at any point. The Edge Function reads it from
  `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` — injected automatically by
  the Supabase Edge Functions runtime into every function's own execution
  environment. Corporate never has this credential and never needs it.
- `QUADX_BRIDGE_API_KEY` is set as a **Supabase project secret** —
  `supabase secrets set QUADX_BRIDGE_API_KEY=... --project-ref
  rwzwktrepfgsooerpyjx` — never committed, never logged, never returned in
  any response. This is the ONLY credential Corporate needs, and Corporate
  already had the infrastructure to hold it server-side (`api/_lib/bridge.ts`,
  §11.3) — unchanged by this migration.
- **Confirmed** (regression run, §15.7): the secret is absent from
  Corporate's built browser bundle, exactly as before.

### 15.3 Deployment

Deployed with the Supabase CLI, authenticated with existing access to the
linked, `ACTIVE_HEALTHY` project (`rwzwktrepfgsooerpyjx`, org
`ufeivykndfhrkoqiunsf`, confirmed via `supabase projects list` before
proceeding):

```
supabase secrets set QUADX_BRIDGE_API_KEY=<generated> --project-ref rwzwktrepfgsooerpyjx
supabase functions deploy quadx-bridge --project-ref rwzwktrepfgsooerpyjx
```

**Production Bridge URL:**
`https://rwzwktrepfgsooerpyjx.supabase.co/functions/v1/quadx-bridge`

**Corporate/Vercel environment variables required** (server-only — set on
Corporate's Vercel project, Production + Preview environments; never
`VITE_`-prefixed, never committed):

| Variable | Value |
|---|---|
| `QUADX_BRIDGE_URL` | `https://rwzwktrepfgsooerpyjx.supabase.co/functions/v1/quadx-bridge` |
| `QUADX_BRIDGE_API_KEY` | the same value set via `supabase secrets set` above — get it from whoever holds it; it is not recorded in this document or repo |

No Vercel access was available in this task (no linked project, no CLI
installed — same as every prior pass) to set these directly on Corporate's
deployment; whoever has Vercel access must add them.

### 15.4 Live validation — local Edge Function first, then the real hosted deployment

Two full passes of the same validation, both via Corporate's real, **unchanged**
`api/support/tickets/*.ts` handler code (throwaway driver scripts, not
committed — same method as §14):

1. **Local pass** — `npx supabase start` in the HeyQ repo (Docker; the same
   linked/migrated local mirror §14 used), function served automatically at
   `http://127.0.0.1:54321/functions/v1/quadx-bridge`. All 17 checks passed
   (same list as §15.5 below), verified against the local Postgres via
   `docker exec ... psql`.
2. **Hosted pass** — against the actual production URL above. All 17 checks
   passed, verified against the REAL hosted Postgres via
   `supabase db query --linked` (Management API — no raw DB password ever
   used or needed).

Both passes ran the identical 17-check sequence §14 established, so the
result is directly comparable:

### 15.5 Results (identical outcome, both passes — local mirror AND hosted)

| # | Check | Result |
|---|---|---|
| 1–3 | Create a ticket (admin demo account), canonical tracking number preserved, initial customer text visible | PASS |
| 4 | Second customer reply from Corporate | PASS |
| 5–6 | Simulated CSR reply (inserted directly in Postgres, as the agent app would) appears on Corporate's next poll (`GET`) | PASS |
| 7 | Third customer reply; full 4-message thread intact, nothing lost/duplicated | PASS |
| 8 | Resolved-ticket reply auto-reopens the ticket (`resolved` → `in_progress`) via the real RPC — **no explicit Reopen action used or needed** | PASS |
| 9 | Idempotent create retry (same `Idempotency-Key`) returns the SAME ticket; row count unchanged | PASS |
| 10 | Idempotent reply retry (same `X-Bridge-Message-Id`) does not duplicate the message; row count unchanged | PASS |
| 11–12 | Cross-account isolation: demo account B (manager) cannot GET or reply to demo account A (admin)'s ticket → real `404` both ways | PASS |
| 13 | Unknown `demoAccountId` → Corporate proxy `400`, Edge Function never called (instrumented) | PASS |
| 14 | Spoofed `externalUserId`/`externalOrgId` on a reply are ignored; the persisted author is the server-derived identity, verified directly in Postgres | PASS |
| 15 | Attachment payload → Corporate proxy `400`, Edge Function never called (instrumented) | PASS |
| 16 | Wrong `QUADX_BRIDGE_API_KEY` → the real Edge Function returns `401`, relayed unchanged | PASS |
| 17 | Missing `QUADX_BRIDGE_API_KEY` (Corporate side) → proxy `500`, Edge Function never called (instrumented) | PASS |

Missing-key behavior **on the Edge Function's own side** specifically (as
opposed to Corporate's side, checked above) was verified by code inspection
of `isAuthorizedCaller` (an unset `QUADX_BRIDGE_API_KEY` makes `expected`
falsy, so every caller is refused with `401` regardless of what it presents)
rather than by another full local-stack restart — the logic is identical to
the already-validated Node equivalent, and restarting the local Supabase
stack a third time for this one sub-case was judged not worth the cost.

### 15.6 A real bug this validation found and fixed (hosted database drift)

The FIRST hosted idempotency check (#9 above) initially **failed** — a
create retry with the same `Idempotency-Key` returned a *different* ticket
id. Root cause: `supabase migration list --linked` reports migration
`20260826130000_quadx_bridge_atomic_rpcs.sql` as applied on both local and
remote, but the hosted database was actually **missing the
`bridge_idempotency_key` column** that migration adds (confirmed directly:
`column "bridge_idempotency_key" does not exist`). The migration-history
table and the actual hosted schema had drifted apart — for reasons outside
this task's visibility (a prior partial/failed apply that still recorded
success is one plausible explanation, not confirmed).

**Fix**: re-ran that exact migration file directly against the hosted
database (`supabase db query --linked -f
supabase/migrations/20260826130000_quadx_bridge_atomic_rpcs.sql`). It is
idempotent by construction (`add column if not exists`, `create or replace
function`), so this is a safe repair, not a new migration or a schema
redesign — it only makes the hosted database match what its own migration
history already claimed. Re-ran the full validation from a clean state
afterward; all 17 checks passed. **This was NOT an Edge Functions
compatibility issue** — it would have equally broken the Node Bridge had it
been pointed at the same drifted hosted database; the Edge Function
migration is simply what surfaced it, since §14's local-only pass never
touched the hosted database at all.

### 15.7 Regression (Corporate repo — no source changes in this task)

- `npm run typecheck` — 0 errors.
- `npm run build` — succeeds; secret/header still absent from `dist/`
  (`grep -rl QUADX_BRIDGE_API_KEY dist/` returns nothing).
- `npm test` — **71/71 passing**, unchanged.
- No Corporate source files were modified in this task — only
  `.env.example`'s comments (documenting the new production URL) and this
  handoff doc.

### 15.8 Cleanup

- All test tickets (local mirror: tracking prefix `GGX-CORP-EDGE-E2E-`;
  hosted: `GGX-CORP-HOSTED-E2E-`) and their messages/status events were
  deleted after validation. The hosted `public.tickets` table was empty (0
  rows) before this task and is empty again now.
- The local Supabase stack was stopped (`supabase stop`) after use.
- Every throwaway validation script (six total, across the local-Edge-Function
  and hosted passes) was deleted; nothing was added to either repo's
  committed test suite.
- The generated `QUADX_BRIDGE_API_KEY` test/production value was set once via
  `supabase secrets set` and is not stored in any file in either repository —
  see §15.3 for how to obtain/rotate it.

### 15.9 Corporate's real Vercel `/api/support/**` HTTP routes — still not exercised

Per §14.10/§13.5 item 4: this validation, like every prior one, called
Corporate's `api/support/tickets/*.ts` handler functions directly in-process
(with real, un-stubbed network calls out to the real Bridge). It did **not**
go through an actual Vercel deployment or `vercel dev` HTTP listener — no
Vercel CLI or linked project is available in this environment. Whoever has
Vercel access should, after setting §15.3's two environment variables:

1. Deploy (or redeploy) Corporate to Vercel.
2. Confirm `/api/support/tickets` (and the `[id]`/`[id]/messages` routes)
   resolve as real HTTP endpoints ahead of the SPA catch-all rewrite (the
   filesystem-over-rewrite precedence this relies on was confirmed against
   Vercel's documentation in §12.1, but never against an actual deployment).
3. Re-run the create → reply → poll flow from the real running Corporate UI
   in a browser, against the production Bridge URL above.

This is the one remaining gate before this integration can be called fully
production-verified end-to-end.
