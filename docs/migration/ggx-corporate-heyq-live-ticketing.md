# GGX Corporate ⇄ QuadX Bridge / HeyQ Live Ticketing Integration

**Status:** COMPLETE  
**Integration Boundary:** `GGX Corporate ⇄ QuadX Bridge/API ⇄ HeyQ/Supabase`  
**Handoff File:** `docs/migration/ggx-corporate-heyq-live-ticketing.md`

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
