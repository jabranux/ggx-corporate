import { useEffect, useRef, type ReactNode } from 'react';
import { IconChevronLeft, IconX } from '@tabler/icons-react';
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

/**
 * Shared "only the topmost overlay closes on Escape" mechanism, used by both
 * `Dialog` and `Drawer` so a drawer opened on top of a dialog (or vice versa)
 * never lets one Escape press close both at once.
 */
function useDialogStack(open: boolean, dismissible: boolean, onClose: () => void) {
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
      if (dialogStack[dialogStack.length - 1] !== idRef.current) return; // not the topmost dialog/drawer
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, dismissible, onClose]);
}

/**
 * Backdrop click-to-dismiss: only fires for a real click that both started
 * AND ended on the backdrop itself — not a drag that starts inside the panel
 * (e.g. selecting text) and releases outside it, which the browser reports as
 * a `click` on the backdrop even though the interaction never touched it
 * directly.
 */
function useBackdropDismiss(dismissible: boolean, onClose: () => void) {
  const mouseDownOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; },
    onClick: (e: React.MouseEvent) => {
      if (dismissible && e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose();
      mouseDownOnBackdrop.current = false;
    },
  };
}

export function Dialog({ open, onClose, title, children, size = 'sm', elevated = false, dismissible = true }: DialogProps) {
  useDialogStack(open, dismissible, onClose);
  const backdropHandlers = useBackdropDismiss(dismissible, onClose);

  if (!open) return null;
  const maxW = size === 'lg' ? 'max-w-2xl' : size === 'md' ? 'max-w-md' : 'max-w-sm';
  return (
    <div
      className={`fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 ${elevated ? 'z-[60]' : 'z-50'}`}
      {...backdropHandlers}
    >
      <div className={`bg-white rounded-xl shadow-xl ${maxW} w-full p-6`} onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * Renders a back-chevron instead of/alongside the close button, for
   * switching between two views (e.g. a picker list and an "add new" form)
   * WITHOUT stacking a second overlay.
   */
  onBack?: () => void;
  children: ReactNode;
  /** Same meaning as `Dialog`'s `dismissible`. Defaults to true. */
  dismissible?: boolean;
}

/**
 * Overlay drawer: a bottom sheet on mobile (below `lg:`), a centered dialog
 * panel on desktop (`lg:` and up) — same scrim/backdrop-dismiss/Escape-stack
 * semantics as `Dialog`, sharing its `dialogStack` mechanism so a Drawer and
 * a Dialog opened together never both react to one Escape press.
 *
 * Used for interactions that previously expanded inline and pushed the rest
 * of the page down (address pickers, voucher entry, payment settings) — as
 * an overlay, the page behind it never reflows when it opens or closes.
 *
 * Focus is trapped inside the panel while open (same pattern as
 * `ReadyRowsDrawer.tsx`) — without this, Tab could reach interactive
 * elements on the obscured page behind the scrim (e.g. the Confirm Booking
 * button), and Enter could act on them while the drawer still looked open.
 */
export function Drawer({ open, onClose, title, onBack, children, dismissible = true }: DrawerProps) {
  useDialogStack(open, dismissible, onClose);
  const backdropHandlers = useBackdropDismiss(dismissible, onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  // Continuously track focus while CLOSED, so the trigger button is already
  // known by the time `open` flips true. Capturing `document.activeElement`
  // only once open (inside the effect below) runs too late — React applies
  // an `autoFocus` descendant's own focus() during the same commit that
  // mounts the drawer's content, before this component's effects fire, so
  // by then `document.activeElement` is already that descendant, not the
  // trigger — and that descendant is what gets unmounted on close.
  useEffect(() => {
    if (open) return;
    const onFocusIn = () => { previouslyFocusedRef.current = document.activeElement; };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [open]);

  // Move focus into the drawer on open (unless content already claimed it,
  // e.g. an input with its own `autoFocus`), and restore the trigger once it closes.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        closeButtonRef.current?.focus();
      }
    }, 0);
    return () => {
      window.clearTimeout(t);
      if (previouslyFocusedRef.current instanceof HTMLElement) previouslyFocusedRef.current.focus();
    };
  }, [open]);

  // Tab is trapped inside the panel while open — Escape is handled
  // separately by `useDialogStack` (topmost-only), so this only needs to
  // contain Tab/Shift+Tab. Focus can land outside the panel (on `body`) when
  // an internal view switch unmounts whatever was focused (e.g. the pickup
  // drawer's list→add-form switch removes the button that had focus) — any
  // activeElement outside the panel, not just exactly the first/last
  // control, must be pulled back in.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!active || !panelRef.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-900/50 flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      {...backdropHandlers}
    >
      <div
        ref={panelRef}
        className="flex w-full max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl lg:max-w-md lg:max-h-[85vh] lg:rounded-xl lg:m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="flex-shrink-0 -ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
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
