/**
 * Prototyping control for the SDD experience — lets stakeholders compare the
 * Lead (not-enrolled), Single (approved, single-booking), and Bulk (approved,
 * bulk-upload) destinations without needing three separate demo accounts.
 * See `SameDayPrototypeContext.tsx`'s own docblock for why the mode it
 * displays is in-memory/session-scoped rather than persisted.
 */
import { Tabs, TabsList, TabsTrigger } from './ui/Tabs';
import type { SameDayPrototypeMode } from '../contexts/SameDayPrototypeContext';

export interface SameDayModeSwitcherProps {
  value: SameDayPrototypeMode;
  onChange: (v: SameDayPrototypeMode) => void;
  className?: string;
}

export function SameDayModeSwitcher({ value, onChange, className }: SameDayModeSwitcherProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as SameDayPrototypeMode)} className={className}>
      <TabsList className="h-8 p-0.5">
        <TabsTrigger value="lead" className="h-7 px-2.5 text-xs">Lead</TabsTrigger>
        <TabsTrigger value="single" className="h-7 px-2.5 text-xs">Single</TabsTrigger>
        <TabsTrigger value="bulk" className="h-7 px-2.5 text-xs">Bulk</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
