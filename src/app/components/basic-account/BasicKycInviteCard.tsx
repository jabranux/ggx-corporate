import { IconSparkles, IconX } from '@tabler/icons-react';
import { Button } from '../ui/Button';

interface BasicKycInviteCardProps {
  onPersonalize: () => void;
  onDismiss: () => void;
  /**
   * Mobile-only presentation (a follow-up refinement request): the whole
   * card becomes the tap target, with a trailing "Personalize now →" text
   * link instead of a filled button, and tighter vertical padding now that
   * the button is gone. Defaults to `false` so the desktop supporting-column
   * card (`BasicHome.tsx`) stays pixel-identical to before this pass — that
   * request was explicit that desktop stays untouched, and this component is
   * shared between both trees.
   */
  compact?: boolean;
}

/**
 * Contextual, dismissible invitation shown on the Basic home while a user
 * hasn't completed profiling (spec §2 "Behavior"). Dismissing it only hides
 * the card — default services keep working, and the same questionnaire stays
 * reachable later through Account/Settings.
 *
 * Deliberately borderless (a soft blue-tinted fill, no `border`) — on mobile
 * this renders nested inside the KYC/secondary-shortcuts group container
 * (`BasicHome.tsx`), and stacking two bordered boxes reads as "nested
 * cards," which the mobile card-styling pass explicitly avoids.
 */
export function BasicKycInviteCard({ onPersonalize, onDismiss, compact = false }: BasicKycInviteCardProps) {
  const dismissButton = (
    <button
      onClick={compact ? (e) => { e.stopPropagation(); onDismiss(); } : onDismiss}
      aria-label="Dismiss"
      className={`absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full text-blue-400 hover:bg-blue-100 hover:text-blue-600 cursor-pointer transition-colors ${compact ? 'top-2' : 'top-2.5'}`}
    >
      <IconX className="w-3.5 h-3.5" />
    </button>
  );

  const body = (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
        <IconSparkles className="w-4.5 h-4.5 text-blue-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm lg:text-base font-semibold text-blue-900 leading-snug">Personalize your GGX experience</p>
        <p className="text-xs lg:text-sm text-blue-700 mt-0.5 leading-snug">
          Answer 4 quick questions so we can show you the most useful services first.
        </p>
        {compact ? (
          <span className="mt-1.5 inline-block text-sm font-medium text-blue-600">Personalize now →</span>
        ) : (
          <Button size="sm" className="mt-2.5" onClick={onPersonalize}>Personalize now</Button>
        )}
      </div>
    </div>
  );

  if (!compact) {
    return (
      <div className="relative rounded-xl bg-blue-50 px-4 py-3.5 pr-10 lg:px-5 lg:py-4 lg:pr-12">
        {dismissButton}
        {body}
      </div>
    );
  }

  // Compact/mobile variant: the whole card is the tap target (spec §2 —
  // "make the entire KYC invitation card clickable"). A real `<button>`
  // can't nest inside the clickable root without being invalid/inaccessible
  // HTML, so the root is a `role="button"` div with its own keyboard
  // handling, and the dismiss "X" stops its click from bubbling up to it.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPersonalize}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPersonalize();
        }
      }}
      className="relative rounded-xl bg-blue-50 px-4 py-2.5 pr-10 cursor-pointer active:bg-blue-100/70 transition-colors"
    >
      {dismissButton}
      {body}
    </div>
  );
}
