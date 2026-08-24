/**
 * On-Demand delivery lifecycle (granular, demo/presentation).
 *
 * This is the DELIVERY/rider side of an On-Demand order — distinct from the
 * buyer-facing Storefront Order acceptance lifecycle (see data/storefrontOrders).
 * A delivery only exists once the seller has accepted the order; at that point it
 * starts at `looking_for_driver`. Stages, ETA, and the rider's position on the
 * mock map are demo values standing in for dispatch-provided fields (FarEye-linked
 * fulfillment in production) — the frontend is NOT the source of truth for them.
 *
 * Order status (awaiting acceptance / accepted / rejected) and delivery status
 * (looking for driver … delivered) are intentionally separate fields so the two
 * never contradict each other.
 */

import type { TransactionStatus } from './transactions';

/** Granular OD delivery stages, in progression order. */
export type OnDemandDeliveryStage =
  | 'looking_for_driver'
  | 'driver_assigned'
  | 'preparing'
  | 'ready_for_pickup'
  | 'handed_to_rider'
  | 'picked_up'
  | 'en_route'
  | 'delivered'
  | 'cancelled';

export interface OnDemandStageDef {
  key: OnDemandDeliveryStage;
  label: string;
  note: string;
  /** Mocked ETA / status line shown on the hero + map chip. */
  eta: string;
  /**
   * Rider marker position along the pickup→delivery route, 0 (pickup) → 1
   * (delivery). `null` = no rider yet (searching state).
   */
  riderAt: number | null;
}

/** Ordered, walkable delivery stages (cancelled is terminal, handled separately). */
export const OD_DELIVERY_FLOW: OnDemandDeliveryStage[] = [
  'looking_for_driver',
  'driver_assigned',
  'preparing',
  'ready_for_pickup',
  'handed_to_rider',
  'picked_up',
  'en_route',
  'delivered',
];

export const OD_STAGE_DEFS: Record<OnDemandDeliveryStage, OnDemandStageDef> = {
  looking_for_driver: {
    key: 'looking_for_driver',
    label: 'Looking for driver',
    note: 'Matching the parcel with a nearby On-Demand driver.',
    eta: 'Finding a driver — ETA updates once assigned',
    riderAt: null,
  },
  driver_assigned: {
    key: 'driver_assigned',
    label: 'Driver assigned',
    note: 'A driver accepted and is heading to the pickup point.',
    eta: 'Driver assigned — arriving at pickup soon',
    riderAt: 0.06,
  },
  preparing: {
    key: 'preparing',
    label: 'Preparing order',
    note: 'Seller is preparing and packing the order for hand-over.',
    eta: 'Preparing — driver waiting at pickup',
    riderAt: 0.1,
  },
  ready_for_pickup: {
    key: 'ready_for_pickup',
    label: 'Ready for rider pickup',
    note: 'Order is packed and ready to hand over to the rider.',
    eta: 'Ready — handing over to the rider',
    riderAt: 0.12,
  },
  handed_to_rider: {
    key: 'handed_to_rider',
    label: 'Handed over to rider',
    note: 'Order handed to the rider; pickup is being confirmed.',
    eta: 'Handed over — pickup confirming',
    riderAt: 0.16,
  },
  picked_up: {
    key: 'picked_up',
    label: 'Picked up',
    note: 'Rider has picked up the parcel from the seller.',
    eta: 'Picked up — arriving in ~20–30 mins',
    riderAt: 0.25,
  },
  en_route: {
    key: 'en_route',
    label: 'En route',
    note: 'Rider is on the way to the drop-off location.',
    eta: 'On the way — arriving in ~10–15 mins',
    riderAt: 0.62,
  },
  delivered: {
    key: 'delivered',
    label: 'Delivered',
    note: 'Parcel delivered to the recipient.',
    eta: 'Delivered',
    riderAt: 1,
  },
  cancelled: {
    key: 'cancelled',
    label: 'Cancelled',
    note: 'This On-Demand delivery was cancelled.',
    eta: 'Cancelled',
    riderAt: null,
  },
};

export type OnDemandStageState = 'done' | 'current' | 'upcoming';

export interface OnDemandProgress {
  stage: OnDemandDeliveryStage;
  /** Index of the current stage within OD_DELIVERY_FLOW (delivered = last). */
  currentStage: number;
  currentLabel: string;
  eta: string;
  /** Rider position along the route (0→1) or null when no rider yet. */
  riderAt: number | null;
  /** True for failed/returned seed transactions (visual exception marker). */
  exception?: 'failed' | 'returned';
  cancelled?: boolean;
  stages: { key: OnDemandDeliveryStage; label: string; note: string; state: OnDemandStageState }[];
}

/** Derive the OD delivery progress view for a given stage (demo/presentation). */
export function getOnDemandProgress(
  stage: OnDemandDeliveryStage,
  opts: { exception?: 'failed' | 'returned' } = {},
): OnDemandProgress {
  const def = OD_STAGE_DEFS[stage];
  const cancelled = stage === 'cancelled';
  const reached = cancelled ? -1 : OD_DELIVERY_FLOW.indexOf(stage);
  const stages = OD_DELIVERY_FLOW.map((key, i) => ({
    key,
    label: OD_STAGE_DEFS[key].label,
    note: OD_STAGE_DEFS[key].note,
    state: (cancelled
      ? 'upcoming'
      : i < reached
        ? 'done'
        : i === reached
          ? 'current'
          : 'upcoming') as OnDemandStageState,
  }));
  return {
    stage,
    currentStage: reached,
    currentLabel: def.label,
    eta: def.eta,
    riderAt: def.riderAt,
    exception: opts.exception,
    cancelled,
    stages,
  };
}

/**
 * Map the coarse Transaction status to an OD delivery stage. Used for existing
 * seed OD transactions that have no explicit granular stage stored, so they
 * still render a sensible OD map/timeline.
 */
export function deliveryStageFromStatus(status: TransactionStatus): OnDemandDeliveryStage {
  switch (status) {
    case 'pending':    return 'looking_for_driver';
    case 'picked-up':  return 'picked_up';
    case 'in-transit': return 'en_route';
    case 'delivered':  return 'delivered';
    case 'failed':     return 'en_route';
    case 'returned':   return 'delivered';
    case 'cancelled':  return 'looking_for_driver';
  }
}

/** Map an OD delivery stage back to the coarse Transaction status (list/claims). */
export function statusFromDeliveryStage(stage: OnDemandDeliveryStage): TransactionStatus {
  switch (stage) {
    case 'looking_for_driver':
    case 'driver_assigned':
    case 'preparing':
    case 'ready_for_pickup':
    case 'handed_to_rider':
      return 'pending';
    case 'picked_up':  return 'picked-up';
    case 'en_route':   return 'in-transit';
    case 'delivered':  return 'delivered';
    case 'cancelled':  return 'returned';
  }
}

/** Next stage in the flow after the given one (null at the end / when cancelled). */
export function nextDeliveryStage(stage: OnDemandDeliveryStage): OnDemandDeliveryStage | null {
  if (stage === 'cancelled' || stage === 'delivered') return null;
  const i = OD_DELIVERY_FLOW.indexOf(stage);
  return OD_DELIVERY_FLOW[i + 1] ?? null;
}
