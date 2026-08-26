import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IconX, IconHeadset, IconSend, IconCircleCheck, IconAlertTriangle,
} from '@tabler/icons-react';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { TransactionMultiSelect } from './TransactionMultiSelect';
import {
  submitOrderReport, REPORT_CONCERN_OPTIONS,
  type CustomerTicket, type HeyQConcernType, type AuthorizedTransactionOption,
} from '../services/ticketsService';

interface ReportIssueDrawerProps {
  open: boolean;
  onClose: () => void;
  /**
   * Transactions to preselect. From Transaction Details this is the current
   * transaction; from Support Tickets it is empty (start with nothing selected).
   * The first entry is treated as the primary/originating transaction.
   */
  preselected?: AuthorizedTransactionOption[];
  /** Called with the created ticket after a successful submit (e.g. to refresh a list). */
  onSubmitted?: (ticket: CustomerTicket) => void;
}

type Phase =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; ticket: CustomerTicket };

const FAILURE_MESSAGE: Record<'forbidden' | 'not_found' | 'unavailable', string> = {
  forbidden: 'One of the selected transactions isn’t available for support on your account. Remove it and try again.',
  not_found: 'We couldn’t find one of the selected transactions to attach it. Please try again.',
  unavailable: 'GGX Support is temporarily unreachable. Your details are kept — try again in a moment.',
};

/**
 * In-app "Report an issue" drawer. Reused from both Transaction Details (with the
 * current transaction preselected) and Support Tickets (no preselection). Submits
 * ONE ticket for all selected transactions DIRECTLY to the HeyQ customer API (no
 * redirect to HeyQ), keeps the user inside Business+, and confirms with the ticket
 * id on success. A report may be submitted with no linked transaction.
 */
export function ReportIssueDrawer({ open, onClose, preselected, onSubmitted }: ReportIssueDrawerProps) {
  const navigate = useNavigate();
  const [concernType, setConcernType] = useState<HeyQConcernType>('delivery_delay');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [transactions, setTransactions] = useState<AuthorizedTransactionOption[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });

  // Reset to a clean form each time the drawer opens. Preselection seeds both the
  // selected transactions and a sensible default subject (only when exactly one is
  // preselected — a general or multi report keeps the subject open for the user).
  useEffect(() => {
    if (open) {
      const seed = preselected ?? [];
      setConcernType('delivery_delay');
      setSubject(seed.length === 1 ? `Issue with order ${seed[0].trackingNumber}` : '');
      setDescription('');
      setTransactions(seed);
      setPhase({ kind: 'form' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submitting = phase.kind === 'submitting';
  const canSubmit = subject.trim().length > 0 && description.trim().length > 0 && !submitting;

  const close = () => { if (!submitting) onClose(); };

  const handleSubmit = async () => {
    if (!canSubmit) return; // guards empty input AND blocks duplicate submits
    setPhase({ kind: 'submitting' });
    const res = await submitOrderReport({
      externalOrderIds: transactions.map((t) => t.externalOrderId),
      concernType,
      subject: subject.trim(),
      description: description.trim(),
    });
    if (res.status === 'ok') {
      onSubmitted?.(res.data);
      setPhase({ kind: 'success', ticket: res.data });
    } else {
      setPhase({ kind: 'error', message: FAILURE_MESSAGE[res.status] }); // form values are preserved
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Report an issue">
      <div className="absolute inset-0 bg-gray-900/50" onClick={close} />
      <div className="relative w-full max-w-md h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <IconHeadset className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Report an issue</h2>
              <p className="text-xs text-gray-500">We’ll open a support ticket with our team.</p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600 p-1" onClick={close} aria-label="Close" disabled={submitting}>
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {phase.kind === 'success' ? (
          <SuccessState
            ticket={phase.ticket}
            onView={() => { onClose(); navigate(`/dashboard/support-tickets/${phase.ticket.id}`); }}
            onDone={onClose}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {phase.kind === 'error' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <IconAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{phase.message}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Affected transactions <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <TransactionMultiSelect value={transactions} onChange={setTransactions} disabled={submitting} />
                <p className="mt-1.5 text-xs text-gray-400">
                  Link one or more orders, or leave empty for a general concern.
                </p>
              </div>

              <div>
                <label htmlFor="report-concern" className="block text-sm font-medium text-gray-700 mb-1.5">
                  What’s the issue?
                </label>
                <Select
                  id="report-concern"
                  value={concernType}
                  onChange={(e) => setConcernType(e.target.value as HeyQConcernType)}
                  disabled={submitting}
                >
                  {REPORT_CONCERN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label htmlFor="report-subject" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Subject
                </label>
                <input
                  id="report-subject"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={submitting}
                  placeholder="Briefly summarize the issue"
                  maxLength={120}
                />
              </div>

              <div>
                <label htmlFor="report-description" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Details
                </label>
                <textarea
                  id="report-description"
                  className="w-full h-32 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Tell us what happened so our team can help…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Attachments
                </label>
                <p className="text-xs text-gray-400 rounded-lg border border-dashed border-gray-200 px-3 py-2">
                  Attachments aren’t available in this demo integration yet — describe the issue in Details above.
                </p>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                <IconSend className="w-4 h-4 mr-2" />
                {submitting ? 'Submitting…' : 'Submit report'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessState({
  ticket, onView, onDone,
}: { ticket: CustomerTicket; onView: () => void; onDone: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
        <IconCircleCheck className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">Report submitted</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-xs">
        Ticket <span className="font-medium text-gray-700">{ticket.reference}</span> is now with our
        support team. You can track it in Support Tickets.
      </p>
      <div className="flex flex-col w-full max-w-xs gap-2.5 mt-6">
        <Button onClick={onView}>Open ticket</Button>
        <Button variant="outline" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
