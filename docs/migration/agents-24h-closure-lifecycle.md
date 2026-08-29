# 24-hour ticket reopen window / permanent closure — GGX Corporate side

Companion to `HeyQ/docs/handoffs/agents-visibility-and-24h-closure.md`, which covers the QuadX Bridge side (agent visibility fix, Users→Agents rename, quick filters, the migration/RPC changes). This doc covers only the GGX Corporate customer-facing changes for the same 24-hour reopen window / permanent closure feature.

## What changed

- `src/app/services/heyqService.ts`:
  - `HeyQResult<T>` gained a `'closed'` variant — Bridge's deterministic rejection for a reply on a permanently-closed ticket (HTTP 409, `resultForStatus` in `heyqCustomerApi.ts`).
  - `CustomerTicket` gained an optional `closedAt` field (mapped through from Bridge's projection).
  - New `isPermanentlyClosed(ticket)`: `status === 'closed'` is always definitive; for `status === 'resolved'`, the server-computed `canReopen === true` (computed fresh on every read, from Bridge's own clock) overrides a "closed" read from this device's own clock — this only ever makes the function return `false` when it might otherwise say `true`, never the reverse, so it can't reintroduce the security concern below. Only when `canReopen` is falsy AND `resolvedAt` is present does it fall through to a `resolvedAt + 24h` client-clock computation.
- `src/app/hooks/useTicketConversation.ts`:
  - `submit()` now resyncs the ticket from the server (`getTicketById`) whenever a reply comes back with `status: 'closed'` — the UI never trusts its own stale belief once the server has explicitly disagreed.
  - `PendingMessage` gained a `closed?: boolean` flag so the UI can show a specific message and skip Retry for a permanent-closure rejection.
  - New one-shot `useEffect` (search "One-shot reopen-window-expiry refetch"): schedules exactly one `setTimeout`, timed to a resolved-and-reopenable ticket's own 24h deadline, that performs a single refetch — see "Design rationale" below.
- `src/app/pages/SupportTicketDetail.tsx`: shows a "This ticket is closed" banner + "Create a new ticket" CTA (reusing the existing `ReportIssueDrawer`) in place of the reply composer once `isPermanentlyClosed` is true; the pending-message bubble shows "Not sent — this ticket is closed." with Dismiss only (no Retry) for a closed rejection.
- `src/app/components/ReportIssueDrawer.tsx`: its shared `FAILURE_MESSAGE` map (typed over the same `HeyQResult` union) gained a `closed` entry — not a real outcome of ticket *creation*, kept generic.
- `src/app/services/ticketsService.ts`: re-exports `isPermanentlyClosed`.

## Design rationale: client-side closure signal, and why it changed twice

The task requires the UI to hide the composer once permanently closed, without waiting on the server's 5-minute closure cron, while never treating client-side state as authoritative (Bridge's `ticket_reply_window_closed` is the sole enforcement — see the Bridge-side handoff).

1. **First attempt**: compute purely from `resolvedAt + 24h` against the device's own clock. Correct and caused zero regressions, but Codex's first audit flagged that a customer's clock running even slightly ahead of the boundary could hide the composer for a ticket Bridge would still accept a reply on — a false positive with no way to self-correct (a hidden composer can never be submitted, so the resync-on-409 path never runs).
2. **Second attempt**: trust the server-computed `canReopen` field alone (ignore `resolvedAt` client-side entirely) — `canReopen` is derived from the exact same 24h rule but computed server-side on every read, so it can't be fooled by device clock skew. This fixed the clock-skew concern but broke several **pre-existing** Playwright fixtures across the suite (`tests/heyq-typing.test.mjs`, `tests/heyq-lifecycle.test.mjs`) that hardcode `canReopen: false` on `resolved`-status tickets for reasons unrelated to this feature — before this change, the field was documented as "read but not wired to any UI action," so its value was never meaningful for display. Caught by running the full test suite (172 tests) after the change; 4 pre-existing tests failed.
3. **Final version** (current): combine both — `canReopen === true` short-circuits to "not closed" (the one direction that matters: never wrongly hide a still-available composer), but `canReopen` being falsy or absent is *not* on its own treated as proof of closure; only an elapsed `resolvedAt` is. This restored 100% pass on the full suite while still closing the original clock-skew gap in the one direction it mattered.
4. **Residual gap, closed**: Codex's second audit pass noted that because a resolved ticket gets no recurring poll, a tab left open past the real deadline could keep showing the composer indefinitely (not a security issue — Bridge still rejects and the UI resyncs on the next reply attempt — but a UX delay). Closed with the one-shot `setTimeout` described above: it fires exactly once, at the ticket's own computed deadline, then does nothing further — it is not a recurring poll and does not affect the "a resolved ticket does not continuously poll" test guarantees (verified: existing fixtures without `resolvedAt` schedule nothing at all).

## Tests

New: `tests/heyq-ticket-closure.test.mjs` (3 Playwright tests, real Chromium against the real dev server, fetch-stubbed):
1. Reply within the 24h window still reopens the ticket; composer stays available.
2. A ticket whose window has elapsed (`canReopen: false`, `resolvedAt` 25h old) renders read-only: no composer, no Send Reply, a "Create a new ticket" CTA, and prior history stays visible.
3. A stale client whose local view still looks reopenable gets Bridge's 409/`closed` rejection on send, shows "Not sent — this ticket is closed." with Dismiss only (no Retry), and resyncs to the server's authoritative closed state.

Added to `package.json`'s `test` script. Full suite: 172/172 passing (includes these 3 plus the 3 pre-existing tests that had regressed and were fixed by the final `isPermanentlyClosed` version, confirmed re-passing). `npm run typecheck` clean. No lint script in this repo (relies on `tsc` + the Playwright/node-test suite).

## Codex audit (final verdict for this repo's portion)

Three rounds, `codex exec -s read-only -C <Projects dir>` against both repos' uncommitted diff together (see the Bridge-side handoff for the two Bridge-side findings from round 1).

- **Round 1**: should-fix — client-clock-only closure computation ignored the server's `canReopen`. Addressed (see "Design rationale" step 2/3 above).
- **Round 2** (re-audit of round-1 fixes): PASS on the Bridge-side fixes; one remaining should-fix on this repo — the composer could stay visible past the real deadline on a long-open tab (UX delay, not security). Addressed with the one-shot timer (step 4 above).
- **Round 3** (re-audit of the one-shot timer specifically): **PASS, no new findings** — confirmed the timer fires once, cleans up correctly on unmount/id-change, doesn't leak stale closures, and doesn't reintroduce a polling loop; confirmed existing "no continuous poll" and the new closure-test expectations remain compatible.

**Final verdict: PASS.**
