import type { ComponentType } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { Card, CardContent } from '../ui/Card';

interface BasicComingSoonProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  body: string;
}

/**
 * Lightweight, design-system-consistent placeholder for a Basic feature not
 * yet built out (spec §6: "provide lightweight ... placeholders rather than
 * building complete feature modules" for this phase). Shared by Earnings,
 * Payout Settings, Rewards, Vouchers, Referrals, and Sulit Bundles so each
 * stays a real, routable, correctly-gated page without duplicating layout.
 */
export function BasicComingSoon({ icon: Icon, title, subtitle, body }: BasicComingSoonProps) {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardContent className="py-16 px-6 text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Coming soon</h3>
          <p className="text-sm text-gray-500 mt-2">{body}</p>
        </CardContent>
      </Card>
    </div>
  );
}
