import { IconBolt } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

/**
 * Same-Day Delivery is a Growing/HVM-gated capability for Basic, not a
 * default feature (basic_user_requirements.md §6/§7) — this is an interest
 * placeholder the home's service shortcuts can safely recommend without
 * claiming the capability is bookable yet.
 */
export function SameDayDeliveryPage() {
  return (
    <BasicComingSoon
      icon={IconBolt}
      title="Same-Day Delivery"
      subtitle="Urgent, same-day delivery for time-sensitive orders."
      body="Same-Day Delivery is available for qualified accounts. Keep shipping with GGX and we'll let you know when it's ready for you."
    />
  );
}
