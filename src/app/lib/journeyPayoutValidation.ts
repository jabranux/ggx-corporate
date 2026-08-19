/**
 * Payout bank account-number validation for the COD Main Account Payout
 * Setup UX Journey (P1).
 *
 * For this POC every bank requires exactly 13 characters — a placeholder for
 * the eventual backend-owned, per-bank account-number contract. `bank` is
 * already part of the signature so swapping in real per-bank rules (e.g. a
 * `BANK_ACCOUNT_NUMBER_LENGTH` lookup from the backend) only means changing
 * this function's body, not any call site.
 */
export const PAYOUT_ACCOUNT_NUMBER_LENGTH = 13;

export function isValidPayoutAccountNumber(_bank: string, accountNumber: string): boolean {
  return accountNumber.trim().length === PAYOUT_ACCOUNT_NUMBER_LENGTH;
}
