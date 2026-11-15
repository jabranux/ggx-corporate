import { IconSparkles, IconX } from '@tabler/icons-react';
import { Button } from '../ui/Button';

interface BasicKycInviteCardProps {
  onPersonalize: () => void;
  onDismiss: () => void;
}

/**
 * Contextual, dismissible invitation shown on the Basic home while a user
 * hasn't completed profiling (spec §2 "Behavior"). Dismissing it only hides
 * the card — default services keep working, and the same questionnaire stays
 * reachable later through Account/Settings.
 */
export function BasicKycInviteCard({ onPersonalize, onDismiss }: BasicKycInviteCardProps) {
  return (
    <div className="relative rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5 pr-10">
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full text-blue-400 hover:bg-blue-100 hover:text-blue-600 cursor-pointer transition-colors"
      >
        <IconX className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          <IconSparkles className="w-4.5 h-4.5 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900 leading-snug">Personalize your GGX experience</p>
          <p className="text-xs text-blue-700 mt-0.5 leading-snug">
            Answer 4 quick questions so we can show you the most useful services first.
          </p>
          <Button size="sm" className="mt-2.5" onClick={onPersonalize}>Personalize now</Button>
        </div>
      </div>
    </div>
  );
}
