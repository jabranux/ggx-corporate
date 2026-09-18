import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IconArrowLeft, IconCircleCheck, IconFileSpreadsheet, IconClock, IconExternalLink,
  IconPackages, IconReceipt2,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { ServiceTypeBadge } from '../components/ServiceTypeBadge';
import { getBulkUploadById, canViewBulkUploadBatch, type UploadRecord } from '../services/bulkUploadService';
import { getTransactionBatchById, statusConfig, type TransactionBatchGroup } from '../services/transactionService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Read-only detail page for a COMPLETED (or awaiting-payment) bulk upload.
 * Reached from Recent Uploads once a batch has been processed/booked. It
 * deliberately contains NO editable grid, review/error sections, or
 * "Revalidate changes" — those belong to the pre-booking review page. A batch
 * only reaches this state once it has been booked — so its rows are shown as
 * real Transactions, sourced from the SAME batch data the main Transactions
 * "By Batch" view reads (`getTransactionBatchById`) — never a separate,
 * hand-maintained copy.
 */

const SOURCE_LABEL: Record<'file' | 'spreadsheet', string> = {
  file: 'Uploaded file',
  spreadsheet: 'In-app spreadsheet',
};

const MODE_LABEL: Record<UploadRecord['uploadMode'], string> = {
  standard: 'Standard Upload',
  'same-day': 'Same-Day Delivery',
  'on-demand': 'On-Demand Delivery',
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function BulkUploadCompleted() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  const [record, setRecord] = useState<UploadRecord | null>(null);
  const [batchGroup, setBatchGroup] = useState<TransactionBatchGroup | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getBulkUploadById(id ?? ''), getTransactionBatchById(id ?? '')])
      .then(([r, group]) => {
        if (!active) return;
        // Same account/subaccount scope rule as every other surface — a
        // manager viewing another subaccount's batch id sees "not found",
        // never that subaccount's recipient/transaction data.
        const visible = r && canViewBulkUploadBatch(r, user);
        setRecord(visible ? r : null);
        setBatchGroup(visible ? group : null);
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [id, user]);

  const txnUrl = `/dashboard/transactions?view=batches&batch=${encodeURIComponent(id ?? '')}`;

  const txnRows = batchGroup?.transactions ?? [];
  // Backend-reported authoritative total (falls back to the visible row count
  // when no reported total is present, e.g. a batch booked this session).
  const createdCount = batchGroup?.counts.total ?? txnRows.length;
  const isPaid = record?.status === 'completed';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/dashboard/bulk-uploader')}
          className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Bulk Upload
        </button>
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !record ? (
        <Card><CardContent className="p-6 text-sm text-gray-500">This upload could not be found.</CardContent></Card>
      ) : (
        <>
          {/* Title + status */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <IconFileSpreadsheet className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{record.fileName}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Batch ID: <span className="text-gray-700 font-medium">{record.id}</span>
                  &nbsp;·&nbsp;
                  <span className="inline-flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5" />{record.uploadedAt}
                  </span>
                  &nbsp;·&nbsp;
                  Source: <span className="text-gray-700 font-medium">{SOURCE_LABEL[record.source ?? 'file']}</span>
                  &nbsp;·&nbsp;
                  {MODE_LABEL[record.uploadMode]}
                </p>
              </div>
            </div>
            <Badge variant={isPaid ? 'success' : 'pending'} className="self-start flex items-center gap-1.5 px-3 py-1">
              <IconCircleCheck className="w-4 h-4" />
              {isPaid ? 'Completed' : 'Awaiting payment'}
            </Badge>
          </div>

          {/* Summary stats */}
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard icon={<IconPackages className="w-5 h-5" />} label="Total rows processed" value={record.totalRows} />
            <StatCard icon={<IconReceipt2 className="w-5 h-5" />} label="Created transactions" value={createdCount} />
            <StatCard icon={<IconCircleCheck className="w-5 h-5" />} label="Booked & paid" value={isPaid ? createdCount : 0} />
          </div>

          {/* Transaction list — same records the main Transactions page shows */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-base font-semibold text-gray-900">Created transactions</p>
                  <p className="text-sm text-gray-500">
                    {isPaid
                      ? 'These orders were created from this upload and have been paid — no further action is needed.'
                      : 'These orders were created from this upload and are awaiting payment.'}
                  </p>
                </div>
                <a
                  href={txnUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View transactions
                  <IconExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {txnRows.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No linked transaction records found for this batch yet.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tracking Number</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Service Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {txnRows.map((row) => (
                          <TableRow
                            key={row.tracking}
                            className="cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => navigate(`/dashboard/transactions/${row.tracking}`)}
                          >
                            <TableCell className="font-medium text-blue-600">{row.tracking}</TableCell>
                            <TableCell className="text-gray-900">{row.recipient}</TableCell>
                            <TableCell className="text-gray-600">{row.destination}</TableCell>
                            <TableCell><ServiceTypeBadge serviceType={row.serviceType} /></TableCell>
                            <TableCell>
                              <Badge variant={statusConfig[row.status].variant}>{statusConfig[row.status].label}</Badge>
                            </TableCell>
                            <TableCell className="text-gray-600">{row.date}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {createdCount > txnRows.length && (
                    <p className="text-center text-sm text-gray-400 mt-3">
                      Showing {txnRows.length} of {createdCount.toLocaleString()}. View all in the transactions page.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
