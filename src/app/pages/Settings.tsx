import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { IconBuilding, IconArrowRight, IconEdit, IconSettings, IconCheck, IconLoader2 } from '@tabler/icons-react';
import { Dialog } from '../components/ui/Dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { AddressDisplayCard } from '../components/AddressDisplayCard';
import type { Address } from '../components/AddressBook';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';

// Default pickup address shown on the account. Address Book is the source of
// truth for creating/editing addresses, so this is display-only here.
const companyAddress: Address = {
  id: 'company-default',
  label: 'office',
  name: 'Acme Corporation',
  mobileNumber: '+63 917 123 4567',
  province: 'Metro Manila',
  city: 'Makati',
  barangay: 'Poblacion',
  otherDetails: '5th Floor, ABC Building, Ayala Avenue',
  postalCode: '1226',
  isPreferred: true,
};

export function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBasic = user?.accountSegment === 'basic';
  const { subAccountsEnabled, isMainAccountView, getCurrentAccountName, getCurrentAccountId } = useSubAccounts();
  const [savingAccount, setSavingAccount] = useState(false);
  const [savedAccount, setSavedAccount] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  // Notification preferences as toggles (local demo state).
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    delivery: true, billing: true, weekly: true, marketing: false,
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handleSaveAccount = async () => {
    setSavingAccount(true);
    await new Promise((r) => setTimeout(r, 700));
    setSavingAccount(false);
    setSavedAccount(true);
    setTimeout(() => setSavedAccount(false), 3000);
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    await new Promise((r) => setTimeout(r, 600));
    setSavingPrefs(false);
    setSavedPrefs(true);
    setTimeout(() => setSavedPrefs(false), 3000);
  };

  const handleChangePassword = async () => {
    setPasswordSaved(true);
    await new Promise((r) => setTimeout(r, 800));
    setPasswordForm({ current: '', next: '', confirm: '' });
    setTimeout(() => { setShowChangePassword(false); setPasswordSaved(false); }, 1200);
  };

  // When the user is viewing a specific subaccount (not Main Account), surface a
  // contextual banner pointing to that subaccount's dedicated settings page.
  const inSubaccountView = subAccountsEnabled && !isMainAccountView();
  const subaccountId   = inSubaccountView ? getCurrentAccountId()   : null;
  const subaccountName = inSubaccountView ? getCurrentAccountName() : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">
          {inSubaccountView
            ? `Main account settings — you are viewing as ${subaccountName}`
            : 'Manage your account preferences and settings'}
        </p>
      </div>

      <div className="grid gap-6">
        {/* Subaccount context banner — shown when drilling into a subaccount */}
        {inSubaccountView && subaccountId && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconSettings className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900 mb-0.5">
                    Subaccount-specific settings
                  </p>
                  <p className="text-sm text-blue-800 mb-3">
                    You are currently viewing <strong>{subaccountName}</strong>. This page shows
                    main-account settings. For pickup address, manager assignments, and
                    subaccount-level configuration, visit the subaccount settings page.
                  </p>
                  <Link to={`/dashboard/subaccounts/${subaccountId}/settings`}>
                    <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
                      Open Subaccount Settings
                      <IconArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subaccounts is a Business+-only hierarchy concept — never offered to a Basic account. */}
        {!subAccountsEnabled && !isBasic && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconBuilding className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <CardTitle>Enable Subaccounts</CardTitle>
                  <CardDescription className="text-blue-800">
                    Manage multiple brands, branches, or clients under one main account
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-blue-900 mb-4">
                Subaccounts allow you to organize your operations across different business units while keeping billing and finance consolidated. Perfect for businesses managing multiple brands, regional offices, or client accounts.
              </p>
              <Button onClick={() => navigate('/dashboard/subaccounts/enable')}>
                Enable Subaccounts
                <IconArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Update your company details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
              <Input defaultValue="Acme Corporation" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <Input type="email" defaultValue="admin@acme.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <Input type="tel" defaultValue="+63 917 123 4567" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Pickup Address</label>
                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => navigate('/dashboard/address-book')}>
                  <IconEdit className="w-3.5 h-3.5 mr-1.5" />
                  Edit in Address Book
                </Button>
              </div>
              <Card className="border-blue-300 ring-1 ring-blue-200">
                <CardContent className="p-5">
                  <AddressDisplayCard address={companyAddress} />
                </CardContent>
              </Card>
              <p className="text-xs text-gray-500 mt-2">
                Addresses are managed in the Address Book to keep pickup-supported locations consistent.
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveAccount} disabled={savingAccount}>
                {savingAccount ? (
                  <><IconLoader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                ) : savedAccount ? (
                  <><IconCheck className="w-4 h-4 mr-2" />Saved</>
                ) : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setSavedAccount(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Manage email and notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: 'delivery', label: 'Delivery status updates' },
              { id: 'billing', label: 'Billing and invoice notifications' },
              { id: 'weekly', label: 'Weekly summary reports' },
              { id: 'marketing', label: 'Marketing and promotional emails' },
            ].map((item) => {
              const on = notifPrefs[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-700">{item.label}</span>
                  <Switch
                    checked={on}
                    onCheckedChange={() => setNotifPrefs((p) => ({ ...p, [item.id]: !p[item.id] }))}
                    aria-label={item.label}
                  />
                </div>
              );
            })}
            <div className="pt-4">
              <Button onClick={handleSavePrefs} disabled={savingPrefs}>
                {savingPrefs ? (
                  <><IconLoader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                ) : savedPrefs ? (
                  <><IconCheck className="w-4 h-4 mr-2" />Saved</>
                ) : 'Update Preferences'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage password and security settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Button variant="outline" onClick={() => setShowChangePassword(true)}>Change Password</Button>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                <span className="text-sm text-gray-700">Enable two-factor authentication</span>
              </label>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showChangePassword} onClose={() => setShowChangePassword(false)} size="sm" title="Change Password">
        {passwordSaved ? (
          <div className="flex items-center gap-2 text-emerald-700 py-4">
            <IconCheck className="w-5 h-5" />
            <span className="text-sm font-medium">Password updated successfully.</span>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
                <Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <Input type="password" value={passwordForm.next} onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                <Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowChangePassword(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!passwordForm.current || !passwordForm.next || passwordForm.next !== passwordForm.confirm}
                onClick={handleChangePassword}
              >
                Update Password
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
