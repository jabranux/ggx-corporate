/**
 * Operations Requests service facade.
 *
 * Backed by QuadX Bridge's real Ops Request POC via GGX Corporate's own
 * same-origin proxy (`/api/ops-requests/*`, implemented under
 * `api/ops-requests/**` at the repo root — see `api/_lib/bridge.ts`), never
 * directly to QuadX Bridge. Same boundary and server-verified-identity rule
 * every other proxy uses (`heyqCustomerApi.ts`, `claimBridgeService.ts`) —
 * this module states no identity of its own.
 *
 * GGX's own category/subtype keys, labels, and category-specific form
 * fields are preserved unchanged (see `../data/operationsRequests.ts`) — the
 * BFF translates them to Bridge's canonical keys at the write boundary.
 * `status` is Bridge's own settled lifecycle vocabulary end to end (no local
 * relabeling): Bridge owns request status.
 *
 * Scoping rules enforced here (not in UI):
 *   - Admin on Main Account: sees all subaccounts.
 *   - Admin viewing a subaccount / Manager: scoped to their subaccountId.
 * Bridge has no subaccount concept of its own (single demo account per the
 * task's own decision) — subaccountId/subaccountName travel inside Bridge's
 * opaque `requestData` JSON and this scoping filter stays entirely
 * client-side, same as it always has.
 */

import {
  type OperationsRequest,
  type OpsRequestCategory,
  type OpsRequestStatus,
  type OpsRequestUpdate,
  type SupplyType,
  type PickupSupportType,
  type OperationalAssistanceType,
} from '../data/operationsRequests';
import { IconBox, IconTruck, IconAdjustments } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { SESSION_EXPIRED_EVENT } from './heyqCustomerApi';

export type {
  OperationsRequest,
  OpsRequestCategory,
  OpsRequestStatus,
  OpsRequestUpdate,
  SupplyType,
  PickupSupportType,
  OperationalAssistanceType,
};

const OPS_REQUESTS_PROXY_BASE = '/api/ops-requests';

// ─── presentation meta ───────────────────────────────────────────────────────

export const CATEGORY_META: Record<OpsRequestCategory, {
  label: string;
  icon: ComponentType<{ className?: string }>;
  bgClass: string;
  iconClass: string;
  badge: 'info' | 'warning' | 'default';
}> = {
  supply: {
    label: 'Supply Request',
    icon: IconBox,
    bgClass: 'bg-violet-50',
    iconClass: 'text-violet-600',
    badge: 'info',
  },
  pickup_support: {
    label: 'Pickup Support',
    icon: IconTruck,
    bgClass: 'bg-blue-50',
    iconClass: 'text-blue-600',
    badge: 'info',
  },
  operational_assistance: {
    label: 'Operational Assistance',
    icon: IconAdjustments,
    bgClass: 'bg-amber-50',
    iconClass: 'text-amber-600',
    badge: 'warning',
  },
};

// Bridge's settled Ops Request lifecycle (Submitted -> In Review -> In
// Progress -> Completed, Rejected terminal from In Review). Bridge's
// internal Sales/AM intervention flag during In Review is never a separate
// status here — such a request still shows simply "In Review".
export const STATUS_META: Record<OpsRequestStatus, {
  label: string;
  variant: 'default' | 'info' | 'warning' | 'success' | 'danger';
}> = {
  submitted:   { label: 'Submitted',   variant: 'default' },
  in_review:   { label: 'In Review',   variant: 'warning' },
  in_progress: { label: 'In Progress', variant: 'info' },
  completed:   { label: 'Completed',   variant: 'success' },
  rejected:    { label: 'Rejected',    variant: 'danger' },
};

export const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  pouches: 'Pouches',
  boxes: 'Boxes',
  other_packaging: 'Other Packaging',
};

export const PICKUP_SUPPORT_LABELS: Record<PickupSupportType, string> = {
  immediate_pickup: 'Immediate Pickup',
  bulk_pickup_assistance: 'Bulk Pickup Assistance',
  four_wheel_pickup: '4-Wheel Pickup (vs 2-Wheel First-Mile)',
  reschedule_pickup: 'Reschedule Pickup',
  escalate_missed_pickup: 'Escalate Missed Pickup',
};

export const ASSISTANCE_TYPE_LABELS: Record<OperationalAssistanceType, string> = {
  special_handling: 'Special Handling',
  high_volume_dispatch: 'High-Volume Dispatch Coordination',
  warehouse_coordination: 'Warehouse / Branch Coordination',
};

// ─── HTTP client ──────────────────────────────────────────────────────────────

type FetchResult =
  | { ok: true; data: unknown }
  | { ok: false; result: 'forbidden' | 'not_found' | 'unavailable' };

function resultForStatus(status: number): 'forbidden' | 'not_found' | 'unavailable' {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return 'unavailable';
}

function notifySessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function getJson(path: string): Promise<FetchResult> {
  try {
    const res = await fetch(`${OPS_REQUESTS_PROXY_BASE}${path}`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 401) notifySessionExpired();
      return { ok: false, result: resultForStatus(res.status) };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, result: 'unavailable' };
  }
}

async function postJson(path: string, body: unknown, headers: Record<string, string>): Promise<FetchResult> {
  try {
    const res = await fetch(`${OPS_REQUESTS_PROXY_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
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

// ─── Bridge <-> GGX mapping ───────────────────────────────────────────────────

// Bridge's OPS_REQUEST_CATALOG category keys -> GGX's own category keys
// (one-way, display-key <- canonical-Bridge-key; the reverse map lives
// server-side in api/_lib/bridge.ts for writes). GGX's category-specific
// fields all travel inside Bridge's opaque `requestData` JSON, so no subtype
// reverse-mapping is needed for reads — `requestData` already carries GGX's
// own field values verbatim.
const CATEGORY_FROM_BRIDGE: Record<string, OpsRequestCategory> = {
  supply_request: 'supply',
  pickup_support: 'pickup_support',
  operational_assistance: 'operational_assistance',
};

const BRIDGE_STATUSES: OpsRequestStatus[] = ['submitted', 'in_review', 'in_progress', 'completed', 'rejected'];

interface RawOpsRequest {
  id?: string;
  requestNumber?: string;
  status?: string;
  category?: string;
  requestData?: Record<string, unknown>;
  clientNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Build the OperationsRequest by an explicit allowlist — never spread the
 * raw response (same discipline `claimBridgeService.ts`'s `toClaimBridgeState`
 * uses). `requestData` is Bridge's opaque passthrough of whatever this
 * service sent at submit time — GGX's own category-specific fields (plus
 * subaccountId/subaccountName/createdBy) round-trip through it unchanged. */
function toOperationsRequest(raw: RawOpsRequest): OperationsRequest | null {
  if (!raw || typeof raw !== 'object' || !raw.requestNumber) return null;
  const rd = (raw.requestData && typeof raw.requestData === 'object') ? raw.requestData : {};
  const status = BRIDGE_STATUSES.includes(raw.status as OpsRequestStatus) ? (raw.status as OpsRequestStatus) : 'submitted';
  const category = (raw.category && CATEGORY_FROM_BRIDGE[raw.category]) || 'operational_assistance';

  const str = (key: string): string | undefined => (typeof rd[key] === 'string' ? (rd[key] as string) : undefined);
  const num = (key: string): number | undefined => (typeof rd[key] === 'number' ? (rd[key] as number) : undefined);

  return {
    id: raw.requestNumber,
    category,
    subaccountId: str('subaccountId') ?? 'main',
    subaccountName: str('subaccountName') ?? 'Main Account',
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 10) : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 10) : '',
    createdBy: str('createdBy') ?? 'GGX Biz+ User',
    notes: typeof raw.clientNotes === 'string' ? raw.clientNotes : str('notes'),
    supplyType: str('supplyType') as SupplyType | undefined,
    quantity: num('quantity'),
    deliveryAddress: str('deliveryAddress'),
    neededByDate: str('neededByDate'),
    pickupSupportType: str('pickupSupportType') as PickupSupportType | undefined,
    relatedBatchId: str('relatedBatchId'),
    pickupAddress: str('pickupAddress'),
    estimatedShipmentCount: num('estimatedShipmentCount'),
    estimatedWeight: str('estimatedWeight'),
    preferredPickupWindow: str('preferredPickupWindow'),
    assistanceType: str('assistanceType') as OperationalAssistanceType | undefined,
  };
}

// ─── service functions ────────────────────────────────────────────────────────

export interface OpsRequestFilters {
  subaccountId?: string;
  category?: OpsRequestCategory | 'all';
  status?: OpsRequestStatus | 'all';
}

/** Thrown by `getOpsRequests` when the list genuinely could not be loaded
 * (session expired, Bridge unreachable, malformed response) — distinct from
 * a real empty result, so the UI can show a retryable failure state instead
 * of silently rendering "No operations requests" (Codex review finding). */
export class OpsRequestsUnavailableError extends Error {
  constructor() { super('Operations Requests could not be loaded.'); }
}

/** Return operations requests, optionally filtered by subaccount, category, and status.
 * Throws `OpsRequestsUnavailableError` on failure — never silently returns []. */
export async function getOpsRequests(filters?: OpsRequestFilters): Promise<OperationsRequest[]> {
  const res = await getJson('');
  if (!res.ok || !Array.isArray(res.data)) throw new OpsRequestsUnavailableError();
  let result = res.data.map(toOperationsRequest).filter((r): r is OperationsRequest => r !== null);

  const { subaccountId, category, status } = filters ?? {};
  if (subaccountId && subaccountId !== 'all' && subaccountId !== 'main') {
    result = result.filter((r) => r.subaccountId === subaccountId);
  }
  if (category && category !== 'all') {
    result = result.filter((r) => r.category === category);
  }
  if (status && status !== 'all') {
    result = result.filter((r) => r.status === status);
  }
  return result;
}

/** Return a single operations request by ID (GGX/Bridge request number, e.g. OPR-2026-0001). */
export async function getOpsRequestById(id: string): Promise<OperationsRequest | null> {
  const res = await getJson(`/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return toOperationsRequest(res.data as RawOpsRequest);
}

/** Return the client-visible update/history timeline for one Ops Request. */
export async function getOpsRequestUpdates(id: string): Promise<OpsRequestUpdate[]> {
  const res = await getJson(`/${encodeURIComponent(id)}/updates`);
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data
    .filter((u): u is { type: unknown; summary: unknown; occurredAt: unknown } => !!u && typeof u === 'object')
    .map((u) => ({
      type: typeof u.type === 'string' ? u.type : 'update',
      summary: typeof u.summary === 'string' ? u.summary : '',
      occurredAt: typeof u.occurredAt === 'string' ? u.occurredAt : '',
    }));
}

export type NewOpsRequest = Omit<OperationsRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

/** Submit a new operations request. Returns the created record (status: submitted).
 * Idempotent via `idempotencyKey` — GGX has no backend DB of its own to
 * remember "did this already send". The CALLER owns this key's lifetime
 * (mint once per attempted request, e.g. via `useRef`, and reuse it across
 * retries of the SAME logical submission): if Bridge accepted a create but
 * the response was lost, retrying with a fresh key would create a second
 * real Ops Request, not just re-fetch the first (Codex review finding).
 * Only mint a new key once this call actually succeeds or the user starts a
 * genuinely new request. Defaults to a fresh UUID for callers that don't
 * need retry-safety (there are none in this codebase yet). */
export async function submitOpsRequest(req: NewOpsRequest, idempotencyKey: string = crypto.randomUUID()): Promise<OperationsRequest | null> {
  const {
    category, subaccountId, subaccountName, createdBy, notes,
    supplyType, quantity, deliveryAddress, neededByDate,
    pickupSupportType, relatedBatchId, pickupAddress,
    estimatedShipmentCount, estimatedWeight, preferredPickupWindow,
    assistanceType,
  } = req;

  const subtype =
    category === 'supply' ? supplyType :
    category === 'pickup_support' ? pickupSupportType :
    assistanceType;

  const res = await postJson(
    '',
    {
      category,
      subtype,
      accountName: subaccountName,
      requestedByName: createdBy,
      clientNotes: notes,
      requestData: {
        subaccountId, subaccountName, createdBy, notes,
        supplyType, quantity, deliveryAddress, neededByDate,
        pickupSupportType, relatedBatchId, pickupAddress,
        estimatedShipmentCount, estimatedWeight, preferredPickupWindow,
        assistanceType,
      },
    },
    { 'Idempotency-Key': idempotencyKey },
  );
  if (!res.ok) return null;
  return toOperationsRequest(res.data as RawOpsRequest);
}
