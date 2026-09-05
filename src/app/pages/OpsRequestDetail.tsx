import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCircleCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconMessage,
  IconMapPin,
  IconPackages,
  IconCalendar,
  IconUser,
  IconWeight,
  IconClock,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  getOpsRequestById,
  getOpsRequestUpdates,
  CATEGORY_META,
  STATUS_META,
  SUPPLY_TYPE_LABELS,
  PICKUP_SUPPORT_LABELS,
  ASSISTANCE_TYPE_LABELS,
  type OperationsRequest,
  type OpsRequestUpdate,
} from '../services/opsRequestsService';

// ─── Status timeline ──────────────────────────────────────────────────────────

const TIMELINE_STEPS: Array<{ key: string; label: string; description: string }> = [
  { key: 'submitted',   label: 'Submitted',   description: 'Request received by GGX Operations.' },
  { key: 'in_review',   label: 'In Review',   description: 'Operations team is reviewing the request.' },
  { key: 'in_progress', label: 'In Progress', description: 'Operations is coordinating and fulfilling the request.' },
  { key: 'completed',   label: 'Completed',   description: 'Request has been fulfilled successfully.' },
];

const TIMELINE_ORDER = ['submitted', 'in_review', 'in_progress', 'completed'];

function OpsRequestTimeline({ request }: { request: OperationsRequest }) {
  const { status } = request;

  if (status === 'rejected') {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-900">Request Rejected</p>
          <p className="text-sm text-red-700 mt-0.5">
            This request was reviewed and could not be fulfilled. Please contact your account manager or submit a new request if the situation changes.
          </p>
        </div>
      </div>
    );
  }

  const currentIdx = TIMELINE_ORDER.indexOf(status);

  return (
    <div className="space-y-0">
      {TIMELINE_STEPS.map((step, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        const last   = i === TIMELINE_STEPS.length - 1;
        return (
          <div key={step.key} className="relative flex gap-4">
            {!last && (
              <div className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
            <div className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 mt-0.5 flex items-center justify-center ${
              done   ? 'bg-green-500 border-green-500' :
              active ? 'bg-white border-blue-500' :
                       'bg-white border-gray-300'
            }`}>
              {done   && <IconCircleCheck className="w-3.5 h-3.5 text-white" />}
              {active && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
            </div>
            <div className={`flex-1 pb-6 ${last ? 'pb-0' : ''}`}>
              <p className={`text-sm font-medium ${active ? 'text-blue-700' : done ? 'text-gray-900' : 'text-gray-400'}`}>
                {step.label}
              </p>
              <p className={`text-xs mt-0.5 ${active ? 'text-blue-600' : done ? 'text-gray-500' : 'text-gray-300'}`}>
                {step.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="text-gray-900 text-sm">{children}</div>
    </div>
  );
}

function SupplyFields({ request }: { request: OperationsRequest }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {request.supplyType && (
        <Field label="Supply Type">{SUPPLY_TYPE_LABELS[request.supplyType]}</Field>
      )}
      {request.quantity !== undefined && (
        <Field label="Quantity">{request.quantity.toLocaleString()} units</Field>
      )}
      {request.neededByDate && (
        <Field label="Needed By">
          <span className="inline-flex items-center gap-1.5">
            <IconCalendar className="w-3.5 h-3.5 text-gray-400" />
            {request.neededByDate}
          </span>
        </Field>
      )}
      {request.deliveryAddress && (
        <div className="sm:col-span-2">
          <Field label="Delivery Address">
            <span className="inline-flex items-start gap-1.5">
              <IconMapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
              {request.deliveryAddress}
            </span>
          </Field>
        </div>
      )}
    </div>
  );
}

function PickupFields({ request }: { request: OperationsRequest }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {request.pickupSupportType && (
        <Field label="Request Type">{PICKUP_SUPPORT_LABELS[request.pickupSupportType]}</Field>
      )}
      {request.estimatedShipmentCount !== undefined && (
        <Field label="Est. Shipments">
          <span className="inline-flex items-center gap-1.5">
            <IconPackages className="w-3.5 h-3.5 text-gray-400" />
            {request.estimatedShipmentCount.toLocaleString()}
          </span>
        </Field>
      )}
      {request.estimatedWeight && (
        <Field label="Est. Weight / Volume">
          <span className="inline-flex items-center gap-1.5">
            <IconWeight className="w-3.5 h-3.5 text-gray-400" />
            {request.estimatedWeight}
          </span>
        </Field>
      )}
      {request.preferredPickupWindow && (
        <div className="sm:col-span-2">
          <Field label="Preferred Pickup Window">
            <span className="inline-flex items-center gap-1.5">
              <IconClock className="w-3.5 h-3.5 text-gray-400" />
              {request.preferredPickupWindow}
            </span>
          </Field>
        </div>
      )}
      {request.pickupAddress && (
        <div className="sm:col-span-2">
          <Field label="Pickup Address">
            <span className="inline-flex items-start gap-1.5">
              <IconMapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
              {request.pickupAddress}
            </span>
          </Field>
        </div>
      )}
      {request.relatedBatchId && (
        <div className="sm:col-span-2">
          <Field label="Related Batch">
            <Link
              to={`/dashboard/transactions?batch=${request.relatedBatchId}`}
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              {request.relatedBatchId}
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Field>
        </div>
      )}
    </div>
  );
}

function AssistanceFields({ request }: { request: OperationsRequest }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {request.assistanceType && (
        <div className="sm:col-span-2">
          <Field label="Assistance Type">{ASSISTANCE_TYPE_LABELS[request.assistanceType]}</Field>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OpsRequestDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [request, setRequest] = useState<OperationsRequest | null | undefined>(undefined);
  const [updates, setUpdates] = useState<OpsRequestUpdate[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Reset synchronously on every id change — direct navigation between two
    // request URLs (same mounted route component, only :id changes) could
    // otherwise transiently render the PREVIOUS request's details/history
    // under the NEW id until the fresh fetches resolve (Codex review finding).
    setRequest(undefined);
    setUpdates([]);
    if (!id) { setRequest(null); return; }
    getOpsRequestById(id)
      .then((r) => { if (!cancelled) setRequest(r); })
      .catch(() => { if (!cancelled) setRequest(null); });
    getOpsRequestUpdates(id)
      .then((u) => { if (!cancelled) setUpdates(u); })
      .catch(() => { if (!cancelled) setUpdates([]); });
    return () => { cancelled = true; };
  }, [id]);

  if (request === undefined) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/operations-requests')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />Back to Operations Requests
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center text-sm text-gray-400">Loading request…</CardContent>
        </Card>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/operations-requests')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />Back to Operations Requests
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center">
            <IconInfoCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">Request not found</h2>
            <p className="text-sm text-gray-500 mt-1">
              No request with ID <span className="font-medium text-gray-700">{id}</span> was found.
            </p>
            <Button className="mt-6" onClick={() => navigate('/dashboard/operations-requests')}>
              View All Requests
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const catMeta = CATEGORY_META[request.category];
  const statusMeta = STATUS_META[request.status];
  const CatIcon = catMeta.icon;

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/operations-requests')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />Back to Operations Requests
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl ${catMeta.bgClass} flex items-center justify-center flex-shrink-0`}>
            <CatIcon className={`w-6 h-6 ${catMeta.iconClass}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{request.id}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{catMeta.label}</span>
              <span className="text-gray-300">·</span>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request details */}
          <Card>
            <CardHeader><CardTitle>Request Details</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* Top metadata */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Request ID">{request.id}</Field>
                <Field label="Status"><Badge variant={statusMeta.variant}>{statusMeta.label}</Badge></Field>
                <Field label="Subaccount">{request.subaccountName}</Field>
                <Field label="Submitted By">
                  <span className="inline-flex items-center gap-1.5">
                    <IconUser className="w-3.5 h-3.5 text-gray-400" />
                    {request.createdBy}
                  </span>
                </Field>
                <Field label="Date Submitted">{request.createdAt}</Field>
                <Field label="Last Updated">{request.updatedAt}</Field>
              </div>

              {/* Type-specific fields */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {catMeta.label} Details
                </p>
                {request.category === 'supply' && <SupplyFields request={request} />}
                {request.category === 'pickup_support' && <PickupFields request={request} />}
                {request.category === 'operational_assistance' && <AssistanceFields request={request} />}
              </div>

              {/* Notes */}
              {request.notes && (
                <div className="pt-4 border-t border-gray-100">
                  <Field label="Notes">
                    <p className="text-gray-700 leading-relaxed">{request.notes}</p>
                  </Field>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact / escalation */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <IconMessage className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900 mb-1">Need an update on this request?</p>
                  <p className="text-sm text-blue-800 mb-3">
                    For urgent changes or escalations, raise a support ticket and reference this request ID.
                  </p>
                  <Button size="sm" onClick={() => navigate('/dashboard/support-tickets')}>
                    Open Support Ticket
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Request Status</CardTitle></CardHeader>
            <CardContent>
              <OpsRequestTimeline request={request} />
            </CardContent>
          </Card>

          {updates.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Updates</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {updates.map((u, i) => (
                    <div key={`${u.occurredAt}-${i}`} className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
                      <div>
                        <p className="text-sm text-gray-800">{u.summary}</p>
                        {u.occurredAt && (
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(u.occurredAt).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {request.status === 'completed' && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <IconCircleCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-900 mb-1">Request Fulfilled</p>
                    <p className="text-sm text-emerald-700">
                      This request has been completed by the GGX Operations team.
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
                  Status updates are managed by the GGX Operations team. Changes are reflected here as your request progresses.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
