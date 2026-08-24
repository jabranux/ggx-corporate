/**
 * OMS-shaped sample order data.
 *
 * Field naming/shape is patterned after a real OMS order payload (reference:
 * a `GET /orders/:tracking_number` response — `data.attributes`). This module
 * intentionally does NOT mirror the full reference payload 1:1: fields the
 * Business+ frontend has no current or likely near-term use for (ip_address,
 * jobData_otp, own_print, partner_courier, per-order `hubs` summary, the
 * duplicate `metadata.events`/`metadata.original_fees`, `dropoff_address`,
 * `channel`, `parent`/`parent_id`, `pickup_attempts`, top-level `remarks` /
 * `agent`) are left out. See docs/context/oms-sample-data.md for the field-by-
 * field rationale.
 *
 * This file is the OMS side of the adapter boundary:
 *   OMS-shaped sample data (this file) → normalizer (`lib/omsOrderMapper.ts`)
 *   → Business+ order model (`data/transactions.ts` `Transaction`) → UI
 *
 * Nothing in `src/app` outside the mapper should import from this file — page/
 * component code must only ever see the Business+ `Transaction` shape.
 */

// ── OMS-shaped types (subset of a real OMS order payload) ──────────────────

export interface OmsAddress {
  id: number;
  type: 'pickup' | 'delivery' | 'return';
  name: string;
  email: string | null;
  phone_number: string;
  mobile_number: string;
  line_1: string;
  line_2: string | null;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  region: string;
  xcode: string;
  country: 'PH';
}

export interface OmsEventAgent {
  hub?: string;
  code?: string;
  name?: string;
  mobile_number?: string;
  location: { latitude: number | null; longitude: number | null };
}

export interface OmsEvent {
  id: number;
  status: string;
  remarks: string;
  created_at: string;
  status_updated_at: string;
  status_id: string;
  agent: OmsEventAgent | null;
  hubs: { origin?: string; destination?: string } | null;
  failure_reason: string | null;
  photo: string | null;
  signature: string | null;
}

export interface OmsFees {
  shipping_fee: string;
  insurance_fee: string;
  transaction_fee: string;
  return_fee: string;
  return_fee_type: string | null;
}

export interface OmsBreakdown {
  subtotal: string;
  shipping: string;
  tax: string;
  fee: string;
  insurance: string;
  discount: string;
}

export interface OmsItem {
  id: number;
  type: 'insurance' | 'shipping' | 'product';
  description: string;
  amount: string;
  quantity: number;
  total: string;
  created_at: string;
}

export interface OmsOrder {
  tracking_number: string;
  reference_id: string | null;
  status: string;
  status_id: string;
  status_updated_at: string;
  status_remarks: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  pickup_at: string;
  estimated_delivery_date: string;
  currency: 'PHP';
  grand_total: string;
  shipment: string;
  parcel: { for_pickup: { parcel_type: string } };
  pickup_address: OmsAddress;
  delivery_address: OmsAddress;
  return_address: OmsAddress;
  fees: OmsFees;
  breakdown: OmsBreakdown;
  payment: { method: string; provider: string | null };
  seller_payment: { method: string | null; provider: string | null };
  service: { id: number; uuid: string; provider: string; name: string };
  consignor: { party_id: number; name: string; uuid: string; status: number; payment_terms: string; payment_option: string };
  consignee: { id: number | null; email: string | null; contact_number: string; name: string; external_id: string | null };
  items: OmsItem[];
  events: OmsEvent[];
  tat: Record<string, number>;
  metadata: {
    item_type: string;
    pricing_type: string;
    original_shipment: string;
    service_fees_payor: 'buyer' | 'seller';
    transaction_type: string;
    transaction_scenario: string;
  };
}

// ── Date/time helpers ───────────────────────────────────────────────────────

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build an OMS-style timestamp `YYYY-MM-DD HH:MM:SS.000000+0000` from a booking date + hour offset. */
function ts(bookingDateISO: string, hourOffset: number): string {
  const dayOffset = Math.floor(hourOffset / 24);
  const hour = Math.floor(hourOffset) % 24;
  const minute = Math.round((hourOffset % 1) * 60);
  const date = addDaysISO(bookingDateISO, dayOffset);
  return `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000000+0000`;
}

function unixOf(omsTimestamp: string): number {
  // 'YYYY-MM-DD HH:MM:SS.ffffff+ZZZZ' -> epoch seconds
  const [datePart, rest] = omsTimestamp.split(' ');
  const timePart = rest.slice(0, 8);
  return Math.floor(new Date(`${datePart}T${timePart}Z`).getTime() / 1000);
}

// ── Address / hub profiles ──────────────────────────────────────────────────

const CITY_INFO: Record<string, { state: string; region: string; postal: string; xcode: string }> = {
  'Quezon City':        { state: 'Metro Manila',      region: 'NCR', postal: '1100', xcode: 'QC10011' },
  'Makati City':        { state: 'Metro Manila',      region: 'NCR', postal: '1223', xcode: 'MK10014' },
  'Pasig City':         { state: 'Metro Manila',      region: 'NCR', postal: '1605', xcode: 'PS10018' },
  'Taguig City':        { state: 'Metro Manila',      region: 'NCR', postal: '1630', xcode: 'TG10022' },
  'Mandaluyong City':   { state: 'Metro Manila',      region: 'NCR', postal: '1550', xcode: 'MD10009' },
  'Paranaque City':     { state: 'Metro Manila',      region: 'NCR', postal: '1700', xcode: 'PQ10007' },
  'Caloocan City':      { state: 'Metro Manila',      region: 'NCR', postal: '1420', xcode: 'CL10003' },
  'Pasay City':         { state: 'Metro Manila',      region: 'NCR', postal: '1300', xcode: 'PY10005' },
  'Iloilo City':        { state: 'Iloilo',             region: 'VI',  postal: '5000', xcode: 'IL10012' },
  'Cebu City':          { state: 'Cebu',               region: 'VI',  postal: '6000', xcode: 'CB10031' },
  'Cagayan de Oro City':{ state: 'Misamis Oriental',   region: 'MIN', postal: '9000', xcode: 'CDO1002' },
  'Davao City':         { state: 'Davao del Sur',      region: 'MIN', postal: '8000', xcode: 'DV10044' },
  'Santa Rosa':         { state: 'Laguna',             region: 'SL',  postal: '4026', xcode: 'LG10017' },
  'Bacoor':             { state: 'Cavite',             region: 'SL',  postal: '4102', xcode: 'CV10009' },
  'Batangas City':      { state: 'Batangas',           region: 'SL',  postal: '4200', xcode: 'BT10002' },
  'San Fernando':       { state: 'Pampanga',           region: 'CL',  postal: '2000', xcode: 'PM10014' },
  'Angeles City':       { state: 'Pampanga',           region: 'CL',  postal: '2009', xcode: 'PM10023' },
  'Imus City':          { state: 'Cavite',             region: 'SL',  postal: '4103', xcode: 'CV10020' },
};

let addressIdSeq = 297940000;

function buildAddress(
  kind: OmsAddress['type'],
  name: string,
  phone: string,
  line1: string,
  city: string,
  district: string,
  email: string | null = null,
): OmsAddress {
  const info = CITY_INFO[city] ?? { state: city, region: 'NL', postal: '0000', xcode: 'XX00000' };
  return {
    id: addressIdSeq++,
    type: kind,
    name,
    email,
    phone_number: phone,
    mobile_number: phone,
    line_1: line1,
    line_2: null,
    district,
    city,
    state: info.state,
    postal_code: info.postal,
    region: info.region,
    xcode: info.xcode,
    country: 'PH',
  };
}

interface ConsignorProfile {
  partyId: number;
  name: string;
  uuid: string;
  paymentTerms: string;
  paymentOption: string;
  pickupName: string;
  pickupLine1: string;
  pickupCity: string;
  pickupDistrict: string;
  pickupEmail: string;
  pickupPhone: string;
  pickupHubName: string;
  pickupHubCode: string;
}

const CONSIGNORS: Record<'acme-corp' | 'acme-luzon', ConsignorProfile> = {
  'acme-corp': {
    partyId: 500101,
    name: 'Acme Corporation',
    uuid: 'b7e2c8a1-4f3d-4a9e-8c2b-1a2b3c4d5e6f',
    paymentTerms: 'postpaid',
    paymentOption: 'wallet',
    pickupName: 'Acme Corporation Warehouse',
    pickupLine1: '5th Floor, ABC Building, Ayala Avenue, Poblacion',
    pickupCity: 'Makati City',
    pickupDistrict: 'Poblacion',
    pickupEmail: 'logistics@acmecorp.ph',
    pickupPhone: '+639171234567',
    pickupHubName: 'makati hub',
    pickupHubCode: 'MKT',
  },
  'acme-luzon': {
    partyId: 500102,
    name: 'Acme Luzon',
    uuid: 'c4d5e6f7-8a9b-4c1d-9e2f-3a4b5c6d7e8f',
    paymentTerms: 'prepaid',
    paymentOption: 'net-off',
    pickupName: 'Acme Luzon Distribution Center',
    pickupLine1: 'Lot 4, Blk 2, Nuvali Logistics Park',
    pickupCity: 'Santa Rosa',
    pickupDistrict: 'Nuvali',
    pickupEmail: 'ops@acmeluzon.ph',
    pickupPhone: '+639189876543',
    pickupHubName: 'santa rosa hub',
    pickupHubCode: 'STR',
  },
};

const RIDERS = [
  { name: 'RODERICK JR LAYUG', code: 'rider_cvh_127_x', mobile: '+639562474423' },
  { name: 'MARLON DE GUZMAN', code: 'rider_cvh_211_x', mobile: '+639173321045' },
  { name: 'JOHN PAUL RIVERA', code: 'rider_cvh_098_x', mobile: '+639285512378' },
];

// ── Shipment / packaging profile ────────────────────────────────────────────

export const SHIPMENT_TYPES = [
  'small-pouch', 'medium-pouch', 'large-pouch',
  'small-box', 'medium-box', 'large-box', 'document',
] as const;

function parcelTypeFor(shipment: string): string {
  if (shipment.endsWith('pouch')) return 'pouch';
  if (shipment.endsWith('box')) return 'box';
  return 'document';
}

// ── Service profiles ────────────────────────────────────────────────────────

const SERVICES: Record<'next_day' | 'same_day' | 'instant', { id: number; uuid: string }> = {
  next_day: { id: 215085, uuid: 'e9fce6db-9e13-4b88-98db-9daad6c03969' },
  same_day: { id: 215090, uuid: '1c9a2b3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d' },
  instant:  { id: 215095, uuid: '2d0b3c4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e' },
};

// ── Shipping fee table (flat base rate by parcel size, service surcharge) ──

const BASE_SHIPPING_FEE: Record<string, number> = {
  'small-pouch': 120, 'medium-pouch': 170, 'large-pouch': 230,
  'small-box': 190, 'medium-box': 260, 'large-box': 340,
  document: 90,
};

const SERVICE_SURCHARGE: Record<'next_day' | 'same_day' | 'instant', number> = {
  next_day: 1, same_day: 1.4, instant: 2,
};

// ── Event scenarios ──────────────────────────────────────────────────────────
// Each scenario is a list of steps (hour offset from booking date 00:00, OMS
// status token, ALL-CAPS remarks, status_id, and which "leg" produced it) that
// buildEvents() turns into a full OmsEvent[]. The reference payload's PUD
// (pickup-up-delivery) flow for a first-attempt delivery is reproduced almost
// verbatim in `delivered_first_attempt`; every other scenario extends the same
// status vocabulary/shape consistently since the reference sample does not
// itself contain a failed/returned/cancelled example.
export type OmsScenario =
  | 'plain_pending'
  | 'pickup_failed_rescheduled'
  | 'cancelled_before_pickup'
  | 'picked_up_shallow'
  | 'picked_up_at_hub'
  | 'picked_up_for_transfer'
  | 'in_transit_exchange'
  | 'in_transit_forwarded'
  | 'delivered_first_attempt'
  | 'delivered_after_retry'
  | 'failed_for_return'
  | 'failed_out_for_return'
  | 'failed_return_in_transit'
  | 'returned_terminal';

const STATUS_ID: Record<string, string> = {
  for_pickup: '1000',
  pickup_rider_found: '5600',
  out_for_pickup: '5300',
  pickup_failed: '1450',
  picked_up: '1400',
  received_at_pickup_hub: '2900',
  for_transfer: '2400',
  in_transit: '1601',
  out_for_delivery: '1501',
  delivered: '2200',
  delivery_failed: '1550',
  for_return: '2600',
  out_for_return: '2700',
  return_in_transit: '2800',
  returned: '2850',
  cancelled: '9000',
};

interface Step {
  hour: number;
  status: string;
  remarks: string;
  agent: 'pickup_rider' | 'pickup_hub' | 'delivery_hub' | 'none';
  failureReason?: string;
  proof?: boolean;
  hubs?: { origin?: string; destination?: string };
}

interface ScenarioCtx {
  rider: { name: string; code: string; mobile: string };
  pickupHubName: string;
  pickupHubCode: string;
  deliveryHubName: string;
  deliveryHubCode: string;
  failureReason: string;
}

function stepsFor(scenario: OmsScenario, ctx: ScenarioCtx): Step[] {
  const dest = ctx.deliveryHubName;
  const pu = ctx.pickupHubName;
  const pickupLeg: Step[] = [
    { hour: 2, status: 'pickup_rider_found', remarks: 'PICKUP RIDER FOUND', agent: 'pickup_rider' },
    { hour: 3, status: 'out_for_pickup', remarks: 'RIDER IS OUT FOR PICKUP', agent: 'pickup_rider' },
    { hour: 4, status: 'picked_up', remarks: 'PACKAGE SUCCESSFULLY PICKED UP', agent: 'pickup_rider', proof: true },
  ];
  const hubLeg: Step[] = [
    { hour: 6, status: 'received_at_pickup_hub', remarks: `RECEIVED BY ${pu.toUpperCase()}`, agent: 'pickup_hub' },
    { hour: 7, status: 'for_transfer', remarks: `VIA LAND: FOR TRANSFER TO ${dest.toUpperCase()}`, agent: 'pickup_hub', hubs: { origin: pu, destination: dest } },
  ];
  const transitLeg: Step[] = [
    { hour: 9, status: 'in_transit', remarks: 'RECEIVED AT COURIER EXCHANGE', agent: 'none', hubs: { origin: pu, destination: dest } },
    { hour: 15, status: 'in_transit', remarks: `FORWARDED TO ${dest.toUpperCase()} DELIVERY TEAM`, agent: 'none', hubs: { origin: pu, destination: dest } },
    { hour: 16, status: 'in_transit', remarks: `RECEIVED AT ${dest.toUpperCase()} DELIVERY TEAM`, agent: 'delivery_hub' },
  ];
  const outForDelivery: Step = { hour: 21, status: 'out_for_delivery', remarks: 'OUT FOR DELIVERY', agent: 'delivery_hub' };
  const delivered: Step = { hour: 24, status: 'delivered', remarks: 'DELIVERED', agent: 'delivery_hub', proof: true };
  const failedAttempt1: Step = { hour: 22, status: 'delivery_failed', remarks: `DELIVERY ATTEMPT FAILED - ${ctx.failureReason.replace(/_/g, ' ').toUpperCase()}`, agent: 'delivery_hub', failureReason: ctx.failureReason };

  switch (scenario) {
    case 'plain_pending':
      return [{ hour: 1, status: 'for_pickup', remarks: 'FOR PICKUP', agent: 'none' }];

    case 'pickup_failed_rescheduled':
      return [
        { hour: 1, status: 'for_pickup', remarks: 'FOR PICKUP', agent: 'none' },
        { hour: 3, status: 'pickup_rider_found', remarks: 'PICKUP RIDER FOUND', agent: 'pickup_rider' },
        { hour: 4, status: 'out_for_pickup', remarks: 'RIDER IS OUT FOR PICKUP', agent: 'pickup_rider' },
        { hour: 5, status: 'pickup_failed', remarks: `PICKUP ATTEMPT FAILED - ${ctx.failureReason.replace(/_/g, ' ').toUpperCase()}`, agent: 'pickup_rider', failureReason: ctx.failureReason },
        { hour: 25, status: 'for_pickup', remarks: 'FOR PICKUP - RESCHEDULED', agent: 'none' },
      ];

    case 'cancelled_before_pickup':
      return [
        { hour: 1, status: 'for_pickup', remarks: 'FOR PICKUP', agent: 'none' },
        { hour: 5, status: 'cancelled', remarks: 'BOOKING CANCELLED BY SENDER', agent: 'none' },
      ];

    case 'picked_up_shallow':
      return [...pickupLeg];

    case 'picked_up_at_hub':
      return [...pickupLeg, hubLeg[0]];

    case 'picked_up_for_transfer':
      return [...pickupLeg, ...hubLeg];

    case 'in_transit_exchange':
      return [...pickupLeg, ...hubLeg, transitLeg[0]];

    case 'in_transit_forwarded':
      return [...pickupLeg, ...hubLeg, transitLeg[0], transitLeg[1]];

    case 'delivered_first_attempt':
      return [...pickupLeg, ...hubLeg, ...transitLeg, outForDelivery, delivered];

    case 'delivered_after_retry':
      return [
        ...pickupLeg, ...hubLeg, ...transitLeg, outForDelivery, failedAttempt1,
        { ...outForDelivery, hour: 46, remarks: 'OUT FOR DELIVERY - REATTEMPT' },
        { ...delivered, hour: 48 },
      ];

    case 'failed_for_return': {
      const failedAttempt2: Step = { hour: 47, status: 'delivery_failed', remarks: `DELIVERY ATTEMPT FAILED - ${ctx.failureReason.replace(/_/g, ' ').toUpperCase()}`, agent: 'delivery_hub', failureReason: ctx.failureReason };
      return [
        ...pickupLeg, ...hubLeg, ...transitLeg, outForDelivery, failedAttempt1,
        { ...outForDelivery, hour: 46, remarks: 'OUT FOR DELIVERY - REATTEMPT' }, failedAttempt2,
        { hour: 50, status: 'for_return', remarks: 'MARKED FOR RETURN TO SENDER - 2 FAILED DELIVERY ATTEMPTS', agent: 'delivery_hub' },
      ];
    }

    case 'failed_out_for_return':
      return [
        ...(stepsFor('failed_for_return', ctx)),
        { hour: 70, status: 'out_for_return', remarks: 'RIDER DISPATCHED TO COLLECT RETURN PARCEL', agent: 'delivery_hub' },
      ];

    case 'failed_return_in_transit':
      return [
        ...(stepsFor('failed_out_for_return', ctx)),
        { hour: 75, status: 'return_in_transit', remarks: 'RETURN PARCEL IN TRANSIT TO ORIGIN HUB', agent: 'none', hubs: { origin: dest, destination: pu } },
      ];

    case 'returned_terminal':
      return [
        ...(stepsFor('failed_return_in_transit', ctx)),
        { hour: 96, status: 'returned', remarks: 'RETURNED TO SENDER', agent: 'pickup_hub' },
      ];

    default:
      return [];
  }
}

let eventIdSeq = 1291500000;

function buildEvents(scenario: OmsScenario, bookingDateISO: string, ctx: ScenarioCtx): OmsEvent[] {
  const steps = stepsFor(scenario, ctx);
  return steps.map((s) => {
    const at = ts(bookingDateISO, s.hour);
    const createdAt = ts(bookingDateISO, s.hour + 0.02);
    let agent: OmsEventAgent | null = null;
    if (s.agent === 'pickup_rider') {
      agent = { hub: ctx.pickupHubName, code: ctx.rider.code, name: ctx.rider.name, mobile_number: ctx.rider.mobile, location: { latitude: 14.3953904, longitude: 120.961086 } };
    } else if (s.agent === 'pickup_hub') {
      agent = { hub: ctx.pickupHubName, location: { latitude: null, longitude: null } };
    } else if (s.agent === 'delivery_hub') {
      agent = { hub: ctx.deliveryHubName, location: { latitude: null, longitude: null } };
    } else {
      agent = { location: { latitude: null, longitude: null } };
    }
    return {
      id: eventIdSeq++,
      status: s.status,
      remarks: s.remarks,
      created_at: createdAt,
      status_updated_at: at,
      status_id: STATUS_ID[s.status] ?? '0000',
      agent,
      hubs: s.hubs ?? null,
      failure_reason: s.failureReason ?? null,
      photo: s.proof ? `https://epod.quadx.xyz/photos/epod-{TRACKING}-${unixOf(at)}.jpg` : null,
      signature: s.proof ? `https://epod.quadx.xyz/signatures/epod-{TRACKING}-${unixOf(at)}.jpg` : null,
    };
  });
}

// ── Per-order spec table ────────────────────────────────────────────────────
// Reuses the identities (tracking numbers, recipients, destinations, dates,
// subaccounts, COD scale) from the prior flat mock so existing bookmarks/links
// and screenshots keep resolving to the same rows — but rebuilds each order's
// full lifecycle, fees, and party data from the OMS shape instead of a single
// status field.

type ConsignorKey = keyof typeof CONSIGNORS;

interface OrderSpec {
  tracking: string;
  consignor: ConsignorKey;
  recipient: string;
  contactNumber: string;
  recipientLine1: string;
  recipientDistrict: string;
  city: string;
  scenario: OmsScenario;
  bookingDate: string;
  service: 'next_day' | 'same_day' | 'instant';
  shipment: typeof SHIPMENT_TYPES[number];
  product: string;
  codBaseline: number;
  insured: boolean;
  paymentMethod: 'cod' | 'prepaid' | 'wallet' | 'bank_transfer';
  serviceFeesPayor: 'buyer' | 'seller';
  transactionScenario: 'PUD' | 'DOD';
  riderIndex: number;
  referenceId?: string | null;
  failureReason?: string;
}

const FAILURE_REASONS = ['recipient_unavailable', 'address_not_found', 'refused_by_recipient'] as const;

const PRODUCTS = [
  'Wireless Mouse (Logitech MX Master 3)', 'Mechanical Keyboard (Keychron K2)', 'Asvesti Limewash Paint',
  'Cotton Crewneck Shirt', 'Whey Protein Isolate 1kg', 'Ceramic Dinnerware Set', 'Bluetooth Earbuds',
  'Skincare Bundle Set', 'Stainless Tumbler 1L', 'A4 Bond Paper (5 reams)', 'LED Desk Lamp',
  'Non-stick Cookware Set', 'Yoga Mat', 'Kids Storybook Bundle', 'USB-C Charging Cable (3-pack)',
];

const specs: OrderSpec[] = [
  { tracking: 'GGX-2026-90021', consignor: 'acme-luzon', recipient: 'Liza Mendoza', contactNumber: '+639172203344', recipientLine1: 'Blk 7 Lot 12, Visayas Ave', recipientDistrict: 'Bagong Pag-asa', city: 'Quezon City', scenario: 'in_transit_forwarded', bookingDate: '2026-05-30', service: 'instant', shipment: 'small-box', product: PRODUCTS[6], codBaseline: 1850, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 0 },
  { tracking: 'GGX-2026-90020', consignor: 'acme-corp', recipient: 'Marco Villanueva', contactNumber: '+639183304455', recipientLine1: 'Unit 802, Salcedo Park Twr', recipientDistrict: 'Bel-Air', city: 'Makati City', scenario: 'delivered_first_attempt', bookingDate: '2026-05-29', service: 'same_day', shipment: 'medium-box', product: PRODUCTS[1], codBaseline: 3200, insured: true, paymentMethod: 'prepaid', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 1 },
  { tracking: 'GGX-2026-90019', consignor: 'acme-luzon', recipient: 'Carla Santos', contactNumber: '+639194415566', recipientLine1: 'The Grove, Capitol Commons', recipientDistrict: 'Oranbo', city: 'Pasig City', scenario: 'cancelled_before_pickup', bookingDate: '2026-05-30', service: 'next_day', shipment: 'small-pouch', product: PRODUCTS[7], codBaseline: 990, insured: false, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 0 },
  { tracking: 'GGX-2026-90018', consignor: 'acme-corp', recipient: 'Tonette Reyes', contactNumber: '+639175526677', recipientLine1: 'Two Serendra, BGC', recipientDistrict: 'Fort Bonifacio', city: 'Taguig City', scenario: 'delivered_first_attempt', bookingDate: '2026-05-29', service: 'same_day', shipment: 'large-pouch', product: PRODUCTS[9], codBaseline: 2450, insured: false, paymentMethod: 'prepaid', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 2 },
  { tracking: 'GGX-2026-90010', consignor: 'acme-corp', recipient: 'Nexus Retail Group', contactNumber: '+639172110011', recipientLine1: 'Ayala Mall, Glorietta 5', recipientDistrict: 'San Lorenzo', city: 'Makati City', scenario: 'pickup_failed_rescheduled', bookingDate: '2026-05-31', service: 'next_day', shipment: 'large-box', product: PRODUCTS[10], codBaseline: 32000, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1, failureReason: 'sender_unavailable' },
  { tracking: 'GGX-2026-90009', consignor: 'acme-luzon', recipient: 'Meridian Health Corp.', contactNumber: '+639183220022', recipientLine1: 'Trinoma Mall, North EDSA', recipientDistrict: 'Bagong Pag-asa', city: 'Quezon City', scenario: 'in_transit_exchange', bookingDate: '2026-05-31', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 18750, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 0 },
  { tracking: 'GGX-2026-90008', consignor: 'acme-corp', recipient: 'Horizon Publishing Co.', contactNumber: '+639194330033', recipientLine1: 'Robinsons Galleria, Ortigas', recipientDistrict: 'Ugong', city: 'Pasig City', scenario: 'failed_for_return', bookingDate: '2026-05-28', service: 'instant', shipment: 'medium-pouch', product: PRODUCTS[11], codBaseline: 9400, insured: true, paymentMethod: 'prepaid', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 2, failureReason: 'recipient_unavailable' },
  { tracking: 'GGX-2026-90007', consignor: 'acme-corp', recipient: 'PeakSoft Technologies', contactNumber: '+639175440044', recipientLine1: 'One Bonifacio High Street, BGC', recipientDistrict: 'Fort Bonifacio', city: 'Taguig City', scenario: 'delivered_after_retry', bookingDate: '2026-05-28', service: 'next_day', shipment: 'large-box', product: PRODUCTS[10], codBaseline: 27500, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1, failureReason: 'recipient_unavailable' },
  { tracking: 'GGX-2026-90006', consignor: 'acme-luzon', recipient: 'Citadel Finance Group', contactNumber: '+639186550055', recipientLine1: 'Shaw Boulevard', recipientDistrict: 'Wack-Wack', city: 'Mandaluyong City', scenario: 'failed_out_for_return', bookingDate: '2026-05-28', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 43200, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 0, failureReason: 'address_not_found' },
  { tracking: 'GGX-2026-90005', consignor: 'acme-corp', recipient: 'Aurora Wellness Studio', contactNumber: '+639197660066', recipientLine1: 'SM Seaside', recipientDistrict: 'Sucat', city: 'Paranaque City', scenario: 'returned_terminal', bookingDate: '2026-05-26', service: 'same_day', shipment: 'small-box', product: PRODUCTS[7], codBaseline: 6800, insured: false, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 2, failureReason: 'refused_by_recipient' },
  { tracking: 'GGX-2026-90004', consignor: 'acme-corp', recipient: 'Vertex Logistics Corp.', contactNumber: '+639178770077', recipientLine1: 'Megaworld Iloilo Business Park, Mandurriao', recipientDistrict: 'Mandurriao', city: 'Iloilo City', scenario: 'in_transit_forwarded', bookingDate: '2026-05-29', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 11600, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1 },
  { tracking: 'GGX-2026-90003', consignor: 'acme-luzon', recipient: 'Solano Medical Supply', contactNumber: '+639189880088', recipientLine1: 'Ayala Center Cebu, Archbishop Reyes Ave', recipientDistrict: 'Kamputhaw', city: 'Cebu City', scenario: 'failed_return_in_transit', bookingDate: '2026-05-27', service: 'instant', shipment: 'large-box', product: PRODUCTS[10], codBaseline: 55000, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 0, failureReason: 'recipient_unavailable' },
  { tracking: 'GGX-2026-90002', consignor: 'acme-corp', recipient: 'Pinnacle Realty Inc.', contactNumber: '+639190990099', recipientLine1: 'Limketkai Mall', recipientDistrict: 'Lapasan', city: 'Cagayan de Oro City', scenario: 'picked_up_for_transfer', bookingDate: '2026-05-29', service: 'same_day', shipment: 'medium-pouch', product: PRODUCTS[7], codBaseline: 14200, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 2 },
  { tracking: 'GGX-2026-90001', consignor: 'acme-corp', recipient: 'Bluewave E-Commerce', contactNumber: '+639171101100', recipientLine1: 'SM City Davao, JP Laurel Ave', recipientDistrict: 'Bajada', city: 'Davao City', scenario: 'picked_up_shallow', bookingDate: '2026-05-29', service: 'next_day', shipment: 'large-box', product: PRODUCTS[10], codBaseline: 38900, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 0 },
  { tracking: 'GGX-2024-89240', consignor: 'acme-corp', recipient: 'TechStart Solutions', contactNumber: '+639179876543', recipientLine1: 'Unit 1203, Salcedo Tower', recipientDistrict: 'Bel-Air', city: 'Makati City', scenario: 'delivered_first_attempt', bookingDate: '2026-05-17', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 14500, insured: true, paymentMethod: 'wallet', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1 },
  { tracking: 'GGX-2024-89239', consignor: 'acme-luzon', recipient: 'Innovation Labs Inc.', contactNumber: '+639182221010', recipientLine1: 'IT Park, Lahug', recipientDistrict: 'Lahug', city: 'Cebu City', scenario: 'in_transit_exchange', bookingDate: '2026-05-18', service: 'same_day', shipment: 'small-box', product: PRODUCTS[6], codBaseline: 8900, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 2 },
  { tracking: 'GGX-2024-89238', consignor: 'acme-corp', recipient: 'Global Enterprises', contactNumber: '+639193332020', recipientLine1: 'Km 5, JP Laurel Ave', recipientDistrict: 'Bajada', city: 'Davao City', scenario: 'picked_up_at_hub', bookingDate: '2026-05-17', service: 'next_day', shipment: 'large-box', product: PRODUCTS[10], codBaseline: 21000, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 0 },
  { tracking: 'GGX-2024-89237', consignor: 'acme-corp', recipient: 'Summit Technologies', contactNumber: '+639174443030', recipientLine1: 'Eastwood City, Bagumbayan', recipientDistrict: 'Bagumbayan', city: 'Quezon City', scenario: 'plain_pending', bookingDate: '2026-05-31', service: 'next_day', shipment: 'small-pouch', product: PRODUCTS[7], codBaseline: 5600, insured: false, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1 },
  { tracking: 'GGX-2024-89236', consignor: 'acme-luzon', recipient: 'Metro Solutions Inc.', contactNumber: '+639185554040', recipientLine1: 'Ortigas Center, San Antonio', recipientDistrict: 'San Antonio', city: 'Pasig City', scenario: 'failed_for_return', bookingDate: '2026-05-16', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 12300, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 0, failureReason: 'address_not_found' },
  { tracking: 'GGX-2024-89235', consignor: 'acme-corp', recipient: 'Digital Ventures Co.', contactNumber: '+639196665050', recipientLine1: 'BGC, Fort Bonifacio', recipientDistrict: 'Fort Bonifacio', city: 'Taguig City', scenario: 'delivered_after_retry', bookingDate: '2026-05-15', service: 'same_day', shipment: 'small-box', product: PRODUCTS[6], codBaseline: 7400, insured: false, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 1, failureReason: 'recipient_unavailable' },
  { tracking: 'GGX-2024-89234', consignor: 'acme-luzon', recipient: 'Tech Solutions Inc.', contactNumber: '+639177776060', recipientLine1: 'Greenfield District', recipientDistrict: 'Wack-Wack', city: 'Mandaluyong City', scenario: 'delivered_first_attempt', bookingDate: '2026-05-15', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 9800, insured: true, paymentMethod: 'wallet', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 2 },
  { tracking: 'GGX-2024-89233', consignor: 'acme-corp', recipient: 'Global Innovations Ltd.', contactNumber: '+639188887070', recipientLine1: 'Grace Park', recipientDistrict: 'Grace Park', city: 'Caloocan City', scenario: 'in_transit_forwarded', bookingDate: '2026-05-15', service: 'next_day', shipment: 'small-pouch', product: PRODUCTS[7], codBaseline: 6200, insured: false, paymentMethod: 'wallet', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 0 },
  { tracking: 'GGX-2024-89232', consignor: 'acme-luzon', recipient: 'Acme Corporation', contactNumber: '+639199998080', recipientLine1: 'Nuvali', recipientDistrict: 'Nuvali', city: 'Santa Rosa', scenario: 'picked_up_shallow', bookingDate: '2026-05-14', service: 'instant', shipment: 'medium-pouch', product: PRODUCTS[7], codBaseline: 17600, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 1 },
  { tracking: 'GGX-2024-89231', consignor: 'acme-corp', recipient: 'Summit Partners', contactNumber: '+639171019090', recipientLine1: 'Molino Boulevard', recipientDistrict: 'Molino', city: 'Bacoor', scenario: 'returned_terminal', bookingDate: '2026-05-11', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 4300, insured: false, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 2, failureReason: 'refused_by_recipient' },
  { tracking: 'GGX-2024-89230', consignor: 'acme-corp', recipient: 'Castillo & Partners Law', contactNumber: '+639182021212', recipientLine1: 'RCBC Plaza, Ayala Avenue', recipientDistrict: 'Bel-Air', city: 'Makati City', scenario: 'failed_out_for_return', bookingDate: '2026-05-10', service: 'instant', shipment: 'document', product: PRODUCTS[9], codBaseline: 19500, insured: false, paymentMethod: 'cod', serviceFeesPayor: 'buyer', transactionScenario: 'PUD', riderIndex: 0, failureReason: 'recipient_unavailable' },
  { tracking: 'GGX-2024-89229', consignor: 'acme-luzon', recipient: 'IronForge Manufacturing', contactNumber: '+639193132323', recipientLine1: 'Batangas City Industrial Estate', recipientDistrict: 'Industrial Estate', city: 'Batangas City', scenario: 'returned_terminal', bookingDate: '2026-05-10', service: 'next_day', shipment: 'large-box', product: PRODUCTS[10], codBaseline: 72000, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1, failureReason: 'address_not_found' },
  { tracking: 'GGX-2024-89228', consignor: 'acme-corp', recipient: 'Lumen Digital Agency', contactNumber: '+639174243434', recipientLine1: 'Mall of Asia Complex', recipientDistrict: 'MOA Complex', city: 'Pasay City', scenario: 'delivered_first_attempt', bookingDate: '2026-05-12', service: 'same_day', shipment: 'small-box', product: PRODUCTS[6], codBaseline: 8100, insured: false, paymentMethod: 'bank_transfer', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 2 },
  { tracking: 'GGX-2024-89227', consignor: 'acme-corp', recipient: 'Cascade Food Corp.', contactNumber: '+639185354545', recipientLine1: 'SM City Pampanga', recipientDistrict: 'City Center', city: 'San Fernando', scenario: 'failed_return_in_transit', bookingDate: '2026-05-12', service: 'next_day', shipment: 'medium-box', product: PRODUCTS[10], codBaseline: 15600, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 0, failureReason: 'address_not_found' },
  { tracking: 'GGX-2024-89226', consignor: 'acme-luzon', recipient: 'Onyx Trading Corp.', contactNumber: '+639196465656', recipientLine1: 'Fields Avenue', recipientDistrict: 'Balibago', city: 'Angeles City', scenario: 'delivered_after_retry', bookingDate: '2026-05-10', service: 'next_day', shipment: 'medium-pouch', product: PRODUCTS[7], codBaseline: 33700, insured: true, paymentMethod: 'cod', serviceFeesPayor: 'seller', transactionScenario: 'PUD', riderIndex: 1, failureReason: 'recipient_unavailable' },
];

// ── Assembly ─────────────────────────────────────────────────────────────────

function pricingTypeFor(spec: OrderSpec): string {
  if (spec.service === 'instant') return 'discounted';
  if (spec.codBaseline >= 15000) return 'contract';
  return 'basic';
}

function round2(n: number): string {
  return n.toFixed(2);
}

function buildOmsOrder(spec: OrderSpec, index: number): OmsOrder {
  const consignor = CONSIGNORS[spec.consignor];
  const rider = RIDERS[spec.riderIndex % RIDERS.length];
  const deliveryHubName = `${spec.city.replace(/ City$/, '').toLowerCase()} hub`;
  const deliveryHubCode = spec.city.slice(0, 3).toUpperCase();
  const failureReason = spec.failureReason ?? FAILURE_REASONS[index % FAILURE_REASONS.length];

  const ctx: ScenarioCtx = {
    rider,
    pickupHubName: consignor.pickupHubName,
    pickupHubCode: consignor.pickupHubCode,
    deliveryHubName,
    deliveryHubCode,
    failureReason,
  };

  const events = buildEvents(spec.scenario, spec.bookingDate, ctx).map((e) => ({
    ...e,
    photo: e.photo ? e.photo.replace('{TRACKING}', spec.tracking) : null,
    signature: e.signature ? e.signature.replace('{TRACKING}', spec.tracking) : null,
  }));

  const lastEvent = events[events.length - 1];
  const status = lastEvent ? lastEvent.status : 'pending';
  const statusId = lastEvent ? lastEvent.status_id : STATUS_ID.for_pickup;
  const statusRemarks = lastEvent ? lastEvent.remarks.split(' - ')[0] : 'BOOKED';
  const orderFailureReason = status === 'delivery_failed' || status === 'for_return' || status === 'out_for_return' || status === 'return_in_transit' || status === 'pickup_failed'
    ? failureReason
    : null;
  const statusUpdatedAt = lastEvent ? lastEvent.status_updated_at : ts(spec.bookingDate, 0.5);
  const createdAt = ts(spec.bookingDate, 0);
  const updatedAt = lastEvent ? lastEvent.created_at : ts(spec.bookingDate, 0.5);
  const pickupAt = ts(spec.bookingDate, 1);
  const estimatedDeliveryDate = `${addDaysISO(spec.bookingDate, spec.service === 'next_day' ? 1 : 0)} 00:00:00+08`;

  // Fees derived from a plausible product subtotal scaled off the legacy COD baseline.
  const subtotal = Math.max(200, Math.round(spec.codBaseline * 0.92));
  const shippingFee = Math.round(BASE_SHIPPING_FEE[spec.shipment] * SERVICE_SURCHARGE[spec.service]);
  const insuranceFee = spec.insured ? Math.max(5, Math.round(subtotal * 0.006)) : 0;
  const transactionFee = spec.paymentMethod === 'cod' ? 0 : 15;
  const discount = spec.tracking.endsWith('9') || spec.tracking.endsWith('3') ? Math.round(shippingFee * 0.2) : 0;
  const grandTotal = subtotal + shippingFee + insuranceFee + transactionFee - discount;

  const pickup_address = buildAddress('pickup', consignor.pickupName, consignor.pickupPhone, consignor.pickupLine1, consignor.pickupCity, consignor.pickupDistrict, consignor.pickupEmail);
  const delivery_address = buildAddress('delivery', spec.recipient, spec.contactNumber, spec.recipientLine1, spec.city, spec.recipientDistrict);
  const return_address = { ...pickup_address, id: addressIdSeq++, type: 'return' as const };

  const items: OmsItem[] = [
    { id: 311500000 + index * 3, type: 'shipping', description: 'Shipping Fee', amount: round2(shippingFee), quantity: 1, total: round2(shippingFee), created_at: createdAt },
    { id: 311500001 + index * 3, type: 'product', description: spec.product, amount: round2(subtotal), quantity: 1, total: round2(subtotal), created_at: createdAt },
  ];
  if (spec.insured) {
    items.unshift({ id: 311500002 + index * 3, type: 'insurance', description: 'Insurance Fee', amount: round2(insuranceFee), quantity: 1, total: round2(insuranceFee), created_at: createdAt });
  }

  const tat: Record<string, number> = { sla_start: unixOf(createdAt), first_estimated_delivery_date: Math.floor(new Date(estimatedDeliveryDate.replace(' ', 'T')).getTime() / 1000) };
  for (const e of events) {
    if (!(e.status in tat)) tat[e.status] = unixOf(e.status_updated_at);
  }
  if (events[0]) tat.first_pickup_at = unixOf(createdAt);

  return {
    tracking_number: spec.tracking,
    reference_id: spec.referenceId ?? null,
    status,
    status_id: statusId,
    status_updated_at: statusUpdatedAt,
    status_remarks: statusRemarks,
    failure_reason: orderFailureReason,
    created_at: createdAt,
    updated_at: updatedAt,
    pickup_at: pickupAt,
    estimated_delivery_date: estimatedDeliveryDate,
    currency: 'PHP',
    grand_total: round2(grandTotal),
    shipment: spec.shipment,
    parcel: { for_pickup: { parcel_type: parcelTypeFor(spec.shipment) } },
    pickup_address,
    delivery_address,
    return_address,
    fees: {
      shipping_fee: round2(shippingFee),
      insurance_fee: round2(insuranceFee),
      transaction_fee: round2(transactionFee),
      return_fee: (spec.scenario.startsWith('failed_') || spec.scenario === 'returned_terminal') ? round2(shippingFee) : '0.00',
      return_fee_type: (spec.scenario.startsWith('failed_') || spec.scenario === 'returned_terminal') ? 'mf' : null,
    },
    breakdown: {
      subtotal: round2(subtotal),
      shipping: round2(shippingFee),
      tax: '0.00',
      fee: round2(transactionFee),
      insurance: round2(insuranceFee),
      discount: round2(discount),
    },
    payment: { method: spec.paymentMethod, provider: spec.paymentMethod === 'cod' ? 'lbcx' : 'cashinator' },
    seller_payment: { method: spec.serviceFeesPayor === 'seller' ? 'wallet' : null, provider: spec.serviceFeesPayor === 'seller' ? 'cashinator' : null },
    service: { id: SERVICES[spec.service].id, uuid: SERVICES[spec.service].uuid, provider: 'GOGO', name: spec.service },
    consignor: { party_id: consignor.partyId, name: consignor.name, uuid: consignor.uuid, status: 1, payment_terms: consignor.paymentTerms, payment_option: consignor.paymentOption },
    consignee: { id: null, email: null, contact_number: spec.contactNumber, name: spec.recipient, external_id: null },
    items,
    events,
    tat,
    metadata: {
      item_type: spec.shipment === 'document' ? 'Not Dangerous' : 'Not Dangerous',
      pricing_type: pricingTypeFor(spec),
      original_shipment: spec.shipment,
      service_fees_payor: spec.serviceFeesPayor,
      transaction_type: 'booking',
      transaction_scenario: spec.transactionScenario,
    },
  };
}

export const omsOrders: OmsOrder[] = specs.map(buildOmsOrder);

export function getOmsOrderByTracking(tracking: string): OmsOrder | undefined {
  return omsOrders.find((o) => o.tracking_number === tracking);
}
