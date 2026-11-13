import { IconUserPlus } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

export function ReferralsPage() {
  return (
    <BasicComingSoon
      icon={IconUserPlus}
      title="Referrals"
      subtitle="Invite other sellers and earn referral rewards."
      body="Referrals for Basic accounts is coming soon."
    />
  );
}
