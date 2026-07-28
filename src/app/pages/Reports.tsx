import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconDownload, IconRefresh, IconClock, IconPlus, IconFileText, IconCalendar, IconInfoCircle, IconCircleCheck, IconReportAnalytics } from '@tabler/icons-react';
import { StatCard } from '../components/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
// Reports read/download via the reportsService facade. Report figures are
// backend-owned; the generating→ready transition is a backend-job stand-in.
import {
  getReports, REPORT_TYPE_META, REPORT_STATUS_META, downloadReport,
  type ReportItem, type ReportType,
} from '../services/reportsService';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { getSubaccountOptions } from '../services/userService';
import { isAddonEnabledForAccount } from '../services/addonsService';
import { MAIN_SCOPE } from '../data/addonState';

type DateRange = 'today' | 'last7' | 'last30' | 'custom';

// All report types — finance types are hidden/disabled in subaccount view.
const ALL_REPORT_TYPE_OPTIONS: { type: ReportType; label: string; financeOnly?: boolean }[] = [
  { type: 'billing',    label: 'Billing Report',        financeOnly: true },
  { type: 'settlement', label: 'Settlement Summary',    financeOnly: true },
  { type: 'delivery',   label: 'Delivery Performance' },
  { type: 'analytics',  label: 'Analytics Export' },
];

const REPORT_TYPE_OPTIONS = ALL_REPORT_TYPE_OPTIONS;

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today',  label: 'Today' },
  { value: 'last7',  label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

function resolvePeriod(range: DateRange, from: string, to: string): string {
  if (range === 'today')  return 'Today';
  if (range === 'last7')  return 'Last 7 days';
  if (range === 'last30') return 'Last 30 days';
  if (from && to) return `${from} to ${to}`;
  return 'Custom range';
}

function resolveReportName(type: ReportType, range: DateRange): string {
  const label = REPORT_TYPE_OPTIONS.find((o) => o.type === type)?.label ?? 'Report';
  const period = DATE_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'Custom';
  return `${label} — ${period}`;
}

export function Reports() {
  const { isMainAccountView, getCurrentAccountId, subAccountsEnabled } = useSubAccounts();
  const { user } = useAuth();
  const mainView = isMainAccountView();
  // custom_reports has allowedRoles: ['admin'] — managers must not get the active CTA
  const customReportsEnabled =
    user?.role !== 'manager' && isAddonEnabledForAccount('custom_reports', MAIN_SCOPE);

  // In subaccount view only operational (non-finance) report types are available.
  const isSubaccountView = subAccountsEnabled && !mainView;
  const availableReportTypes = isSubaccountView
    ? REPORT_TYPE_OPTIONS.filter((o) => !o.financeOnly)
    : REPORT_TYPE_OPTIONS;

  const [allReports, setAllReports] = useState<ReportItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    getReports()
      .then((list) => { if (!cancelled) setAllReports(list); })
      .catch(() => { if (!cancelled) setAllReports([]); });
    return () => { cancelled = true; };
  }, []);
  const [genType,    setGenType]    = useState<ReportType>(isSubaccountView ? 'delivery' : 'billing');
  const [dateRange,  setDateRange]  = useState<DateRange>('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [subaccountFilter, setSubaccountFilter] = useState('');
  const [subaccountOptions, setSubaccountOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    getSubaccountOptions()
      .then((opts) => { if (!cancelled) setSubaccountOptions(opts); })
      .catch(() => { if (!cancelled) setSubaccountOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const customRangeValid = dateRange !== 'custom' || (customFrom !== '' && customTo !== '');
  const canGenerate = customRangeValid;

  // In subaccount view keep untagged (parent-level) reports visible alongside
  // subaccount-specific ones; in main view apply optional filter.
  const visibleReports = mainView
    ? allReports.filter((r) => !subaccountFilter || r.accountId === subaccountFilter)
    : allReports.filter((r) => !r.accountId || r.accountId === getCurrentAccountId());

  const readyCount      = visibleReports.filter((r) => r.status === 'ready').length;
  const generatingCount = visibleReports.filter((r) => r.status === 'generating').length;

  const handleGenerate = () => {
    if (!canGenerate) return;
    const period = resolvePeriod(dateRange, customFrom, customTo);
    const name   = resolveReportName(genType, dateRange);
    const id = `RPT-${genType.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}`;
    const newReport: ReportItem = {
      id, name, type: genType, period,
      generatedAt: 'In progress', status: 'generating', format: 'CSV', sizeLabel: '—',
    };
    setAllReports((prev) => [newReport, ...prev]);
    setTimeout(() => {
      setAllReports((prev) => prev.map((r) =>
        r.id === id
          ? { ...r, status: 'ready', generatedAt: 'Just now', sizeLabel: `${Math.floor(Math.random() * 50) + 20} KB` }
          : r
      ));
    }, 2500);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports &amp; Downloads</h1>
          <p className="text-gray-600 mt-1">
            Centralised export centre for billing, settlement, delivery, and analytics reports.
            Contextual downloads on Analytics, Billing, and Earnings pages are also available.
          </p>
        </div>
        {customReportsEnabled ? (
          <Link to="/dashboard/reports/custom" className="flex-shrink-0 self-start">
            <Button>
              <IconReportAnalytics className="w-4 h-4" /> Custom Reports
            </Button>
          </Link>
        ) : (
          <Link to="/dashboard/account-add-ons" className="w-full min-w-0 self-start md:w-auto md:flex-shrink-0">
            <Button variant="outline" className="w-full border-dashed text-gray-400 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50 overflow-hidden md:w-auto">
              <IconReportAnalytics className="w-4 h-4 flex-shrink-0" /><span className="truncate min-w-0 flex-1">Custom Reports — Enable in Add-ons →</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Reports"      value={visibleReports.length} sub="Available in your account" icon={IconFileText}    iconBg="bg-blue-50"    iconColor="text-blue-600" />
        <StatCard label="Ready to Download"  value={readyCount}            sub="Completed reports"         icon={IconCircleCheck} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <StatCard label="Generating"         value={generatingCount}       sub="In progress"               icon={IconClock}       iconBg="bg-amber-50"   iconColor="text-amber-600" />
      </div>

      {/* Generate a report */}
      <Card>
        <CardHeader>
          <CardTitle>Generate a Report</CardTitle>
          <CardDescription>
            Select a report type and date range, then generate. Results appear in the list below.
            Analytics, Billing, and Earnings pages also offer contextual downloads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSubaccountView && (
            <div className="mb-4">
              <div className="inline-flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 max-w-prose">
                <IconInfoCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Showing operational reports for this subaccount. Billing and settlement reports are available to the Main Account admin only.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
            {/* Report Type */}
            <div className="flex-1 min-w-[160px] max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Report type</label>
              <Select value={genType} onChange={(e) => setGenType(e.target.value as ReportType)}>
                {availableReportTypes.map((o) => (
                  <option key={o.type} value={o.type}>{o.label}</option>
                ))}
              </Select>
            </div>

            {/* Date Range */}
            <div className="flex-1 min-w-[160px] max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date range</label>
              <Select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)}>
                {DATE_RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>

            {/* Custom date inputs — revealed when "Custom range" is selected */}
            {dateRange === 'custom' && (
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <IconCalendar className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                    From
                  </label>
                  <Input
                    type="date"
                    className="w-36"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
                  <Input
                    type="date"
                    className="w-36"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </div>
              </div>
            )}

            <Button onClick={handleGenerate} disabled={!canGenerate} className="self-end">
              <IconPlus className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </div>

          {dateRange === 'custom' && !customRangeValid && (
            <p className="text-xs text-amber-600 mt-2">Select both a From and To date to generate a custom report.</p>
          )}
        </CardContent>
      </Card>

      {/* Reports list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Available Reports</CardTitle>
              <CardDescription>Download completed reports (CSV).</CardDescription>
            </div>
            {mainView && (
              <div className="w-48 flex-shrink-0">
                <Select
                  value={subaccountFilter}
                  onChange={(e) => setSubaccountFilter(e.target.value)}
                >
                  <option value="">All subaccounts</option>
                  {subaccountOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {visibleReports.length === 0 ? (
            <div className="py-10 text-center">
              <IconFileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">No reports yet</p>
              <p className="text-xs text-gray-400 mt-1">Generate a report above to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    {mainView && <TableHead>Scope</TableHead>}
                    <TableHead>Generated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReports.map((r) => {
                    const meta   = REPORT_TYPE_META[r.type];
                    const Icon   = meta.icon;
                    const status = REPORT_STATUS_META[r.status];
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bgClass}`}>
                              <Icon className={`w-4 h-4 ${meta.iconClass}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{r.name}</p>
                              <p className="text-xs text-gray-400">{r.id} · {r.format} · {r.sizeLabel}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">{meta.label}</TableCell>
                        <TableCell className="text-gray-600">{r.period}</TableCell>
                        {mainView && (
                          <TableCell className="text-gray-600 text-sm">
                            {r.accountName ?? 'All accounts'}
                          </TableCell>
                        )}
                        <TableCell className="text-gray-600">
                          <div className="flex items-center gap-1">
                            <IconClock className="w-3 h-3" />
                            {r.generatedAt}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === 'ready' && (
                            <Button
                              variant="ghost" size="sm"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => downloadReport(r)}
                            >
                              <IconDownload className="w-3.5 h-3.5 mr-1.5" />
                              Download
                            </Button>
                          )}
                          {r.status === 'generating' && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                              <IconClock className="w-3.5 h-3.5 animate-pulse" />
                              Generating…
                            </span>
                          )}
                          {r.status === 'failed' && (
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              <IconRefresh className="w-3.5 h-3.5 mr-1.5" />
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
