import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { enrollPayoutBankAccount } from '../services/payoutBankService';

const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'PNB', 'Security Bank'];

interface PayoutBankModalProps {
  open: boolean;
  /** Account/subaccount the enrolled bank account is scoped to. */
  accountId: string;
  onClose: () => void;
  /** Called after the bank account is successfully enrolled. */
  onEnrolled: () => void;
  title?: string;
  description?: string;
}

/**
 * Shared payout bank enrollment modal — same Bank / Account Name / Account
 * Number fields used across the app's payout-account surfaces. Reused as-is
 * (not redesigned) so any caller can gate an action on payout-account
 * enrollment without building its own dialog.
 */
export function PayoutBankModal({
  open, accountId, onClose, onEnrolled,
  title = 'Add a payout bank account',
  description,
}: PayoutBankModalProps) {
  const [form, setForm] = useState({ bank: '', accountName: '', accountNumber: '' });
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = !!(form.bank.trim() && form.accountName.trim() && form.accountNumber.trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await enrollPayoutBankAccount(accountId, form);
      setForm({ bank: '', accountName: '', accountNumber: '' });
      onEnrolled();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="md" title={title}>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank</label>
          <Select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
            <option value="">Select bank</option>
            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name</label>
          <Input
            value={form.accountName}
            onChange={(e) => setForm({ ...form, accountName: e.target.value })}
            placeholder="Name on the account"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Number</label>
          <Input
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            placeholder="Account number"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-4">
        Your details are used only for payouts. Verification may take 1–2 business days.
      </p>
      <div className="flex gap-2.5 justify-end pt-5">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit || submitting} onClick={handleSubmit}>
          {submitting ? 'Saving…' : 'Add bank account'}
        </Button>
      </div>
    </Dialog>
  );
}
