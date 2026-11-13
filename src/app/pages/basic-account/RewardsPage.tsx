import { IconGift } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

export function RewardsPage() {
  return (
    <BasicComingSoon
      icon={IconGift}
      title="Rewards"
      subtitle="Earn perks as you ship more with GoGo Xpress."
      body="Rewards for Basic accounts is coming soon."
    />
  );
}
