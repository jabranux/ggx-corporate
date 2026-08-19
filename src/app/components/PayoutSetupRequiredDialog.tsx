import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';

interface PayoutSetupRequiredDialogProps {
  open: boolean;
  /** Only a Main Account admin in Main Account view may manage payout details. */
  canManagePayout: boolean;
  onClose: () => void;
  onManagePayout: () => void;
  /**
   * Overrides the manage-payout CTA label. Defaults to "Open Payment
   * Settings" (the normal handoff). The COD Main Account Payout Setup UX
   * Journey passes "Set Up Payout Account" since it opens bank setup inline
   * within Bulk Upload instead of navigating away.
   */
  manageLabel?: string;
}

/**
 * Reusable COD block for bulk-booking surfaces. Payout setup normally stays
 * in the Main Account's OTP-gated Payment Settings flow; this dialog never
 * collects or changes financial details itself.
 */
export function PayoutSetupRequiredDialog({
  open, canManagePayout, onClose, onManagePayout, manageLabel = 'Open Payment Settings',
}: PayoutSetupRequiredDialogProps) {
  const title = canManagePayout ? 'Set up a payout account' : 'Payout setup required';
  const description = canManagePayout
    ? 'This batch contains COD transactions. A verified Main Account payout bank is required before you can complete the booking. New bank accounts remain unavailable for COD until verification is complete.'
    : 'This batch contains COD transactions. The Main Account must configure and verify a payout bank account before COD bookings can be completed. Contact your Main Account admin to update finance settings.';

  return (
    <Dialog open={open} onClose={onClose} size="md" title={title}>
      <p className="text-sm text-gray-600 leading-6">{description}</p>
      <div className="flex gap-2.5 justify-end pt-5">
        <Button variant="outline" size="sm" onClick={onClose}>
          {canManagePayout ? 'Cancel' : 'Close'}
        </Button>
        {canManagePayout && (
          <Button size="sm" onClick={onManagePayout}>{manageLabel}</Button>
        )}
      </div>
    </Dialog>
  );
}
