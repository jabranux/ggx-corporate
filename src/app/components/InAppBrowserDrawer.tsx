/**
 * In-app browser overlay for an external "Learn more" link — renders the
 * destination in a full-screen `<iframe>` overlay instead of a real
 * navigation, so the page underneath (and any in-progress form state on it,
 * e.g. the SDD lead form) is never unmounted and needs no explicit
 * save/restore when the user closes it. Mirrors `Drawer`'s fullScreen
 * overlay/backdrop/Escape conventions but renders its own chrome (an iframe
 * needs a full-bleed body, not `Drawer`'s padded content area).
 */
import { useEffect } from 'react';
import { IconChevronLeft, IconExternalLink } from '@tabler/icons-react';

export interface InAppBrowserDrawerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export function InAppBrowserDrawer({ open, onClose, url, title }: InAppBrowserDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  let host = url;
  try { host = new URL(url).host; } catch { /* keep raw url as a fallback label */ }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2.5"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex-shrink-0 -ml-1 flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          <p className="truncate text-xs text-gray-400">{host}</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in a new tab"
          className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
        >
          <IconExternalLink className="h-4 w-4" />
        </a>
      </div>
      <iframe src={url} title={title} className="h-full w-full flex-1 border-0" />
    </div>
  );
}
