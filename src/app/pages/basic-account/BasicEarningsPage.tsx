import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconDownload, IconBuilding, IconCircleCheck, IconAlertCircle, IconArrowRight } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { useAuth } from '../../contexts/AuthContext';
// Settlement figures are FTX-owned official finance values delivered via the
// BFF; this page only renders what earningsService returns — same facade and
// `subaccountId` filter the Corporate Earnings page uses (see Earnings.tsx).
import { getSettlements, SETTLEMENT_STATUS_CONFIG, type Settlement } from '../../services/earningsService';
import { getPayoutBankAccounts, type PayoutBankAccount } from '../../services/payoutBankService';
import { csvCell, downloadCsv } from '../../lib/csv';

export function BasicEarningsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountId = user?.accountId ?? '';

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [primaryBank, setPrimaryBank] = useState<PayoutBankAccount | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    getSettlements({ subaccountId: accountId })
      .then((list) => { if (!cancelled) setSettlements(list); })
      .catch(() => { if (!cancelled) setSettlements([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    getPayoutBankAccounts(accountId)
      .then((accounts) => { if (!cancelled) setPrimaryBank(accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null); })
      .catch(() => { if (!cancelled) setPrimaryBank(null); });
    return () => { cancelled = true; };
  }, [accountId]);

  const filtered = settlements.filter((s) => {
    const statusOk = statusFilter === 'all' || s.status === statusFilter;
    const sourceOk = sourceFilter === 'all' || s.source === sourceFilter;
    return statusOk && sourceOk;
  });

  // Summary figures are sample backend-provided values (same convention as the
  // Corporate Earnings page) derived from this account's own settlement rows,
  // not computed as frontend source-of-truth.
  const { availablePayout, pendingCollection, remittedThisMonth } = useMemo(() => {
    const scheduled = settlements.find((s) => s.status === 'scheduled');
    const pending = settlements.filter((s) => s.status === 'pending');
    const deposited = settlements.filter((s) => s.status === 'deposited');
    return {
      availablePayout: scheduled?.netAmount ?? 0,
      pendingCollection: pending.reduce((sum, s) => sum + s.netAmount, 0),
      remittedThisMonth: deposited.reduce((sum, s) => sum + s.netAmount, 0),
    };
  }, [settlements]);

  const exportCsv = () => {
    const header = ['Settlement ID', 'Source', 'Collection Period', 'Gross Amount', 'Fees', 'Net Amount', 'Status', 'Expected Deposit'];
    const lines = filtered.map((s) => [
      s.id, s.source, s.period,
      s.grossAmount.toString(), s.fees.toString(), s.netAmount.toString(),
      SETTLEMENT_STATUS_CONFIG[s.status as keyof typeof SETTLEMENT_STATUS_CONFIG].label, s.expectedDate,
    ].map(csvCell).join(','));
    downloadCsv('earnings.csv', [header.join(','), ...lines].join('\n'));
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Earnings"
        subtitle="Track your COD earnings, pending collections, and payout history"
        action={
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <IconDownload className="w-4 h-4 mr-2" />
            Download Report
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="border-0 bg-green-100">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Available for Payout</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">₱{Math.round(availablePayout).toLocaleString()}</p>
                <p className="text-sm text-gray-600 mt-2">Ready to withdraw</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-600 flex items-center justify-center">
                <IconCircleCheck className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-orange-100">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Pending Collection</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">₱{Math.round(pendingCollection).toLocaleString()}</p>
                <p className="text-sm text-gray-600 mt-2">Still being collected by riders</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-orange-600 flex items-center justify-center">
                <IconAlertCircle className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-purple-100">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Remitted This Month</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">₱{Math.round(remittedThisMonth).toLocaleString()}</p>
                <p className="text-sm text-gray-600 mt-2">November 2026</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center">
                <IconDownload className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle>Payout Account</CardTitle></CardHeader>
        <CardContent>
          {primaryBank ? (
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-semibold text-gray-900">{primaryBank.bank}</p>
                  <Badge variant={primaryBank.status === 'verified' ? 'success' : 'warning'}>
                    {primaryBank.status === 'verified' ? 'Verified' : 'Pending'}
                  </Badge>
                </div>
                <p className="text-gray-600">Account Number: {primaryBank.accountMasked}</p>
                <p className="text-sm text-gray-500 mt-1">{primaryBank.accountName}</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/dashboard/payout-settings')}>
                Manage Payout Account
                <IconArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <IconBuilding className="w-5 h-5 text-gray-400" />
                <p className="text-sm text-gray-600">No payout account on file yet — COD payouts can&apos;t be disbursed until one is added.</p>
              </div>
              <Button onClick={() => navigate('/dashboard/payout-settings')}>Set Up Payout Account</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <CardTitle>Settlement History</CardTitle>
            <div className="flex gap-3">
              <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">All Sources</option>
                <option value="COD">COD</option>
                <option value="Online Payment">Online Payment</option>
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="scheduled">Scheduled</option>
                <option value="deposited">Deposited</option>
                <option value="failed">Failed</option>
              </Select>
              <Input type="date" className="w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Collection Period</TableHead>
                  <TableHead>Gross Amount</TableHead>
                  <TableHead>Fees</TableHead>
                  <TableHead>Net Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected Deposit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                      No settlements match your filters.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((settlement) => (
                  <TableRow key={settlement.id}>
                    <TableCell className="font-medium text-gray-900">{settlement.id}</TableCell>
                    <TableCell>
                      <Badge variant={settlement.source === 'COD' ? 'info' : 'default'}>{settlement.source}</Badge>
                    </TableCell>
                    <TableCell>{settlement.period}</TableCell>
                    <TableCell className="font-medium">₱{settlement.grossAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-gray-600">-₱{settlement.fees.toLocaleString()}</TableCell>
                    <TableCell className="font-medium text-green-700">₱{settlement.netAmount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={SETTLEMENT_STATUS_CONFIG[settlement.status as keyof typeof SETTLEMENT_STATUS_CONFIG].variant}>
                        {SETTLEMENT_STATUS_CONFIG[settlement.status as keyof typeof SETTLEMENT_STATUS_CONFIG].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">{settlement.expectedDate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Showing {filtered.length} of {settlements.length} settlements.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
