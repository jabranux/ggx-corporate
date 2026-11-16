import { IconCode } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

export function BasicApiIntegrationPage() {
  return (
    <BasicComingSoon
      icon={IconCode}
      title="API Integration"
      subtitle="Connect your own systems to GGX with API keys and webhooks."
      body="API Integration for Basic accounts is coming soon."
    />
  );
}
