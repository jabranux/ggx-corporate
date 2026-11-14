import { useState } from 'react';
import {
  Section,
  Subsection,
  ResponsivePreview,
  CodeBlock,
  DoDont,
  ImplementationMeta,
  AccessibilityNotes,
} from '../components/DocPrimitives';
import { ShippingFeePayerSelector } from '../../app/components/ShippingFeePayerSelector';
import type { FeePayer, FirstMile, SenderPaymentMethod } from '../../app/lib/basicBookingDraft';

const CODE = `import { ShippingFeePayerSelector } from '@/app/components/ShippingFeePayerSelector';

<ShippingFeePayerSelector
  feePayer={feePayer}
  onFeePayerChange={setFeePayer}
  firstMile={draft.firstMile}
  senderMethod={senderMethod}
  onSenderMethodChange={setSenderMethod}
  amount={shippingTotal}
/>`;

export function ShippingFeePayerSection() {
  const [feePayer, setFeePayer] = useState<FeePayer>('sender');
  const [senderMethod, setSenderMethod] = useState<SenderPaymentMethod>('cash_pickup');
  const [firstMile] = useState<FirstMile>('pickup');

  return (
    <Section
      id="shipping-fee-payer"
      title="Shipping Fee Payer"
      intro="Who pays the shipping fee on a GGX Basic single booking, and how. Used only in the Basic single-booking Review & Payment panel — never on buyer checkout, which has its own CheckoutPaymentOptions with no fee-payer control."
    >
      <ImplementationMeta
        id="shipping-fee-payer"
        note="Keeps feePayer/senderPaymentMethod strictly independent from merchandise COD and from declared value/item protection — those live as separate fields on the booking draft."
      />
      <ResponsivePreview defaultView="mobile">
        <ShippingFeePayerSelector
          feePayer={feePayer}
          onFeePayerChange={setFeePayer}
          firstMile={firstMile}
          senderMethod={senderMethod}
          onSenderMethodChange={setSenderMethod}
          amount={178}
        />
      </ResponsivePreview>
      <CodeBlock code={CODE} />

      <Subsection title="Rules">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
          <li>Sender pays: Cash on Pickup, GCash Scan QR, or GCash Wallet.</li>
          <li>Receiver pays: Cash on Delivery (shipping fee only) plus the Returns Policy notice.</li>
          <li>GCash options are simulated for this phase — never process a real payment.</li>
          <li>Pass the booking's first-mile choice (<code>pickup</code>/<code>dropoff</code>) in — Cash on Pickup is excluded, and an already-selected Cash on Pickup is reconciled automatically, when the booking is drop-off (no rider to hand cash to).</li>
          <li>Never conflate this with merchandise COD (item-value collection) or with declared value / item protection — keep them visually and structurally separate.</li>
          <li>Lives only in the Review &amp; Payment panel — keep earlier booking steps payment-free.</li>
        </ul>
      </Subsection>

      <AccessibilityNotes
        items={[
          'Payer toggle and method cards are native <button>s — reachable by Tab, activated with Enter/Space.',
          'Selected state is shown with a filled border + tint, not color alone.',
          'The Returns Policy notice uses the Alert component’s role="status" region.',
        ]}
      />

      <Subsection title="Content guidance">
        <DoDont
          dos={[
            'Lead with the amount in the contextual line ("You pay ₱X when the rider picks up your parcel.").',
            'Label simulated payment methods clearly as simulated.',
          ]}
          donts={[
            'Don’t let this control appear on buyer-facing checkout.',
            'Don’t derive merchandise COD or item protection from this selection, or vice versa.',
          ]}
        />
      </Subsection>

      <Subsection title="Open item">
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          The Returns Policy notice copy shown here was authored for this spec and needs product/legal
          verification before it ships to real users — it is not sourced from an existing published policy
          document in this repo.
        </p>
      </Subsection>
    </Section>
  );
}
