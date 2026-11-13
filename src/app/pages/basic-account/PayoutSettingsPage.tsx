import { IconBuildingBank } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

export function PayoutSettingsPage() {
  return (
    <BasicComingSoon
      icon={IconBuildingBank}
      title="Payout Settings"
      subtitle="Manage the bank details used for your disbursements."
      body="Setting up and updating payout bank details is coming soon."
    />
  );
}
