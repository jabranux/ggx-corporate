# OMS-Shaped Sample Order Data — Handoff

> Implementation notes for the OMS-patterned sample/mock order rework. Read
> this before touching transaction/order mock data again.

## What changed

The Transactions/order sample data was rebuilt so it is patterned after a real
OMS order payload (reference: a `GET /orders/:tracking_number`-style response,
file `N9QB-FKM1-D2ZC.json` supplied for this task) instead of a flat row with a
single current status. The **same 29 sample tracking numbers, recipients,
destinations, subaccounts, and rough COD scale** from the prior mock are kept
so existing links/screenshots/tests keep resolving to the same rows.

### New adapter boundary

```
data/omsOrders.ts (OMS-shaped mock)
        │  pure OMS field names/shape: tracking_number, status, events[],
        │  fees, breakdown, parcel, pickup/delivery/return_address,
        │  payment, seller_payment, service, consignor, consignee, items,
        │  tat, metadata{pricing_type, original_shipment,
        │  service_fees_payor, transaction_type, transaction_scenario}
        ▼
lib/omsOrderMapper.ts (normalizer)
        │  mapOmsOrderToTransaction(order, attribution) -> Transaction
        ▼
data/transactions.ts (Business+ order model, unchanged shape + 2 new
        │  optional fields)  — owns the one thing OMS has no concept of:
        │  account attribution (subaccount, batch, source), keyed by
        │  tracking number in the local `ATTRIBUTION` table.
        ▼
services/transactionService.ts (frontend facade, unchanged) → UI (unchanged)
```

Only `data/transactions.ts` and `services/transactionService.ts` import the
mapper/OMS data. No page/component imports `data/omsOrders.ts` directly —
UI code only ever sees `Transaction`. When a real OMS/BFF integration lands,
only `omsOrderMapper.ts`'s function bodies need to change.

### Files

- **New** `src/app/data/omsOrders.ts` — OMS-shaped types + a per-order spec
  table (29 entries) + an event-scenario generator, assembled into
  `omsOrders: OmsOrder[]`.
- **New** `src/app/lib/omsOrderMapper.ts` — `mapOmsOrderToTransaction()`.
- **Changed** `src/app/data/transactions.ts` — `rows`/`RowSeed`/`buildTimeline`/
  `reachedStage`/`STAGES`/the flat `sender`/`defaultItems`/`defaultFees` are
  gone. Replaced by a small `ATTRIBUTION: Record<string, OmsOrderAttribution>`
  table + `transactions = omsOrders.map(o => mapOmsOrderToTransaction(o,
  ATTRIBUTION[o.tracking_number]))`. `TransactionStatus` gained `'cancelled'`;
  `Transaction` gained two optional fields: `statusRemarks?: string`,
  `failureReason?: string`. Everything else (attribution model, label maps,
  `TransactionSummary`, `getTransactionByTracking`, etc.) is untouched.
- **Changed** `src/app/services/transactionService.ts` — the two hardcoded
  `byStatus` seed objects (`getDashboardStats`, `getBasicAnalytics`) gained
  `cancelled: 0`.
- **Changed** `src/app/data/onDemandDelivery.ts` — `deliveryStageFromStatus()`
  gained a `case 'cancelled'` (maps to `looking_for_driver`, same as
  `pending` — a cancelled OD delivery never got a driver). Required for the
  switch to stay exhaustive after adding the new status.
- **Changed** `src/app/pages/Transactions.tsx` — status filter dropdown gained
  a "Cancelled" option.
- **Changed** `src/app/pages/Dashboard.tsx` — the "Failed / Returned" KPI/rollup
  now also folds in `cancelled` (2 lines) so dashboard totals still sum to the
  full dataset.
- **Changed** `src/app/pages/TrackingPage.tsx` — added a `cancelled` entry to
  the public tracking status icon map (was falling back to the generic
  package icon; now shows the same alert icon as failed).
- **Changed** `src/app/pages/TransactionDetails.tsx` — one small additive
  line: when `transaction.failureReason` is present, it now renders as a
  small red subtitle under the header (e.g. "recipient unavailable"). This is
  the only UI layout change; everything else renders exactly as before,
  fed by richer underlying data.

## Why `'cancelled'` was added as a real status

The task asked for a "cancelled before pickup" scenario. The app already has
an unrelated, separate cancellation mechanism (`claimsService.cancelBooking`
/ `data/claims.ts` — a user-initiated, localStorage-backed overlay offered
only on `pending` transactions). That mechanism models "the Business+ user
cancelled this booking from the app" and was left completely alone.

What the OMS scenario needed is different: an order that OMS itself reports
as cancelled (e.g. sender cancelled with the courier before a rider was even
dispatched). The design system's `DeliveryStatusBadge`
(`src/design-system/data/deliveryStatus.ts`) already had a `cancelled` status
concept with its own badge variant — so `cancelled` was promoted into
`TransactionStatus` as a 7th coarse bucket, `variant: 'danger'`. Blast radius
was: 2 hardcoded `byStatus` object literals, 1 switch in
`onDemandDelivery.ts` (now exhaustive), 1 filter dropdown option, 1 dashboard
rollup. `claimsService`'s `isClaimEligible`/`isCancelEligible` needed **no**
change — neither list includes `'cancelled'`, so a cancelled-at-OMS order
correctly cannot be claimed or "cancelled" again from the app.

## Granular OMS status → coarse `TransactionStatus` mapping

| OMS status | Coarse bucket | Why |
|---|---|---|
| `pending`, `for_pickup`, `pickup_rider_found`, `out_for_pickup`, `pickup_failed` | `pending` | Nothing has been collected yet. `pickup_failed` is deliberately mapped here (not its own bucket) because in the sample data it is always a **transient, recovered** state — the last event afterward is a rescheduled `for_pickup`, never a resting `pickup_failed`. This keeps `isCancelEligible` (pending-only) correct for a sender who wants to cancel after a failed pickup attempt. |
| `picked_up`, `received_at_pickup_hub`, `for_transfer` | `picked-up` | Collected, still at/near the origin hub. |
| `in_transit`, `out_for_delivery` | `in-transit` | Moving through the network toward the recipient. |
| `delivered` | `delivered` | Terminal success. |
| `delivery_failed`, `for_return`, `out_for_return`, `return_in_transit` | `failed` | Delivery did not succeed and the parcel is now (or about to be) moving backward through the return pipeline. Chosen over `returned` because `returned` is reserved for the **terminal, completed** return; chosen over `in-transit` because these states should surface in claim-eligible / failure-visible UI (`isClaimEligible` already includes `'failed'`). |
| `returned` | `returned` | Terminal — parcel is back with the sender. |
| `cancelled` | `cancelled` | Terminal, non-success, distinct from a failed delivery attempt. |

## Scenario coverage (11 event-history generators in `omsOrders.ts`)

Each is a reusable step-list (`stepsFor()` in `omsOrders.ts`), not
hand-written per order, so the same vocabulary/shape extends consistently to
statuses the reference payload doesn't itself contain:

| Scenario key | Coarse status | What it represents | Orders using it |
|---|---|---|---|
| `plain_pending` | pending | Booked, awaiting rider assignment (1 event) | 89237 |
| `pickup_failed_rescheduled` | pending | Rider dispatched, pickup failed, rescheduled next day (recovered) | 90010 |
| `cancelled_before_pickup` | cancelled | Sender cancelled before any rider activity | 90019 |
| `picked_up_shallow` / `picked_up_at_hub` / `picked_up_for_transfer` | picked-up | Collected; 3 depths (just picked up → at hub → ready for transfer) for texture | 90001, 89232, 89238, 90002 |
| `in_transit_exchange` / `in_transit_forwarded` | in-transit | Mid-network, 2 depths | 90009, 89239, 90021, 90004, 89233, 90003* |
| `delivered_first_attempt` | delivered | Full reference-style PUD chain, delivered on the first attempt (~10 events, mirrors the supplied sample almost verbatim) | 90020, 90018, 89240, 89234, 89228 |
| `delivered_after_retry` | delivered | Same chain, but the first delivery attempt fails (with a `failure_reason`) and a next-day reattempt succeeds | 90007, 89235, 89226 |
| `failed_for_return` | failed | Two failed delivery attempts → marked `for_return` (current state) | 90008, 89236 |
| `failed_out_for_return` | failed | `failed_for_return` chain + a rider dispatched to collect the parcel (current state) | 90006, 89230 |
| `failed_return_in_transit` | failed | `failed_out_for_return` chain + parcel moving back through the network (current state) | 90003, 89227 |
| `returned_terminal` | returned | Full chain through to `returned` (terminal) | 90005, 89231, 89229 |

\* `90003` actually uses `failed_return_in_transit`, not `in_transit_*` —
listed once, see the table above.

`status`, `status_id`, `status_remarks`, and `failure_reason` at the order
(top) level are **always derived from the last event** in `buildOmsOrder()`
(`omsOrders.ts`), and `tat` is built generically from the first-occurrence
timestamp of every status that actually appears in `events` — so these fields
cannot drift out of sync with the event history by construction.

## Deliberate field trimming (vs. the reference payload)

Per the task's "don't mock every field" instruction, the following
reference-payload fields were **not** carried into `OmsOrder` because
Business+ has no current or foreseeable use for them: `ip_address`,
`preferred_delivery_time`, `own_print`, `agent` (top-level — duplicate of the
last event's agent), `activities`, `pickup_total`, `pickup_attempts`,
`dropoff_address`, `partner_courier`, `hubs` (top-level summary — duplicate of
per-event `hubs`), `parent`/`parent_id`, `channel`, `rebooking`, top-level
`remarks` (duplicate of `status_remarks`), `metadata.jobData_otp`,
`metadata.events` (a redundant, oddly-shaped duplicate of the real `events`
array), `metadata.original_fees` (duplicate of `fees.shipping_fee`),
`fees.commission_fee`/`fees.adjustment` (always null in the reference, no
consumer). `consignor.payment_terms`/`payment_option` and
`metadata.transaction_scenario` are kept and populated with real variation
(contract/payment-term realism) even though nothing renders them yet — they
exist purely so a future backend swap doesn't need a shape change.

## Known simplifications / assumptions (documented, not silently guessed)

- **Timestamps are UTC (`+0000`) throughout**, not corrected to Philippine
  local time. The reference payload itself is inconsistent about this
  (`pickup_at` in `+0000`, `estimated_delivery_date` in `+08`). Internal
  consistency (chronological order, event-to-status-to-tat agreement) was
  prioritized over timezone accuracy, since nothing in the UI parses the
  timezone offset.
- **New `status_id` values were invented** for statuses absent from the
  reference (`for_pickup`=1000, `pickup_failed`=1450, `delivery_failed`=1550,
  `for_return`=2600, `out_for_return`=2700, `return_in_transit`=2800,
  `returned`=2850, `cancelled`=9000). Reference-documented ids were reused
  where the status matches (`picked_up`=1400, `out_for_delivery`=1501,
  `for_transfer`=2400, `delivered`=2200, `received_at_pickup_hub`=2900,
  `out_for_pickup`=5300, `pickup_rider_found`=5600). All plain `in_transit`
  legs were simplified to a single id (`1601`) instead of the reference's
  mixed `1600`/`1601`.
- **`transaction_scenario` is always `"PUD"`** (pickup-up-delivery) — the
  reference's only example. No dropoff-based (`DOD`) scenario was invented
  since `dropoff_address` was trimmed (see above).
- **Grand totals/COD amounts are recomputed**, not copied from the old flat
  mock's `codAmount` values. Each order's product subtotal is derived from
  the old COD figure (≈92% of it) and then fees/insurance/discount are added
  back on top, so grand totals are internally consistent
  (subtotal+shipping+insurance+fee-discount) rather than exactly matching the
  prior arbitrary numbers. They stay in the same order of magnitude.
- **Postal codes/xcodes/regions** in `CITY_INFO` (`omsOrders.ts`) are
  plausible real-world values for the cities used, not verified against an
  authoritative PH postal directory — nothing in the UI renders them
  field-by-field today.
- **`paidBy` on the Business+ `payment` object is now driven directly by
  `metadata.service_fees_payor`** (`seller` → "Sender", otherwise
  "Recipient"), regardless of COD vs. prepaid. This is a small, intentional
  behavior change from the old mock (which always said "Recipient") — it's
  what makes the buyer-paid/seller-paid variation requirement actually
  visible on the Payment Method card.

## Variation delivered (dataset-wide, see `omsOrders.ts` spec table)

COD (22) vs. non-COD (7: prepaid/wallet/bank_transfer) · `service_fees_payor`
buyer (14) vs. seller (15) · 7 shipment types (pouch/box/document, 3 sizes
each) · 3 pricing types (basic/discounted/contract, derived from
service+COD scale, not random) · 3 OMS services (`next_day`/`same_day`/
`instant` → Standard/Same-Day/On-Demand) · 2 consignor profiles with distinct
`payment_terms`/`payment_option` (Acme Corporation: postpaid/wallet; Acme
Luzon: prepaid/net-off, matching the reference exactly) · insured (22) vs.
uninsured (7) · all 7 coarse statuses represented, plus all 11 event
scenarios above.

## Compatibility check performed

- `npm run typecheck` — clean.
- `npm run build` — clean (production Vite build).
- `npm test` — 70/70 (Node test runner + Playwright-driven DOM tests,
  including the journey-mode suite that reads live transaction data).
- Manually inspected mapped output via `tsx` for several orders across
  scenarios: confirmed no `NaN` fees anywhere in the 29-order set, timelines
  render newest-first and are chronologically descending, and the
  `for_return`/`cancelled`/`pickup_failed_rescheduled` orders show
  internally-consistent status/remarks/failure_reason/events.
- Dashboard, Transactions list/filters, Transaction Details (fees, payment,
  packaging, tracking timeline, claims/cancel eligibility), and the public
  `/track` page all read through the unchanged `Transaction`/
  `TransactionSummary` shape — no page needed a structural change beyond the
  additive items listed above.

## Not done / explicitly out of scope

- No real OMS/BFF network call was introduced — this is still 100% local
  mock data, per the roadmap's "swap mock services for real integration only
  as the final production stage" rule.
- `data/earnings.ts` (Earnings/Settlements) and `data/claims.ts` keep their
  own independent sample tracking-number rows; they were not restructured to
  pull from `omsOrders` — that's a different feature domain and out of scope
  for this task.
- No new UI screens or layout changes beyond the one-line failure-reason
  subtitle on Transaction Details.
