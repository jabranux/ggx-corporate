import { useState, type ReactNode } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { cn } from '../../lib/utils';

export interface AccordionItemProps {
  title: ReactNode;
  children: ReactNode;
  /** Open on first render. Ignored once `open` (controlled mode) is passed. */
  defaultOpen?: boolean;
  /** Controlled open state — pass alongside `onOpenChange` to drive this item from a parent (e.g. "only one section open at a time"). Omit both for the original uncontrolled, self-toggling behavior. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Single collapsible section. Compose multiple inside a container (e.g. a Card
 * or a divided list) to build an accordion. Header is a real button with
 * aria-expanded; the panel is hidden when collapsed.
 */
export function AccordionItem({ title, children, defaultOpen = false, open: openProp, onOpenChange, className }: AccordionItemProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const toggle = () => {
    if (controlled) {
      onOpenChange?.(!open);
    } else {
      setUncontrolledOpen((o) => !o);
    }
  };
  return (
    <div className={cn('border-b border-gray-200 last:border-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {title}
        <IconChevronDown className={cn('h-4 w-4 flex-shrink-0 text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-3 text-sm text-gray-600">{children}</div>}
    </div>
  );
}
