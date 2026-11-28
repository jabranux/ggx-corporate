// Earnings / Settlements mock data (frontend only).
//
// Consumed by Earnings.tsx (list) and EarningsSettlementDetail.tsx (detail).
// Each settlement includes a small set of mock transactions so the detail page
// has something to render. Tracking numbers that exist in transactions.ts are
// used where they match; the rest are illustrative mock IDs.

export type SettlementStatus = 'pending' | 'processing' | 'scheduled' | 'deposited' | 'failed' | 'on-hold';

export interface SettlementTransaction {
  trackingNumber: string;
  recipient: string;
  destination: string;
  codAmount: number;
  fees: number;
  net: number;
  status: 'delivered' | 'failed' | 'returned';
}

export interface Settlement {
  id: string;
  source: string;
  period: string;
  grossAmount: number;
  fees: number;
  netAmount: number;
  status: SettlementStatus;
  expectedDate: string;
  subaccount: string;
  subaccountId?: string;
  transactions: SettlementTransaction[];
}

export const SETTLEMENT_STATUS_CONFIG: Record<SettlementStatus, { variant: 'pending' | 'info' | 'warning' | 'success' | 'danger' | 'default'; label: string }> = {
  pending:    { variant: 'pending', label: 'Pending Collection' },
  processing: { variant: 'info',    label: 'Processing' },
  scheduled:  { variant: 'warning', label: 'Scheduled' },
  deposited:  { variant: 'success', label: 'Deposited' },
  failed:     { variant: 'danger',  label: 'Failed' },
  'on-hold':  { variant: 'default', label: 'On Hold' },
};

export const SETTLEMENTS: Settlement[] = [
  {
    id: 'SET-2026-05-003',
    source: 'COD',
    period: 'May 13–18, 2026',
    grossAmount: 487500,
    fees: 14625,
    netAmount: 472875,
    status: 'scheduled',
    expectedDate: '2026-05-22',
    subaccount: 'Acme Corporation',
    subaccountId: 'acme-corporation',
    transactions: [
      { trackingNumber: 'GGX-2024-89240', recipient: 'Maria Santos',    destination: 'Quezon City',   codAmount: 1850, fees: 55.50, net: 1794.50, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89238', recipient: 'Juan dela Cruz',  destination: 'Makati City',   codAmount: 3200, fees: 96.00, net: 3104.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89235', recipient: 'Ana Reyes',       destination: 'Pasig City',    codAmount: 4500, fees: 135.00, net: 4365.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89231', recipient: 'Jose Garcia',     destination: 'Taguig City',   codAmount: 4300, fees: 129.00, net: 4171.00, status: 'failed' },
    ],
  },
  {
    id: 'SET-2026-05-002',
    source: 'COD',
    period: 'May 6–12, 2026',
    grossAmount: 523000,
    fees: 15690,
    netAmount: 507310,
    status: 'deposited',
    expectedDate: '2026-05-15',
    subaccount: 'Acme Luzon',
    subaccountId: 'acme-luzon',
    transactions: [
      { trackingNumber: 'GGX-2024-89239', recipient: 'Carmen Lopez',    destination: 'Cebu City',     codAmount: 2100, fees: 63.00, net: 2037.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89237', recipient: 'Pedro Villanueva', destination: 'Davao City',   codAmount: 5500, fees: 165.00, net: 5335.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89236', recipient: 'Luz Fernandez',   destination: 'Iloilo City',   codAmount: 12300, fees: 369.00, net: 11931.00, status: 'failed' },
    ],
  },
  {
    id: 'SET-2026-05-001',
    source: 'COD',
    period: 'May 1–5, 2026',
    grossAmount: 398200,
    fees: 11946,
    netAmount: 386254,
    status: 'deposited',
    expectedDate: '2026-05-08',
    subaccount: 'Acme Corporation',
    subaccountId: 'acme-corporation',
    transactions: [
      { trackingNumber: 'GGX-2024-89234', recipient: 'Roberto Cruz',    destination: 'Mandaluyong',   codAmount: 7800, fees: 234.00, net: 7566.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89233', recipient: 'Sofia Mendoza',   destination: 'San Juan City', codAmount: 3200, fees: 96.00,  net: 3104.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89232', recipient: 'Emmanuel Torres', destination: 'Caloocan City', codAmount: 6100, fees: 183.00, net: 5917.00, status: 'returned' },
    ],
  },
  {
    id: 'SET-2026-04-006',
    source: 'COD',
    period: 'Apr 27–30, 2026',
    grossAmount: 445600,
    fees: 13368,
    netAmount: 432232,
    status: 'deposited',
    expectedDate: '2026-05-02',
    subaccount: 'Acme Luzon',
    subaccountId: 'acme-luzon',
    transactions: [
      { trackingNumber: 'GGX-2024-89230', recipient: 'Remedios Ocampo', destination: 'Bacolod City',  codAmount: 4400, fees: 132.00, net: 4268.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89229', recipient: 'Danilo Bautista', destination: 'General Santos', codAmount: 9200, fees: 276.00, net: 8924.00, status: 'delivered' },
    ],
  },
  {
    id: 'SET-2026-04-005',
    source: 'Online Payment',
    period: 'Apr 20–26, 2026',
    grossAmount: 612800,
    fees: 18384,
    netAmount: 594416,
    status: 'processing',
    expectedDate: '2026-04-29',
    subaccount: 'Acme Corporation',
    subaccountId: 'acme-corporation',
    transactions: [
      { trackingNumber: 'GGX-2024-89228', recipient: 'Gloria Aquino',   destination: 'Angeles City',  codAmount: 0,    fees: 150.00, net: -150.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89227', recipient: 'Vicente Ramos',   destination: 'Antipolo City', codAmount: 0,    fees: 150.00, net: -150.00, status: 'delivered' },
      { trackingNumber: 'GGX-2024-89226', recipient: 'Maricel Santos',  destination: 'Imus, Cavite',  codAmount: 0,    fees: 150.00, net: -150.00, status: 'delivered' },
    ],
  },
];

export function getSettlement(id: string): Settlement | undefined {
  return SETTLEMENTS.find((s) => s.id === id);
}

// ── Basic-segment settlements ────────────────────────────────────────────────
// Built from the same COD tracking numbers/amounts as `data/basicTransactions.ts`
// (demo Basic account 'basic-jamie-cruz' / "Jamie's Store" — see
// api/_lib/demoUsers.ts) so Earnings/Payout history stays consistent with the
// Transactions/Transaction Details pages. Filtered in via `getSettlements`'s
// existing `subaccountId` filter — no new service code needed.
export const BASIC_SETTLEMENTS: Settlement[] = [
  {
    id: 'SET-BASIC-2026-11-W4',
    source: 'COD',
    period: 'Nov 22–28, 2026',
    grossAmount: 4960,
    fees: 148.80,
    netAmount: 4811.20,
    status: 'pending',
    expectedDate: '2026-12-02',
    subaccount: "Jamie's Store",
    subaccountId: 'basic-jamie-cruz',
    transactions: [
      { trackingNumber: 'GGXB-2026-10017', recipient: 'Patricia Mendoza', destination: 'Quezon City', codAmount: 3400, fees: 102.00, net: 3298.00, status: 'delivered' },
      { trackingNumber: 'GGXB-2026-10018', recipient: 'Enrico Salazar',   destination: 'Pasig City',   codAmount: 1560, fees: 46.80,  net: 1513.20, status: 'delivered' },
    ],
  },
  {
    id: 'SET-BASIC-2026-11-W3',
    source: 'COD',
    period: 'Nov 15–21, 2026',
    grossAmount: 2675,
    fees: 80.25,
    netAmount: 2594.75,
    status: 'scheduled',
    expectedDate: '2026-11-24',
    subaccount: "Jamie's Store",
    subaccountId: 'basic-jamie-cruz',
    transactions: [
      { trackingNumber: 'GGXB-2026-10016', recipient: 'Joshua Bautista', destination: 'Muntinlupa City', codAmount: 2675, fees: 80.25, net: 2594.75, status: 'delivered' },
      { trackingNumber: 'GGXB-2026-10009', recipient: 'Michelle Ong',    destination: 'Cebu City',       codAmount: 1700, fees: 51.00, net: 1649.00, status: 'failed' },
    ],
  },
  {
    id: 'SET-BASIC-2026-11-W2',
    source: 'COD',
    period: 'Nov 8–14, 2026',
    grossAmount: 1890,
    fees: 56.70,
    netAmount: 1833.30,
    status: 'deposited',
    expectedDate: '2026-11-17',
    subaccount: "Jamie's Store",
    subaccountId: 'basic-jamie-cruz',
    transactions: [
      { trackingNumber: 'GGXB-2026-10015', recipient: 'Samantha Yu', destination: 'Las Piñas City', codAmount: 1890, fees: 56.70, net: 1833.30, status: 'delivered' },
      { trackingNumber: 'GGXB-2026-10010', recipient: 'Rafael Cruz', destination: 'Davao City',      codAmount: 2050, fees: 61.50, net: 1988.50, status: 'returned' },
    ],
  },
  {
    id: 'SET-BASIC-2026-11-W1',
    source: 'COD',
    period: 'Nov 1–7, 2026',
    grossAmount: 7520,
    fees: 225.60,
    netAmount: 7294.40,
    status: 'deposited',
    expectedDate: '2026-11-10',
    subaccount: "Jamie's Store",
    subaccountId: 'basic-jamie-cruz',
    transactions: [
      { trackingNumber: 'GGXB-2026-10012', recipient: 'Victor Aquino',   destination: 'San Juan City',  codAmount: 4300, fees: 129.00, net: 4171.00, status: 'delivered' },
      { trackingNumber: 'GGXB-2026-10013', recipient: 'Grace Lim',       destination: 'Antipolo City',  codAmount: 1120, fees: 33.60,  net: 1086.40, status: 'delivered' },
      { trackingNumber: 'GGXB-2026-10001', recipient: 'Liza Fernandez',  destination: 'Quezon City',    codAmount: 1250, fees: 37.50,  net: 1212.50, status: 'delivered' },
      { trackingNumber: 'GGXB-2026-10002', recipient: 'Mark Villanueva', destination: 'Makati City',    codAmount: 850,  fees: 25.50,  net: 824.50,  status: 'delivered' },
    ],
  },
];

SETTLEMENTS.push(...BASIC_SETTLEMENTS);
