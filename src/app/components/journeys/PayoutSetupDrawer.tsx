import { useState } from 'react';
import { IconX, IconBuilding, IconShieldLock, IconCircleCheck } from '@tabler/icons-react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { OtpDialog } from '../ui/OtpDialog';
import { isValidPayoutAccountNumber, PAYOUT_ACCOUNT_NUMBER_LENGTH } from '../../lib/journeyPayoutValidation';

const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'PNB', 'Security Bank'];

interface SubmittedAccount {
  bank: string;
  accountName: string;
  accountNumber: string;
  /** Whether this was the Main Account's first payout account (and so became the default). */
  isDefault: boolean;
}

interface PayoutSetupDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Submits the new bank account into journey scenario state only — never the real payoutBankService. */
  onSubmit: (details: { bank: string; accountName: string; accountNumber: string }) => void;
  /** Whether this will be the Main Account's first payout account (drives the "Default" preview). */
  willBeDefault: boolean;
}

const maskAccountNumber = (accountNumber: string) => `•••• •••• •••• ${accountNumber.slice(-4)}`;

/**
 * P1 UX Journey — inline Main Account payout bank setup, presented as a
 * right-side drawer WITHIN Bulk Upload. Reuses the same fields and OTP gate
 * (`OtpDialog`) as Payment Settings' Add Bank Account flow, but never
 * navigates away — Bulk Upload stays the underlying task context throughout.
 *
 * A successfully added account is immediately usable: there is no Pending/
 * verification state or delayed activation in this journey.
 */
export function PayoutSetupDrawer({ open, onClose, onSubmit, willBeDefault }: PayoutSetupDrawerProps) {
  const [bank, setBank] = useState('');
  const [accountName, setAccountName] = useState('Acme Corporation');
  const [accountNumber, setAccountNumber] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedAccount | null>(null);

  if (!open) return null;

  const accountNumberValid = isValidPayoutAccountNumber(bank, accountNumber);
  // Live feedback once the field has content — matches the existing
  // review-grid pattern of showing inline errors as the user edits, without
  // an initial red state on a still-empty field.
  const showAccountNumberError = accountNumber.length > 0 && !accountNumberValid;
  const canSubmit = bank.trim().length > 0 && accountNumberValid;

  const reset = () => {
    setBank('');
    setAccountName('Acme Corporation');
    setAccountNumber('');
    setShowOtp(false);
    setSubmitted(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleContinue = () => {
    if (!canSubmit) return; // the Continue button is disabled until valid
    setShowOtp(true);
  };

  const handleVerified = () => {
    setShowOtp(false);
    onSubmit({ bank, accountName, accountNumber });
    setSubmitted({ bank, accountName, accountNumber, isDefault: willBeDefault });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Set up payout account">
      <div className="absolute inset-0 bg-gray-900/50" onClick={close} />
      <div className="relative w-full max-w-md h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <IconBuilding className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Set up payout account</h2>
              <p className="text-xs text-gray-500">Main Account payout bank — completed without leaving Bulk Upload.</p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer" onClick={close} aria-label="Close">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
              <IconCircleCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Payout account added</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              This account is added and ready to receive COD payouts — no further verification needed.
            </p>

            {/* Account preview card */}
            <div className="mt-5 w-full max-w-xs text-left rounded-xl border border-green-200 bg-green-50/60 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
                  <IconBuilding className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{submitted.bank}</p>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{maskAccountNumber(submitted.accountNumber)}</p>
                  <p className="text-xs text-gray-500 truncate">{submitted.accountName}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {submitted.isDefault && <Badge variant="info">Default</Badge>}
                <Badge variant="success">Added</Badge>
              </div>
            </div>

            <Button className="mt-6" onClick={close}>Back to Bulk Upload</Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank</label>
                <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option value="">Select bank</option>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name</label>
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Number</label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account number"
                  className={showAccountNumberError ? 'border-red-500 focus-visible:ring-red-500 bg-red-50' : ''}
                  aria-invalid={showAccountNumberError}
                />
                {showAccountNumberError && (
                  <p className="text-xs text-red-600 mt-1.5">
                    Account number must be exactly {PAYOUT_ACCOUNT_NUMBER_LENGTH} characters (currently {accountNumber.trim().length}).
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <IconShieldLock className="w-3.5 h-3.5" />
                You&apos;ll be asked to verify with an OTP before this submits.
              </p>
            </div>
            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button disabled={!canSubmit} onClick={handleContinue}>Continue</Button>
            </div>
          </>
        )}
      </div>

      <OtpDialog
        open={showOtp}
        onClose={() => setShowOtp(false)}
        onVerified={handleVerified}
        actionLabel="Bank account added"
        elevated
      />
    </div>
  );
}
