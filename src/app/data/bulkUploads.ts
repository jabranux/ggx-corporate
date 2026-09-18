// Module-level store for upload sessions (frontend-only).
// State lives for the lifetime of the browser tab.
//
// Notification integration (done): `PENDING_NOTIFICATIONS` is consumed by
// `src/app/data/notifications.ts`, which maps each UploadNotificationEvent into
// the unified AppNotification model (category 'bulk_upload') rendered in the
// RootLayout bell popover and the Notifications page. `event.read` is flipped by
// `markAllNotificationsRead()` when the popover/page is opened.

import { loadState, saveState } from '../lib/storage';

export type UploadStatus = 'processing' | 'needs-review' | 'awaiting-payment' | 'completed';

// Account scope captured at upload time so notifications and batch linkage are
// correctly scoped. `main` = parent/Main Account; `subaccount` = a specific one.
export interface UploadAccount {
  accountId: string;     // 'main' or a subaccount id
  accountName: string;   // 'Main Account' or the subaccount name
  accountType: 'main' | 'subaccount';
}

export interface UploadRecord {
  id: string;
  fileName: string;
  uploadedAt: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  status: UploadStatus;
  uploadMode: 'standard' | 'same-day' | 'on-demand';
  firstMile: 'pickup' | 'dropoff';
  /**
   * Which Bulk Booking input method produced this batch. Absent/'file' = the
   * Upload File path (default); 'spreadsheet' = the in-app Type in Spreadsheet
   * grid (rows already validated in-grid, so the review summary skips the mock
   * error-correction table). Both methods feed the same review/summary flow.
   */
  source?: 'file' | 'spreadsheet';
  // Account scope of the uploading account/subaccount.
  accountId: string;
  accountName: string;
  accountType: 'main' | 'subaccount';
}

// Notification event shape — ready for bell integration (see TODO above).
export interface UploadNotificationEvent {
  id: string;
  type: 'upload_needs_review';
  batchId: string;
  fileName: string;
  validRows: number;
  errorRows: number;
  timestamp: string;
  read: boolean;
  // Account scope, copied from the upload record so the notification model can
  // resolve visibility (parent vs subaccount).
  accountId: string;
  accountName: string;
  accountType: 'main' | 'subaccount';
}

export const PENDING_NOTIFICATIONS: UploadNotificationEvent[] = [];

/**
 * Display snapshot of a single booked row from the in-app spreadsheet, captured
 * at submit so the review/summary screen can render the ACTUAL rows (not just a
 * count). Kept lean (display strings only) and session-only — not persisted to
 * localStorage. On a hard reload the summary falls back to a count note.
 */
export interface SpreadsheetBatchRow {
  recipientName: string;
  recipientMobile: string;
  address: string;
  /** "Barangay, City, Province" composed from the cascade cells. */
  location: string;
  /** Product summary (primary + "+N more") or free-text Product/SKU. */
  product: string;
  /** Total item quantity for the row. */
  quantity: string;
  /** Raw declared value string (formatted for display by the summary). */
  declaredValue: string;
  parcelSize: string;
  /** 'Yes' | 'No' — drives the COD payout-account guard on the summary page. */
  cod: string;
}

// Map of batchId → captured spreadsheet rows. Persisted (not just in-memory) —
// a booked spreadsheet batch's real row data must survive a reload, since
// synthesized Transaction records (transactionService.ts) and the Ready Rows
// page both read it as their concrete per-row source; losing it on reload
// would silently replace real recipient/item data with sample filler.
const SPREADSHEET_BATCH_ROWS: Record<string, SpreadsheetBatchRow[]> = loadState('spreadsheetBatchRows', {});
function persistSpreadsheetBatchRows(): void { saveState('spreadsheetBatchRows', SPREADSHEET_BATCH_ROWS); }

/** Store the booked spreadsheet rows for a batch (in-session handoff to summary). */
export function setSpreadsheetBatchRows(batchId: string, rows: SpreadsheetBatchRow[]): void {
  SPREADSHEET_BATCH_ROWS[batchId] = rows;
  persistSpreadsheetBatchRows();
}

/** Return the captured spreadsheet rows for a batch (empty if none captured). */
export function getSpreadsheetBatchRows(batchId: string): SpreadsheetBatchRow[] {
  return SPREADSHEET_BATCH_ROWS[batchId] ?? [];
}

/**
 * Live per-batch row classification, mirrored from the Review Before Booking
 * page's own in-progress editing state (`BulkUploadSummary.tsx`). This is the
 * SAME data the review grid computes — not a separate/copied dataset — so the
 * dedicated Ready-to-book Rows page (and, once a batch is booked, synthesized
 * Transaction records — see `transactionService.ts`) always read the current
 * classification instead of a stale snapshot.
 *
 * Only rows that started in "Rows needing fixes" or "Needs review" and carry
 * real edited field data are tracked here. The larger base "no issues from the
 * start" count has no per-row mock detail (mirrors `UploadRecord.validRows`)
 * and is rendered as sample/placeholder rows by consumers, the same way
 * `BulkUploadCompleted.tsx` already represents a batch's full row count from a
 * small sample list.
 */
export interface BatchRowSnapshot {
  key: string;
  recipientName: string;
  mobileNumber: string;
  itemName: string;
  /** "City/Municipality, Province" — matches the Transactions list's Destination format. */
  location: string;
  declaredValue: string;
  pouchSize: string;
  referenceId: string;
  cod: string;
}

export interface BatchRowsState {
  /** Currently classified "Ready to book" — real data, originated from Fixes/Needs review. */
  readyRows: BatchRowSnapshot[];
  /** Currently classified "Needs review" — non-blocking, still bookable alongside Ready rows. */
  reviewRows: BatchRowSnapshot[];
}

const EMPTY_BATCH_ROWS_STATE: BatchRowsState = { readyRows: [], reviewRows: [] };

// Persisted (not just session-in-memory) so the dedicated Ready Rows page reads
// the latest classification even after a full reload of this demo app.
const BATCH_ROWS_STATE: Record<string, BatchRowsState> = loadState('batchRowsState', {});
function persistBatchRowsState(): void { saveState('batchRowsState', BATCH_ROWS_STATE); }

/** Replace the live row-classification snapshot for a batch. */
export function setBatchRowsState(batchId: string, state: BatchRowsState): void {
  BATCH_ROWS_STATE[batchId] = state;
  persistBatchRowsState();
}

/** Return the live row-classification snapshot for a batch (empty if none yet). */
export function getBatchRowsState(batchId: string): BatchRowsState {
  return BATCH_ROWS_STATE[batchId] ?? EMPTY_BATCH_ROWS_STATE;
}

/**
 * Shared sample filler for a batch's base "validated with no issues from the
 * start" rows, which — like `BulkUploadCompleted.tsx`'s completed-batch list —
 * have no per-row mock detail beyond the batch's own valid-row count. Used by
 * both the Ready Rows page and synthesized Transaction records (see
 * `transactionService.ts`) so the two stay visually consistent.
 */
export const BATCH_ROW_SAMPLE_FILLER: readonly Omit<BatchRowSnapshot, 'key'>[] = [
  { recipientName: 'Lia Santos',   mobileNumber: '+639171234501', itemName: 'UNO FLIP! Double Sided Card', location: 'Mandaluyong City, Metro Manila', declaredValue: '600', pouchSize: 'SMALL', referenceId: '', cod: 'No' },
  { recipientName: 'Marco Alonzo', mobileNumber: '+639171234502', itemName: 'UNO FLIP! Double Sided Card', location: 'Makati City, Metro Manila',      declaredValue: '600', pouchSize: 'SMALL', referenceId: '', cod: 'No' },
  { recipientName: 'Tessa Cruz',   mobileNumber: '+639171234503', itemName: 'UNO FLIP! Double Sided Card', location: 'Pasig City, Metro Manila',       declaredValue: '600', pouchSize: 'SMALL', referenceId: '', cod: 'No' },
  { recipientName: 'Rico Mendoza', mobileNumber: '+639171234504', itemName: 'UNO FLIP! Double Sided Card', location: 'Quezon City, Metro Manila',      declaredValue: '600', pouchSize: 'SMALL', referenceId: '', cod: 'No' },
  { recipientName: 'Nina Reyes',   mobileNumber: '+639171234505', itemName: 'UNO FLIP! Double Sided Card', location: 'Taguig City, Metro Manila',      declaredValue: '600', pouchSize: 'SMALL', referenceId: '', cod: 'No' },
];

/** Build `count` filler row snapshots by cycling the shared sample list, keyed uniquely so React lists render safely. */
export function buildBatchRowFiller(count: number, keyPrefix = 'base'): BatchRowSnapshot[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    key: `${keyPrefix}-${i}`,
    ...BATCH_ROW_SAMPLE_FILLER[i % BATCH_ROW_SAMPLE_FILLER.length],
  }));
}

/** Adapt a captured in-app-spreadsheet row into the shared `BatchRowSnapshot` shape. */
export function spreadsheetRowToBatchRowSnapshot(row: SpreadsheetBatchRow, index: number): BatchRowSnapshot {
  return {
    key: `sheet-${index}`,
    recipientName: row.recipientName || 'Recipient',
    mobileNumber: row.recipientMobile,
    itemName: row.product,
    location: row.location,
    declaredValue: row.declaredValue,
    pouchSize: row.parcelSize,
    referenceId: '',
    cod: row.cod,
  };
}

// Recent uploads persist across reloads (lightweight continuity). The derived
// upload-event notifications (PENDING_NOTIFICATIONS) remain session-only.
const SESSION_UPLOADS: UploadRecord[] = loadState<UploadRecord[]>('recentUploads', []);
function persistUploads(): void { saveState('recentUploads', SESSION_UPLOADS); }

export function addUpload(record: UploadRecord): void {
  SESSION_UPLOADS.unshift(record);
  persistUploads();
}

export function updateUploadStatus(id: string, status: UploadStatus): void {
  const record = SESSION_UPLOADS.find((r) => r.id === id);
  if (!record) return;
  record.status = status;
  persistUploads();
  if (status === 'needs-review') {
    PENDING_NOTIFICATIONS.push({
      id: `notif-${Date.now()}`,
      type: 'upload_needs_review',
      batchId: id,
      fileName: record.fileName,
      validRows: record.validRows,
      errorRows: record.errorRows,
      timestamp: new Date().toISOString(),
      read: false,
      accountId: record.accountId,
      accountName: record.accountName,
      accountType: record.accountType,
    });
  }
}

export function getSessionUploads(): readonly UploadRecord[] {
  return SESSION_UPLOADS;
}

function nowString(): string {
  return new Date().toLocaleString('en-PH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function generateUploadId(): string {
  const d = new Date();
  const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `UPLOAD-${datePart}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

export function createUploadRecord(
  id: string,
  fileName: string,
  uploadMode: 'standard' | 'same-day' | 'on-demand',
  firstMile: 'pickup' | 'dropoff',
  status: UploadStatus,
  account: UploadAccount,
): UploadRecord {
  return {
    id,
    fileName,
    uploadedAt: nowString(),
    totalRows: 104,
    validRows: 100,
    errorRows: 4,
    status,
    uploadMode,
    firstMile,
    accountId: account.accountId,
    accountName: account.accountName,
    accountType: account.accountType,
  };
}
