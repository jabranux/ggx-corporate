import { useEffect, useMemo, useRef, useState } from 'react';
import { IconX, IconCircleCheck } from '@tabler/icons-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table';
import { Pagination } from './ui/Pagination';
import { SearchInput } from './SearchInput';
import { BULK_FIELD_LABELS as L } from '../data/bulkTemplate';
import type { BatchRowSnapshot } from '../services/bulkUploadService';

const PAGE_SIZE = 50;

interface ReadyRowsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The Review page's current live Ready-to-book row set — never a copy. */
  rows: BatchRowSnapshot[];
}

function matchesSearch(row: BatchRowSnapshot, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.recipientName, row.mobileNumber, row.itemName, row.location, row.referenceId]
    .some((field) => field.toLowerCase().includes(q));
}

const peso = (n: number) => (Number.isFinite(n) ? `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

/**
 * In-page right-side drawer showing the Review page's full current Ready-to-book
 * row set. Opened from `BulkUploadSummary.tsx`'s "View all ready rows" CTA — it
 * never navigates, so it does not trigger the page's unsaved-work exit guard and
 * the Review page (edits, scroll, upload progress) is preserved underneath it.
 *
 * Reads the SAME rows the Review page already computed (passed in as `rows`) —
 * no separate fetch, no duplicate dataset, no conversion into Transactions.
 */
export function ReadyRowsDrawer({ open, onClose, rows }: ReadyRowsDrawerProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  // Reset to a clean first page each time the drawer is (re)opened.
  useEffect(() => { if (open) { setSearch(''); setPage(1); } }, [open]);

  // Focus management: remember whatever had focus (the CTA that opened this),
  // move focus into the drawer, and restore it on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      if (previouslyFocusedRef.current instanceof HTMLElement) previouslyFocusedRef.current.focus();
    };
  }, [open]);

  // Escape closes the drawer; Tab is trapped inside it while open, so keyboard
  // users can never tab into the obscured Review page behind the scrim.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => rows.filter((r) => matchesSearch(r, search)), [rows, search]);

  // Clamp instead of reset-only-on-search so a shrinking result set (e.g. the
  // batch changes while the drawer is open) never strands the user on a blank page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Ready to book rows">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />
      <div ref={panelRef} className="relative w-full sm:w-[65vw] sm:max-w-[980px] h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <IconCircleCheck className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">
                Ready to book · {rows.length} {rows.length === 1 ? 'row' : 'rows'}
              </h2>
              <p className="text-xs text-gray-500">
                These rows passed validation and are ready to book. They become Transactions once this batch is booked.
              </p>
            </div>
          </div>
          <button ref={closeButtonRef} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer flex-shrink-0" onClick={onClose} aria-label="Close">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 border-b border-gray-100">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by recipient, mobile, item, location, or reference ID..."
            className="max-w-md"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">No rows are ready to book yet.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500">No ready rows match "{search}".</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{L.name}</TableHead>
                    <TableHead>{L.mobile}</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>{L.itemName}</TableHead>
                    <TableHead>{L.pouchSize}</TableHead>
                    <TableHead className="text-right">{L.declaredValue}</TableHead>
                    <TableHead>{L.referenceId}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium text-gray-900">{row.recipientName || '—'}</TableCell>
                      <TableCell className="text-gray-600">{row.mobileNumber || '—'}</TableCell>
                      <TableCell className="text-gray-600">{row.location || '—'}</TableCell>
                      <TableCell className="text-gray-600">{row.itemName || '—'}</TableCell>
                      <TableCell className="text-gray-600">{row.pouchSize || '—'}</TableCell>
                      <TableCell className="text-right text-gray-900">{peso(Number(row.declaredValue))}</TableCell>
                      <TableCell className="text-gray-600">{row.referenceId || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100">
            <Pagination
              summary={`Showing ${pageRows.length ? (clampedPage - 1) * PAGE_SIZE + 1 : 0}–${(clampedPage - 1) * PAGE_SIZE + pageRows.length} of ${filtered.length} ready rows`}
              previousDisabled={clampedPage <= 1}
              nextDisabled={clampedPage >= totalPages}
              onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
