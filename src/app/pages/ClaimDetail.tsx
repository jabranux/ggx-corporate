import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import {
  IconArrowLeft,
  IconReceiptRefund,
  IconPackage,
  IconArrowRight,
  IconCircleCheck,
  IconClock,
  IconAlertCircle,
  IconInfoCircle,
  IconSend,
  IconLoader2,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { getClaimById, CLAIM_STATUS_META, syncLocalClaimStatus, type Claim, type ClaimStatus } from '../services/claimsService';
import { getTransactionById, statusConfig, type Transaction } from '../services/transactionService';
import {
  ensureClaimLinked, getClaimBridgeState, replyToClaim, mapBridgeStatusToLocal,
  type ClaimBridgeState, type ClaimBridgeResult,
} from '../services/claimBridgeService';

/** Moderate refresh cadence — a claim's Bridge status changes on staff/
 * Finance action cadence (minutes-to-hours), not real time, so a simple
 * poll is the right tool here (matches the task's own "don't over-engineer
 * realtime" guidance) rather than the ticket path's faster adaptive poll. */
const CLAIM_STATE_POLL_MS = 25_000;

const TICKET_STATUS_LABEL: Record<string, string> = {
  new: 'New', open: 'Open', in_progress: 'In Progress', on_hold: 'On Hold',
  resolved: 'Resolved', closed: 'Closed',
};

// The permanent lifecycle — every claim passes through these five nodes in
// order. `On Hold` is NOT one of them: it is inserted conditionally (see
// `buildTimelineSteps` below) only while the claim is currently on hold, and
// removed the moment it resumes — the timeline answers "where is my claim
// now," not "everywhere it has ever been" (historical hold detail stays in
// Claim Updates & Messages).
const STATUS_STEPS: Array<{ key: ClaimStatus; label: string; description: string }> = [
  { key: 'open',       label: 'Claim Filed',      description: 'Claim received and queued for review.' },
  { key: 'in-review',  label: 'Pending Approval',  description: 'Claims team is reviewing the submission.' },
  { key: 'approved',   label: 'Approved',          description: 'Claim has been approved.' },
  { key: 'processing', label: 'Processing',        description: 'Finance is processing the refund.' },
  { key: 'settled',    label: 'Settled',           description: 'Refund has been issued to your account.' },
];

const FALLBACK_HOLD_MESSAGE = 'Placed on hold. See Claim Updates & Messages below for details.';

type TimelineStep = { key: ClaimStatus; label: string; description: string; isHold?: boolean };

/** Bridge only ever reaches `on_hold` from 'approved' or 'processing' (both
 * counted as "processing has started" — see finance_hold_claim), so the node
 * always lands in the same place: right after Processing, right before
 * Settled — the last completed lifecycle state and the next applicable one. */
function buildTimelineSteps(status: ClaimStatus, holdReason: string | null): TimelineStep[] {
  if (status !== 'on_hold') return STATUS_STEPS;
  return [
    ...STATUS_STEPS.slice(0, 4),
    { key: 'on_hold', label: 'On Hold', description: holdReason ? `Placed on hold due to ${holdReason}.` : FALLBACK_HOLD_MESSAGE, isHold: true },
    STATUS_STEPS[4],
  ];
}

type NodeVisual = 'done' | 'processing' | 'onhold' | 'active' | 'future';

function nodeVisual(step: TimelineStep, i: number, currentIdx: number): NodeVisual {
  if (i < currentIdx) return 'done';
  if (i > currentIdx) return 'future';
  if (step.key === 'processing') return 'processing';
  if (step.key === 'on_hold') return 'onhold';
  if (step.key === 'settled') return 'done'; // terminal state — fully complete, not a "current" highlight
  return 'active';
}

const CIRCLE_CLASSES: Record<NodeVisual, string> = {
  done: 'bg-green-500 border-green-500',
  processing: 'bg-amber-500 border-amber-500',
  onhold: 'bg-orange-500 border-orange-500',
  active: 'bg-white border-blue-500',
  future: 'bg-white border-gray-300',
};

const LABEL_CLASSES: Record<NodeVisual, string> = {
  done: 'text-gray-900',
  processing: 'text-amber-700',
  onhold: 'text-orange-700',
  active: 'text-blue-700',
  future: 'text-gray-400',
};

const DESCRIPTION_CLASSES: Record<NodeVisual, string> = {
  done: 'text-gray-500',
  processing: 'text-amber-600',
  onhold: 'text-orange-600',
  active: 'text-blue-600',
  future: 'text-gray-300',
};

const LINE_CLASSES: Record<NodeVisual, string> = {
  done: 'bg-green-400',
  processing: 'bg-gray-200',
  onhold: 'bg-gray-200',
  active: 'bg-gray-200',
  future: 'bg-gray-200',
};

function ClaimTimeline({ status, holdReason }: { status: ClaimStatus; holdReason: string | null }) {
  if (status === 'denied') {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-900">Claim Denied</p>
          <p className="text-sm text-red-700 mt-0.5">
            This claim was reviewed and denied. Please contact support if you believe this decision is incorrect.
          </p>
        </div>
      </div>
    );
  }

  const steps = buildTimelineSteps(status, holdReason);
  const currentIdx = steps.findIndex((s) => s.key === status);

  return (
    <div className="space-y-0" data-testid="claim-timeline">
      {steps.map((step, i) => {
        const visual = nodeVisual(step, i, currentIdx);
        const last = i === steps.length - 1;
        return (
          <div key={step.key} className="relative flex gap-4">
            {!last && (
              <div className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${LINE_CLASSES[visual]}`} />
            )}
            <div className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 mt-0.5 flex items-center justify-center ${CIRCLE_CLASSES[visual]}`}>
              {visual === 'done' && <IconCircleCheck className="w-3.5 h-3.5 text-white" />}
              {visual === 'processing' && <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />}
              {visual === 'onhold' && <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />}
              {visual === 'active' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
            </div>
            <div className={`flex-1 pb-6 ${last ? 'pb-0' : ''}`}>
              <p className={`text-sm font-medium ${LABEL_CLASSES[visual]}`}>
                {step.label}
              </p>
              <p className={`text-xs mt-0.5 break-words ${DESCRIPTION_CLASSES[visual]}`}>
                {step.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClaimDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [claim,       setClaim]       = useState<Claim | null | undefined>(undefined);
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(undefined);
  const [displayStatus, setDisplayStatus] = useState<ClaimStatus | null>(null);

  // 'loading' | claim's live Bridge state | a typed failure (unavailable /
  // claims_disabled / forbidden / not_found) — distinct from `claim` itself,
  // which stays the local mock record regardless of Bridge reachability.
  const [bridgeResult, setBridgeResult] = useState<'loading' | ClaimBridgeResult<ClaimBridgeState>>('loading');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) { setClaim(null); return; }
    getClaimById(id)
      .then((c) => {
        if (cancelled) return;
        setClaim(c);
        setDisplayStatus(c?.status ?? null);
        if (c) {
          getTransactionById(c.trackingNumber)
            .then((tx) => { if (!cancelled) setTransaction(tx); })
            .catch(() => {});
        } else {
          setTransaction(null);
        }
      })
      .catch(() => { if (!cancelled) setClaim(null); });
    return () => { cancelled = true; };
  }, [id]);

  // Ensure the claim is linked to QuadX Bridge (idempotent — safe on every
  // mount, including for a legacy/never-linked claim), then start a moderate
  // poll for its live status/timeline/messages. Paused while the tab is
  // hidden, same discipline the ticket-detail poll uses.
  useEffect(() => {
    if (!claim) return;
    const currentClaim = claim;
    let cancelled = false;

    // Clear any previous claim's Bridge data immediately on an id change —
    // otherwise, while the fresh fetch below is in flight, this would keep
    // rendering the PREVIOUS claim's live state (including its holdReason)
    // under the new claim's id, a stale cross-claim leak in the timeline/
    // refund banner. `effectiveStatus` already resets synchronously via the
    // claim-load effect above; this keeps `bridgeResult` in step with it.
    setBridgeResult('loading');

    function applyResult(result: ClaimBridgeResult<ClaimBridgeState>) {
      if (cancelled) return;
      setBridgeResult(result);
      if (result.status === 'ok') {
        const mapped = mapBridgeStatusToLocal(result.data.status);
        setDisplayStatus(mapped);
        syncLocalClaimStatus(currentClaim.id, mapped);
      }
    }

    ensureClaimLinked(currentClaim.id, {
      reason: currentClaim.reason,
      trackingNumber: currentClaim.trackingNumber,
      details: currentClaim.details,
    }).then(applyResult);

    function poll() {
      if (document.hidden) return;
      getClaimBridgeState(currentClaim.id).then(applyResult);
    }
    pollRef.current = setInterval(poll, CLAIM_STATE_POLL_MS);
    document.addEventListener('visibilitychange', poll);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim?.id]);

  async function handleSendReply() {
    if (!claim || !replyText.trim() || sending) return;
    setSending(true);
    const result = await replyToClaim(claim.id, replyText.trim());
    setSending(false);
    if (result.status === 'ok') {
      setReplyText('');
      setBridgeResult(result);
      const mapped = mapBridgeStatusToLocal(result.data.status);
      setDisplayStatus(mapped);
      syncLocalClaimStatus(claim.id, mapped);
    }
  }

  if (claim === undefined) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/claims')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />Back to Claims
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center text-sm text-gray-400">Loading claim…</CardContent>
        </Card>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/claims')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />Back to Claims
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center">
            <IconReceiptRefund className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">Claim not found</h2>
            <p className="text-sm text-gray-500 mt-1">
              No claim with ID <span className="font-medium text-gray-700">{id}</span> was found.
            </p>
            <Button className="mt-6" onClick={() => navigate('/dashboard/claims')}>View All Claims</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const effectiveStatus = displayStatus ?? claim.status;
  const meta = CLAIM_STATUS_META[effectiveStatus];
  const holdReason = bridgeResult !== 'loading' && bridgeResult.status === 'ok' ? bridgeResult.data.holdReason : null;
  const isOnHold = effectiveStatus === 'on_hold';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/claims')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />Back to Claims
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Claim {claim.id}</h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-gray-600 text-sm">Filed {claim.createdAt}</p>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Claim Summary */}
          <Card>
            <CardHeader><CardTitle>Claim Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Claim ID</p>
                  <p className="text-gray-900 font-medium">{claim.id}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Tracking Number</p>
                  <button
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                    onClick={() => navigate(`/dashboard/transactions/${claim.trackingNumber}`)}
                  >
                    {claim.trackingNumber}
                    <IconArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Claim Amount</p>
                  <p className="text-gray-900 font-medium">
                    {claim.amount ? `₱${claim.amount.toLocaleString()}` : '—'}
                  </p>
                </div>
                {claim.accountName && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Subaccount</p>
                    <p className="text-gray-900">{claim.accountName}</p>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Reason</p>
                <p className="text-gray-900">{claim.reason}</p>
              </div>
              {claim.details && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Details</p>
                  <p className="text-gray-700 text-sm">{claim.details}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked transaction */}
          {transaction && (
            <Card>
              <CardHeader><CardTitle>Linked Transaction</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <IconPackage className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900">{transaction.trackingNumber}</p>
                      <Badge variant={statusConfig[transaction.status].variant}>
                        {statusConfig[transaction.status].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {transaction.recipient.name} · {transaction.destination}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {transaction.type} · Booked {transaction.date}
                    </p>
                    <Link
                      to={`/dashboard/transactions/${transaction.trackingNumber}`}
                      className="inline-flex items-center gap-1 mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      View transaction details
                      <IconArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Claim Updates & Messages */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Claim Updates &amp; Messages</CardTitle>
              {bridgeResult !== 'loading' && bridgeResult.status === 'ok' && (
                <Badge variant="info">
                  Related ticket: {TICKET_STATUS_LABEL[bridgeResult.data.ticket.status] ?? bridgeResult.data.ticket.status}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {bridgeResult === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                  <IconLoader2 className="w-4 h-4 animate-spin" />Loading updates…
                </div>
              )}

              {bridgeResult !== 'loading' && bridgeResult.status === 'claims_disabled' && (
                <p className="text-sm text-gray-500 py-4">
                  Claim updates aren't available for this account yet. Check back soon.
                </p>
              )}

              {bridgeResult !== 'loading' && (bridgeResult.status === 'unavailable' || bridgeResult.status === 'not_found' || bridgeResult.status === 'forbidden') && (
                <p className="text-sm text-gray-500 py-4">
                  Claim updates are temporarily unavailable. This page will keep checking automatically.
                </p>
              )}

              {bridgeResult !== 'loading' && bridgeResult.status === 'ok' && (
                <>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                    {[
                      ...bridgeResult.data.timelineEvents.map((e) => ({ kind: 'event' as const, at: e.occurredAt, summary: e.summary })),
                      ...bridgeResult.data.messages.map((m) => ({ kind: 'message' as const, at: m.createdAt, message: m })),
                    ]
                      .sort((a, b) => a.at.localeCompare(b.at))
                      .map((item, i) =>
                        item.kind === 'event' ? (
                          <div key={`e-${i}`} className="flex items-center gap-2 text-xs text-gray-500">
                            <IconClock className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{item.summary}</span>
                          </div>
                        ) : (
                          <div key={item.message.id} className={`flex gap-3 ${item.message.from === 'you' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium ${item.message.from === 'you' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                              {item.message.from === 'you' ? 'You' : 'CS'}
                            </div>
                            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${item.message.from === 'you' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                              <p>{item.message.body}</p>
                            </div>
                          </div>
                        ),
                      )}
                    {bridgeResult.data.timelineEvents.length === 0 && bridgeResult.data.messages.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">No updates yet.</p>
                    )}
                  </div>
                  <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                    <textarea
                      className="w-full h-20 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Ask a question about this claim…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" disabled={!replyText.trim() || sending} onClick={handleSendReply}>
                        {sending ? <IconLoader2 className="w-4 h-4 mr-2 animate-spin" /> : <IconSend className="w-4 h-4 mr-2" />}
                        {sending ? 'Sending…' : 'Send'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: status timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Claim Status</CardTitle></CardHeader>
            <CardContent>
              <ClaimTimeline status={effectiveStatus} holdReason={holdReason} />
            </CardContent>
          </Card>

          {(effectiveStatus === 'approved' || effectiveStatus === 'processing' || effectiveStatus === 'on_hold' || effectiveStatus === 'settled') && claim.amount && (
            <Card className={isOnHold ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  {isOnHold
                    ? <IconAlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    : <IconCircleCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`font-semibold mb-1 ${isOnHold ? 'text-orange-900' : 'text-emerald-900'}`}>
                      {effectiveStatus === 'settled' ? 'Refund Issued' : isOnHold ? 'Refund On Hold' : 'Refund Approved'}
                    </p>
                    <p className={`text-2xl font-bold ${isOnHold ? 'text-orange-800' : 'text-emerald-800'}`}>₱{claim.amount.toLocaleString()}</p>
                    <p className={`text-sm mt-1 break-words ${isOnHold ? 'text-orange-700' : 'text-emerald-700'}`}>
                      {effectiveStatus === 'settled'
                        ? 'This refund has been credited to your linked account.'
                        : isOnHold
                          ? (holdReason ? `Processing is paused — placed on hold due to ${holdReason}.` : 'Processing is paused while this claim is on hold.')
                          : 'Refund is being processed and will arrive within 3–5 business days.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-2.5">
                <IconInfoCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  Claim decisions are made by the GoGo Xpress claims team and are final. Processing typically takes 3–7 business days from the date of filing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
