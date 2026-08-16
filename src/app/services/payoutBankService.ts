/**
 * payoutBankService — payout bank account enrollment status, scoped per
 * account/subaccount. Mock/session-only (in-memory), matching the pattern of
 * other frontend-only services in this app.
 *
 * Future API:
 *   GET  /accounts/:id/payout-bank-account → hasEligiblePayoutBank
 *   POST /accounts/:id/payout-bank-account → enrollPayoutBankAccount
 */

interface PayoutBankAccount {
  bank: string;
  accountName: string;
  accountNumberLast4: string;
}

// Seed: Main Account already has an eligible payout bank (mirrors the demo
// data shown on Payment Settings / Earnings). Subaccounts start unenrolled so
// the COD upload guard is demoable when uploading under a subaccount scope.
const ENROLLED: Record<string, PayoutBankAccount> = {
  main: { bank: 'BDO Unibank', accountName: 'Acme Corporation', accountNumberLast4: '5678' },
};

/** Whether the given account/subaccount has an eligible payout bank account. */
export async function hasEligiblePayoutBank(accountId: string): Promise<boolean> {
  return !!ENROLLED[accountId];
}

/** Enroll (or replace) the payout bank account for the given account/subaccount. */
export async function enrollPayoutBankAccount(
  accountId: string,
  details: { bank: string; accountName: string; accountNumber: string },
): Promise<void> {
  ENROLLED[accountId] = {
    bank: details.bank,
    accountName: details.accountName,
    accountNumberLast4: details.accountNumber.slice(-4),
  };
}
