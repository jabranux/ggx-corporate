/**
 * claimBridgeService — the HTTP client behind ClaimDetail's "Claim Updates &
 * Messages" section.
 *
 * Claim reads/writes go through GGX Corporate's OWN same-origin claims proxy
 * (`/api/claims/*`, implemented under `api/claims/**` at the repo root — see
 * `api/_lib/bridge.ts`), never directly to QuadX Bridge. Same boundary and
 * same server-verified-identity rule the support ticket proxy already uses
 * (`heyqCustomerApi.ts`) — this module states no identity of its own.
 *
 * `claimId` throughout is GGX's OWN customer-facing claim reference (e.g.
 * `CLM-1008`, `src/app/data/claims.ts`) — never a Bridge-internal id, which
 * is never surfaced here. The same id is always sent as the idempotency key
 * for linking, so calling `ensureClaimLinked` repeatedly (right after
 * filing, or lazily whenever an existing/legacy claim's details page is
 * opened) never creates a duplicate Bridge claim or ticket.
 *
 * Full architecture:
 * docs/migration/ggx-corporate-quadx-bridge-claims-integration.md.
 *
 * Attachments are NOT sent — same text-only Bridge contract the support
 * ticket path already has; see that module's docblock for why.
 */
import { SESSION_EXPIRED_EVENT } from './heyqCustomerApi';

const CLAIMS_PROXY_BASE = '/api/claims';

export interface ClaimTimelineEvent {
  type: string;
  summary: string;
  occurredAt: string;
}

export interface ClaimBridgeMessage {
  id: string;
  from: 'you' | 'support' | 'system';
  authorLabel: string;
  body: string;
  createdAt: string;
}

// Bridge's canonical 6-value claim status vocabulary (public.claims.status,
// QuadX Bridge repo). Was 'pending_approval' | 'approved' | 'rejected' |
// 'on_hold' | 'processed' — Bridge later added an explicit 'processing'
// state (Approved -> Processing -> Settled, Finance must start processing
// before settling) and renamed the terminal state from 'processed' to
// 'settled' (see that repo's 20260918090000_claims_finance_processing_and_settle.sql).
// Bridge's GET /customer/claims/:reference passes claims.status straight
// through with no server-side relabeling ("the caller — GGX BFF — owns
// display mapping", per that route's own comment) — this union and
// mapBridgeStatusToLocal below are that one required mapping point.
export type BridgeClaimStatus = 'pending_approval' | 'approved' | 'processing' | 'on_hold' | 'rejected' | 'settled';

export interface ClaimBridgeState {
  status: BridgeClaimStatus;
  reason: string;
  trackingNumber?: string;
  filedAt: string;
  ticket: { id: string; status: string; customerVisible: boolean };
  timelineEvents: ClaimTimelineEvent[];
  messages: ClaimBridgeMessage[];
}

export type ClaimBridgeResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  /** Claims are not enabled for this account yet (Bridge's `claims_enabled`
   * product toggle is off) — a distinct, deterministic outcome (HTTP 409),
   * not a generic failure, so the UI can say so specifically. */
  | { status: 'claims_disabled' };

function resultForStatus(status: number): 'forbidden' | 'not_found' | 'unavailable' | 'claims_disabled' {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'claims_disabled';
  return 'unavailable';
}

function notifySessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function getJson(path: string): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' | 'claims_disabled' }
> {
  try {
    const res = await fetch(`${CLAIMS_PROXY_BASE}${path}`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 401) notifySessionExpired();
      return { ok: false, result: resultForStatus(res.status) };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

async function postJson(path: string, body: unknown): Promise<
  { ok: true; data: unknown } | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' | 'claims_disabled' }
> {
  try {
    const res = await fetch(`${CLAIMS_PROXY_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 401) notifySessionExpired();
      return { ok: false, result: resultForStatus(res.status) };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

interface RawClaimState {
  status?: string;
  reason?: string;
  trackingNumber?: string;
  filedAt?: string;
  ticket?: { id?: string; status?: string; customerVisible?: boolean };
  timelineEvents?: { type?: string; summary?: string; occurredAt?: string }[];
  messages?: { id?: string; from?: string; authorLabel?: string; body?: string; createdAt?: string }[];
}

const BRIDGE_STATUSES: BridgeClaimStatus[] = ['pending_approval', 'approved', 'processing', 'on_hold', 'rejected', 'settled'];

/** Build the state by an explicit allowlist — never spread the raw response
 * (same discipline `heyqCustomerApi.ts`'s `toCustomerTicket` uses). */
function toClaimBridgeState(raw: RawClaimState): ClaimBridgeState | null {
  if (!raw || typeof raw !== 'object' || !raw.ticket?.id) return null;
  const status = BRIDGE_STATUSES.includes(raw.status as BridgeClaimStatus) ? (raw.status as BridgeClaimStatus) : 'pending_approval';
  return {
    status,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    trackingNumber: typeof raw.trackingNumber === 'string' ? raw.trackingNumber : undefined,
    filedAt: typeof raw.filedAt === 'string' ? raw.filedAt : '',
    ticket: {
      id: raw.ticket.id,
      status: typeof raw.ticket.status === 'string' ? raw.ticket.status : 'open',
      customerVisible: raw.ticket.customerVisible !== false,
    },
    timelineEvents: (raw.timelineEvents ?? [])
      .filter((e): e is { type: string; summary: string; occurredAt: string } => typeof e?.type === 'string' && typeof e?.summary === 'string' && typeof e?.occurredAt === 'string')
      .map((e) => ({ type: e.type, summary: e.summary, occurredAt: e.occurredAt })),
    messages: (raw.messages ?? [])
      .filter((m): m is { id: string; from: string; authorLabel: string; body: string; createdAt: string } =>
        typeof m?.id === 'string' && typeof m?.body === 'string' && typeof m?.createdAt === 'string')
      .map((m) => ({
        id: m.id,
        from: m.from === 'you' || m.from === 'system' ? m.from : 'support',
        authorLabel: typeof m.authorLabel === 'string' ? m.authorLabel : '',
        body: m.body,
        createdAt: m.createdAt,
      })),
  };
}

export interface EnsureClaimLinkedInput {
  reason: string;
  trackingNumber: string;
  details?: string;
}

/**
 * Idempotently file-or-link `claimId` with QuadX Bridge and return its
 * current public state in one round trip. Safe to call every time
 * `ClaimDetail.tsx` mounts — a claim already linked simply gets re-read, no
 * duplicate is ever created (Bridge keys off `claimId` itself, see the
 * module docblock).
 */
export async function ensureClaimLinked(claimId: string, input: EnsureClaimLinkedInput): Promise<ClaimBridgeResult<ClaimBridgeState>> {
  const res = await postJson(`/${encodeURIComponent(claimId)}/sync`, input);
  if (!res.ok) return { status: res.result };
  const state = toClaimBridgeState(res.data as RawClaimState);
  if (!state) return { status: 'unavailable' };
  return { status: 'ok', data: state };
}

/** Re-read a claim already known to be linked (the poll/refresh path). */
export async function getClaimBridgeState(claimId: string): Promise<ClaimBridgeResult<ClaimBridgeState>> {
  const res = await getJson(`/${encodeURIComponent(claimId)}/state`);
  if (!res.ok) return { status: res.result };
  const state = toClaimBridgeState(res.data as RawClaimState);
  if (!state) return { status: 'unavailable' };
  return { status: 'ok', data: state };
}

/** Post a customer reply, then return the freshly re-read state (same
 * re-read-after-write pattern `apiReplyToMyTicket` uses for tickets). */
export async function replyToClaim(claimId: string, body: string): Promise<ClaimBridgeResult<ClaimBridgeState>> {
  const posted = await postJson(`/${encodeURIComponent(claimId)}/messages`, { body, messageId: crypto.randomUUID() });
  if (!posted.ok) return { status: posted.result };
  return getClaimBridgeState(claimId);
}

/** Map Bridge's 6-value claim status to GGX's `ClaimStatus` for display + the
 * local write-through cache (`claimsService.syncLocalClaimStatus`) — a 1:1
 * rename, never collapsed: GGX shows Bridge's actual status (Pending
 * Approval / Approved / Processing / On Hold / Rejected / Settled), Bridge
 * stays the source of truth. There is no `For Finance Review` (or any other
 * obsolete) status anywhere in this mapping. */
export function mapBridgeStatusToLocal(status: BridgeClaimStatus): 'open' | 'in-review' | 'approved' | 'processing' | 'on_hold' | 'denied' | 'settled' {
  switch (status) {
    case 'pending_approval': return 'in-review';
    case 'approved': return 'approved';
    case 'processing': return 'processing';
    case 'on_hold': return 'on_hold';
    case 'rejected': return 'denied';
    case 'settled': return 'settled';
    default: return 'in-review';
  }
}
