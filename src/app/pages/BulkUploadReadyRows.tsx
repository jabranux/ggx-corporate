import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IconArrowLeft, IconCircleCheck, IconExternalLink, IconClock, IconInfoCircle,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import {
  getBulkUploadById, getBatchRowsState, getSpreadsheetBatchRows, buildBatchRowFiller,
  spreadsheetRowToBatchRowSnapshot, canViewBulkUploadBatch,
  type UploadRecord, type BatchRowSnapshot,
} from '../services/bulkUploadService';
import { BULK_FIELD_LABELS as L } from '../data/bulkTemplate';
import { useAuth } from '../contexts/AuthContext';

/**
 * Dedicated full-page view of a batch's current "Ready to book" rows — the
 * upload rows that have PASSED validation and have no outstanding issues.
 * These are validated upload rows, not Transactions yet (see
 * docs/context/bulk-booking.md); a batch's rows only become Transactions once
 * it is actually processed/booked (status `awaiting-payment` / `completed`).
 *
 * This page does not maintain its own copy of the row data — it reads the
 * SAME live per-batch classification the Review Before Booking page produces
 * (`getBatchRowsState`), so fixing rows there and coming back here always
 * reflects the current count, never a stale snapshot.
 */

const PAGE_SIZE = 20;

/** The full current Ready-to-book row set for a batch, base filler + real promoted rows — read live, never copied. */
function readyRowsFor(record: UploadRecord): BatchRowSnapshot[] {
  if (record.source === 'spreadsheet') {
    const captured = getSpreadsheetBatchRows(record.id).map(spreadsheetRowToBatchRowSnapshot);
    return [...captured, ...buildBatchRowFiller(record.validRows - captured.length)];
  }
  const { readyRows } = getBatchRowsState(record.id);
  return [...buildBatchRowFiller(record.validRows), ...readyRows];
}

export function BulkUploadReadyRows() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  const [record, setRecord] = useState<UploadRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Re-derive on every focus of this effect's deps — cheap, and keeps the page
  // current if the user re-opens it after another Review-page revalidate.
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    getBulkUploadById(id ?? '')
      .then((r) => {
        if (!active) return;
        // Same account/subaccount scope rule as every other surface — a
        // manager viewing another subaccount's batch id sees "not found",
        // never that subaccount's recipient/mobile-number data.
        setRecord(r && canViewBulkUploadBatch(r, user) ? r : null);
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [id, tick, user]);

  // Refresh the classification when the tab regains focus (e.g. the user
  // fixed rows on the Review page in the same tab, then navigated back).
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const rows = useMemo(() => (record ? readyRowsFor(record) : []), [record, tick]);

  useEffect(() => { setPage(1); }, [id]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const txnUrl = `/dashboard/transactions?view=batches&batch=${encodeURIComponent(id ?? '')}`;
  const peso = (n: number) => (Number.isFinite(n) ? `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

  const alreadyBooked = record && (record.status === 'awaiting-payment' || record.status === 'completed');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/dashboard/bulk-uploader/summary/${id ?? ''}`)}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Review
        </Button>
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !record ? (
        <Card><CardContent className="p-6 text-sm text-gray-500">This upload could not be found.</CardContent></Card>
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ready to book rows</h1>
            <p className="text-sm text-gray-500 mt-1">
              <span className="inline-flex items-center gap-1">
                <IconClock className="w-3.5 h-3.5" />{record.uploadedAt}
              </span>
              &nbsp;·&nbsp;
              Batch ID: <span className="text-gray-700 font-medium">{record.id}</span>
              &nbsp;·&nbsp;
              File: <span className="text-gray-700 font-medium">{record.fileName}</span>
            </p>
          </div>

          {alreadyBooked ? (
            <Card className="border-blue-100">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <IconInfoCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">This batch has already been booked</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Its rows are now real Transactions, not pre-booking rows — view them in Transactions instead.
                    </p>
                    <a
                      href={txnUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 mt-3"
                    >
                      View all in Transactions
                      <IconExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-green-100">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <IconCircleCheck className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {rows.length} {rows.length === 1 ? 'row passed' : 'rows passed'} validation and {rows.length === 1 ? 'is' : 'are'} ready to book
                    </p>
                    <p className="text-sm text-gray-500">
                      These are validated upload rows, not Transactions yet — they become Transactions once this batch is booked.
                    </p>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="text-sm text-gray-500">No rows are ready to book yet.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{L.name}</TableHead>
                            <TableHead>{L.mobile}</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>{L.itemName}</TableHead>
                            <TableHead>{L.pouchSize}</TableHead>
                            <TableHead className="text-right">{L.declaredValue}</TableHead>
                            <TableHead>{L.referenceId}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium text-gray-900">{row.recipientName || '—'}</TableCell>
                              <TableCell className="text-gray-600">{row.mobileNumber || '—'}</TableCell>
                              <TableCell className="text-gray-600">{row.location || '—'}</TableCell>
                              <TableCell className="text-gray-600">{row.itemName || '—'}</TableCell>
                              <TableCell className="text-gray-600">{row.pouchSize || '—'}</TableCell>
                              <TableCell className="text-right text-gray-900">{peso(Number(row.declaredValue))}</TableCell>
                              <TableCell className="text-gray-600">{row.referenceId || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <Pagination
                      className="mt-6 border-t border-gray-200 pt-6"
                      summary={`Showing ${pageRows.length ? (clampedPage - 1) * PAGE_SIZE + 1 : 0}–${(clampedPage - 1) * PAGE_SIZE + pageRows.length} of ${rows.length} ready rows`}
                      previousDisabled={clampedPage <= 1}
                      nextDisabled={clampedPage >= totalPages}
                      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
