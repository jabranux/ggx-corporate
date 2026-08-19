/**
 * Fixture transaction for the Edit Delivery Details journey (P3). Lives
 * outside the real transactions seed — never written into it — so
 * TransactionDetails can render a controlled, always-editable scenario
 * without mutating `data/transactions.ts` or `transactionService`.
 */

import type { Transaction } from '../services/transactionService';
import { JOURNEY_P3_TRACKING_NUMBER } from './journeyRegistry';
import { computeItemProtectionFee, JOURNEY_POUCH_SIZE_FEE } from '../lib/journeyPricing';

/** Editable fields a presenter can change in the journey's edit drawer. */
export interface JourneyEditDeliveryDraft {
  senderAddress?: string;
  pickupDate?: string;
  itemName?: string;
  pouchSize?: string;
  codAmount?: number;
  itemProtection?: boolean;
}

const BASE_ITEM_VALUE = 1800;
const BASE_POUCH_SIZE = 'MEDIUM';

/** Fresh, unedited fixture — status `pending` (pre-pickup) and COD payable, so it is editable by default. */
export function buildJourneyEditFixtureTransaction(): Transaction {
  return {
    trackingNumber: JOURNEY_P3_TRACKING_NUMBER,
    destination: 'Quezon City, Metro Manila',
    type: 'Standard',
    serviceType: 'standard',
    status: 'pending',
    date: '2026-08-18',
    subaccount: 'Acme Corporation',
    source: 'manual',
    attribution: {
      accountScope: 'main',
      sourceType: 'ggx_dashboard',
      bookingMethod: 'single_booking',
      createdBy: 'Max Rodriguez',
    },
    createdAt: '2026-08-18 09:15 AM',
    pickupDate: '2026-08-19',
    deliveryDate: '2026-08-21 (estimated)',
    sender: {
      name: 'Acme Corporation',
      contactNumber: '+63 917 123 4567',
      address: '5th Floor, ABC Building, Ayala Avenue, Poblacion, Makati City, Metro Manila',
    },
    recipient: {
      name: 'Liza Fernandez',
      contactNumber: '+63 917 555 2211',
      address: 'Blk 12 Lot 4, Visayas Ave, Quezon City, Metro Manila',
    },
    items: [
      { name: 'Gift Hamper Set', quantity: 1, description: 'Curated gift hamper', price: BASE_ITEM_VALUE },
    ],
    packaging: { size: BASE_POUCH_SIZE, dimensions: '—', weight: '2.0 kg' },
    store: { name: 'Acme Corporation', url: 'acme-corp.gogoxpress.com' },
    fees: {
      serviceFee: 0,
      shippingFee: 129, // matches JOURNEY_POUCH_SIZE_FEE.MEDIUM
      protectionFee: computeItemProtectionFee(BASE_ITEM_VALUE),
      discount: 0,
      processingFee: 0,
    },
    payment: { method: 'Cash on Delivery (COD)', paidBy: 'Recipient', codAmount: BASE_ITEM_VALUE },
    timeline: [
      { status: 'Order Created', date: '2026-08-18 09:15 AM', note: 'Order placed and awaiting confirmation' },
      { status: 'Booking Confirmed', date: '2026-08-18 09:20 AM', note: 'Booking confirmed and processing' },
    ],
  };
}

/** Merge a confirmed draft onto the base fixture — journey-local state only, never persisted. */
export function applyJourneyEditDraft(base: Transaction, draft: JourneyEditDeliveryDraft | null): Transaction {
  if (!draft) return base;
  const pouchSize = draft.pouchSize ?? base.packaging.size;
  const itemProtection = draft.itemProtection ?? base.fees.protectionFee > 0;
  const declaredValue = base.items[0]?.price ?? BASE_ITEM_VALUE;
  return {
    ...base,
    sender: { ...base.sender, address: draft.senderAddress ?? base.sender.address },
    pickupDate: draft.pickupDate ?? base.pickupDate,
    items: base.items.map((item, i) => (i === 0 ? { ...item, name: draft.itemName ?? item.name } : item)),
    packaging: { ...base.packaging, size: pouchSize },
    fees: {
      ...base.fees,
      shippingFee: JOURNEY_POUCH_SIZE_FEE[pouchSize] ?? base.fees.shippingFee,
      protectionFee: itemProtection ? computeItemProtectionFee(declaredValue) : 0,
    },
    payment: { ...base.payment, codAmount: draft.codAmount ?? base.payment.codAmount },
  };
}
