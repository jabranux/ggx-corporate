import { useState } from 'react';

/**
 * Shared "Discard changes?" confirmation for a dialog with dirty-form state —
 * used by `ProductFormDialog`/`StorefrontBannerDialog` so backdrop click,
 * Escape, and the Cancel/Close button all funnel through one place instead of
 * each needing its own confirm-then-close logic. Pass the caller's `isDirty`
 * check and the function that performs the real close; `requestClose` is what
 * every dismiss path (Dialog's `onClose`, the footer Cancel button) should
 * call instead of closing directly.
 */
export function useDiscardChangesGuard(isDirty: () => boolean, close: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = () => {
    if (isDirty()) setConfirmOpen(true);
    else close();
  };
  const keepEditing = () => setConfirmOpen(false);
  const discardChanges = () => {
    setConfirmOpen(false);
    close();
  };

  return { confirmOpen, requestClose, keepEditing, discardChanges };
}
