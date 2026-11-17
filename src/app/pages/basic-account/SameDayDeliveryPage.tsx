import { useState } from 'react';
import { Navigate } from 'react-router';
import { IconBolt, IconClockHour4 } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import {
  getSameDayEnrollment,
  submitSameDayApplication,
  type SameDayEnrollment,
} from '../../lib/basicSameDayEnrollment';

/**
 * Same Day Delivery entry point for Basic accounts. Not enabled by default —
 * it is assessed by Sales, so this page branches on the account's enrollment
 * status (`lib/basicSameDayEnrollment.ts`):
 *  - approved: straight to booking
 *  - pending: read-only status, no duplicate applications
 *  - not_enrolled / rejected: the application form (reapplication is allowed)
 */
export function SameDayDeliveryPage() {
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic-guest';
  const [enrollment, setEnrollment] = useState<SameDayEnrollment>(() => getSameDayEnrollment(accountId));

  const [businessName, setBusinessName] = useState(enrollment.application?.businessName ?? user?.name ?? '');
  const [dailyOrders, setDailyOrders] = useState(enrollment.application?.estimatedDailyOrders ?? '');
  const [coverageArea, setCoverageArea] = useState(enrollment.application?.coverageArea ?? '');
  const [notes, setNotes] = useState(enrollment.application?.notes ?? '');

  if (enrollment.status === 'approved') {
    return <Navigate to="/dashboard/book-delivery" replace />;
  }

  const canSubmit = businessName.trim() !== '' && dailyOrders !== '' && coverageArea.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setEnrollment(
      submitSameDayApplication(accountId, {
        businessName: businessName.trim(),
        estimatedDailyOrders: dailyOrders,
        coverageArea: coverageArea.trim(),
        notes: notes.trim(),
      }),
    );
  };

  if (enrollment.status === 'pending') {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Same Day Delivery" subtitle="Urgent, same-day delivery for time-sensitive orders." />
        <Card>
          <CardContent className="py-12 px-6 text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <IconClockHour4 className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Application under review</h3>
            <p className="text-sm text-gray-500 mt-2">
              Our Sales team is assessing your application
              {enrollment.submittedAt ? ` (submitted ${new Date(enrollment.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })})` : ''}.
              We'll notify you once Same Day Delivery is enabled for your account.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Join Same Day Delivery" subtitle="Tell us about your delivery needs and our Sales team will assess your account." />
      {enrollment.status === 'rejected' && (
        <Alert variant="warning" title="Your previous application wasn't approved">
          You can update your details and apply again.
        </Alert>
      )}
      <Card>
        <CardContent className="p-5 max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <IconBolt className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600">Same Day Delivery is available to qualified accounts after assessment.</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Business or store name</span>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Estimated same-day orders per day</span>
              <Select value={dailyOrders} onChange={(e) => setDailyOrders(e.target.value)} required>
                <option value="" disabled>Select a range</option>
                <option value="1-5">1–5</option>
                <option value="6-20">6–20</option>
                <option value="21-50">21–50</option>
                <option value="51+">51 or more</option>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Main delivery area</span>
              <Input value={coverageArea} onChange={(e) => setCoverageArea(e.target.value)} placeholder="e.g. Metro Manila" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Anything else we should know? (optional)</span>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>
            <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
              {enrollment.status === 'rejected' ? 'Reapply' : 'Submit application'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
