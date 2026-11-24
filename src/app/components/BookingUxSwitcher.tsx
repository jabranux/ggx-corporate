/**
 * Temporary prototyping control for the GGX Basic single-booking flow —
 * lets stakeholders compare the existing step-based Wizard against the
 * experimental single-page Accordion variant side by side. Not a production
 * feature: no persistence, defaults to Wizard on every visit (see
 * `BookDelivery.tsx`'s module docblock for how the two variants are kept
 * separate).
 */
import { Tabs, TabsList, TabsTrigger } from './ui/Tabs';

export type BookingUxVariant = 'wizard' | 'accordion';

export interface BookingUxSwitcherProps {
  value: BookingUxVariant;
  onChange: (v: BookingUxVariant) => void;
  className?: string;
}

export function BookingUxSwitcher({ value, onChange, className }: BookingUxSwitcherProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as BookingUxVariant)} className={className}>
      <TabsList className="h-8 p-0.5">
        <TabsTrigger value="wizard" className="h-7 px-2.5 text-xs">Wizard</TabsTrigger>
        <TabsTrigger value="accordion" className="h-7 px-2.5 text-xs">Accordion</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
