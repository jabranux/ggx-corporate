import { useEffect, useState } from 'react';
import { Drawer } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { RadioGroup, type RadioOption } from '../ui/RadioGroup';
import { Checkbox } from '../ui/Checkbox';
import {
  mainUseRequiresSellingChannels,
  saveKycAnswers,
  type BasicKycAnswers, type BasicKycProfile, type KycDailyOrders,
  type KycDeliveryNeeds, type KycMainUse, type KycSellingChannel,
} from '../../lib/basicKycProfile';

interface BasicKycModalProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  initialAnswers: BasicKycAnswers | null;
  onSaved: (profile: BasicKycProfile) => void;
}

const MAIN_USE_OPTIONS: RadioOption<KycMainUse>[] = [
  { value: 'personal', label: 'Sending personal items' },
  { value: 'selling', label: 'Shipping products I sell' },
  { value: 'business', label: 'Managing business deliveries' },
  { value: 'exploring', label: 'Just exploring' },
];

const SELLING_CHANNEL_OPTIONS: { value: KycSellingChannel; label: string }[] = [
  { value: 'facebook_instagram', label: 'Facebook/Instagram' },
  { value: 'own_website', label: 'Own website' },
  { value: 'physical_store', label: 'Physical store' },
  { value: 'shopee_lazada', label: 'Shopee/Lazada' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'other', label: 'Other' },
];

const DAILY_ORDERS_OPTIONS: RadioOption<KycDailyOrders>[] = [
  { value: '1-5', label: '1–5 orders a day' },
  { value: '6-20', label: '6–20 orders a day' },
  { value: '21-50', label: '21–50 orders a day' },
  { value: '51+', label: '51 or more orders a day' },
  { value: 'not-sure', label: 'Not sure yet' },
];

const DELIVERY_NEEDS_OPTIONS: RadioOption<KycDeliveryNeeds>[] = [
  { value: 'same-day', label: 'Same-day deliveries' },
  { value: 'nationwide', label: 'Nationwide deliveries' },
  { value: 'both', label: 'Both' },
  { value: 'not-sure', label: 'Not sure yet' },
];

const DEFAULT_ANSWERS: BasicKycAnswers = {
  mainUse: 'exploring',
  sellingChannels: [],
  dailyOrders: 'not-sure',
  deliveryNeeds: 'not-sure',
};

/**
 * Four-question profiling flow (spec §2) in a single responsive Drawer
 * (bottom sheet on mobile, centered dialog on desktop — `ui/Dialog.tsx`'s
 * existing `Drawer`). Step 2 (selling channels) only appears when relevant
 * (spec: "Where do you sell? (Conditional, where applicable)").
 */
export function BasicKycModal({ open, onClose, accountId, initialAnswers, onSaved }: BasicKycModalProps) {
  const [answers, setAnswers] = useState<BasicKycAnswers>(initialAnswers ?? DEFAULT_ANSWERS);
  const [stepIndex, setStepIndex] = useState(0);

  // Temporary, unsubmitted answers must never survive a close — reset on
  // BOTH transitions (open AND close), not only "load fresh answers when
  // reopened". Relying solely on the open-side reset is fragile: this
  // component is rendered unconditionally by its callers (`BasicHome.tsx`/
  // `Settings.tsx`), so it never actually unmounts when the Drawer closes —
  // without this, a closed-but-still-mounted instance keeps holding
  // whatever was last typed until something happens to reopen it, which is
  // exactly the "relies on visual unmounting" failure mode this guards
  // against. Resetting on close also means a background change to
  // `initialAnswers` (e.g. a save completing elsewhere) can never be
  // clobbered by a stale in-flight edit the next time this opens.
  useEffect(() => {
    setAnswers(initialAnswers ?? DEFAULT_ANSWERS);
    setStepIndex(0);
  }, [open, initialAnswers]);

  const needsChannelsStep = mainUseRequiresSellingChannels(answers.mainUse);
  const steps = needsChannelsStep ? (['mainUse', 'channels', 'volume', 'needs'] as const) : (['mainUse', 'volume', 'needs'] as const);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const toggleChannel = (channel: KycSellingChannel) => {
    setAnswers((prev) => ({
      ...prev,
      sellingChannels: prev.sellingChannels.includes(channel)
        ? prev.sellingChannels.filter((c) => c !== channel)
        : [...prev.sellingChannels, channel],
    }));
  };

  const handleNext = () => {
    if (isLast) {
      const finalAnswers: BasicKycAnswers = needsChannelsStep ? answers : { ...answers, sellingChannels: [] };
      const profile = saveKycAnswers(accountId, finalAnswers);
      onSaved(profile);
      onClose();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const titles: Record<typeof steps[number], string> = {
    mainUse: 'What will you mainly use GGX for?',
    channels: 'Where do you sell?',
    volume: 'How many orders do you ship daily?',
    needs: 'What kind of deliveries do you need?',
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      onBack={isFirst ? undefined : handleBack}
      title="Personalize your GGX experience"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">Step {stepIndex + 1} of {steps.length}</span>
          <Button onClick={handleNext}>{isLast ? 'Save' : 'Next'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900">{titles[step]}</h4>

        {step === 'mainUse' && (
          <RadioGroup
            name="kyc-main-use"
            value={answers.mainUse}
            onChange={(mainUse) => setAnswers((prev) => ({ ...prev, mainUse }))}
            options={MAIN_USE_OPTIONS}
          />
        )}

        {step === 'channels' && (
          <div className="space-y-2">
            {SELLING_CHANNEL_OPTIONS.map((opt) => {
              const checked = answers.sellingChannels.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${checked ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <Checkbox checked={checked} onChange={() => toggleChannel(opt.value)} />
                  <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                </label>
              );
            })}
            <p className="text-xs text-gray-400">Select all that apply.</p>
          </div>
        )}

        {step === 'volume' && (
          <RadioGroup
            name="kyc-daily-orders"
            value={answers.dailyOrders}
            onChange={(dailyOrders) => setAnswers((prev) => ({ ...prev, dailyOrders }))}
            options={DAILY_ORDERS_OPTIONS}
          />
        )}

        {step === 'needs' && (
          <RadioGroup
            name="kyc-delivery-needs"
            value={answers.deliveryNeeds}
            onChange={(deliveryNeeds) => setAnswers((prev) => ({ ...prev, deliveryNeeds }))}
            options={DELIVERY_NEEDS_OPTIONS}
          />
        )}
      </div>
    </Drawer>
  );
}
