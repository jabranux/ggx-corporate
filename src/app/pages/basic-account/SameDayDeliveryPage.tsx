import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IconClockHour4, IconCoin, IconTrendingUp, IconMapPin, IconChevronLeft,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SameDayModeSwitcher } from '../../components/SameDayModeSwitcher';
import { InAppBrowserDrawer } from '../../components/InAppBrowserDrawer';
import { BookDelivery } from './BookDelivery';
import { getSameDayMode, setSameDayMode, type SameDayPrototypeMode } from '../../lib/basicSameDayMode';
import {
  getSameDayEnrollment,
  submitSameDayApplication,
  SAME_DAY_AVERAGE_DAILY_SHIPMENT_OPTIONS,
  SAME_DAY_PICKUP_LOCATION_OPTIONS,
  type SameDayEnrollment,
  type SameDayAverageDailyShipment,
  type SameDayPickupLocation,
} from '../../lib/basicSameDayEnrollment';
import { getKycProfile } from '../../lib/basicKycProfile';
import { getDefaultBookingAddresses } from '../../services/basicBookingPreferencesService';
import iconSdd from '../../../assets/basic/icon-sdd.png';

const SDD_LEARN_MORE_URL = 'https://www.gogoxpress.com/same-day-delivery/';

/** Matches a saved address's city against the official form's NCR city list; falls back to "Outside Metro Manila" once there's an address to go on at all. */
function pickupLocationFromCity(city: string | undefined): SameDayPickupLocation | '' {
  if (!city) return '';
  const normalized = city.trim().toLowerCase();
  const match = SAME_DAY_PICKUP_LOCATION_OPTIONS.find((opt) => opt.label.toLowerCase() === normalized);
  return match?.value ?? 'outside_metro_manila';
}

/**
 * KYC's daily-order buckets (`basicKycProfile.ts`) don't line up with the
 * official form's own buckets except at the bottom end (both start at
 * "1-5") — e.g. KYC's "6-20" spans three different official options.
 * Prefilling a guess across a wider KYC bucket would show the seller a
 * specific number they never actually gave us, so only the one bucket that
 * matches exactly is prefilled; every other case is left blank for the
 * seller to pick themselves (per spec: "leave fields blank when reliable
 * data is unavailable").
 */
function averageDailyShipmentFromKyc(dailyOrders: string | undefined): SameDayAverageDailyShipment | '' {
  return dailyOrders === '1-5' ? '1-5' : '';
}

interface LeadFormState {
  fullName: string;
  businessName: string;
  mobileNumber: string;
  email: string;
  averageDailyShipment: SameDayAverageDailyShipment | '';
  mainPickupLocation: SameDayPickupLocation | '';
}

const SELLING_POINTS = [
  { icon: IconClockHour4, title: 'Same-day delivery', body: 'Fulfill orders within the day, every time you ship.' },
  { icon: IconCoin, title: 'Predictable pricing', body: 'Flat, fixed service pricing — no surprises at checkout.' },
  { icon: IconTrendingUp, title: 'Built for scaling sellers', body: 'Bulk booking and hub routing made for growing order volume.' },
];

function SameDayPromoPanel({ onLearnMore }: { onLearnMore: () => void }) {
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 p-6 text-white">
        <img src={iconSdd} alt="" className="h-14 w-14 object-contain" />
        <h1 className="mt-3 text-2xl font-bold leading-tight lg:text-3xl">
          Same Day Delivery for Sellers in Metro Manila
        </h1>
        <p className="mt-2 text-sm text-blue-50 lg:text-base">
          Deliver your orders within the day with a reliable, scalable delivery solution built for growing businesses.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5">
        <IconMapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <p className="text-sm text-gray-700"><span className="font-semibold">Coverage:</span> Metro Manila (NCR) addresses only.</p>
      </div>

      <div className="space-y-3">
        {SELLING_POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <Icon className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="text-xs text-gray-500">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={onLearnMore} className="w-full sm:w-auto">
        Learn more about Same Day Delivery
      </Button>
    </div>
  );
}

function SameDayLeadForm({ accountId }: { accountId: string }) {
  const { user } = useAuth();
  const [enrollment, setEnrollment] = useState<SameDayEnrollment>(() => getSameDayEnrollment(accountId));

  const [form, setForm] = useState<LeadFormState>(() => ({
    fullName: enrollment.application?.fullName ?? user?.name ?? '',
    businessName: enrollment.application?.businessName ?? user?.accountName ?? '',
    mobileNumber: enrollment.application?.mobileNumber ?? '',
    email: enrollment.application?.email ?? user?.email ?? '',
    averageDailyShipment: enrollment.application?.averageDailyShipment ?? '',
    mainPickupLocation: enrollment.application?.mainPickupLocation ?? '',
  }));

  // One-time background prefill from KYC + the default pickup address —
  // editing a prefilled field afterward only ever touches this form's own
  // local state, never the registered profile/address/KYC records
  // themselves (per spec: "editing prefilled information must not modify
  // the user's registered account details"). Never overwrites a field the
  // user (or a previously-submitted application, restored above) already
  // has something in.
  useEffect(() => {
    if (enrollment.application) return;
    let active = true;
    const kyc = getKycProfile(accountId);
    getDefaultBookingAddresses(accountId).then(({ pickup }) => {
      if (!active) return;
      setForm((prev) => ({
        ...prev,
        mobileNumber: prev.mobileNumber || pickup?.mobileNumber || '',
        averageDailyShipment: prev.averageDailyShipment || averageDailyShipmentFromKyc(kyc.answers?.dailyOrders),
        mainPickupLocation: prev.mainPickupLocation || pickupLocationFromCity(pickup?.city),
      }));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const canSubmit = form.fullName.trim() !== '' && form.businessName.trim() !== ''
    && form.mobileNumber.trim() !== '' && form.email.trim() !== ''
    && form.averageDailyShipment !== '' && form.mainPickupLocation !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setEnrollment(submitSameDayApplication(accountId, {
      fullName: form.fullName.trim(),
      businessName: form.businessName.trim(),
      mobileNumber: form.mobileNumber.trim(),
      email: form.email.trim(),
      averageDailyShipment: form.averageDailyShipment,
      mainPickupLocation: form.mainPickupLocation,
    }));
  };

  if (enrollment.status === 'approved') {
    return (
      <Alert variant="info" title="This account is already approved for Same-Day Delivery">
        Switch to Single or Bulk mode above to use it.
      </Alert>
    );
  }

  if (enrollment.status === 'pending') {
    return (
      <Card>
        <CardContent className="py-12 px-6 text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <IconClockHour4 className="w-7 h-7 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">We've got your application</h3>
          <p className="text-sm text-gray-500 mt-2">
            Our team will reach out to help you get started
            {enrollment.submittedAt ? ` (submitted ${new Date(enrollment.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })})` : ''}.
            This isn't an automatic approval — we'll follow up once your account is ready for Same-Day Delivery.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
          {enrollment.status === 'rejected' && (
            <Alert variant="warning" title="Your previous application wasn't approved" className="mb-4">
              You can update your details and apply again.
            </Alert>
          )}
          <h2 className="text-base font-semibold text-gray-900">Get started with Same Day Delivery</h2>
          <p className="mt-1 text-sm text-gray-500">Fill out the form and our team will get in touch with you to help you get started.</p>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Your full name</span>
              <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Your business name</span>
              <Input value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Mobile number</span>
              <Input value={form.mobileNumber} onChange={(e) => setForm((f) => ({ ...f, mobileNumber: e.target.value }))} placeholder="+63 9XX XXX XXXX" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Email address</span>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">What's your average daily shipment</span>
              <Select
                value={form.averageDailyShipment}
                onChange={(e) => setForm((f) => ({ ...f, averageDailyShipment: e.target.value as SameDayAverageDailyShipment }))}
                required
              >
                <option value="" disabled>Select an option</option>
                {SAME_DAY_AVERAGE_DAILY_SHIPMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Where is your main pickup location</span>
              <Select
                value={form.mainPickupLocation}
                onChange={(e) => setForm((f) => ({ ...f, mainPickupLocation: e.target.value as SameDayPickupLocation }))}
                required
              >
                <option value="" disabled>Select an option</option>
                {SAME_DAY_PICKUP_LOCATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </label>
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {enrollment.status === 'rejected' ? 'Reapply' : 'Join Same-Day Delivery'}
            </Button>
          </form>
        </CardContent>
      </Card>
  );
}

/**
 * SDD Lead mode: compact promotional + enrollment page (spec §2) — promo
 * content and the lead form share one page, two columns on desktop
 * (promo left, form right — `lg:grid-cols-2`), stacked with the form kept
 * high on mobile (form first in DOM/visual order below `lg:`, promo content
 * condensed above it). Learn More opens the referenced GGX marketing page in
 * an in-app browser overlay (`InAppBrowserDrawer`) rather than a real
 * navigation, so this form's in-progress state is never at risk of being
 * lost — the page itself never unmounts.
 */
function SameDayLeadContent({ accountId }: { accountId: string }) {
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="order-2 lg:order-1">
        <SameDayPromoPanel onLearnMore={() => setLearnMoreOpen(true)} />
      </div>
      <div className="order-1 lg:order-2">
        <SameDayLeadForm accountId={accountId} />
      </div>
      <InAppBrowserDrawer
        open={learnMoreOpen}
        onClose={() => setLearnMoreOpen(false)}
        url={SDD_LEARN_MORE_URL}
        title="Same Day Delivery"
      />
    </div>
  );
}

/**
 * Same Day Delivery entry point for Basic accounts — now routed through the
 * SDD prototype switch (`basicSameDayMode.ts`): Lead (not enrolled, default),
 * Single (simulates an approved account's own dedicated single-booking
 * flow), and Bulk (simulates an approved account, redirects straight to the
 * Bulk Uploader with Same-Day pre-selected). See `basicSameDayMode.ts`'s own
 * docblock for why this is persisted rather than reset-on-visit like the
 * Wizard/Accordion switcher.
 */
export function SameDayDeliveryPage() {
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic-guest';
  const navigate = useNavigate();
  const [mode, setMode] = useState<SameDayPrototypeMode>(() => getSameDayMode(accountId));

  useEffect(() => {
    if (mode === 'bulk') navigate('/dashboard/bulk-uploader?serviceMode=same-day', { replace: true });
  }, [mode, navigate]);

  const handleModeChange = (next: SameDayPrototypeMode) => {
    setSameDayMode(accountId, next);
    setMode(next);
  };

  // Mid-redirect to the Bulk Uploader — render nothing rather than a flash
  // of Lead/Single content for the instant before navigation commits.
  if (mode === 'bulk') return null;

  if (mode === 'single') {
    return (
      <div className="p-4 lg:p-6">
        {/* Same 1280px-max, centered container as Lead mode below, so the
            switcher row and `BookDelivery`'s own desktop content share one
            left/right edge — `BookDelivery`'s inner desktop wrapper is the
            same max-width, so nesting them is a no-op once this outer one
            is already the narrower of the two. Single mode's back button is
            `BookingAccordionFlow`'s own existing mobile header row — not
            duplicated here. */}
        <div className="mx-auto w-full max-w-[1280px] space-y-3">
          <div className="flex justify-end">
            <SameDayModeSwitcher value={mode} onChange={handleModeChange} />
          </div>
          <BookDelivery serviceTypeLock="same_day" embedded />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto w-full max-w-[1280px] space-y-4 lg:space-y-6">
        {/* Mobile-only compact header — back button + title + switcher,
            consistent with Single mode's own back button
            (`BookingAccordionFlow`'s header row). Desktop never shows a
            back button (per spec) and gets the full `PageHeader` instead. */}
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              aria-label="Back"
              className="flex-shrink-0 -ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-semibold text-gray-900">Same Day Delivery</h1>
          </div>
          <SameDayModeSwitcher value={mode} onChange={handleModeChange} className="flex-shrink-0" />
        </div>
        <div className="hidden lg:block">
          <PageHeader
            title="Same Day Delivery"
            subtitle="Urgent, same-day delivery for time-sensitive orders."
            action={<SameDayModeSwitcher value={mode} onChange={handleModeChange} />}
          />
        </div>
        <SameDayLeadContent accountId={accountId} />
      </div>
    </div>
  );
}
