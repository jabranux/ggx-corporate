import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IconArrowLeft, IconPackages, IconDownload, IconEye, IconClock,
  IconAlertTriangle, IconTag,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/ui/Pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { ServiceTypeBadge } from '../components/ServiceTypeBadge';
import { useScopedAccountId } from '../hooks/useAccountScope';
import { useSubAccounts } from '../contexts/SubAccountContext';
import {
  getTransactionBatchById,
  paginateBatchTransactions,
  getAllTransactionBatchRows,
  statusConfig,
  sourceTypeLabel,
  SERVICE_TYPE_SHORT_LABEL,
  type TransactionBatchGroup,
  type TransactionSummary,
  type TransactionStatus,
} from '../services/transactionService';

/**
 * Dedicated Batch Details page — replaces the old inline accordion-expand /
 * small-transaction-sample preview on the Transactions "By Batch" view. Every
 * batch gets its own stable URL (`/dashboard/transactions/batches/:batchId`),
 * loads/refreshes directly, and shows the FULL transaction list behind
 * server-shaped pagination (`paginateBatchTransactions` in
 * `transactionService.ts`, applied to the already-loaded batch group) instead
 * of a capped sample.
 */

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function StatTile({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="text-xl font-semibold text-gray-900 tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

export function TransactionBatchDetails() {
  const navigate = useNavigate();
  const { batchId } = useParams();
  const scopeId = useScopedAccountId();
  const { subAccountsEnabled } = useSubAccounts();
  const mainView = subAccountsEnabled && scopeId === undefined;

  // Load state for the batch header. 'loading' | 'not-found' | 'error' | 'ready'.
  const [loadState, setLoadState] = useState<'loading' | 'not-found' | 'error' | 'ready'>('loading');
  const [group, setGroup] = useState<TransactionBatchGroup | null>(null);
  // Bumped by the Retry action to re-run the header load effect below (retrying
  // must actually re-issue the request, not just flip the displayed state).
  const [retryTick, setRetryTick] = useState(0);

  // Table query state.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState(false);

  // Load the batch header once (and whenever the account scope, id, or retry
  // trigger changes — switching the Main Account's subaccount view must
  // re-check authorization).
  useEffect(() => {
    let active = true;
    setLoadState('loading');
    getTransactionBatchById(batchId ?? '', scopeId)
      .then((g) => {
        if (!active) return;
        setGroup(g);
        setLoadState(g ? 'ready' : 'not-found');
      })
      .catch(() => { if (active) setLoadState('error'); });
    return () => { active = false; };
  }, [batchId, scopeId, retryTick]);

  // Reset to page 1 whenever the query changes.
  useEffect(() => { setPage(1); }, [search, statusFilter, pageSize]);

  // Pure/synchronous pagination over the ALREADY-LOADED group — avoids
  // re-resolving the batch (a full scan across every batch in the app) on
  // every page click, page-size change, or search keystroke.
  const { rows, total } = useMemo(() => {
    if (!group) return { rows: [] as TransactionSummary[], total: 0 };
    const result = paginateBatchTransactions(group, { page, pageSize, search, status: statusFilter });
    return { rows: result.items, total: result.total };
  }, [group, page, pageSize, search, statusFilter]);

  const handleExport = useCallback(async () => {
    if (!batchId || !group) return;
    setExporting(true);
    try {
      const all = await getAllTransactionBatchRows(batchId, scopeId);
      if (!all) return;
      const header = ['Tracking Number', 'Recipient', 'Destination', 'Source', 'Service Type', 'Status', 'Date'];
      const lines = all.map((r) => [
        r.tracking, r.recipient, r.destination, sourceTypeLabel(r),
        SERVICE_TYPE_SHORT_LABEL[r.serviceType], statusConfig[r.status].label, r.date,
      ].map(csvCell).join(','));
      downloadCsv(`${batchId}.csv`, [header.join(','), ...lines].join('\n'));
    } finally {
      setExporting(false);
    }
  }, [batchId, group, scopeId]);

  const backToTransactions = () => navigate('/dashboard/transactions?tab=batches');

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={backToTransactions}
        className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <IconArrowLeft className="w-4 h-4 mr-2" />
        Back to Transactions
      </button>

      {loadState === 'loading' && (
        <p className="text-sm text-gray-500">Loading batch…</p>
      )}

      {loadState === 'error' && (
        <Card>
          <CardContent className="py-10 text-center">
            <IconAlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">Unable to load this batch</p>
            <p className="text-xs text-gray-400 mt-1">Something went wrong. Please try again.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setRetryTick((t) => t + 1)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Nonexistent AND unauthorized batch ids render identically — never reveal
          whether a batch exists outside the caller's account scope. */}
      {loadState === 'not-found' && (
        <Card>
          <CardContent className="py-10 text-center">
            <IconPackages className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">This batch could not be found</p>
            <p className="text-xs text-gray-400 mt-1">
              It may not exist, or it belongs to a different account.
            </p>
          </CardContent>
        </Card>
      )}

      {loadState === 'ready' && group && (
        <>
          {/* Batch summary */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <IconPackages className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-bold text-gray-900">{group.batch.batchId}</h1>
                      <Badge variant={group.status.variant}>{group.status.label}</Badge>
                      {mainView && group.batch.accountName && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                          <IconTag className="w-3 h-3" />
                          {group.batch.accountName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1 truncate">
                      {group.batch.fileName}
                      &nbsp;·&nbsp;
                      <span className="inline-flex items-center gap-1">
                        <IconClock className="w-3.5 h-3.5" />Uploaded {group.uploadedDate}
                      </span>
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" iconEnd onClick={handleExport} disabled={exporting} className="flex-shrink-0">
                  {exporting ? 'Exporting…' : 'Export CSV'}
                  <IconDownload className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
                <StatTile label="Total" value={group.counts.total} dot="bg-gray-300" />
                <StatTile label="Delivered" value={group.counts.delivered} dot="bg-emerald-500" />
                <StatTile label="Active" value={group.counts.inProgress} dot="bg-blue-500" />
                <StatTile label="Failed" value={group.counts.failed} dot="bg-red-500" />
              </div>

              {group.counts.total > 0 && (
                <div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.round((group.counts.delivered / group.counts.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {Math.round((group.counts.delivered / group.counts.total) * 100)}% delivered
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transactions table */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-[240px]">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by tracking number or recipient..."
                  />
                </div>
                <div className="w-full sm:w-[160px] flex-shrink-0">
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TransactionStatus | 'all')}>
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="picked-up">Picked Up</option>
                    <option value="in-transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="returned">Returned</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </div>
                <div className="w-full sm:w-[130px] flex-shrink-0">
                  <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </Select>
                </div>
              </div>

              <Table className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tracking Number</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                        {group.counts.total === 0
                          ? 'This batch has no transactions.'
                          : `No transactions match "${search}".`}
                      </TableCell>
                    </TableRow>
                  ) : rows.map((tx) => (
                    <TableRow
                      key={tx.tracking}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => navigate(`/dashboard/transactions/${tx.tracking}`)}
                    >
                      <TableCell className="font-medium">{tx.tracking}</TableCell>
                      <TableCell>{tx.recipient}</TableCell>
                      <TableCell>{tx.destination}</TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{sourceTypeLabel(tx)}</span>
                      </TableCell>
                      <TableCell>
                        <ServiceTypeBadge serviceType={tx.serviceType} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[tx.status].variant}>
                          {statusConfig[tx.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{tx.date}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/transactions/${tx.tracking}`); }}
                        >
                          <IconEye className="w-4 h-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {total > 0 && (
                <Pagination
                  className="border-t border-gray-200 pt-4"
                  summary={`Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()} transactions`}
                  previousDisabled={page <= 1}
                  nextDisabled={page >= totalPages}
                  onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
