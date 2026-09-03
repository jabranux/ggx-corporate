import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  IconPackage, IconCircleCheck, IconArrowBackUp, IconReceiptRefund,
  IconClockCheck, IconCash, IconTruckReturn, IconGauge, IconInfoCircle,
  IconDownload, IconLock, IconChartBar,
} from '@tabler/icons-react';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useScopedAccountId } from '../hooks/useAccountScope';
import { useAuth } from '../contexts/AuthContext';
import { getAccountNameById } from '../data/accounts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { getClaimsList, CLAIM_STATUS_META, type Claim } from '../services/claimsService';
import { getSlaAlertsList, type SlaAlert } from '../services/slaService';
import {
  getAnalyticsData,
  type AnalyticsOverview,
  type AnalyticsCharts,
} from '../services/dataAnalyticsService';
import { isAddonEnabledForAccount } from '../services/addonsService';
import { MAIN_SCOPE } from '../data/addonState';
import { SUBACCOUNT_OPTIONS } from '../data/users';
import { getBasicAnalytics, type BasicAnalytics, type DeliveryServiceType } from '../services/transactionService';

/** Distinct colors for the source / booking-method attribution charts. */
const ATTRIBUTION_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

const DEFAULT_OVERVIEW: AnalyticsOverview = {
  totalOrders: 0,
  fulfilledOrders: 0,
  deliveryEfficiencyPct: 0,
  rtsRatePct: 0,
  slaHitPct: 0,
  slaMissPct: 0,
  totalReturns: 0,
  amountSettledBase: 0,
};

const DEFAULT_CHARTS: AnalyticsCharts = {
  monthlyVolume: [],
  fulfillmentTrend: [],
  regionVolume: [],
  avgDeliveryDays: [],
  returnsByReason: [],
  slaHitMiss: [],
};

type DateRangeMode = '7' | '30' | '90' | '365' | 'custom';

export function DataAnalytics() {
  const { getCurrentAccountName, isMainAccountView, subAccountsEnabled } = useSubAccounts();
  const { user } = useAuth();
  const scopeId = useScopedAccountId();
  const inSubaccountView = scopeId !== undefined;
  const scopeName = scopeId ? (getAccountNameById(scopeId) ?? getCurrentAccountName()) : null;
  const mainView = isMainAccountView();

  const advancedEnabled = isAddonEnabledForAccount('advanced_analytics', MAIN_SCOPE);

  const [overview, setOverview] = useState<AnalyticsOverview>(DEFAULT_OVERVIEW);
  const [charts, setCharts] = useState<AnalyticsCharts>(DEFAULT_CHARTS);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [sla, setSla] = useState<SlaAlert[]>([]);
  const [dateMode, setDateMode] = useState<DateRangeMode>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  // Subaccount comparison data (main account view only)
  const [subComparison, setSubComparison] = useState<{ id: string; name: string; total: number; successRate: number; totalCod: number }[]>([]);
  // Order-attribution breakdowns (source mix + granular booking-method mix).
  const [attribution, setAttribution] = useState<Pick<BasicAnalytics, 'sourceMix' | 'bookingMethodMix'> | null>(null);

  useEffect(() => {
    let active = true;
    const context = scopeId ? { subaccountId: scopeId } : undefined;
    Promise.all([
      getAnalyticsData(context),
      getClaimsList(context),
      getSlaAlertsList(context),
    ])
      .then(([analyticsData, claimsList, slaList]) => {
        if (!active) return;
        setOverview(analyticsData.overview);
        setCharts(analyticsData.charts);
        setClaims(claimsList);
        setSla(slaList);
      })
      .catch(() => {
        if (!active) return;
        setOverview(DEFAULT_OVERVIEW);
        setCharts(DEFAULT_CHARTS);
        setClaims([]);
        setSla([]);
      });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Load subaccount comparison (main view only, advanced analytics enabled)
  useEffect(() => {
    if (!mainView || !subAccountsEnabled || !advancedEnabled) return;
    let active = true;
    Promise.all(
      SUBACCOUNT_OPTIONS.map((s) =>
        getBasicAnalytics(s.id).then((b) => ({
          id: s.id, name: s.name,
          total: b.periodTotal,
          successRate: b.successRate,
          totalCod: b.totalCod,
        }))
      )
    ).then((rows) => { if (active) setSubComparison(rows); }).catch(() => {});
    return () => { active = false; };
  }, [mainView, subAccountsEnabled, advancedEnabled]);

  // Load order-attribution breakdowns for the active scope + service-type filter.
  useEffect(() => {
    if (!advancedEnabled) return;
    let active = true;
    getBasicAnalytics(scopeId, {
      serviceType: serviceTypeFilter === 'all' ? undefined : (serviceTypeFilter as DeliveryServiceType),
    })
      .then((b) => { if (active) setAttribution({ sourceMix: b.sourceMix, bookingMethodMix: b.bookingMethodMix }); })
      .catch(() => { if (active) setAttribution(null); });
    return () => { active = false; };
  }, [scopeId, serviceTypeFilter, advancedEnabled]);

  const sourceData = (attribution?.sourceMix ?? [])
    .filter((m) => m.count > 0)
    .map((m, i) => ({ name: m.label, value: m.count, color: ATTRIBUTION_COLORS[i % ATTRIBUTION_COLORS.length] }));
  const bookingMethodData = (attribution?.bookingMethodMix ?? [])
    .filter((m) => m.count > 0)
    .map((m) => ({ name: m.label, count: m.count }));

  const claimsTotal = claims.length;
  const claimsOpen = claims.filter((c) => c.status === 'open' || c.status === 'in-review').length;
  const claimsSettledAmount = claims
    .filter((c) => c.status === 'settled' || c.status === 'approved')
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);

  const activeSlaMisses = sla.filter((a) => a.type === 'breach' && a.status !== 'resolved').length;

  const maxReason = charts.returnsByReason.length
    ? Math.max(...charts.returnsByReason.map((r) => r.count))
    : 1;

  const scopeLabel = scopeName ?? 'All accounts';
  const primaryKpis = [
    { title: 'Total Orders',        value: overview.totalOrders.toLocaleString(),     sub: scopeLabel,             icon: IconPackage,     color: 'text-blue-600',   bg: 'bg-blue-100' },
    { title: 'Fulfilled Orders',    value: overview.fulfilledOrders.toLocaleString(), sub: `${overview.deliveryEfficiencyPct.toFixed(1)}% of total`, icon: IconCircleCheck, color: 'text-green-600',  bg: 'bg-green-100' },
    { title: 'Delivery Efficiency', value: `${overview.deliveryEfficiencyPct.toFixed(1)}%`, sub: '+0.4% vs last period', icon: IconGauge,       color: 'text-violet-600', bg: 'bg-violet-100' },
    { title: 'RTS Rate',            value: `${overview.rtsRatePct.toFixed(1)}%`,      sub: 'Return-to-sender',     icon: IconArrowBackUp, color: 'text-amber-600',  bg: 'bg-amber-100' },
  ];

  const secondaryKpis = [
    { title: 'SLA Hit / Miss',        value: `${overview.slaHitPct.toFixed(1)}% / ${overview.slaMissPct.toFixed(1)}%`, sub: `${activeSlaMisses} active SLA breach${activeSlaMisses === 1 ? '' : 'es'}`, icon: IconClockCheck,    color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { title: 'Returned / For Return', value: overview.totalReturns.toLocaleString(),  sub: 'This period',          icon: IconTruckReturn,   color: 'text-orange-600',  bg: 'bg-orange-100' },
    { title: 'Claims',                value: `${claimsTotal}`,                        sub: `${claimsOpen} open / in review`, icon: IconReceiptRefund, color: 'text-red-600',     bg: 'bg-red-100' },
    { title: 'Amount Settled',        value: `₱${(overview.amountSettledBase + claimsSettledAmount).toLocaleString()}`, sub: 'Payouts + approved claims', icon: IconCash, color: 'text-green-700', bg: 'bg-green-100' },
  ];

  const handleExport = () => {
    const csv = [
      'Metric,Value',
      `Total Orders,${overview.totalOrders}`,
      `Fulfilled Orders,${overview.fulfilledOrders}`,
      `Delivery Efficiency,${overview.deliveryEfficiencyPct.toFixed(1)}%`,
      `RTS Rate,${overview.rtsRatePct.toFixed(1)}%`,
      `SLA Hit,${overview.slaHitPct.toFixed(1)}%`,
      `Claims Total,${claimsTotal}`,
      ...(attribution?.sourceMix.filter((m) => m.count > 0).map((m) => `Source: ${m.label},${m.count}`) ?? []),
      ...(attribution?.bookingMethodMix.filter((m) => m.count > 0).map((m) => `Booking method: ${m.label},${m.count}`) ?? []),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analytics-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Addon gate — show upgrade CTA if not enabled
  if (!advancedEnabled) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Analytics</h1>
          <p className="text-gray-600 mt-1">Performance overview across orders, fulfillment, SLA, returns, and claims</p>
        </div>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-10 text-center">
            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <IconLock className="w-8 h-8 text-violet-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Advanced Data Analytics</h2>
            <p className="text-gray-600 max-w-md mx-auto mb-6">
              Unlock efficiency metrics, SLA/exception analysis, fulfillment trends, regional breakdowns,
              subaccount comparison, and CSV exports. Powered by your GGX Business+ plan.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
              {['SLA Hit/Miss tracking', 'RTS & exception analysis', 'Regional volume breakdown', 'Subaccount comparison', 'Fulfillment trend charts', 'CSV export'].map((f) => (
                <span key={f} className="inline-flex items-center gap-1.5 text-sm text-violet-700 bg-violet-100 px-3 py-1 rounded-full">
                  <IconChartBar className="w-3.5 h-3.5" /> {f}
                </span>
              ))}
            </div>
            <Link to="/dashboard/account-add-ons">
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                Enable Advanced Analytics in Add-ons →
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Analytics</h1>
          <p className="text-gray-600 mt-1">Performance overview across orders, fulfillment, SLA, returns, and claims</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date range</label>
            <Select value={dateMode} onChange={(e) => setDateMode(e.target.value as DateRangeMode)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
              <option value="custom">Custom range</option>
            </Select>
          </div>
          {dateMode === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <Input type="date" className="w-36" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                <Input type="date" className="w-36" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Region</label>
            <Select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
              <option value="all">All Regions</option>
              <option value="ncr">Metro Manila</option>
              <option value="luzon">Luzon (ex-NCR)</option>
              <option value="visayas">Visayas</option>
              <option value="mindanao">Mindanao</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Service type</label>
            <Select value={serviceTypeFilter} onChange={(e) => setServiceTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              <option value="standard">Standard</option>
              <option value="same_day">Same-Day</option>
              <option value="on_demand">On-Demand</option>
            </Select>
          </div>
          <Button onClick={handleExport} className="self-end">
            <IconDownload className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {inSubaccountView && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
          <IconInfoCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Showing analytics for <span className="font-semibold">{scopeName}</span>.
            {user?.role !== 'manager' && ' Switch to Main Account to see consolidated data across all subaccounts.'}
          </p>
        </div>
      )}

      {/* Performance Overview */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Performance Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {primaryKpis.map((s) => (
            <Card key={s.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-600">{s.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{s.value}</p>
                    <p className="text-sm text-gray-500 mt-2 truncate">{s.sub}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0 ml-3`}>
                    <s.icon className={`w-6 h-6 ${s.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {secondaryKpis.map((s) => (
          <Card key={s.title}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">{s.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{s.value}</p>
                  <p className="text-sm text-gray-500 mt-2 truncate">{s.sub}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0 ml-3`}>
                  <s.icon className={`w-6 h-6 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subaccount comparison (main account only) */}
      {mainView && subAccountsEnabled && subComparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subaccount Comparison</CardTitle>
            <CardDescription>Key metrics per subaccount for this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2 pr-4 text-left font-semibold text-gray-600">Subaccount</th>
                    <th className="py-2 px-4 text-right font-semibold text-gray-600">Shipments</th>
                    <th className="py-2 px-4 text-right font-semibold text-gray-600">Success rate</th>
                    <th className="py-2 pl-4 text-right font-semibold text-gray-600">COD collected</th>
                  </tr>
                </thead>
                <tbody>
                  {subComparison.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-4 font-medium text-gray-900">{row.name}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-700">{row.total.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span className={row.successRate >= 80 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                          {row.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right tabular-nums text-gray-700">₱{row.totalCod.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Volume + Fulfillment trend */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Order Volume</CardTitle>
            <CardDescription>Total orders per month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={charts.monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Bar dataKey="orders" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fulfillment vs RTS Trend</CardTitle>
            <CardDescription>Fulfilled rate and return-to-sender rate by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={charts.fulfillmentTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
                <Line type="monotone" dataKey="fulfilled" stroke="#10b981" strokeWidth={2} name="Fulfilled %" />
                <Line type="monotone" dataKey="rts" stroke="#f59e0b" strokeWidth={2} name="RTS %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* SLA + Region share */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>SLA Hit / Miss</CardTitle>
            <CardDescription>On-SLA vs breached deliveries</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={charts.slaHitMiss} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                  {charts.slaHitMiss.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volume Sharing by Region</CardTitle>
            <CardDescription>Order distribution across regions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={charts.regionVolume} cx="50%" cy="50%" outerRadius={100} dataKey="value"
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {charts.regionVolume.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Order attribution — source mix + granular booking-method mix */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Bookings by Source</CardTitle>
            <CardDescription>Order origin (GoBenta and Product Checkout counted separately)</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">No bookings in this scope.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {sourceData.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bookings by Booking Method</CardTitle>
            <CardDescription>Bulk template upload and in-app spreadsheet tracked separately</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingMethodData.length === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">No bookings in this scope.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={bookingMethodData} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" stroke="#6b7280" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#6b7280" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delivery days + Returns + Claims */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Avg. Delivery Days by Area</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {charts.avgDeliveryDays.map((d) => (
                <div key={d.area} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{d.area}</span>
                  <span className="text-sm font-medium text-gray-900">{d.days.toFixed(1)} days</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Returns by Reason</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {charts.returnsByReason.map((r) => (
                <div key={r.reason}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{r.reason}</span>
                    <span className="text-sm font-medium text-gray-900">{r.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Claims Summary</CardTitle></CardHeader>
          <CardContent>
            {claimsTotal === 0 ? (
              <p className="text-sm text-gray-500">No claims filed.</p>
            ) : (
              <div className="space-y-3">
                {(['open', 'in-review', 'approved', 'processing', 'on_hold', 'denied', 'settled'] as const).map((st) => {
                  const count = claims.filter((c) => c.status === st).length;
                  if (count === 0) return null;
                  const meta = CLAIM_STATUS_META[st];
                  return (
                    <div key={st} className="flex items-center justify-between">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-sm font-medium text-gray-900">{count}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-900">Total claims</span>
                  <span className="text-sm font-semibold text-gray-900">{claimsTotal}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
