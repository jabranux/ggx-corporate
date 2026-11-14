/**
 * Central booking-draft shape for the GGX Basic single-booking flow. Shared
 * verbatim between the desktop two-column page and the mobile guided
 * journey — both read/write the same draft, never a per-breakpoint copy.
 *
 * `feePayer` / `senderPaymentMethod` (who pays the shipping fee, and how),
 * `merchandiseCod` (receiver-collected item value), and
 * `declaredValue` (drives item-protection fee only) are kept strictly
 * independent fields by design — none is derived from another. See
 * `components/ShippingFeePayerSelector.tsx`'s header comment.
 */
import type { Address } from '../components/AddressBook';
import type { DeliveryServiceType } from '../services/transactionService';
import type { BasicPouchSizeKey } from './basicPouchSizes';

export type FirstMile = 'pickup' | 'dropoff';
export type FeePayer = 'sender' | 'receiver';
export type SenderPaymentMethod = 'cash_pickup' | 'gcash_qr' | 'gcash_wallet';

export interface MerchandiseCod {
  enabled: boolean;
  /** String while editing — parse with Number() before use. */
  amount: string;
}

export interface BookingDraft {
  pickupAddressId: string | null;
  pickupAddress: Address | null;
  recipientAddressId: string | null;
  recipientAddress: Address | null;
  firstMile: FirstMile;
  serviceType: DeliveryServiceType;
  /** ISO date string (yyyy-mm-dd), chosen from the eligible pickup-date chips. Required for 'standard', unused for 'on_demand' (immediate). */
  pickupDate: string | null;
  pouchSize: BasicPouchSizeKey;
  itemDescription: string;
  /** String while editing — parse with Number() before use. Drives item protection only. */
  declaredValue: string;
  merchandiseCod: MerchandiseCod;
  feePayer: FeePayer;
  senderPaymentMethod: SenderPaymentMethod;
  voucherCode: string;
  voucherDiscount: number;
}

export const EMPTY_MERCHANDISE_COD: MerchandiseCod = { enabled: false, amount: '' };

export const INITIAL_BOOKING_DRAFT: BookingDraft = {
  pickupAddressId: null,
  pickupAddress: null,
  recipientAddressId: null,
  recipientAddress: null,
  firstMile: 'pickup',
  serviceType: 'standard',
  pickupDate: null,
  pouchSize: 'small',
  itemDescription: '',
  declaredValue: '',
  merchandiseCod: EMPTY_MERCHANDISE_COD,
  feePayer: 'sender',
  senderPaymentMethod: 'cash_pickup',
  voucherCode: '',
  voucherDiscount: 0,
};
