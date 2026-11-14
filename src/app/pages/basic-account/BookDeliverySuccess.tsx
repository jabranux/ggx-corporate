import { useNavigate } from 'react-router';
import { IconCircleCheck } from '@tabler/icons-react';
import { Button } from '../../components/ui/Button';

/**
 * Confirmation screen for the GGX Basic single-booking flow.
 *
 * Draft clearing happens exactly once, in `BookDelivery`'s own
 * `handleConfirm`, before navigating here — never on this route's mount.
 * Revisiting this screen (e.g. browser Back after starting a new booking)
 * must not clear a different, not-yet-confirmed draft.
 */
export function BookDeliverySuccess() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <IconCircleCheck className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Booking confirmed!</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your booking details have been saved for this demo.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          This is a demo confirmation — real booking creation and tracking through Transactions require the
          backend order API, which is not yet connected (see docs/roadmap.md).
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="outline" onClick={() => navigate('/dashboard/transactions')}>Go to Transactions</Button>
          <Button onClick={() => navigate('/dashboard/book-delivery')}>Book another delivery</Button>
        </div>
      </div>
    </div>
  );
}
