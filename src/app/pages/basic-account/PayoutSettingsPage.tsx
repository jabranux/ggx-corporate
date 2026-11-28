import { useEffect, useState } from 'react';
import { IconPlus, IconCheck, IconBuilding, IconShieldLock, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Dialog, ConfirmDialog } from '../../components/ui/Dialog';
import { OtpDialog } from '../../components/ui/OtpDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { recordFinancialChange } from '../../services/financialSecurityService';
import {
  addPayoutBankAccount,
  getPayoutBankAccounts,
  removePayoutBankAccount,
  setPrimaryPayoutBankAccount,
  updatePayoutBankAccount,
  type PayoutBankAccount,
} from '../../services/payoutBankService';

const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'PNB', 'Security Bank'];

type EditState = { id: string; accountName: string } | null;
type RemoveState = { id: string; label: string } | null;
type OtpAction = { title: string; run: () => void } | null;

/**
 * Basic Account's own Payout Settings — the bank-account half of Corporate's
 * Payment Settings page (PaymentSettings.tsx), reusing the same payoutBankService
 * facade, OTP-gated flow, and UI pattern. Payment Methods (for paying GoGo
 * Xpress billing statements) are a Business+/Corporate-only concept (no
 * Billing page exists for Basic — see routes.tsx) and are intentionally not
 * included here.
 */
export function PayoutSettingsPage() {
  const { user } = useAuth();
  const accountId = user?.accountId ?? '';

  const [banks, setBanks] = useState<PayoutBankAccount[]>([]);
  const [edit, setEdit] = useState<EditState>(null);
  const [remove, setRemove] = useState<RemoveState>(null);
  const [otp, setOtp] = useState<OtpAction>(null);
  const [addBank, setAddBank] = useState<{ bank: string; accountName: string; accountNumber: string } | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    getPayoutBankAccounts(accountId)
      .then((accounts) => { if (active) setBanks(accounts); })
      .catch(() => { if (active) setBanks([]); });
    return () => { active = false; };
  }, [accountId]);

  const requireOtp = (title: string, run: () => void) => setOtp({ title, run });

  const onOtpVerified = () => {
    if (!otp) return;
    otp.run();
    // Backend-emitted side effect (audit + attention email + notification);
    // fire-and-forget — the UI does not depend on its completion.
    void recordFinancialChange(otp.title);
    setOtp(null);
  };

  const saveEdit = () => {
    if (!edit) return;
    const e = edit;
    setEdit(null);
    requireOtp('Bank account updated', () => {
      void updatePayoutBankAccount(accountId, e.id, { accountName: e.accountName }).then(setBanks);
    });
  };

  const confirmRemove = () => {
    if (!remove) return;
    const r = remove;
    setRemove(null);
    requireOtp('Bank account removed', () => {
      void removePayoutBankAccount(accountId, r.id).then(setBanks);
    });
  };

  const setPrimary = (id: string) =>
    requireOtp('Primary payout account changed', () => {
      void setPrimaryPayoutBankAccount(accountId, id).then(setBanks);
    });

  const submitAddBank = () => {
    if (!addBank || !addBank.bank.trim() || !addBank.accountNumber.trim()) return;
    const a = addBank;
    setAddBank(null);
    requireOtp('Payout account added', () => {
      void addPayoutBankAccount(accountId, a).then(setBanks);
    });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Payout Settings" subtitle="Manage the bank account used for your COD disbursements" />

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <IconShieldLock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              Financial changes require OTP verification before they take effect — this applies to everyone, including the account holder.
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Payout Bank Account</h2>
        <p className="text-sm text-gray-600 mb-4">For receiving COD earnings</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {banks.map((b) => (
            <Card key={b.id} className={`flex flex-col ${b.isPrimary ? 'border-green-300 bg-green-50/50' : ''}`}>
              <CardContent className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${b.isPrimary ? 'bg-green-600' : 'bg-gray-100'}`}>
                    <IconBuilding className={`w-5 h-5 ${b.isPrimary ? 'text-white' : 'text-gray-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{b.bank}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{b.accountMasked}</p>
                    <p className="text-xs text-gray-500 truncate">{b.accountName}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.isPrimary && <Badge variant="info">Primary</Badge>}
                  {b.status === 'verified' ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Pending</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                  {!b.isPrimary && (
                    <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setPrimary(b.id)}>
                      Set Primary
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setEdit({ id: b.id, accountName: b.accountName })}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-600 hover:bg-red-50" onClick={() => setRemove({ id: b.id, label: b.bank })}>
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <button
            onClick={() => setAddBank({ bank: '', accountName: user?.name ?? '', accountNumber: '' })}
            className="rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-green-400 hover:bg-green-50 transition-colors flex flex-col items-center justify-center gap-2 p-5 min-h-[160px] cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-green-100 flex items-center justify-center transition-colors">
              <IconPlus className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
            </div>
            <span className="text-sm font-medium text-gray-600 group-hover:text-green-700 transition-colors">
              Add Payout Account
            </span>
          </button>
        </div>

        <Card className="mt-6 bg-blue-50 border-blue-200 max-w-xl">
          <CardContent className="p-5">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <IconCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Payout Schedule</h4>
                  <p className="text-sm text-blue-800">
                    Payouts are processed weekly and deposited to your nominated bank account within 1–2 business days after verification.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <IconCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Bank Account Verification</h4>
                  <p className="text-sm text-blue-800">
                    New bank accounts must be verified before they can receive payouts. Verification typically takes 1–3 business days.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit modal */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} size="md">
        {edit && (
          <>
            <h3 className="text-base font-semibold text-gray-900 mb-5">Edit Bank Account</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name</label>
                <Input value={edit.accountName} onChange={(e) => setEdit({ ...edit, accountName: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1.5">
              <IconShieldLock className="w-3.5 h-3.5" />
              You&apos;ll be asked to verify with an OTP before changes save.
            </p>
            <div className="flex gap-2.5 justify-end pt-4">
              <Button variant="outline" size="sm" onClick={() => setEdit(null)}>Cancel</Button>
              <Button size="sm" onClick={saveEdit}>Save Changes</Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Add bank account modal */}
      <Dialog open={!!addBank} onClose={() => setAddBank(null)} size="md">
        {addBank && (
          <>
            <h3 className="text-base font-semibold text-gray-900 mb-5">Add Payout Account</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank</label>
                <Select value={addBank.bank} onChange={(e) => setAddBank({ ...addBank, bank: e.target.value })}>
                  <option value="">Select bank</option>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name</label>
                <Input value={addBank.accountName} onChange={(e) => setAddBank({ ...addBank, accountName: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Number</label>
                <Input value={addBank.accountNumber} onChange={(e) => setAddBank({ ...addBank, accountNumber: e.target.value })} placeholder="Account number" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1.5">
              <IconShieldLock className="w-3.5 h-3.5" />
              OTP verification is required before this is added.
            </p>
            <div className="flex gap-2.5 justify-end pt-4">
              <Button variant="outline" size="sm" onClick={() => setAddBank(null)}>Cancel</Button>
              <Button size="sm" disabled={!addBank.bank.trim() || !addBank.accountNumber.trim()} onClick={submitAddBank}>Continue</Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Remove confirmation (confirm → OTP → remove) */}
      {remove && (
        <ConfirmDialog
          open
          onClose={() => setRemove(null)}
          onConfirm={confirmRemove}
          title="Remove bank account?"
          description={
            <>
              <span className="font-medium text-gray-700">{remove.label}</span> will be removed from your account. This action cannot be undone.
            </>
          }
          confirmLabel="Remove"
          variant="destructive"
          confirmIcon={<IconTrash className="w-3.5 h-3.5 mr-1.5" />}
        >
          <div className="flex items-start gap-2 mb-5 text-xs text-gray-500">
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
            Any scheduled payouts using this account will need a new one. You&apos;ll verify with an OTP next.
          </div>
        </ConfirmDialog>
      )}

      {/* OTP verification gate for all sensitive financial actions */}
      <OtpDialog
        open={!!otp}
        onClose={() => setOtp(null)}
        onVerified={onOtpVerified}
        actionLabel={otp?.title}
      />
    </div>
  );
}
