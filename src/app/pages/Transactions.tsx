import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  IconDownload, IconEye, IconPackages, IconList,
  IconChevronDown, IconChevronRight, IconTag,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/SearchInput';
import { SegmentedControl } from '../components/SegmentedControl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useScopedAccountId } from '../hooks/useAccountScope';
import { getFeatureStateSync } from '../services/featureEnablementService';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { StoreOrdersPanel } from '../components/StoreOrdersPanel';
// Data access goes through the transactionService facade (not the data module
// directly). The service shapes data the UI needs; in production it is fronted
// by the GGX Corporate BFF over OMS/fulfillment/FTX. See transactionService.ts.
import {
  getTransactions,
  getTransactionsBySubaccountId,
  getTransactionBatches,
  statusConfig,
  subaccountDisplayLabel,
  sourceTypeLabel,
  SERVICE_TYPE_SHORT_LABEL,
  SOURCE_TYPE_LABEL,
  type TransactionSummary,
  type TransactionBatchGroup,
  type DeliveryServiceType,
  type SourceType,
} from '../services/transactionService';

/** Source filter options (order matches the attribution model). */
const SOURCE_FILTER_OPTIONS: SourceType[] = [
  'ggx_dashboard', 'bulk_upload', 'api', 'shopify', 'gobenta', 'product_checkout',
];

// Each booking has exactly ONE service type. Badge colors align with the Bulk
// Upload service types — Standard = blue, Same-Day = orange, On-Demand = purple —
// using subtle -100/-800 tones consistent with the other transaction badges.
const SERVICE_TYPE_BADGE: Record<DeliveryServiceType, { className: string; label: string }> = {
  standard:  { className: 'bg-blue-100 text-blue-800',     label: SERVICE_TYPE_SHORT_LABEL.standard },
  same_day:  { className: 'bg-orange-100 text-orange-800', label: SERVICE_TYPE_SHORT_LABEL.same_day },
  on_demand: { className: 'bg-violet-100 text-violet-800', label: SERVICE_TYPE_SHORT_LABEL.on_demand },
};

/** Service-type cell: a single badge — exactly one service type per row. */
function ServiceTypeCell({ serviceType }: { serviceType: DeliveryServiceType }) {
  const badge = SERVICE_TYPE_BADGE[serviceType];
  return <Badge className={badge.className}>{badge.label}</Badge>;
}

// ─── component ──────────────────────────────────────────────────────────────

export function Transactions() {
  const navigate = useNavigate();
  const { subAccountsEnabled } = useSubAccounts();
  // Role-aware scope: managers are hard-scoped to their subaccount; admins see
  // consolidated on Main Account and scoped when drilled into a subaccount.
  const scopeId = useScopedAccountId();
  const mainView = subAccountsEnabled && scopeId === undefined; // consolidated admin view

  // Feature gating uses the module-access scope (maps a standard account to its
  // synthetic scope id), consistent with the sidebar / add-on surfaces — so a
  // standard account that enabled the add-on resolves correctly.
  const featureScope = useModuleAccessContext().scopeAccountId;

  // Commerce (Inventory/Storefront) gating: the Store Orders tab only appears when
  // commerce is enabled for the active account/subaccount. Without it, Transactions
  // behaves as the normal delivery transactions page (no tabs).
  const commerceEnabled =
    getFeatureStateSync('inventory', featureScope).enabled ||
    getFeatureStateSync('storefront', featureScope).enabled;

  // On-Demand entitlement: only show On-Demand transactions where the OD add-on
  // is enabled for the current scope (OD is subaccount-scoped). A main/standard
  // account without OD must not start with On-Demand rows.
  const odEnabledForScope = getFeatureStateSync('on_demand', featureScope).enabled;

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'store-orders' | 'deliveries'>(
    searchParams.get('view') === 'store-orders' ? 'store-orders' : 'deliveries'
  );
  const showStoreOrders = commerceEnabled && activeTab === 'store-orders';

  // View mode: flat list vs. grouped by batch. A `?batch=<id>` deep link (used by
  // the Bulk Upload "View transactions" new-tab links) opens the By Batch view
  // pre-expanded on that batch.
  const initialBatch = searchParams.get('batch');
  const [viewMode, setViewMode] = useState<'all' | 'batches'>(initialBatch ? 'batches' : 'all');

  // "All Transactions" filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [subaccountFilter, setSubaccountFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // "By Batch" state
  const [expandedBatch, setExpandedBatch] = useState<string | null>(initialBatch);

  // Service-backed data
  const [allDeliveries, setAllDeliveries] = useState<TransactionSummary[]>([]);
  const [batchGroups, setBatchGroups] = useState<TransactionBatchGroup[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the full transaction list once (presentation-only filtering happens
  // locally below — filtering/search/grouping are allowed UI operations).
  useEffect(() => {
    let cancelled = false;
    // Scope the flat list at the service layer: managers / drilled-in admins get
    // only their subaccount's transactions; consolidated view gets all.
    const load = scopeId ? getTransactionsBySubaccountId(scopeId) : getTransactions();
    load
      .then((list) => { if (!cancelled) setAllDeliveries(list); })
      .catch(() => { if (!cancelled) setLoadError('Unable to load transactions.'); });
    return () => { cancelled = true; };
  }, [scopeId]);

  // Load batch groups, scoped to the active subaccount when not in main view.
  // Counts/status come precomputed from the service (treated as backend-provided).
  useEffect(() => {
    let cancelled = false;
    getTransactionBatches(scopeId)
      .then((groups) => { if (!cancelled) setBatchGroups(groups); })
      .catch(() => { if (!cancelled) setLoadError('Unable to load batches.'); });
    return () => { cancelled = true; };
  }, [scopeId]);

  // ── All Transactions view (presentation-only filtering) ────────────────────
  const q = searchQuery.trim().toLowerCase();
  const filtered = allDeliveries.filter((d) => {
    const searchOk =
      q.length < 2 ||
      d.tracking.toLowerCase().includes(q) ||
      d.recipient.toLowerCase().includes(q) ||
      d.destination.toLowerCase().includes(q);
    const statusOk = statusFilter === 'all' || d.status === statusFilter;
    const serviceOk = serviceTypeFilter === 'all' || d.serviceType === serviceTypeFilter;
    const sourceOk = sourceFilter === 'all' || d.sourceType === sourceFilter;
    const subOk    = subaccountFilter === 'all' || d.subaccount === subaccountFilter;
    // Hide On-Demand rows unless the current scope has the OD add-on enabled.
    const odOk     = odEnabledForScope || d.serviceType !== 'on_demand';
    return searchOk && statusOk && serviceOk && sourceOk && subOk && odOk;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <PageHeader
        title="Transactions"
        subtitle="Track all your bookings and deliveries"
        action={!showStoreOrders && (
          <div className="flex flex-wrap items-center gap-2">
            {/* View mode toggle */}
            <SegmentedControl
              segments={[
                { value: 'all',     label: 'All Transactions', icon: IconList },
                { value: 'batches', label: 'By Batch',         icon: IconPackages },
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as 'all' | 'batches')}
            />
            <Button variant="outline" iconEnd>
              Export CSV
              <IconDownload className="w-4 h-4" />
            </Button>
          </div>
        )}
      />

      {/* Commerce tabs — Store Orders vs Deliveries. Only when commerce is on. */}
      {commerceEnabled && (
        <div className="border-b border-gray-200">
          <nav className="flex gap-6" aria-label="Transactions tabs">
            {([
              { key: 'store-orders', label: 'Store Orders' },
              { key: 'deliveries',   label: 'Deliveries' },
            ] as const).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    const next = new URLSearchParams(searchParams);
                    if (tab.key === 'store-orders') next.set('view', 'store-orders');
                    else next.delete('view');
                    setSearchParams(next, { replace: true });
                  }}
                  className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {loadError && !showStoreOrders && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* ── Store Orders tab — buyer commerce orders (separate from deliveries) ── */}
      {showStoreOrders && <StoreOrdersPanel scopeId={scopeId} />}

      {/* ── All Transactions view ──────────────────────────────────────────── */}
      {!showStoreOrders && viewMode === 'all' && (
        <Card>
          <CardHeader>
            {/* Filter toolbar — flex-col on mobile, single row on sm+ */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-[260px]">
                <SearchInput
                  placeholder="Search by tracking number, recipient, or destination..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
              </div>
              {mainView && (
                <div className="w-full sm:w-[160px] flex-shrink-0">
                  <Select value={subaccountFilter} onChange={(e) => setSubaccountFilter(e.target.value)}>
                    <option value="all">All Subaccounts</option>
                    <option value="Acme Corporation">Acme Corporation</option>
                    <option value="Acme Luzon">Acme Luzon</option>
                  </Select>
                </div>
              )}
              <div className="w-full sm:w-[160px] flex-shrink-0">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
              <div className="w-full sm:w-[180px] flex-shrink-0">
                <Select value={serviceTypeFilter} onChange={(e) => setServiceTypeFilter(e.target.value)}>
                  <option value="all">All Service Types</option>
                  <option value="standard">{SERVICE_TYPE_SHORT_LABEL.standard}</option>
                  <option value="same_day">{SERVICE_TYPE_SHORT_LABEL.same_day}</option>
                  {odEnabledForScope && (
                    <option value="on_demand">{SERVICE_TYPE_SHORT_LABEL.on_demand}</option>
                  )}
                </Select>
              </div>
              <div className="w-full sm:w-[160px] flex-shrink-0">
                <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                  <option value="all">All Sources</option>
                  {SOURCE_FILTER_OPTIONS.map((s) => (
                    <option key={s} value={s}>{SOURCE_TYPE_LABEL[s]}</option>
                  ))}
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Cells stay single-line so the wide table scrolls cleanly on mobile
                instead of wrapping identifiers; desktop has room so it's unchanged. */}
            <Table className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking Number</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Destination</TableHead>
                  {mainView && <TableHead>Subaccount</TableHead>}
                  <TableHead>Source</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={mainView ? 9 : 8} className="text-center py-8 text-gray-400 text-sm">
                      No transactions match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((delivery) => (
                  <TableRow
                    key={delivery.tracking}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => navigate(`/dashboard/transactions/${delivery.tracking}`)}
                  >
                    <TableCell className="font-medium">{delivery.tracking}</TableCell>
                    <TableCell>{delivery.recipient}</TableCell>
                    <TableCell>{delivery.destination}</TableCell>
                    {mainView && (
                      <TableCell>
                        <span className="text-sm font-medium text-gray-700">
                          {subaccountDisplayLabel(delivery)}
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="text-sm text-gray-600">{sourceTypeLabel(delivery)}</span>
                    </TableCell>
                    <TableCell>
                      <ServiceTypeCell serviceType={delivery.serviceType} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[delivery.status].variant}>
                        {statusConfig[delivery.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">{delivery.date}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <IconEye className="w-4 h-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              className="mt-6 border-t border-gray-200 pt-6"
              summary={`Showing ${filtered.length} of ${allDeliveries.length} transactions`}
              previousDisabled
              nextDisabled
            />
          </CardContent>
        </Card>
      )}

      {/* ── By Batch view ─────────────────────────────────────────────────── */}
      {!showStoreOrders && viewMode === 'batches' && (
        <div className="space-y-4">
          {batchGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <IconPackages className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">No batches found</p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload transactions via Bulk Upload to create batches.
                </p>
              </CardContent>
            </Card>
          ) : batchGroups.map(({ batch, transactions: items, counts, status: st, uploadedDate }) => {
            const isExpanded = expandedBatch === batch.batchId;
            const { total, delivered, inProgress, failed } = counts;
            // Compact, consistent count breakdown (dot + value + label) — replaces
            // the old row of competing colored badges.
            const countStats = [
              { label: 'Total',     value: total,      dot: 'bg-gray-300' },
              { label: 'Delivered', value: delivered,  dot: 'bg-emerald-500' },
              { label: 'Active',    value: inProgress, dot: 'bg-blue-500' },
              { label: 'Failed',    value: failed,     dot: 'bg-red-500' },
            ];

            return (
              <Card key={batch.batchId}>
                {/* Batch summary row — click to expand */}
                <button
                  className="w-full text-left cursor-pointer"
                  onClick={() => setExpandedBatch(isExpanded ? null : batch.batchId)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      {/* Expand icon */}
                      <div className="flex-shrink-0 text-gray-400">
                        {isExpanded
                          ? <IconChevronDown className="w-5 h-5" />
                          : <IconChevronRight className="w-5 h-5" />}
                      </div>

                      {/* Batch icon */}
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <IconPackages className="w-5 h-5 text-blue-600" />
                      </div>

                      {/* Batch details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{batch.batchId}</span>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {mainView && batch.accountName && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                              <IconTag className="w-3 h-3" />
                              {batch.accountName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">
                          {batch.fileName} · Uploaded {uploadedDate}
                        </p>
                      </div>

                      {/* Counter stats — compact, consistent format */}
                      <div className="hidden sm:flex items-center gap-5 flex-shrink-0 tabular-nums">
                        {countStats.map((s) => (
                          <div key={s.label} className="flex flex-col items-end leading-tight">
                            <span className="text-sm font-semibold text-gray-900">{s.value.toLocaleString()}</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-400">
                              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                              {s.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Download action — stopPropagation so it doesn't toggle expand */}
                      <Button
                        variant="ghost" size="sm" iconEnd
                        className="hidden sm:flex flex-shrink-0 text-gray-500 hover:text-gray-700 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Export
                        <IconDownload className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Delivery progress bar — shown below the row */}
                    {total > 0 && (
                      <div className="mt-3 mx-0 hidden sm:block">
                        <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.round((delivered / total) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{Math.round((delivered / total) * 100)}% delivered</p>
                      </div>
                    )}

                    {/* Mobile counts — same compact format, inline */}
                    <div className="sm:hidden flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 ml-14 tabular-nums">
                      {countStats.map((s) => (
                        <span key={s.label} className="flex items-center gap-1 text-xs text-gray-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          <span className="font-semibold text-gray-900">{s.value.toLocaleString()}</span> {s.label}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </button>

                {/* Expanded transaction list */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <Table className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tracking Number</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Service Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((tx) => (
                          <TableRow
                            key={tx.tracking}
                            className="cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => navigate(`/dashboard/transactions/${tx.tracking}`)}
                          >
                            <TableCell className="font-medium">{tx.tracking}</TableCell>
                            <TableCell>{tx.recipient}</TableCell>
                            <TableCell>{tx.destination}</TableCell>
                            <TableCell>
                              <ServiceTypeCell serviceType={tx.serviceType} />
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusConfig[tx.status].variant}>
                                {statusConfig[tx.status].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-gray-600">{tx.date}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm">
                                <IconEye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {items.length < total && (
                      <div className="px-5 py-3 border-t border-gray-100">
                        <p className="text-xs text-gray-400">
                          Showing {items.length.toLocaleString()} of {total.toLocaleString()} transactions in this batch. Use Export for the full list.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          <p className="text-xs text-gray-400 text-center">
            Showing {batchGroups.length} batch{batchGroups.length !== 1 ? 'es' : ''}.
            Only batch uploads appear in this view.
          </p>
        </div>
      )}
    </div>
  );
}
