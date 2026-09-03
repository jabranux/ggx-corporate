# GGX Corporate ↔ QuadX Bridge Claims integration

Wires GGX Corporate's Claims experience to QuadX Bridge's real Claims Phase 1
data, through the same BFF proxy boundary the support-ticket integration
already established. Companion doc on the Bridge (HeyQ) side:
`docs/migration/quadx-bridge-claims-customer-api.md`.

## 1. What existed before this pass

GGX's Claims feature (`src/app/pages/Claims.tsx`, `ClaimDetail.tsx`,
`src/app/data/claims.ts`, `src/app/services/claimsService.ts`) was entirely
client-side mock/`localStorage` state — no backend, non-durable/collision-
prone claim ids (`nextClaimId()` reset on every page load), and no status-
transition capability at all. Claim Details' "Questions about this claim? →
Open Support Ticket" card was a dead-end link (`navigate('/dashboard/
support-tickets')`) with zero linkage to the claim or its transaction.
QuadX Bridge had a real internal Claims Phase 1 system (`public.claims`,
staff approve/reject/Finance-process RPCs) but no external HTTP surface at
all — GGX could not reach any of it.

## 2. Architecture

```
GGX Corporate Browser → Corporate /api/claims/* → QuadX Bridge → HeyQ/Supabase
```

Same boundary, same server-verified identity, and the same never-trust-the-
client-identity rule the support proxy already established
(`api/_lib/bridge.ts`'s `requireSessionIdentity` — reused unchanged). No new
auth mechanism, no new session concept.

**Ownership boundary** (per the task brief, unchanged by this pass):
- GGX owns: claim submission UX, the Claims list/detail pages, transaction
  context, customer replies/uploads (uploads deferred — see §6), and how
  claim status/public updates are presented.
- Bridge owns: structured claims processing, the linked operational ticket,
  the CS/Finance workspace, internal notes, approve/reject/settle decisions,
  and processing history. None of this is duplicated in GGX.

## 3. `/api/claims/**` contract (new)

| Route | Method | Behavior |
|---|---|---|
| `api/claims/[claimId]/sync.ts` | `POST` | Idempotently file-or-link `claimId` with Bridge (→ `POST /customer/claims`) and return its current state. |
| `api/claims/[claimId]/state.ts` | `GET` | Re-read `claimId`'s live state (→ `GET /customer/claims/:reference`). |
| `api/claims/[claimId]/messages.ts` | `POST` | Post a customer reply. Re-resolves the linked ticket id server-side (never trusts a client-supplied one) before posting to the **existing** `/customer/tickets/:id/messages` route — no new Bridge write surface for messaging. |

`claimId` in every route is GGX's own customer-facing reference (`CLM-1008`)
— never a Bridge-internal id, which is never sent to or rendered by the
browser. `api/_lib/bridge.ts` gained one small addition,
`mapClaimReasonToBridge`, mapping GGX's free-text `CLAIM_REASONS` to
Bridge's 5-value canonical reason code (same one-way-mapping pattern
`CATEGORY_ID_TO_CONCERN_TYPE` already uses for tickets).

Frontend client: `src/app/services/claimBridgeService.ts` (new), the same
shape as `heyqCustomerApi.ts` — a `ClaimBridgeResult<T>` union
(`ok | forbidden | not_found | unavailable | claims_disabled`), an explicit
field allowlist on every response (never spreads raw JSON into app state),
and the same `SESSION_EXPIRED_EVENT` dispatch on a 401 so a claims call
failing doesn't leave the UI looking signed-in.

## 4. Linkage / idempotency (legacy claims included)

GGX's own claim reference IS the idempotency key — there is no separate
"remember the Bridge claim id" step anywhere in GGX (GGX has no backend
database of its own; `localStorage` is not treated as a durable linkage
store). `ensureClaimLinked(claimId, ...)` is called:

1. **Eagerly**, right after `fileClaim()` succeeds
   (`TransactionDetails.tsx`'s `handleSubmitClaim`) — best-effort,
   non-blocking, never surfaced as a filing error.
2. **Lazily**, every time `ClaimDetail.tsx` mounts for any claim — including
   the 8 pre-existing seed claims (`CLM-1001`–`CLM-1008`) that predate this
   integration entirely.

Both call sites hit the exact same idempotent Bridge RPC
(`create_external_claim_bridge`, keyed on `(product_id, external_reference)`
via a partial unique index) — so a legacy claim's first-ever view creates
its Bridge claim+ticket exactly once, and every subsequent view (or a
double-fire from step 1 and 2 both running) just re-reads the same row.
Nothing about this integration can duplicate a Bridge claim or crash on an
unlinked legacy claim — see `docs/migration/quadx-bridge-claims-customer-api.md`
§2a for the database-level guarantee.

## 5. Status mapping — GGX shows Bridge's status as-is, no "For Finance Review" anywhere

```
Bridge status         GGX ClaimStatus     Displayed label
pending_approval   →  in-review           "Pending Approval"
approved           →  approved            "Approved"
processing         →  processing          "Processing"
on_hold            →  on_hold             "On Hold"
rejected           →  denied              "Rejected"
settled            →  settled             "Settled"
```

> **UPDATE (final demo alignment pass):** Two earlier passes are folded
> into this table. First, Bridge added an explicit `processing` state
> (Approved → Processing → Settled) and renamed its terminal state from
> `processed` to `settled`
> (`20260918090000_claims_finance_processing_and_settle.sql`, Bridge repo);
> `claimBridgeService.ts` was stale against that rename and silently
> mis-displayed both live states as "Pending Approval" until fixed. Second,
> `processing`/`on_hold` were initially collapsed onto `approved` (treated
> as internal Finance sub-states, matching Bridge's own internal framing) —
> the task now requires GGX to show Bridge's status directly with no
> collapsing, so `ClaimStatus` gained dedicated `processing`/`on_hold`
> members and `mapBridgeStatusToLocal` is a straight 1:1 rename. The 4-step
> visual timeline in `ClaimDetail.tsx` (`ClaimTimeline`/`STATUS_STEPS`) is
> unaffected by this — it is a coarse "Filed → Pending Approval → Approved →
> Settled" journey view, not a literal 6-status rendering, and still folds
> `processing`/`on_hold` onto its one "Approved" milestone; the actual
> Status badge is what always shows the exact, un-collapsed Bridge status.

GGX's `in-review` label was changed from "Under Review" to "Pending
Approval" and `denied`'s label is "Rejected" (`CLAIM_STATUS_META`,
`src/app/data/claims.ts`) to match Bridge's own wording exactly — the
underlying `ClaimStatus` union keys are internal identifiers, unchanged in
meaning. **No "For Finance Review", "Under Review", "Filed", "Submitted", or
"Processed" status exists anywhere in either repo.**

Claim status and ticket status are independently rendered: `ClaimDetail.tsx`
shows the claim's own status badge (driven by the mapping above) and a
separate, small "Related ticket: Open/In Progress/Resolved/Closed" badge in
the Claim Updates & Messages header — an Approved claim next to an Open
ticket is a normal, expected state, never treated as inconsistent.

## 6. Claim Details — the new "Claim Updates & Messages" section

Replaces the old dead-end "Open Support Ticket" card, in the same card slot,
styled as a continuation of the existing Claim Details layout (not a
generic chat/helpdesk UI). Renders one merged, chronological timeline:

- **Timeline events** — Bridge's `customer_visible` `ticket_activities` rows
  for this claim only (`claim_filed`/`claim_approved`/`claim_rejected`/
  `claim_processed`, all in plain GGX-facing wording — no Bridge/support
  terminology).
- **Public messages** — the linked ticket's public message thread (agent
  replies + customer replies), same shape the ticket detail page already
  renders.

A compact composer (textarea + Send) posts through `replyToClaim`, which
re-reads and re-renders the merged state on success. Refresh is a plain
25-second poll (`CLAIM_STATE_POLL_MS`, paused while the tab is hidden) —
deliberately not new realtime infrastructure, per the task's own
don't-over-engineer instruction; a claim's Bridge status changes on a
staff/Finance action cadence, not a real-time one.

`ClaimTimeline` (the existing 4-step "Claim Filed → Under Review →
Approved → Settled" stepper) now takes a `status` prop directly instead of
a whole `Claim`, driven by the live-synced `displayStatus` — so it reflects
Bridge's actual status once linked, not just the claim's original local
`open` value.

**List page (`Claims.tsx`) is intentionally unchanged** — it still reads
the local mock status field (now kept reasonably fresh via a best-effort
write-through, `syncLocalClaimStatus`, whenever Claim Details successfully
reads live Bridge state) rather than making a live Bridge call per row.
Fetching live state for every row was out of scope for this pass (task's
own scope-discipline section) and would be N calls for an N-row list; a
future pass could revisit this if live list-status becomes a real need.

## 7. Public/private event rule

Enforced **server-side, in Bridge**, not by GGX hiding fields — see
`docs/migration/quadx-bridge-claims-customer-api.md` §2b's `GET
/customer/claims/:reference`. `rejection_reason`, `hold_reason`,
`finance_reference`, `reviewed_by`, `processed_by`, and every other Phase 1
staff-only column are never selected into the response Bridge sends back —
there is nothing for GGX to accidentally leak even if a future GGX change
stopped filtering them, because they never arrive.

## 8. Legacy / unlinked claims

Covered entirely by §4's idempotent lazy-link-on-view — no migration
script, no special-cased "unlinked" branch in the UI. A legacy claim whose
first-ever sync call fails (Bridge unreachable, `claims_enabled` still off)
degrades to the existing `unavailable`/`claims_disabled` states in the
Claim Updates & Messages card; the rest of the page (summary, tracking
number, local status/timeline) renders exactly as it always has — nothing
crashes, nothing silently retries into a duplicate.

## 9. Deferred dependency — attachments

Confirmed with the product owner as explicitly out of scope for this pass.
Bridge has no working attachment infrastructure anywhere (see the Bridge
doc's §5); the new claims routes reject an `attachments` payload with `400`
using the exact same `hasAttachmentPayload` check every existing support
route already uses. Evidence/photo upload for claims needs real Storage
infrastructure on the Bridge side first — not a GGX-only gap.

## 10. Operational dependency

`app_settings.claims_enabled` is `false` for `ggx` today — `POST
/customer/claims` fails closed with `409` (mapped to GGX's
`claims_disabled` result) until a platform_admin/cs_head flips it via
`set_claims_enabled('ggx', true)` in the target Supabase project. Required
before any live round trip; not a code gap on either side.

## 11. Validation performed

- `npm run typecheck` — clean.
- `npm run build` — clean; `dist/` scanned, confirmed no Bridge secret/
  `X-Corporate-Internal-Key` string anywhere in the built bundle.
- `npm test` — new `tests/api-claims.test.mjs` (11 cases: 401 on every
  route with no session; server-resolved identity always wins over a
  client-supplied one; the URL `claimId` always wins as `externalReference`
  even if the body tries to override it; reason-string mapping; attachment
  payload rejected before Bridge is ever called; `messages.ts` resolves the
  ticket id via a real claim-state read rather than trusting a client-
  supplied one; 404 propagation for an unknown/unlinked claim), esbuild-
  bundled against a real local fake Bridge HTTP server, same pattern as
  `tests/api-support-categories.test.mjs`. Full existing suite re-run
  alongside it for regressions from the `CLAIM_STATUS_META` label changes.
- Live round-trip against a real Bridge deployment was **not** run in this
  environment — no `QUADX_BRIDGE_URL`/`QUADX_BRIDGE_API_KEY` configured
  here, the same recurring constraint every prior HeyQ-integration session
  in this project's history has hit (see `docs/session_state.md`), and
  `claims_enabled` is off by default regardless (§10).

## 12. Follow-ups / unresolved dependencies

- **Attachments** (§9) — needs real Bridge-side Storage infrastructure.
- **`claims_enabled`** (§10) — an operator with Supabase access needs to
  flip it for `ggx` before any live filing works, in every environment this
  gets deployed to.
- **Claims list page live status** (§6) — currently a best-effort local
  cache sync, not a live per-row Bridge read; revisit only if this becomes
  a real product need (N+1 call cost today).
- Live end-to-end validation against a real, reachable QuadX Bridge
  deployment, exactly as flagged for every prior HeyQ-integration pass in
  this project.
