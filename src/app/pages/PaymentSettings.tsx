import { useEffect, useState } from 'react';
import { IconPlus, IconCheck, IconBuilding, IconCreditCard, IconShield, IconShieldLock, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { OtpDialog } from '../components/ui/OtpDialog';
import { recordFinancialChange } from '../services/financialSecurityService';
import {
  addPayoutBankAccount,
  getPayoutBankAccounts,
  removePayoutBankAccount,
  setPrimaryPayoutBankAccount,
  updatePayoutBankAccount,
  type PayoutBankAccount,
} from '../services/payoutBankService';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { useJourney } from '../contexts/JourneyContext';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  holder: string;
  isDefault: boolean;
  verified: boolean;
}

const initialMethods: PaymentMethod[] = [
  { id: 'pm1', brand: 'Visa', last4: '4242', expiry: '12/2027', holder: 'Acme Corporation', isDefault: true, verified: true },
  { id: 'pm2', brand: 'Mastercard', last4: '8888', expiry: '08/2028', holder: 'Acme Corporation', isDefault: false, verified: true },
];

type EditState =
  | { type: 'method'; id: string; holder: string; expiry: string }
  | { type: 'bank'; id: string; accountName: string }
  | null;

type RemoveState =
  | { type: 'method'; id: string; label: string }
  | { type: 'bank'; id: string; label: string }
  | null;

// A sensitive action pending OTP verification.
type OtpAction = { title: string; action: string; run: () => void } | null;

const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'PNB', 'Security Bank'];

export function PaymentSettings() {
  const { subAccountsEnabled, isMainAccountView } = useSubAccounts();
  const { user } = useAuth();
  const journey = useJourney();
  // P1 UX Journey: an in-memory, presentation-only Main Account admin capability
  // for this page while the journey is active — never a real permission change
  // (see JourneyContext / AdminRoute's `allowJourneyOverride`).
  const isJourneyP1 = journey.activeJourney?.id === 'cod-main-account-payout';
  // Financial actions are parent/main-account level only and Admin-only. The
  // route is already AdminRoute-guarded; this also gates the action controls
  // (defense-in-depth) and when an Admin is drilled into a specific subaccount.
  const financialAccessAllowed = (user?.role === 'admin' && (!subAccountsEnabled || isMainAccountView())) || isJourneyP1;

  const [methods, setMethods] = useState<PaymentMethod[]>(initialMethods);
  const [banks, setBanks] = useState<PayoutBankAccount[]>([]);
  const [edit, setEdit] = useState<EditState>(null);
  const [remove, setRemove] = useState<RemoveState>(null);
  const [otp, setOtp] = useState<OtpAction>(null);

  // Add forms
  const [addMethod, setAddMethod] = useState<{ brand: string; last4: string; holder: string; expiry: string } | null>(null);
  const [addBank, setAddBank] = useState<{ bank: string; accountName: string; accountNumber: string } | null>(null);

  // Payout banks are shared with COD eligibility through the service layer.
  // Payment Settings remains the only UI allowed to mutate them. During the P1
  // UX Journey, the payout bank list is sourced from journey scenario state
  // instead (never the real service) — see `journeyBanks` below.
  useEffect(() => {
    if (isJourneyP1) return;
    let active = true;
    getPayoutBankAccounts('main')
      .then((accounts) => { if (active) setBanks(accounts); })
      .catch(() => { if (active) setBanks([]); });
    return () => { active = false; };
  }, [isJourneyP1]);

  // Journey-only payout bank list: starts empty ("no eligible payout bank"),
  // becomes one pending (never verified) entry after Add Bank Account + OTP.
  const journeyBanks: PayoutBankAccount[] = journey.codPayout.status === 'pending'
    ? [{
        id: 'journey-bank',
        bank: journey.codPayout.bank ?? '',
        accountMasked: journey.codPayout.accountMasked ?? '',
        accountName: journey.codPayout.accountName ?? '',
        isPrimary: true,
        status: 'pending',
      }]
    : [];
  const displayBanks = isJourneyP1 ? journeyBanks : banks;

  // Open the OTP gate for a sensitive action. `run` executes only after verify.
  const requireOtp = (action: string, run: () => void) =>
    setOtp({ title: 'Verify financial change', action, run });

  const onOtpVerified = () => {
    if (!otp) return;
    otp.run();
    // Backend-emitted side effect (audit + attention email + notification);
    // fire-and-forget — the UI does not depend on its completion.
    void recordFinancialChange(otp.action);
    setOtp(null);
  };

  // --- Edit (OTP-gated) ---
  const saveEdit = () => {
    if (!edit) return;
    const e = edit;
    setEdit(null);
    requireOtp(e.type === 'method' ? 'Payment method updated' : 'Bank account updated', () => {
      if (e.type === 'method') {
        setMethods((prev) => prev.map((m) => (m.id === e.id ? { ...m, holder: e.holder, expiry: e.expiry } : m)));
      } else if (isJourneyP1) {
        journey.updateCodPayoutAccountName(e.accountName);
      } else {
        void updatePayoutBankAccount('main', e.id, { accountName: e.accountName }).then(setBanks);
      }
    });
  };

  // --- Remove (confirm → OTP → remove) ---
  const confirmRemove = () => {
    if (!remove) return;
    const r = remove;
    setRemove(null);
    requireOtp(r.type === 'method' ? 'Payment method removed' : 'Bank account removed', () => {
      if (r.type === 'method') setMethods((prev) => prev.filter((m) => m.id !== r.id));
      else if (isJourneyP1) journey.clearCodPayoutBank();
      else void removePayoutBankAccount('main', r.id).then(setBanks);
    });
  };

  // --- Set default / primary (payout change → OTP) ---
  const setDefaultMethod = (id: string) =>
    requireOtp('Default payment method changed', () =>
      setMethods((prev) => prev.map((m) => ({ ...m, isDefault: m.id === id }))),
    );

  const setPrimaryBank = (id: string) =>
    requireOtp('Primary payout account changed', () =>
      void setPrimaryPayoutBankAccount('main', id).then(setBanks),
    );

  // --- Add (form → OTP → add) ---
  const submitAddMethod = () => {
    if (!addMethod || !addMethod.last4.trim()) return;
    const a = addMethod;
    setAddMethod(null);
    requireOtp('Payment method added', () => {
      setMethods((prev) => [
        ...prev,
        { id: `pm${Date.now()}`, brand: a.brand, last4: a.last4.slice(-4), expiry: a.expiry, holder: a.holder, isDefault: false, verified: false },
      ]);
    });
  };

  const submitAddBank = () => {
    if (!addBank || !addBank.bank.trim() || !addBank.accountNumber.trim()) return;
    const a = addBank;
    setAddBank(null);
    requireOtp('Bank account added', () => {
      if (isJourneyP1) {
        // Journey fixture only supports None → Pending; a new bank never
        // starts verified, matching real payout verification rules.
        journey.setCodPayoutPending(a);
      } else {
        void addPayoutBankAccount('main', a).then(setBanks);
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment Settings</h1>
        <p className="text-gray-600 mt-1">Manage how you pay GoGo Xpress and receive earnings</p>
      </div>

      {/* Parent-level financial access notice */}
      {!financialAccessAllowed && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <IconShieldLock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Financial settings are managed at the parent (Main Account) level. Switch to the Main Account to add, edit, or remove payment and payout details.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security note */}
      {financialAccessAllowed && (
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
      )}

      <div className="space-y-8">
        {/* ── Payment Methods ─────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Payment Methods</h2>
          <p className="text-sm text-gray-600 mb-4">For paying billing statements to GoGo Xpress</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {methods.map((m) => (
              <Card key={m.id} className={`flex flex-col ${m.isDefault ? 'border-blue-300 bg-blue-50/50' : ''}`}>
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  {/* Icon + card info */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${m.isDefault ? 'bg-gradient-to-r from-blue-600 to-blue-800' : 'bg-gray-100'}`}>
                      <IconCreditCard className={`w-5 h-5 ${m.isDefault ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{m.brand} •••• {m.last4}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Expires {m.expiry}</p>
                      <p className="text-xs text-gray-500 truncate">{m.holder}</p>
                    </div>
                  </div>
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {m.isDefault && <Badge variant="info">Default</Badge>}
                    {m.verified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Pending</Badge>}
                  </div>
                  {/* Actions */}
                  {financialAccessAllowed && (
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                      {!m.isDefault && (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setDefaultMethod(m.id)}>
                          Set Default
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setEdit({ type: 'method', id: m.id, holder: m.holder, expiry: m.expiry })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-600 hover:bg-red-50" onClick={() => setRemove({ type: 'method', id: m.id, label: `${m.brand} •••• ${m.last4}` })}>
                        Remove
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Add Payment Method — card-style, always last */}
            {financialAccessAllowed && (
              <button
                onClick={() => setAddMethod({ brand: 'Visa', last4: '', holder: 'Acme Corporation', expiry: '' })}
                className="rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-2 p-5 min-h-[160px] cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                  <IconPlus className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
                <span className="text-sm font-medium text-gray-600 group-hover:text-blue-700 transition-colors">
                  Add Payment Method
                </span>
              </button>
            )}
          </div>

          {/* Auto-Pay — contained width, not full-page */}
          <Card className="mt-6 bg-gray-50 border-gray-200 max-w-xl">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <IconShield className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">Auto-Pay (Coming Soon)</h4>
                  <p className="text-sm text-gray-600">
                    Automatically pay billing statements using your default payment method. This feature will be available soon to ensure seamless transactions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Payout Bank Accounts ─────────────────────────────────────────── */}
        <div className="pt-6 border-t border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Payout Bank Accounts</h2>
          <p className="text-sm text-gray-600 mb-4">For receiving COD earnings and online payment settlements</p>

          {isJourneyP1 && journey.codPayout.status === 'none' && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No payout bank on file yet — this UX Journey preview starts from a clean Main Account with COD blocked.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {displayBanks.map((b) => (
              <Card key={b.id} className={`flex flex-col ${b.isPrimary ? 'border-green-300 bg-green-50/50' : ''}`}>
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  {/* Icon + bank info */}
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
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {b.isPrimary && <Badge variant="info">Primary</Badge>}
                    {b.status === 'verified' ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Pending</Badge>}
                  </div>
                  {/* Actions */}
                  {financialAccessAllowed && (
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                      {!b.isPrimary && (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setPrimaryBank(b.id)}>
                          Set Primary
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setEdit({ type: 'bank', id: b.id, accountName: b.accountName })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-600 hover:bg-red-50" onClick={() => setRemove({ type: 'bank', id: b.id, label: b.bank })}>
                        Remove
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Add Bank Account — card-style, always last */}
            {financialAccessAllowed && (
              <button
                onClick={() => setAddBank({ bank: '', accountName: 'Acme Corporation', accountNumber: '' })}
                className="rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-green-400 hover:bg-green-50 transition-colors flex flex-col items-center justify-center gap-2 p-5 min-h-[160px] cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-green-100 flex items-center justify-center transition-colors">
                  <IconPlus className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                </div>
                <span className="text-sm font-medium text-gray-600 group-hover:text-green-700 transition-colors">
                  Add Bank Account
                </span>
              </button>
            )}
          </div>

          {/* Payout info — contained width, not full-page */}
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
      </div>

      {/* Edit modal */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} size="md">
        {edit && (
          <>
            <h3 className="text-base font-semibold text-gray-900 mb-5">
              {edit.type === 'method' ? 'Edit Payment Method' : 'Edit Bank Account'}
            </h3>
            <div className="space-y-4">
              {edit.type === 'method' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Cardholder / Account Name</label>
                    <Input value={edit.holder} onChange={(e) => setEdit({ ...edit, holder: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry (MM/YYYY)</label>
                    <Input value={edit.expiry} onChange={(e) => setEdit({ ...edit, expiry: e.target.value })} />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name</label>
                  <Input value={edit.accountName} onChange={(e) => setEdit({ ...edit, accountName: e.target.value })} />
                </div>
              )}
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

      {/* Add payment method modal */}
      <Dialog open={!!addMethod} onClose={() => setAddMethod(null)} size="md">
        {addMethod && (
          <>
            <h3 className="text-base font-semibold text-gray-900 mb-5">Add Payment Method</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Card Brand</label>
                <Select value={addMethod.brand} onChange={(e) => setAddMethod({ ...addMethod, brand: e.target.value })}>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Card Number</label>
                <Input value={addMethod.last4} onChange={(e) => setAddMethod({ ...addMethod, last4: e.target.value })} placeholder="1234 5678 9012 3456" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Cardholder</label>
                  <Input value={addMethod.holder} onChange={(e) => setAddMethod({ ...addMethod, holder: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry (MM/YYYY)</label>
                  <Input value={addMethod.expiry} onChange={(e) => setAddMethod({ ...addMethod, expiry: e.target.value })} placeholder="12/2028" />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1.5">
              <IconShieldLock className="w-3.5 h-3.5" />
              OTP verification is required before this is added.
            </p>
            <div className="flex gap-2.5 justify-end pt-4">
              <Button variant="outline" size="sm" onClick={() => setAddMethod(null)}>Cancel</Button>
              <Button size="sm" disabled={!addMethod.last4.trim()} onClick={submitAddMethod}>Continue</Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Add bank account modal */}
      <Dialog open={!!addBank} onClose={() => setAddBank(null)} size="md">
        {addBank && (
          <>
            <h3 className="text-base font-semibold text-gray-900 mb-5">Add Bank Account</h3>
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
          title={`Remove ${remove.type === 'method' ? 'payment method' : 'bank account'}?`}
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
            Any scheduled payments or payouts using this {remove.type === 'method' ? 'card' : 'account'} will need a new method. You&apos;ll verify with an OTP next.
          </div>
        </ConfirmDialog>
      )}

      {/* OTP verification gate for all sensitive financial actions */}
      <OtpDialog
        open={!!otp}
        onClose={() => setOtp(null)}
        onVerified={onOtpVerified}
        actionLabel={otp?.action}
      />
    </div>
  );
}
