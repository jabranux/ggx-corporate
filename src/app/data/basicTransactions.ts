// Basic-segment transaction mock data.
//
// GGX Basic accounts are standalone (no Main Account/Subaccount hierarchy) —
// see `AccountSegment` in `contexts/AuthContext.tsx` and `useScopedAccountId`'s
// Basic branch, which always resolves to the account's own id. These rows are
// spliced into the shared `transactions`/`deliveries` pipeline in
// `transactionService.ts` so the existing (Corporate-built) Transactions /
// Transaction Details pages render real content for a Basic account too,
// scoped by `txAccountId` via `subaccount` name (registered in `data/accounts.ts`)
// or `batch.accountId`.
//
// Demo account: 'basic-jamie-cruz' / "Jamie's Store" (see api/_lib/demoUsers.ts).
// Dates are recent (Nov 2026) relative to this account's other demo data.
// COD amounts here are the same ones referenced by `data/earnings.ts`'s Basic
// settlement rows — keep the two in sync when editing either.

import type { Transaction, TransactionItem, TimelineEvent, Party } from './transactions';

const SENDER: Party = {
  name: 'Jamie Cruz',
  contactNumber: '0917 234 5678',
  address: '45 Maginhawa Street, Teacher’s Village, Quezon City, Metro Manila',
};

const STORE = { name: "Jamie's Store", url: 'jamiesstore.ph' };

type Status = Transaction['status'];

function timeline(
  status: Status,
  dates: { confirmed: string; pickedUp?: string; inTransit?: string; resolved?: string },
  note?: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (status === 'delivered') {
    events.push({ status: 'Delivered', date: dates.resolved!, hasProof: true });
  } else if (status === 'failed') {
    events.push({ status: 'Delivery Attempt Failed', date: dates.resolved!, note });
  } else if (status === 'returned') {
    events.push({ status: 'Returned to Sender', date: dates.resolved! });
    events.push({ status: 'Delivery Attempt Failed', date: dates.inTransit!, note });
  } else if (status === 'cancelled') {
    events.push({ status: 'Booking Cancelled', date: dates.resolved!, note });
  }
  if (status === 'delivered' || status === 'in-transit' || status === 'failed' || status === 'returned') {
    events.push({ status: 'In Transit', date: dates.inTransit ?? dates.pickedUp! });
  }
  if (status !== 'pending' && status !== 'cancelled') {
    events.push({ status: 'Picked Up', date: dates.pickedUp! });
  }
  events.push({ status: 'Booking Confirmed', date: dates.confirmed });
  return events;
}

interface Row {
  trackingNumber: string;
  recipient: Party;
  destination: string;
  serviceType: 'standard' | 'same_day';
  status: Status;
  date: string;
  createdAt: string;
  pickupDate: string;
  deliveryDate: string;
  items: TransactionItem[];
  codAmount: number;
  paymentMethod: string;
  events: TimelineEvent[];
  sourceType: 'ggx_dashboard' | 'bulk_upload';
  bookingMethod: 'single_booking' | 'bulk_template_upload';
  batchId?: string;
  batchFileName?: string;
  failureReason?: string;
}

const ROWS: Row[] = [
  {
    trackingNumber: 'GGXB-2026-10012', recipient: { name: 'Victor Aquino', contactNumber: '0918 555 0112', address: '88 F. Blumentritt St., San Juan City, Metro Manila' },
    destination: 'San Juan City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 2, 2026', createdAt: 'Nov 1, 2026 – 6:40 PM', pickupDate: 'Nov 2, 2026', deliveryDate: 'Nov 2, 2026',
    items: [{ name: 'Tote Bag Bundle (3pc)', quantity: 1, description: 'Canvas tote bags, assorted colors', price: 4300 }],
    codAmount: 4300, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 1, 2026 – 6:40 PM', pickedUp: 'Nov 2, 2026 – 8:15 AM', inTransit: 'Nov 2, 2026 – 11:00 AM', resolved: 'Nov 2, 2026 – 3:20 PM' }),
    sourceType: 'bulk_upload', bookingMethod: 'bulk_template_upload',
    batchId: 'BASIC-UPLOAD-2026-11-02-001', batchFileName: 'nov2_morning_orders.xlsx',
  },
  {
    trackingNumber: 'GGXB-2026-10013', recipient: { name: 'Grace Lim', contactNumber: '0918 555 0113', address: '12 M. Reyes St., Antipolo City, Rizal' },
    destination: 'Antipolo City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 2, 2026', createdAt: 'Nov 1, 2026 – 6:40 PM', pickupDate: 'Nov 2, 2026', deliveryDate: 'Nov 2, 2026',
    items: [{ name: 'Scented Candle Set', quantity: 2, description: 'Soy wax candles, 8oz jars', price: 560 }],
    codAmount: 1120, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 1, 2026 – 6:40 PM', pickedUp: 'Nov 2, 2026 – 8:15 AM', inTransit: 'Nov 2, 2026 – 11:10 AM', resolved: 'Nov 2, 2026 – 4:05 PM' }),
    sourceType: 'bulk_upload', bookingMethod: 'bulk_template_upload',
    batchId: 'BASIC-UPLOAD-2026-11-02-001', batchFileName: 'nov2_morning_orders.xlsx',
  },
  {
    trackingNumber: 'GGXB-2026-10001', recipient: { name: 'Liza Fernandez', contactNumber: '0917 882 4410', address: '21 Mother Ignacia Ave., Quezon City, Metro Manila' },
    destination: 'Quezon City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 3, 2026', createdAt: 'Nov 2, 2026 – 9:12 AM', pickupDate: 'Nov 3, 2026', deliveryDate: 'Nov 3, 2026',
    items: [{ name: 'Crochet Keychains (5pc)', quantity: 1, description: 'Handmade crochet keychains, mixed designs', price: 1250 }],
    codAmount: 1250, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 2, 2026 – 9:12 AM', pickedUp: 'Nov 3, 2026 – 9:00 AM', inTransit: 'Nov 3, 2026 – 12:30 PM', resolved: 'Nov 3, 2026 – 5:45 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10002', recipient: { name: 'Mark Villanueva', contactNumber: '0917 220 3391', address: '305 Jupiter St., Makati City, Metro Manila' },
    destination: 'Makati City', serviceType: 'same_day', status: 'delivered',
    date: 'Nov 4, 2026', createdAt: 'Nov 4, 2026 – 8:05 AM', pickupDate: 'Nov 4, 2026', deliveryDate: 'Nov 4, 2026',
    items: [{ name: 'Phone Case (Clear)', quantity: 2, description: 'Shockproof clear case, assorted models', price: 425 }],
    codAmount: 850, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 4, 2026 – 8:05 AM', pickedUp: 'Nov 4, 2026 – 10:30 AM', inTransit: 'Nov 4, 2026 – 12:00 PM', resolved: 'Nov 4, 2026 – 3:10 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10003', recipient: { name: 'Angelica Reyes', contactNumber: '0917 440 8820', address: '7 Kalayaan Ave., Pasig City, Metro Manila' },
    destination: 'Pasig City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 6, 2026', createdAt: 'Nov 5, 2026 – 2:18 PM', pickupDate: 'Nov 6, 2026', deliveryDate: 'Nov 6, 2026',
    items: [{ name: 'Beaded Bracelet Set', quantity: 1, description: 'Handmade beaded bracelets (3pc)', price: 650 }],
    codAmount: 0, paymentMethod: 'GCash (paid)',
    events: timeline('delivered', { confirmed: 'Nov 5, 2026 – 2:18 PM', pickedUp: 'Nov 6, 2026 – 9:15 AM', inTransit: 'Nov 6, 2026 – 11:40 AM', resolved: 'Nov 6, 2026 – 4:30 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10015', recipient: { name: 'Samantha Yu', contactNumber: '0917 902 1145', address: '19 Alabang-Zapote Rd., Las Piñas City, Metro Manila' },
    destination: 'Las Piñas City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 9, 2026', createdAt: 'Nov 8, 2026 – 5:50 PM', pickupDate: 'Nov 9, 2026', deliveryDate: 'Nov 9, 2026',
    items: [{ name: 'Tumbler (Insulated)', quantity: 1, description: '500ml stainless tumbler, matte finish', price: 1890 }],
    codAmount: 1890, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 8, 2026 – 5:50 PM', pickedUp: 'Nov 9, 2026 – 8:50 AM', inTransit: 'Nov 9, 2026 – 11:20 AM', resolved: 'Nov 9, 2026 – 4:00 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10010', recipient: { name: 'Rafael Cruz', contactNumber: '0917 331 7790', address: '56 J.P. Laurel Ave., Davao City, Davao del Sur' },
    destination: 'Davao City', serviceType: 'standard', status: 'returned',
    date: 'Nov 10, 2026', createdAt: 'Nov 9, 2026 – 10:30 AM', pickupDate: 'Nov 10, 2026', deliveryDate: 'Nov 13, 2026',
    items: [{ name: 'Ceramic Mug Set (2pc)', quantity: 1, description: 'Hand-painted ceramic mugs', price: 2050 }],
    codAmount: 2050, paymentMethod: 'Cash on Delivery',
    events: timeline('returned', { confirmed: 'Nov 9, 2026 – 10:30 AM', pickedUp: 'Nov 10, 2026 – 9:40 AM', inTransit: 'Nov 11, 2026 – 2:00 PM', resolved: 'Nov 13, 2026 – 10:15 AM' }, 'Recipient unreachable after 3 delivery attempts'),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
    failureReason: 'recipient_unreachable',
  },
  {
    trackingNumber: 'GGXB-2026-10014', recipient: { name: 'Daniel Garcia', contactNumber: '0917 774 2208', address: '33 Gil Fernando Ave., Marikina City, Metro Manila' },
    destination: 'Marikina City', serviceType: 'same_day', status: 'delivered',
    date: 'Nov 11, 2026', createdAt: 'Nov 11, 2026 – 9:00 AM', pickupDate: 'Nov 11, 2026', deliveryDate: 'Nov 11, 2026',
    items: [{ name: 'Phone Charger Cable (3pc)', quantity: 1, description: 'USB-C fast charging cable, 1m', price: 990 }],
    codAmount: 0, paymentMethod: 'GCash (paid)',
    events: timeline('delivered', { confirmed: 'Nov 11, 2026 – 9:00 AM', pickedUp: 'Nov 11, 2026 – 11:20 AM', inTransit: 'Nov 11, 2026 – 1:00 PM', resolved: 'Nov 11, 2026 – 4:45 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10011', recipient: { name: 'Bianca Lopez', contactNumber: '0917 115 6632', address: '9 General Luna St., Iloilo City, Iloilo' },
    destination: 'Iloilo City', serviceType: 'standard', status: 'cancelled',
    date: 'Nov 12, 2026', createdAt: 'Nov 12, 2026 – 8:20 AM', pickupDate: 'Nov 12, 2026', deliveryDate: '—',
    items: [{ name: 'Throw Pillow Cover (2pc)', quantity: 1, description: 'Linen pillow covers, 18x18in', price: 780 }],
    codAmount: 0, paymentMethod: 'Credit Card (paid)',
    events: timeline('cancelled', { confirmed: 'Nov 12, 2026 – 8:20 AM', resolved: 'Nov 12, 2026 – 9:05 AM' }, 'Cancelled by sender before pickup'),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10009', recipient: { name: 'Michelle Ong', contactNumber: '0917 668 2290', address: '14 Osmeña Blvd., Cebu City, Cebu' },
    destination: 'Cebu City', serviceType: 'standard', status: 'failed',
    date: 'Nov 15, 2026', createdAt: 'Nov 14, 2026 – 3:40 PM', pickupDate: 'Nov 15, 2026', deliveryDate: 'Nov 17, 2026',
    items: [{ name: 'Leather Wallet', quantity: 1, description: 'Genuine leather bifold wallet', price: 1700 }],
    codAmount: 1700, paymentMethod: 'Cash on Delivery',
    events: timeline('failed', { confirmed: 'Nov 14, 2026 – 3:40 PM', pickedUp: 'Nov 15, 2026 – 9:10 AM', inTransit: 'Nov 16, 2026 – 10:00 AM', resolved: 'Nov 17, 2026 – 1:30 PM' }, 'Recipient unavailable at delivery address'),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
    failureReason: 'recipient_unavailable',
  },
  {
    trackingNumber: 'GGXB-2026-10016', recipient: { name: 'Joshua Bautista', contactNumber: '0917 556 9912', address: '2 Civic Drive, Muntinlupa City, Metro Manila' },
    destination: 'Muntinlupa City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 16, 2026', createdAt: 'Nov 15, 2026 – 6:10 PM', pickupDate: 'Nov 16, 2026', deliveryDate: 'Nov 16, 2026',
    items: [{ name: 'Yoga Mat (6mm)', quantity: 1, description: 'Non-slip yoga mat with strap', price: 2675 }],
    codAmount: 2675, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 15, 2026 – 6:10 PM', pickedUp: 'Nov 16, 2026 – 9:00 AM', inTransit: 'Nov 16, 2026 – 11:45 AM', resolved: 'Nov 16, 2026 – 5:20 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10017', recipient: { name: 'Patricia Mendoza', contactNumber: '0917 290 4471', address: '58 Visayas Ave., Quezon City, Metro Manila' },
    destination: 'Quezon City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 25, 2026', createdAt: 'Nov 24, 2026 – 4:30 PM', pickupDate: 'Nov 25, 2026', deliveryDate: 'Nov 25, 2026',
    items: [
      { name: 'Scrunchie Set (6pc)', quantity: 1, description: 'Satin scrunchies, assorted colors', price: 450 },
      { name: 'Tote Bag Bundle (3pc)', quantity: 1, description: 'Canvas tote bags, assorted colors', price: 2950 },
    ],
    codAmount: 3400, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 24, 2026 – 4:30 PM', pickedUp: 'Nov 25, 2026 – 8:40 AM', inTransit: 'Nov 25, 2026 – 11:00 AM', resolved: 'Nov 25, 2026 – 3:50 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10006', recipient: { name: 'Paolo Ramos', contactNumber: '0917 603 8841', address: '11 A. Mabini St., Caloocan City, Metro Manila' },
    destination: 'Caloocan City', serviceType: 'standard', status: 'picked-up',
    date: 'Nov 25, 2026', createdAt: 'Nov 24, 2026 – 7:50 PM', pickupDate: 'Nov 25, 2026', deliveryDate: 'Nov 26, 2026 (est.)',
    items: [{ name: 'Baking Supplies Bundle', quantity: 1, description: 'Flour, sugar, and baking essentials', price: 980 }],
    codAmount: 980, paymentMethod: 'Cash on Delivery',
    events: timeline('picked-up', { confirmed: 'Nov 24, 2026 – 7:50 PM', pickedUp: 'Nov 25, 2026 – 9:30 AM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10004', recipient: { name: 'Noel Santos', contactNumber: '0917 522 9034', address: '27 C-5 Road, Taguig City, Metro Manila' },
    destination: 'Taguig City', serviceType: 'standard', status: 'in-transit',
    date: 'Nov 24, 2026', createdAt: 'Nov 23, 2026 – 6:00 PM', pickupDate: 'Nov 24, 2026', deliveryDate: 'Nov 26, 2026 (est.)',
    items: [{ name: 'Desk Organizer', quantity: 1, description: 'Bamboo desk organizer with drawers', price: 2400 }],
    codAmount: 2400, paymentMethod: 'Cash on Delivery',
    events: timeline('in-transit', { confirmed: 'Nov 23, 2026 – 6:00 PM', pickedUp: 'Nov 24, 2026 – 9:15 AM', inTransit: 'Nov 24, 2026 – 1:40 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10018', recipient: { name: 'Enrico Salazar', contactNumber: '0917 384 1120', address: '5 Shaw Blvd., Pasig City, Metro Manila' },
    destination: 'Pasig City', serviceType: 'standard', status: 'delivered',
    date: 'Nov 27, 2026', createdAt: 'Nov 26, 2026 – 5:15 PM', pickupDate: 'Nov 27, 2026', deliveryDate: 'Nov 27, 2026',
    items: [{ name: 'Wireless Earbuds Case', quantity: 1, description: 'Protective silicone case', price: 1560 }],
    codAmount: 1560, paymentMethod: 'Cash on Delivery',
    events: timeline('delivered', { confirmed: 'Nov 26, 2026 – 5:15 PM', pickedUp: 'Nov 27, 2026 – 8:50 AM', inTransit: 'Nov 27, 2026 – 11:10 AM', resolved: 'Nov 27, 2026 – 3:30 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10005', recipient: { name: 'Carla Dizon', contactNumber: '0917 447 2256', address: '14 Shaw Blvd., Mandaluyong City, Metro Manila' },
    destination: 'Mandaluyong City', serviceType: 'same_day', status: 'in-transit',
    date: 'Nov 26, 2026', createdAt: 'Nov 26, 2026 – 8:00 AM', pickupDate: 'Nov 26, 2026', deliveryDate: 'Nov 26, 2026 (est.)',
    items: [{ name: 'Skincare Set', quantity: 1, description: 'Facial wash, toner, and moisturizer trio', price: 1450 }],
    codAmount: 0, paymentMethod: 'Credit Card (paid)',
    events: timeline('in-transit', { confirmed: 'Nov 26, 2026 – 8:00 AM', pickedUp: 'Nov 26, 2026 – 10:15 AM', inTransit: 'Nov 26, 2026 – 12:30 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10007', recipient: { name: 'Ella Navarro', contactNumber: '0917 801 4423', address: '8 Roxas Blvd., Pasay City, Metro Manila' },
    destination: 'Pasay City', serviceType: 'standard', status: 'pending',
    date: 'Nov 27, 2026', createdAt: 'Nov 27, 2026 – 2:40 PM', pickupDate: 'Nov 28, 2026 (scheduled)', deliveryDate: 'Nov 29, 2026 (est.)',
    items: [{ name: 'Perfume Oil Set (3pc)', quantity: 1, description: 'Concentrated perfume oils, 10ml each', price: 3150 }],
    codAmount: 3150, paymentMethod: 'Cash on Delivery',
    events: timeline('pending', { confirmed: 'Nov 27, 2026 – 2:40 PM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
  {
    trackingNumber: 'GGXB-2026-10008', recipient: { name: 'Francis Tan', contactNumber: '0917 993 7712', address: '22 Dr. A. Santos Ave., Parañaque City, Metro Manila' },
    destination: 'Parañaque City', serviceType: 'same_day', status: 'pending',
    date: 'Nov 28, 2026', createdAt: 'Nov 28, 2026 – 7:50 AM', pickupDate: 'Nov 28, 2026 (scheduled)', deliveryDate: 'Nov 28, 2026 (est.)',
    items: [{ name: 'Phone Charger Cable (3pc)', quantity: 1, description: 'USB-C fast charging cable, 1m', price: 890 }],
    codAmount: 0, paymentMethod: 'GCash (paid)',
    events: timeline('pending', { confirmed: 'Nov 28, 2026 – 7:50 AM' }),
    sourceType: 'ggx_dashboard', bookingMethod: 'single_booking',
  },
];

function packagingFor(items: TransactionItem[]): Transaction['packaging'] {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  if (totalQty <= 1) return { size: 'Small', dimensions: '20 x 15 x 10 cm', weight: '0.5 kg' };
  if (totalQty <= 3) return { size: 'Medium', dimensions: '30 x 25 x 15 cm', weight: '1.5 kg' };
  return { size: 'Large', dimensions: '40 x 35 x 20 cm', weight: '3 kg' };
}

function feesFor(codAmount: number): Transaction['fees'] {
  return {
    serviceFee: 0,
    shippingFee: 99,
    protectionFee: codAmount > 0 ? Math.round(codAmount * 0.01) : 15,
    discount: 0,
    processingFee: codAmount === 0 ? 15 : 0,
  };
}

export const basicTransactions: Transaction[] = ROWS.map((r) => ({
  trackingNumber: r.trackingNumber,
  destination: r.destination,
  type: r.serviceType === 'same_day' ? 'Express' : 'Standard',
  serviceType: r.serviceType,
  status: r.status,
  date: r.date,
  subaccount: "Jamie's Store",
  source: r.sourceType === 'bulk_upload' ? 'bulk_upload' : 'manual',
  attribution: {
    accountScope: 'main',
    sourceType: r.sourceType,
    bookingMethod: r.bookingMethod,
    createdBy: 'Jamie Cruz',
  },
  createdAt: r.createdAt,
  pickupDate: r.pickupDate,
  deliveryDate: r.deliveryDate,
  sender: SENDER,
  recipient: r.recipient,
  items: r.items,
  packaging: packagingFor(r.items),
  store: STORE,
  fees: feesFor(r.codAmount),
  payment: {
    method: r.paymentMethod,
    paidBy: r.codAmount > 0 ? 'Recipient (COD)' : 'Sender',
    codAmount: r.codAmount,
  },
  timeline: r.events,
  batch: r.batchId
    ? {
        batchId: r.batchId,
        fileName: r.batchFileName!,
        uploadedVia: 'bulk_upload',
        accountId: 'basic-jamie-cruz',
        accountName: "Jamie's Store",
      }
    : undefined,
  failureReason: r.failureReason,
}));
