import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  IconPackage,
  IconClock,
  IconAlertTriangle,
  IconCurrencyDollar,
  IconUpload,
  IconReceipt,
  IconKey,
  IconMessage,
  IconTrendingUp,
  IconTrendingDown,
  IconArrowRight,
  IconCircleCheck,
  IconHourglass,
  IconCalendar,
  IconBuilding,
  IconActivityHeartbeat,
  IconUserCircle,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Progress } from '../components/ui/Progress';
import { Badge } from '../components/ui/Badge';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { IconContainer } from '../components/IconContainer';
// Recent transactions come through the transactionService facade. SLA alerts
// remain on their data module (service migration out of scope for this pass).
import { getRecentTransactions, getDashboardStats, getBasicAnalytics, statusConfig, type TransactionSummary, type DashboardStats, type BasicAnalytics } from '../services/transactionService';
import { getSlaAlertsList, SLA_TYPE_META, SLA_STATUS_META, type SlaAlert } from '../services/slaService';

const quickActions = [
  { title: 'Upload Bulk Bookings', description: 'Import CSV to create multiple shipments at once', icon: IconUpload, href: '/dashboard/bulk-uploader', iconColor: 'text-blue-600', iconBg: 'bg-blue-50' },
  { title: 'View Billing Statement', description: 'Download invoices and billing reports', icon: IconReceipt, href: '/dashboard/billing', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
  { title: 'Generate API Key', description: 'Connect and integrate your own systems', icon: IconKey, href: '/dashboard/api-access', iconColor: 'text-violet-600', iconBg: 'bg-violet-50' },
  { title: 'Submit a Ticket', description: 'Report issues or follow up on tickets', icon: IconMessage, href: '/dashboard/support-tickets', iconColor: 'text-orange-600', iconBg: 'bg-orange-50' },
];

// `updated` is a Dashboard-only relative-time label (presentation-only).
const recentUpdatedLabels = ['2 hrs ago', '4 hrs ago', '6 hrs ago', '8 hrs ago', '12 hrs ago'];

// Bar colors per delivery service type (match the booking mode selector accents).
const SERVICE_TYPE_BAR: Record<string, string> = {
  standard: 'bg-blue-500',
  same_day: 'bg-orange-500',
  on_demand: 'bg-violet-500',
};

const earningsRows = [
  { label: 'Earnings Disbursed', amount: '₱184,320', meta: 'Transferred to your account', icon: IconCircleCheck, iconColor: 'text-emerald-500' },
  { label: 'For Disbursal', amount: '₱56,940', meta: 'Next: Jun 1, 2024', metaIcon: IconCalendar, icon: IconCurrencyDollar, iconColor: 'text-blue-500' },
  { label: 'For Processing', amount: '₱23,100', meta: 'Pending clearance', icon: IconHourglass, iconColor: 'text-orange-400' },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { subAccountsEnabled, currentAccount, getCurrentAccountName } = useSubAccounts();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  // Recent transactions for the preview panel, loaded via the service facade.
  const [recentTransactions, setRecentTransactions] = useState<TransactionSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    getRecentTransactions(5)
      .then((list) => { if (!cancelled) setRecentTransactions(list); })
      .catch(() => { if (!cancelled) setRecentTransactions([]); });
    return () => { cancelled = true; };
  }, []);

  // Delivery stats from the transaction seed — drives KPI cards + performance card.
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDashboardStats(currentAccount !== 'main' ? currentAccount : undefined)
      .then((s) => { if (!cancelled) setDashStats(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentAccount]);

  // Basic Analytics (service-type mix + daily volume), scoped like dashStats.
  // Aggregates come from the service layer (treated as backend-provided).
  const [basic, setBasic] = useState<BasicAnalytics | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBasicAnalytics(currentAccount !== 'main' ? currentAccount : undefined)
      .then((b) => { if (!cancelled) setBasic(b); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentAccount]);

  // Open SLA alerts for the subaccount-view card (loaded via the service facade).
  const [openSlaAlerts, setOpenSlaAlerts] = useState<SlaAlert[]>([]);
  useEffect(() => {
    let cancelled = false;
    getSlaAlertsList({ openOnly: true })
      .then((list) => { if (!cancelled) setOpenSlaAlerts(list.slice(0, 4)); })
      .catch(() => { if (!cancelled) setOpenSlaAlerts([]); });
    return () => { cancelled = true; };
  }, []);

  // Derived KPI values from real seed data.
  const active     = dashStats ? (dashStats.byStatus['in-transit'] + dashStats.byStatus['picked-up']) : 0;
  const pending    = dashStats ? dashStats.byStatus.pending : 0;
  const failed     = dashStats ? (dashStats.byStatus.failed + dashStats.byStatus.returned + dashStats.byStatus.cancelled) : 0;
  const totalCod   = dashStats ? dashStats.totalCod : 0;

  const stats = dashStats ? [
    { title: 'Active Deliveries', value: active.toString(), change: '+12.5%', trend: 'up' as const, icon: IconPackage, iconBg: 'bg-blue-600', cardBg: 'bg-blue-50', changeColor: 'text-blue-700' },
    { title: 'Pending Pickups',   value: pending.toString(), change: '-8.2%', trend: 'down' as const, icon: IconClock, iconBg: 'bg-orange-500', cardBg: 'bg-orange-50', changeColor: 'text-orange-700' },
    { title: 'Failed / Delayed',  value: failed.toString(), change: '+3.1%', trend: 'up' as const, icon: IconAlertTriangle, iconBg: 'bg-red-500', cardBg: 'bg-red-50', changeColor: 'text-red-700' },
    { title: 'COD Collected',     value: `₱${totalCod.toLocaleString()}`, change: '+18.7%', trend: 'up' as const, icon: IconCurrencyDollar, iconBg: 'bg-emerald-600', cardBg: 'bg-emerald-50', changeColor: 'text-emerald-700' },
  ] : [
    { title: 'Active Deliveries', value: '—', change: '', trend: 'up' as const, icon: IconPackage, iconBg: 'bg-blue-600', cardBg: 'bg-blue-50', changeColor: 'text-blue-700' },
    { title: 'Pending Pickups',   value: '—', change: '', trend: 'down' as const, icon: IconClock, iconBg: 'bg-orange-500', cardBg: 'bg-orange-50', changeColor: 'text-orange-700' },
    { title: 'Failed / Delayed',  value: '—', change: '', trend: 'up' as const, icon: IconAlertTriangle, iconBg: 'bg-red-500', cardBg: 'bg-red-50', changeColor: 'text-red-700' },
    { title: 'COD Collected',     value: '—', change: '', trend: 'up' as const, icon: IconCurrencyDollar, iconBg: 'bg-emerald-600', cardBg: 'bg-emerald-50', changeColor: 'text-emerald-700' },
  ];

  const performanceRows = dashStats ? [
    { label: 'Delivered',         value: dashStats.byStatus.delivered,   dot: 'bg-emerald-500', pct: Math.round((dashStats.byStatus.delivered / dashStats.total) * 100) },
    { label: 'In Transit',        value: dashStats.byStatus['in-transit'] + dashStats.byStatus['picked-up'], dot: 'bg-blue-500', pct: Math.round(((dashStats.byStatus['in-transit'] + dashStats.byStatus['picked-up']) / dashStats.total) * 100) },
    { label: 'Failed / Returned', value: dashStats.byStatus.failed + dashStats.byStatus.returned + dashStats.byStatus.cancelled, dot: 'bg-red-400', pct: Math.round(((dashStats.byStatus.failed + dashStats.byStatus.returned + dashStats.byStatus.cancelled) / dashStats.total) * 100) },
    { label: 'Pending',           value: dashStats.byStatus.pending,      dot: 'bg-orange-400', pct: Math.round((dashStats.byStatus.pending / dashStats.total) * 100) },
  ] : [];

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back — here&apos;s your logistics overview.</p>
      </div>

      {/* Manager view — scoped to their assigned subaccount */}
      {isManager && (
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <IconContainer icon={IconUserCircle} bg="bg-violet-100" color="text-violet-600" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-violet-900">Manager View — {user?.accountName}</span>
                <p className="text-xs text-violet-700 mt-0.5">You are managing this subaccount. Data shown is scoped to {user?.accountName}.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin scoped to a specific subaccount */}
      {!isManager && subAccountsEnabled && currentAccount !== 'main' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <IconContainer icon={IconBuilding} bg="bg-blue-100" color="text-blue-600" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-blue-900">Viewing: {getCurrentAccountName()}</span>
                <p className="text-xs text-blue-700 mt-0.5">Showing data for this subaccount only</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin main account with subaccounts enabled — consolidated view */}
      {!isManager && subAccountsEnabled && currentAccount === 'main' && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <IconContainer icon={IconBuilding} bg="bg-emerald-100" color="text-emerald-600" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-emerald-900">Main Account — Consolidated View</span>
                <p className="text-xs text-emerald-700 mt-0.5">Data shown aggregates across all subaccounts. Use the account switcher to scope to a subaccount.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className={`border-0 shadow-none ${stat.cardBg}`}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest leading-none">{stat.title}</p>
                  <p className="text-2xl 2xl:text-3xl font-bold text-gray-900 mt-3 leading-none tracking-tight tabular-nums truncate">{stat.value}</p>
                  <div className="flex items-center gap-1.5 mt-3 min-w-0">
                    {stat.trend === 'up'
                      ? <IconTrendingUp className={`w-4 h-4 flex-shrink-0 ${stat.changeColor}`} />
                      : <IconTrendingDown className={`w-4 h-4 flex-shrink-0 ${stat.changeColor}`} />}
                    <span className={`text-sm font-semibold flex-shrink-0 ${stat.changeColor}`}>{stat.change}</span>
                    <span className="text-sm text-gray-400 hidden xl:inline truncate">vs last month</span>
                  </div>
                </div>
                <div className={`w-11 h-11 rounded-xl ${stat.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link key={action.title} to={action.href} className="group">
              <Card className="h-full border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-150 cursor-pointer">
                <CardContent className="p-5">
                  <IconContainer icon={action.icon} bg={action.iconBg} color={action.iconColor} rounded="rounded-xl" className="mb-4" />
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{action.title}</p>
                  <p className="text-sm text-gray-500 mt-1.5 leading-snug">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="flex flex-col">
          <CardHeader className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-900">Recent Transactions</CardTitle>
              <Link to="/dashboard/transactions">
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer gap-1.5 -mr-1">
                  View all
                  <IconArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4 flex-1">
            <div className="space-y-1">
              {recentTransactions.map((tx, i) => {
                const sc = statusConfig[tx.status];
                return (
                  <div
                    key={tx.tracking}
                    onClick={() => navigate(`/dashboard/transactions/${tx.tracking}`)}
                    className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate leading-snug">{tx.tracking}</p>
                      <p className="text-sm text-gray-500 truncate mt-0.5 leading-snug">{tx.recipient}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge variant={sc.variant} className="text-xs font-medium px-2 py-0.5 leading-none">{sc.label}</Badge>
                      <span className="text-xs text-gray-400 leading-none tabular-nums">{recentUpdatedLabels[i]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Finance card — shown only in Main Account / standard view.
            Subaccount view shows SLA Alerts instead (finance is Admin-only). */}
        {subAccountsEnabled && currentAccount !== 'main' ? (
          <Card className="flex flex-col">
            <CardHeader className="px-6 pt-5 pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconContainer icon={IconActivityHeartbeat} bg="bg-amber-50" color="text-amber-600" size="sm" />
                  <CardTitle className="text-base font-semibold text-gray-900">SLA Alerts</CardTitle>
                </div>
                <Link to="/dashboard/sla-alerts">
                  <Button variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer gap-1.5 -mr-1">
                    View all
                    <IconArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pt-3 pb-4 flex-1">
              {(() => {
                const openAlerts = openSlaAlerts;
                if (openAlerts.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <IconCircleCheck className="w-7 h-7 text-emerald-400" />
                      <p className="text-sm text-gray-500">No active SLA alerts</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-1">
                    {openAlerts.map((a) => {
                      const meta = SLA_TYPE_META[a.type];
                      const st   = SLA_STATUS_META[a.status];
                      return (
                        <div
                          key={a.id}
                          onClick={() => navigate(`/dashboard/transactions/${a.trackingNumber}`)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <IconContainer icon={meta.icon} bg={meta.bgClass} color={meta.iconClass} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 truncate leading-snug">{a.title}</p>
                            <p className="text-xs text-gray-500 leading-snug">{a.trackingNumber}</p>
                          </div>
                          <Badge variant={st.variant} className="text-xs px-1.5 flex-shrink-0">{st.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex flex-col">
            <CardHeader className="px-6 pt-5 pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-900">Earnings Report</CardTitle>
                <Link to="/dashboard/earnings">
                  <Button variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer gap-1.5 -mr-1">
                    Full report
                    <IconArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-6 pt-4 pb-5 flex-1 flex flex-col">
              <div className="flex-1 divide-y divide-gray-100">
                {earningsRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <IconContainer icon={row.icon} bg="bg-gray-100" color={row.iconColor} size="base" className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-snug">{row.label}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {row.metaIcon && <row.metaIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                          <p className="text-sm text-gray-400 leading-snug">{row.meta}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-base font-bold text-gray-900 flex-shrink-0 ml-4 tabular-nums">{row.amount}</p>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-400">Total COD collected</p>
                <p className="text-base font-bold text-gray-900 tabular-nums">₱264,360</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col">
          <CardHeader className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-900">Delivery Performance</CardTitle>
              <Link to="/dashboard/analytics">
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer gap-1.5 -mr-1">
                  Analytics
                  <IconArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-6 pt-4 pb-5 flex-1 flex flex-col">
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Overall success rate</p>
                <p className="text-base font-bold text-gray-900">{dashStats ? `${dashStats.successRate}%` : '—'}</p>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: dashStats ? `${dashStats.successRate}%` : '0%' }} />
              </div>
            </div>
            <div className="flex-1 divide-y divide-gray-100">
              {performanceRows.map((row) => (
                <div key={row.label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${row.dot}`} />
                  <p className="text-sm text-gray-700 flex-1 leading-none">{row.label}</p>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Progress value={row.pct} barClassName={row.dot} className="w-16 hidden sm:block" aria-label={row.label} />
                    <p className="text-sm font-bold text-gray-900 w-12 text-right tabular-nums">{row.value.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-400">Total shipments this period</p>
              <p className="text-base font-bold text-gray-900 tabular-nums">{dashStats?.total ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Basic Analytics ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Basic Analytics</p>
          <Link to="/dashboard/analytics">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer gap-1.5 -mr-1">
              Full analytics
              <IconArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Bookings by service type */}
          <Card className="flex flex-col">
            <CardHeader className="px-6 pt-5 pb-0">
              <CardTitle className="text-base font-semibold text-gray-900">Bookings by Service Type</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-4 pb-5 flex-1">
              {(() => {
                const mix = basic?.serviceTypeMix ?? [];
                const total = basic?.periodTotal ?? 0;
                const max = Math.max(1, ...mix.map((m) => m.count));
                return (
                  <div className="space-y-4">
                    {mix.map((m) => (
                      <div key={m.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm text-gray-700">{m.label}</span>
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">
                            {m.count}
                            <span className="text-gray-400 font-normal ml-1">
                              ({total > 0 ? Math.round((m.count / total) * 100) : 0}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${SERVICE_TYPE_BAR[m.key] ?? 'bg-gray-400'}`}
                            style={{ width: `${(m.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 pt-1">
                      Based on {total} booking{total === 1 ? '' : 's'} in the current sample.
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Daily booking volume */}
          <Card className="flex flex-col">
            <CardHeader className="px-6 pt-5 pb-0">
              <CardTitle className="text-base font-semibold text-gray-900">Daily Booking Volume</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-4 pb-5 flex-1 flex flex-col">
              {(() => {
                const days = basic?.dailyVolume ?? [];
                if (days.length === 0) {
                  return <p className="text-sm text-gray-400">No booking activity in this period.</p>;
                }
                const max = Math.max(1, ...days.map((d) => d.count));
                return (
                  <div className="flex-1 flex items-end justify-between gap-2">
                    {days.map((d) => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700 tabular-nums">{d.count}</span>
                        <div className="w-full bg-blue-50 rounded-md flex items-end" style={{ height: 96 }}>
                          <div className="w-full bg-blue-500 rounded-md" style={{ height: `${(d.count / max) * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-400 tabular-nums">{d.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
