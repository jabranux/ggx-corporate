import { IconTicket } from '@tabler/icons-react';
import { BasicComingSoon } from '../../components/basic-account/BasicComingSoon';

export function VouchersPage() {
  return (
    <BasicComingSoon
      icon={IconTicket}
      title="Vouchers"
      subtitle="Promo codes and vouchers available to your account."
      body="Vouchers for Basic accounts is coming soon."
    />
  );
}
