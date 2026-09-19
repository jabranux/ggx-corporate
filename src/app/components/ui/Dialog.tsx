import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  /** Max-width utility for the panel. Defaults to a small confirm-sized panel. */
  size?: 'sm' | 'md' | 'lg';
  /** Stacking context — confirmations layered over another modal use a higher z-index. */
  elevated?: boolean;
  /** Set false to suppress backdrop-click / Escape dismissal (the caller still
   * controls its own explicit close actions, e.g. Cancel/Close buttons) —
   * used for dirty-form protection, where a plain `onClose` would discard
   * unsaved work instead of asking first. */
  dismissible?: boolean;
}

/**
 * Base modal: full-screen scrim + centered white panel.
 * Mirrors the app's previous inline `fixed inset-0 bg-gray-900/50…` pattern so
 * existing modals look and behave identically.
 *
 * Backdrop dismissal only fires for a real click ON the backdrop itself —
 * both the `mousedown` AND the resulting `click` must target the backdrop
 * element, not just bubble to it. A plain `onClick={onClose}` on the scrim
 * closes on ANY click whose target ends up being the scrim, which also
 * includes a click-drag that starts inside the panel (e.g. selecting text,
 * or dragging across a tab trigger) and releases outside it — the browser
 * fires that `click` on the nearest common ancestor of the mousedown/mouseup
 * targets, which is the scrim, even though the interaction never touched it
 * directly. That accidentally closed the dialog (and, when it wrapped a form
 * mid-edit, discarded it) whenever a drag crossed the panel boundary.
 */
// Escape must only dismiss the TOPMOST open dialog — every mounted `Dialog`
// would otherwise register its own document-level listener, so one Escape
// press could close a nested dialog (e.g. a product picker opened from
// inside another dialog) AND the dialog underneath it in the same keystroke,
// discarding whatever unsaved state that outer dialog held. Each open,
// dismissible instance pushes its id here on mount and only acts on Escape
// while it's the last one on the stack.
let dialogStack: number[] = [];
let nextDialogId = 0;

export function Dialog({ open, onClose, title, children, size = 'sm', elevated = false, dismissible = true }: DialogProps) {
  const mouseDownOnBackdrop = useRef(false);
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !dismissible) return;
    const id = nextDialogId++;
    idRef.current = id;
    dialogStack.push(id);
    return () => {
      dialogStack = dialogStack.filter((x) => x !== id);
      idRef.current = null;
    };
  }, [open, dismissible]);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialogStack[dialogStack.length - 1] !== idRef.current) return; // not the topmost dialog
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  const maxW = size === 'lg' ? 'max-w-2xl' : size === 'md' ? 'max-w-md' : 'max-w-sm';
  return (
    <div
      className={`fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 ${elevated ? 'z-[60]' : 'z-50'}`}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose();
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div className={`bg-white rounded-xl shadow-xl ${maxW} w-full p-6`} onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** Optional icon shown inside the confirm button. */
  confirmIcon?: ReactNode;
  /** Extra content rendered between the description and the action row. */
  children?: ReactNode;
  elevated?: boolean;
}

/**
 * Confirmation wrapper around `Dialog` with a description and confirm/cancel
 * actions. `variant` controls the confirm button style (destructive vs default).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  confirmIcon,
  children,
  elevated = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} elevated={elevated}>
      {description && <p className="text-sm text-gray-500 mb-5">{description}</p>}
      {children}
      <div className="flex gap-2.5 justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={variant} size="sm" onClick={onConfirm}>
          {confirmIcon}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
