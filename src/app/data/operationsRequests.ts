/**
 * Ops Request domain types.
 *
 * These are logistics execution requests sent by corporate users to the GGX
 * Operations team — supply replenishment, pickup coordination, and operational
 * assistance. They are NOT issue reports (see Support Tickets for that).
 *
 * Backed by QuadX Bridge's real Ops Request POC (`src/app/services/opsRequestsService.ts`
 * calls `/api/ops-requests/*`, the BFF proxy to Bridge's `/customer/ops-requests/*`).
 * This file holds ONLY the shared domain types — no mock data/store lives here
 * anymore (see git history for the pre-integration in-memory version).
 *
 * `status` mirrors Bridge's settled lifecycle exactly (Submitted -> In Review
 * -> In Progress -> Completed, with Rejected terminal from In Review) — Bridge
 * owns request status; GGX's presentation is not a separate vocabulary. Bridge's
 * internal Sales/AM intervention flag during In Review is deliberately never
 * surfaced here — GGX Biz+ continues to show such a request simply as "In Review".
 */

export type OpsRequestCategory = 'supply' | 'pickup_support' | 'operational_assistance';

export type OpsRequestStatus = 'submitted' | 'in_review' | 'in_progress' | 'completed' | 'rejected';

export type SupplyType = 'pouches' | 'boxes' | 'other_packaging';
export type PickupSupportType =
  | 'immediate_pickup'
  | 'bulk_pickup_assistance'
  | 'four_wheel_pickup'
  | 'reschedule_pickup'
  | 'escalate_missed_pickup';
export type OperationalAssistanceType =
  | 'special_handling'
  | 'high_volume_dispatch'
  | 'warehouse_coordination';

export interface OperationsRequest {
  id: string;
  category: OpsRequestCategory;
  subaccountId: string;
  subaccountName: string;
  status: OpsRequestStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;

  // Supply request fields
  supplyType?: SupplyType;
  quantity?: number;
  deliveryAddress?: string;
  neededByDate?: string;

  // Pickup support fields
  pickupSupportType?: PickupSupportType;
  relatedBatchId?: string;
  pickupAddress?: string;
  estimatedShipmentCount?: number;
  estimatedWeight?: string;
  preferredPickupWindow?: string;

  // Operational assistance fields
  assistanceType?: OperationalAssistanceType;
}

/** One client-visible history entry (Bridge `GET /customer/ops-requests/:id/updates`). */
export interface OpsRequestUpdate {
  type: string;
  summary: string;
  occurredAt: string;
}
