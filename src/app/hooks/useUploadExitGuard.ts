import { useEffect, type RefObject } from 'react';
import { useBlocker } from 'react-router';

/**
 * Blocks in-app navigation away from an in-progress Bulk Upload session with a
 * confirmation prompt, and arms the native browser unload prompt for
 * refresh/tab-close (which cannot be replaced with a custom modal).
 *
 * Takes a ref (not a boolean) so callers can flip it synchronously right
 * before a programmatic redirect they want to skip the prompt for — e.g. the
 * auto-navigate after a successful upload — without waiting on a re-render.
 */
export function useUploadExitGuard(activeRef: RefObject<boolean>) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !!activeRef.current && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [activeRef]);

  return blocker;
}
