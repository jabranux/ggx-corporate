import { IconWallet } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

export function BasicEarningsPage() {
  return (
    <BasicComingSoon
      icon={IconWallet}
      title="Earnings"
      subtitle="Track your COD earnings and disbursable balance."
      body="Earnings and COD disbursement tracking for Basic accounts is coming soon."
    />
  );
}
