/**
 * bulkUploadService — bulk upload history, batch detail, and summary access.
 *
 * All functions are async to match a real API contract.
 * Currently backed by `data/bulkUploads.ts` (session-level state + localStorage).
 *
 * Future API endpoints:
 *   GET  /bulk-uploads              → getBulkUploads
 *   GET  /bulk-uploads/:id          → getBulkUploadById
 *   GET  /bulk-uploads/:id/summary  → getBulkUploadSummary
 *   GET  /accounts/:id/bulk-uploads → getBulkUploadsBySubaccountId
 *   POST /bulk-uploads              → createBulkUpload (handled in BulkUploader UI)
 */

import {
  getSessionUploads,
  addUpload,
  updateUploadStatus,
  generateUploadId,
  createUploadRecord,
  setSpreadsheetBatchRows,
  getSpreadsheetBatchRows,
  setBatchRowsState,
  getBatchRowsState,
  buildBatchRowFiller,
  spreadsheetRowToBatchRowSnapshot,
  type UploadRecord,
  type UploadStatus,
  type UploadAccount,
  type SpreadsheetBatchRow,
  type BatchRowSnapshot,
  type BatchRowsState,
} from '../data/bulkUploads';

export type { UploadRecord, UploadStatus, UploadAccount, SpreadsheetBatchRow, BatchRowSnapshot, BatchRowsState };

export interface BulkUploadFilters {
  subaccountId?: string;
  status?: UploadStatus | 'all';
}

export interface BulkUploadSummary {
  batchId: string;
  fileName: string;
  subaccountId: string;
  subaccountName: string;
  uploadedBy: string;
  status: UploadStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  bookedCount: number;
  failedCount: number;
  uploadedAt: string;
}

/**
 * Seed uploads shown in BulkUploader's Recent Uploads (matches SEED_UPLOADS in
 * BulkUploader.tsx). The three already-processed batches below (awaiting-payment
 * / completed) have real linked Transaction records in `data/transactions.ts`'s
 * seed (via `batch.reportedCounts` on the matching `omsOrders` entries) — their
 * totalRows/validRows here are kept aligned to that linked batch's reported
 * total so this record's own stats never contradict what the Completed Batch
 * Details / Transactions "By Batch" pages show for the same batch id.
 */
const SEED_RECORDS: UploadRecord[] = [
  { id: 'UPLOAD-2026-05-19-001', fileName: 'bulk_shipments_may19.xlsx', uploadedAt: '2026-05-19 10:30 AM', totalRows: 5,   validRows: 3,   errorRows: 2, status: 'needs-review', uploadMode: 'standard',  firstMile: 'pickup',  accountId: 'acme-corporation', accountName: 'Acme Corporation', accountType: 'subaccount' },
  { id: 'UPLOAD-2026-05-18-003', fileName: 'daily_orders_batch3.xlsx',  uploadedAt: '2026-05-18 04:15 PM', totalRows: 198, validRows: 198, errorRows: 0, status: 'awaiting-payment', uploadMode: 'standard',  firstMile: 'pickup',  accountId: 'acme-corporation', accountName: 'Acme Corporation', accountType: 'subaccount' },
  { id: 'UPLOAD-2026-05-18-002', fileName: 'weekend_deliveries.xlsx',   uploadedAt: '2026-05-18 02:45 PM', totalRows: 156, validRows: 156, errorRows: 0, status: 'completed',     uploadMode: 'same-day', firstMile: 'dropoff', accountId: 'acme-luzon',       accountName: 'Acme Luzon',       accountType: 'subaccount' },
  { id: 'UPLOAD-2026-05-18-001', fileName: 'morning_batch.xlsx',        uploadedAt: '2026-05-18 09:20 AM', totalRows: 134, validRows: 134, errorRows: 0, status: 'completed',     uploadMode: 'standard',  firstMile: 'pickup',  accountId: 'acme-luzon',       accountName: 'Acme Luzon',       accountType: 'subaccount' },
];

function mergeWithSeed(session: readonly UploadRecord[]): UploadRecord[] {
  const sessionIds = new Set(session.map((r) => r.id));
  return [
    ...session,
    ...SEED_RECORDS.filter((r) => !sessionIds.has(r.id)),
  ];
}

/** Return all bulk uploads, merging session (live) records with the seed. */
export async function getBulkUploads(
  filters?: BulkUploadFilters
): Promise<UploadRecord[]> {
  let records = mergeWithSeed(getSessionUploads());
  if (!filters) return records;

  if (filters.subaccountId && filters.subaccountId !== 'main') {
    records = records.filter((r) => r.accountId === filters.subaccountId);
  }
  if (filters.status && filters.status !== 'all') {
    records = records.filter((r) => r.status === filters.status);
  }
  return records;
}

/** Return a single upload record by batch id, or null. */
export async function getBulkUploadById(
  batchId: string
): Promise<UploadRecord | null> {
  const all = mergeWithSeed(getSessionUploads());
  return all.find((r) => r.id === batchId) ?? null;
}

/**
 * Whether a signed-in user may view a batch's detail data (Review Before
 * Booking, Ready Rows, Completed Batch Details) — the same account/subaccount
 * scope rule every other surface follows: Main Account (admin) sees
 * consolidated data; a manager only sees their own subaccount's batches.
 * Callers should treat `false` exactly like "not found" — never reveal that a
 * batch exists under another subaccount (same convention the support/claims
 * proxy routes use server-side: 404, not 403).
 */
export function canViewBulkUploadBatch(
  record: Pick<UploadRecord, 'accountId'>,
  user: { role: 'admin' | 'manager'; accountId: string } | null | undefined,
): boolean {
  if (!user) return false;
  return user.role !== 'manager' || record.accountId === user.accountId;
}

/**
 * Return a structured summary for a batch.
 * The error/valid counts are the source of truth; booked/failed are derived
 * estimates (real values come from the backend confirmation response).
 */
export async function getBulkUploadSummary(
  batchId: string
): Promise<BulkUploadSummary | null> {
  const record = await getBulkUploadById(batchId);
  if (!record) return null;
  return {
    batchId: record.id,
    fileName: record.fileName,
    subaccountId: record.accountId,
    subaccountName: record.accountName,
    uploadedBy: 'Current User', // Deferred: derive from auth session
    status: record.status,
    totalRows: record.totalRows,
    validRows: record.validRows,
    errorRows: record.errorRows,
    bookedCount: record.status === 'completed' ? record.validRows : 0,
    failedCount: record.errorRows,
    uploadedAt: record.uploadedAt,
  };
}

/** Return all uploads for a specific subaccount. */
export async function getBulkUploadsBySubaccountId(
  subaccountId: string
): Promise<UploadRecord[]> {
  return getBulkUploads({ subaccountId });
}

// Re-export write helpers so consumers don't import data layer directly.
export {
  addUpload, updateUploadStatus, generateUploadId, createUploadRecord,
  setSpreadsheetBatchRows, getSpreadsheetBatchRows,
  setBatchRowsState, getBatchRowsState, buildBatchRowFiller, spreadsheetRowToBatchRowSnapshot,
};
