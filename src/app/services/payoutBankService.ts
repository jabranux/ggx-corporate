/**
 * payoutBankService — Main Account-owned payout bank accounts.
 *
 * The service is the finance/BFF seam for both Payment Settings and COD
 * booking eligibility. A subaccount's COD collections settle through its
 * parent Main Account; subaccounts never own payout bank details themselves.
 *
 * Future API:
 *   GET    /accounts/:id/payout-owner
 *   GET    /accounts/:mainAccountId/payout-bank-accounts
 *   POST   /accounts/:mainAccountId/payout-bank-accounts
 *   PATCH  /accounts/:mainAccountId/payout-bank-accounts/:id
 *   DELETE /accounts/:mainAccountId/payout-bank-accounts/:id
 */

export type PayoutBankStatus = 'verified' | 'pending';

export interface PayoutBankAccount {
  id: string;
  bank: string;
  accountMasked: string;
  accountName: string;
  isPrimary: boolean;
  status: PayoutBankStatus;
}

const MAIN_ACCOUNT_ID = 'main';

// Session-only mock data. The Main Account starts with the same verified BDO
// account shown in Payment Settings, plus one pending account. A pending bank
// never satisfies COD payout eligibility.
const BANKS_BY_MAIN_ACCOUNT: Record<string, PayoutBankAccount[]> = {
  [MAIN_ACCOUNT_ID]: [
    { id: 'ba1', bank: 'BDO Unibank', accountMasked: '•••• •••• ••34 5678', accountName: 'Acme Corporation', isPrimary: true, status: 'verified' },
    { id: 'ba2', bank: 'BPI', accountMasked: '•••• •••• ••12 3456', accountName: 'Acme Corporation', isPrimary: false, status: 'pending' },
  ],
};

const clone = (accounts: PayoutBankAccount[]) => accounts.map((account) => ({ ...account }));

/** Resolve any batch/account scope to its Main Account finance owner. */
export async function getPayoutOwnerAccountId(_accountId: string): Promise<string> {
  // The mock data has one Main Account hierarchy. The future BFF resolves this
  // relationship from the batch owner's account id.
  return MAIN_ACCOUNT_ID;
}

/** List payout bank accounts for the Main Account that owns this scope. */
export async function getPayoutBankAccounts(accountId: string): Promise<PayoutBankAccount[]> {
  const ownerId = await getPayoutOwnerAccountId(accountId);
  return clone(BANKS_BY_MAIN_ACCOUNT[ownerId] ?? []);
}

/** Whether this scope's Main Account has a verified payout bank account. */
export async function hasEligiblePayoutBank(accountId: string): Promise<boolean> {
  const accounts = await getPayoutBankAccounts(accountId);
  return accounts.some((account) => account.status === 'verified');
}

/** Add a Main Account payout bank. New bank accounts remain pending verification. */
export async function addPayoutBankAccount(
  accountId: string,
  details: { bank: string; accountName: string; accountNumber: string },
): Promise<PayoutBankAccount[]> {
  const ownerId = await getPayoutOwnerAccountId(accountId);
  const accounts = BANKS_BY_MAIN_ACCOUNT[ownerId] ?? [];
  accounts.push({
    id: `ba${Date.now()}`,
    bank: details.bank,
    accountMasked: `•••• •••• •••• ${details.accountNumber.slice(-4)}`,
    accountName: details.accountName,
    isPrimary: false,
    status: 'pending',
  });
  BANKS_BY_MAIN_ACCOUNT[ownerId] = accounts;
  return clone(accounts);
}

/** Update the display name for a Main Account payout bank. */
export async function updatePayoutBankAccount(
  accountId: string,
  bankId: string,
  patch: Pick<PayoutBankAccount, 'accountName'>,
): Promise<PayoutBankAccount[]> {
  const ownerId = await getPayoutOwnerAccountId(accountId);
  const accounts = BANKS_BY_MAIN_ACCOUNT[ownerId] ?? [];
  BANKS_BY_MAIN_ACCOUNT[ownerId] = accounts.map((account) =>
    account.id === bankId ? { ...account, ...patch } : account,
  );
  return clone(BANKS_BY_MAIN_ACCOUNT[ownerId]);
}

/** Set the Main Account's primary payout bank. */
export async function setPrimaryPayoutBankAccount(accountId: string, bankId: string): Promise<PayoutBankAccount[]> {
  const ownerId = await getPayoutOwnerAccountId(accountId);
  const accounts = BANKS_BY_MAIN_ACCOUNT[ownerId] ?? [];
  BANKS_BY_MAIN_ACCOUNT[ownerId] = accounts.map((account) => ({ ...account, isPrimary: account.id === bankId }));
  return clone(BANKS_BY_MAIN_ACCOUNT[ownerId]);
}

/** Remove a Main Account payout bank. */
export async function removePayoutBankAccount(accountId: string, bankId: string): Promise<PayoutBankAccount[]> {
  const ownerId = await getPayoutOwnerAccountId(accountId);
  BANKS_BY_MAIN_ACCOUNT[ownerId] = (BANKS_BY_MAIN_ACCOUNT[ownerId] ?? []).filter((account) => account.id !== bankId);
  return clone(BANKS_BY_MAIN_ACCOUNT[ownerId]);
}
