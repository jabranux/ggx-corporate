import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IconPlus, IconCircleCheck, IconBox, IconTruck, IconAdjustments, IconMapPin, IconAlertCircle,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { SearchInput } from '../components/SearchInput';
import { Dialog } from '../components/ui/Dialog';
import { StatCard } from '../components/StatCard';
import { CompactAddressCard } from '../components/CompactAddressCard';
import { AddressBook, getPreferredAddress, type Address } from '../components/AddressBook';
import { useSubAccounts, type SubAccount } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { useScopedAccountId } from '../hooks/useAccountScope';
import { getSubaccountOptions } from '../services/userService';
import {
  getOpsRequests, submitOpsRequest,
  CATEGORY_META, STATUS_META,
  SUPPLY_TYPE_LABELS, PICKUP_SUPPORT_LABELS, ASSISTANCE_TYPE_LABELS,
  type OperationsRequest, type OpsRequestCategory,
  type SupplyType, type PickupSupportType, type OperationalAssistanceType,
} from '../services/opsRequestsService';
import { IconClipboardList } from '@tabler/icons-react';

// ─── address helpers ─────────────────────────────────────────────────────────

/** Synthesise a display Address from a SubAccount's pickup data. */
function subToAddress(sub: SubAccount): Address {
  return {
    id: `sub-${sub.id}`,
    label: 'office',
    name: sub.senderName,
    mobileNumber: sub.contactNumber,
    province: '',
    city: '',
    barangay: '',
    otherDetails: sub.pickupAddress,
    isPreferred: true,
  };
}

/** Format an Address object into the string stored on the service contract. */
function formatAddress(addr: Address): string {
  const parts = [addr.otherDetails, addr.barangay, addr.city, addr.province]
    .filter(Boolean);
  return parts.join(', ');
}

// ─── form state ───────────────────────────────────────────────────────────────

interface FormState {
  category: OpsRequestCategory | '';
  subaccountId: string;
  notes: string;
  // supply
  supplyType: SupplyType | '';
  quantity: string;
  neededByDate: string;
  // pickup support
  pickupSupportType: PickupSupportType | '';
  relatedBatchId: string;
  estimatedShipmentCount: string;
  estimatedWeight: string;
  preferredPickupWindow: string;
  // operational assistance
  assistanceType: OperationalAssistanceType | '';
  // shared: address for delivery or pickup
  selectedAddress: Address | null;
}

const emptyForm = (): FormState => ({
  category: '',
  subaccountId: '',
  notes: '',
  supplyType: '',
  quantity: '',
  neededByDate: '',
  pickupSupportType: '',
  relatedBatchId: '',
  estimatedShipmentCount: '',
  estimatedWeight: '',
  preferredPickupWindow: '',
  assistanceType: '',
  selectedAddress: null,
});

// ─── display helpers ──────────────────────────────────────────────────────────

function requestTitle(r: OperationsRequest): string {
  if (r.category === 'supply' && r.supplyType)
    return `${SUPPLY_TYPE_LABELS[r.supplyType]} Supply — ${r.quantity ?? '?'} units`;
  if (r.category === 'pickup_support' && r.pickupSupportType)
    return PICKUP_SUPPORT_LABELS[r.pickupSupportType];
  if (r.category === 'operational_assistance' && r.assistanceType)
    return ASSISTANCE_TYPE_LABELS[r.assistanceType];
  return CATEGORY_META[r.category].label;
}

function requestDetail(r: OperationsRequest): string {
  if (r.category === 'supply') {
    return [r.deliveryAddress, r.neededByDate ? `Needed by ${r.neededByDate}` : ''].filter(Boolean).join(' · ');
  }
  if (r.category === 'pickup_support') {
    return [
      r.pickupAddress,
      r.estimatedShipmentCount ? `~${r.estimatedShipmentCount} shipments` : '',
    ].filter(Boolean).join(' · ');
  }
  if (r.category === 'operational_assistance') {
    return r.notes ?? '';
  }
  return '';
}

// ─── component ────────────────────────────────────────────────────────────────

export function OperationsRequests() {
  const navigate = useNavigate();
  const {
    getCurrentAccountName, subAccountsEnabled, subAccounts, currentAccount,
  } = useSubAccounts();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  // Role-aware scope: managers are hard-scoped to their subaccount (they may have
  // currentAccount='main' inherited from an admin session); admins see consolidated
  // on Main Account and scoped when drilled into a subaccount.
  const scopeId = useScopedAccountId();
  const mainView = subAccountsEnabled && scopeId === undefined;
  // The currently-viewed subaccount object (null when on main or no subaccounts).
  const currentSubaccount = subAccounts.find((s) => s.id === currentAccount) ?? null;

  // For managers, find their assigned subaccount by name from user.accountName
  // (managers may have currentAccount='main' if state was inherited from an admin session).
  const managerSubaccount: SubAccount | null = isManager && user?.accountName
    ? (subAccounts.find((s) => s.name === user.accountName) ?? currentSubaccount)
    : null;

  // The resolved "active" subaccount for scoped contexts (C, D — not A or E).
  const activeScopedSub: SubAccount | null =
    isManager ? managerSubaccount :
    (!mainView && currentSubaccount) ? currentSubaccount :
    null;

  // Subaccount selector display rules:
  //   • Admin (not manager), main view, 2+ subaccounts → show selector (Context A)
  //   • All other contexts → scope is already determined, no selector needed
  const showSubaccountSelector = mainView && !isManager && subAccounts.length > 1;

  const [requests, setRequests]               = useState<OperationsRequest[]>([]);
  const [listError, setListError]             = useState(false);
  const [subaccountOptions, setSubaccountOptions] = useState<{ id: string; name: string }[]>([]);
  const [categoryFilter, setCategoryFilter]   = useState<OpsRequestCategory | 'all'>('all');
  const [statusFilter, setStatusFilter]       = useState<string>('all');
  const [subaccountFilter, setSubaccountFilter] = useState('all');
  const [searchQuery, setSearchQuery]         = useState('');

  const [formOpen, setFormOpen]           = useState(false);
  const [form, setForm]                   = useState<FormState>(emptyForm());
  const [submitting, setSubmitting]       = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError]     = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  // Minted once per logical submission attempt (openForm), reused across
  // retries of the SAME attempt so a lost-response retry re-fetches the
  // original Bridge request instead of creating a second real one.
  const submitIdempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // Guards against an earlier scope's slower fetch resolving AFTER a newer
  // one (e.g. an admin switching subaccount view twice in quick succession)
  // and overwriting the current scope's rows with the stale scope's —
  // same generation-counter pattern `activeTicketsRequestRef` uses elsewhere
  // in this codebase (Codex review finding).
  const listRequestGenerationRef = useRef(0);

  const refresh = () => {
    const generation = ++listRequestGenerationRef.current;
    getOpsRequests(scopeId ? { subaccountId: scopeId } : undefined)
      .then((data) => {
        if (generation !== listRequestGenerationRef.current) return; // superseded — discard
        setRequests(data);
        setListError(false);
      })
      // A genuine load failure (session expired, Bridge unreachable) must
      // not render as "no requests" — show a distinct, retryable state.
      .catch(() => {
        if (generation !== listRequestGenerationRef.current) return;
        setListError(true);
      });
  };
  useEffect(() => {
    setRequests([]); // never show the PREVIOUS scope's rows while the new scope loads
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  useEffect(() => {
    getSubaccountOptions().then(setSubaccountOptions).catch(() => {});
  }, []);

  // ── Presentation-only filtering ─────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const visible = requests.filter((r) => {
    const searchOk =
      q.length < 2 ||
      r.id.toLowerCase().includes(q) ||
      requestTitle(r).toLowerCase().includes(q) ||
      r.subaccountName.toLowerCase().includes(q);
    const catOk = categoryFilter === 'all' || r.category === categoryFilter;
    const stOk  = statusFilter === 'all'   || r.status === statusFilter;
    const subOk = subaccountFilter === 'all' || r.subaccountId === subaccountFilter;
    return searchOk && catOk && stOk && subOk;
  });

  // ── Summary counts ──────────────────────────────────────────────────────────
  const openCount   = requests.filter((r) => ['submitted', 'in_review', 'in_progress'].includes(r.status)).length;
  const supplyCount = requests.filter((r) => r.category === 'supply').length;
  const pickupCount = requests.filter((r) => r.category === 'pickup_support').length;

  // ── Form helpers ────────────────────────────────────────────────────────────
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  /**
   * When admin changes the subaccount selector, update both subaccountId and
   * the default address for that subaccount.
   */
  const handleSubaccountChange = (subId: string) => {
    const sub = subAccounts.find((s) => s.id === subId) ?? null;
    setForm((f) => ({
      ...f,
      subaccountId: subId,
      selectedAddress: sub ? subToAddress(sub) : f.selectedAddress,
    }));
  };

  const formValid = (): boolean => {
    if (!form.category) return false;
    // Context A: selector is shown — user must make an explicit selection.
    if (showSubaccountSelector && !form.subaccountId) return false;
    if (form.category === 'supply') {
      return !!(form.supplyType && form.quantity && form.neededByDate && form.selectedAddress);
    }
    if (form.category === 'pickup_support') {
      return !!(form.pickupSupportType && form.selectedAddress);
    }
    if (form.category === 'operational_assistance') {
      return !!form.assistanceType;
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!formValid() || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      // Determine scope:
      //   A/B (main view, admin): use the form's explicit subaccountId selection.
      //   C (scoped sub view): use scopeId from context.
      //   D (manager): use manager's assigned subaccount.
      //   E (no subs): 'main' / current account.
      let subId: string;
      let subName: string;
      if (showSubaccountSelector || (mainView && !isManager && subAccounts.length === 1)) {
        subId   = form.subaccountId;
        subName = subAccounts.find((s) => s.id === form.subaccountId)?.name ?? form.subaccountId;
      } else if (activeScopedSub) {
        subId   = activeScopedSub.id;
        subName = activeScopedSub.name;
      } else {
        subId   = scopeId ?? 'main';
        subName = getCurrentAccountName();
      }

      const addrStr = form.selectedAddress ? formatAddress(form.selectedAddress) : undefined;

      const created = await submitOpsRequest({
        category:     form.category as OpsRequestCategory,
        subaccountId: subId,
        subaccountName: subName,
        createdBy:    user?.name ?? 'GGX Biz+ User',
        notes:        form.notes || undefined,
        supplyType:   form.supplyType as SupplyType || undefined,
        quantity:     form.quantity ? parseInt(form.quantity, 10) : undefined,
        deliveryAddress: form.category === 'supply' ? addrStr : undefined,
        neededByDate:    form.category === 'supply' ? (form.neededByDate || undefined) : undefined,
        pickupSupportType: form.pickupSupportType as PickupSupportType || undefined,
        relatedBatchId:    form.relatedBatchId || undefined,
        pickupAddress:     form.category === 'pickup_support' ? addrStr : undefined,
        estimatedShipmentCount: form.estimatedShipmentCount ? parseInt(form.estimatedShipmentCount, 10) : undefined,
        estimatedWeight: form.estimatedWeight || undefined,
        preferredPickupWindow: form.category === 'pickup_support' ? (form.preferredPickupWindow || undefined) : undefined,
        assistanceType: form.assistanceType as OperationalAssistanceType || undefined,
      }, submitIdempotencyKeyRef.current);
      // `submitOpsRequest` resolves to `null` (never throws) on a failed/
      // unreachable Bridge call — never assume success (Codex review
      // finding: silently losing an operational request is a P1).
      if (!created) {
        setSubmitError(true);
        return;
      }
      setSubmitSuccess(true);
      refresh();
      setTimeout(() => {
        setSubmitSuccess(false);
        setFormOpen(false);
        setForm(emptyForm());
      }, 1800);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Open the form with correct defaults for the current account context.
   *
   * A — Admin, main view, 2+ subaccounts: show selector, no auto-selection,
   *     no default address — user must explicitly choose a subaccount first.
   * B — Admin, main view, 1 subaccount: auto-select it, derive default address.
   * C — Admin viewing a specific subaccount: scope from viewed sub, derive address.
   * D — Manager: scope from manager's assigned subaccount, derive address.
   * E — Standard account (no subaccounts): no default address → "Select" empty state.
   */
  const openForm = () => {
    const init = emptyForm();

    if (mainView && !isManager && subAccounts.length === 1) {
      // Context B: exactly one subaccount — auto-select, no manual choice needed.
      const onlySub = subAccounts[0];
      init.subaccountId    = onlySub.id;
      init.selectedAddress = subToAddress(onlySub);
    } else if (activeScopedSub) {
      // Context C / D: scope is already determined by the viewed subaccount or
      // manager assignment. Derive the default address from it.
      init.selectedAddress = subToAddress(activeScopedSub);
    }
    // Context A (2+ subs): subaccountId = '' and selectedAddress = null.
    //   User must choose from the selector; address populates on selection.
    // Context E (no subs enabled): fall back to the account's preferred address
    //   from the address book so the user never faces a blank address field.
    if (!init.selectedAddress && !subAccountsEnabled) {
      init.selectedAddress = getPreferredAddress();
    }

    setForm(init);
    setSubmitSuccess(false);
    setSubmitError(false);
    submitIdempotencyKeyRef.current = crypto.randomUUID();
    setFormOpen(true);
  };

  // Address picker callback: update form address and close picker.
  const handleAddressPicked = (addr: Address) => {
    setField('selectedAddress', addr);
    setAddressPickerOpen(false);
  };

  // ── Address section shared by supply and pickup support ─────────────────────
  const addressLabel = form.category === 'pickup_support' ? 'Pickup address' : 'Delivery address';
  const addressSection = (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {addressLabel} <span className="text-red-500">*</span>
      </label>
      {form.selectedAddress ? (
        <CompactAddressCard
          address={form.selectedAddress}
          onChangeClick={() => setAddressPickerOpen(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddressPickerOpen(true)}
          className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-4 text-center text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors cursor-pointer"
        >
          <IconMapPin className="w-4 h-4 mx-auto mb-1 opacity-60" />
          Select address from Address Book
        </button>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Operations Requests</h1>
          <p className="text-gray-600 mt-1">
            Submit and track supply, pickup, and operational assistance requests.
          </p>
        </div>
        <Button onClick={openForm}>
          <IconPlus className="w-4 h-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Open Requests"
          value={openCount}
          sub="Submitted, in review, or scheduled"
          icon={IconClipboardList}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Supply Requests"
          value={supplyCount}
          sub="Total this period"
          icon={IconBox}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          label="Pickup Support"
          value={pickupCount}
          sub="Total this period"
          icon={IconTruck}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1 min-w-[240px]">
          <SearchInput
            placeholder="Search by ID, type, or subaccount..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>
        {mainView && (
          <div className="w-full sm:w-[180px] flex-shrink-0">
            <Select value={subaccountFilter} onChange={(e) => setSubaccountFilter(e.target.value)}>
              <option value="all">All subaccounts</option>
              {subaccountOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-full sm:w-[180px] flex-shrink-0">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as OpsRequestCategory | 'all')}>
            <option value="all">All categories</option>
            <option value="supply">Supply Request</option>
            <option value="pickup_support">Pickup Support</option>
            <option value="operational_assistance">Operational Assistance</option>
          </Select>
        </div>
        <div className="w-full sm:w-[160px] flex-shrink-0">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In Review</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
      </div>

      {/* Request list */}
      {listError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <IconAlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">Couldn't load operations requests</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Something went wrong reaching Operations. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <IconAdjustments className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">No operations requests</p>
            <p className="text-xs text-gray-400 mt-1">
              {q.length >= 2
                ? 'No requests match your search.'
                : 'No requests match the current filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const cat     = CATEGORY_META[r.category];
            const st      = STATUS_META[r.status];
            const CatIcon = cat.icon;
            const detail  = requestDetail(r);
            return (
              <Card
                key={r.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${r.status === 'completed' || r.status === 'rejected' ? 'opacity-70' : ''}`}
                onClick={() => navigate(`/dashboard/operations-requests/${r.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cat.bgClass}`}>
                      <CatIcon className={`w-5 h-5 ${cat.iconClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{requestTitle(r)}</span>
                        <Badge variant={cat.badge}>{cat.label}</Badge>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </div>
                      {detail && (
                        <p className="text-sm text-gray-500 mt-1 truncate">{detail}</p>
                      )}
                      {r.notes && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.notes}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                        <span className="font-medium text-gray-500">{r.id}</span>
                        {mainView && <span>{r.subaccountName}</span>}
                        <span>Submitted {r.createdAt}</span>
                        {r.updatedAt !== r.createdAt && <span>· Updated {r.updatedAt}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── New Request dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setForm(emptyForm()); }}
        title="New Operations Request"
        size="md"
      >
        {submitSuccess ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <IconCircleCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-gray-900">Request submitted</p>
            <p className="text-sm text-gray-500">The Operations team will be in touch shortly.</p>
          </div>
        ) : (
          <div className="space-y-4">

            {submitError && (
              <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900">Request could not be submitted</p>
                  <p className="text-sm text-red-700 mt-0.5">
                    Something went wrong reaching Operations. Your entries below are unchanged — please try again.
                  </p>
                </div>
              </div>
            )}

            {/* Category picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Request category <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['supply', 'pickup_support', 'operational_assistance'] as OpsRequestCategory[]).map((cat) => {
                  const m = CATEGORY_META[cat];
                  const CatIcon = m.icon;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setField('category', cat)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${
                        form.category === cat
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <CatIcon className="w-5 h-5" />
                      <span className="text-center leading-snug">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subaccount selector — Context A only (admin, main view, 2+ subaccounts).
                Blank placeholder forces an explicit choice; selecting a subaccount
                also populates the default delivery/pickup address. */}
            {showSubaccountSelector && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Subaccount <span className="text-red-500">*</span>
                </label>
                <Select
                  value={form.subaccountId}
                  onChange={(e) => handleSubaccountChange(e.target.value)}
                >
                  <option value="">Select subaccount…</option>
                  {subAccounts.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* ── Supply fields ─────────────────────────────────────────────── */}
            {form.category === 'supply' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Supply type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={form.supplyType}
                    onChange={(e) => setField('supplyType', e.target.value as SupplyType)}
                  >
                    <option value="">Select supply type…</option>
                    <option value="pouches">Pouches</option>
                    <option value="boxes">Boxes</option>
                    <option value="other_packaging">Other Packaging Supplies</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number" min="1"
                    value={form.quantity}
                    onChange={(e) => setField('quantity', e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Needed by <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.neededByDate}
                    onChange={(e) => setField('neededByDate', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {addressSection}
              </>
            )}

            {/* ── Pickup support fields ─────────────────────────────────────── */}
            {form.category === 'pickup_support' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Request type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={form.pickupSupportType}
                    onChange={(e) => setField('pickupSupportType', e.target.value as PickupSupportType)}
                  >
                    <option value="">Select request type…</option>
                    <option value="immediate_pickup">Immediate Pickup</option>
                    <option value="bulk_pickup_assistance">Bulk Pickup Assistance</option>
                    <option value="four_wheel_pickup">4-Wheel Pickup (vs 2-Wheel First-Mile)</option>
                    <option value="reschedule_pickup">Reschedule Pickup</option>
                    <option value="escalate_missed_pickup">Escalate Missed Pickup</option>
                  </Select>
                </div>
                {addressSection}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Est. shipment count</label>
                    <input
                      type="number" min="1"
                      value={form.estimatedShipmentCount}
                      onChange={(e) => setField('estimatedShipmentCount', e.target.value)}
                      placeholder="e.g. 200"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Est. weight / volume</label>
                    <input
                      type="text"
                      value={form.estimatedWeight}
                      onChange={(e) => setField('estimatedWeight', e.target.value)}
                      placeholder="e.g. ~300 kg"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred pickup window</label>
                  <input
                    type="text"
                    value={form.preferredPickupWindow}
                    onChange={(e) => setField('preferredPickupWindow', e.target.value)}
                    placeholder="e.g. Tomorrow 9 AM–12 PM"
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Related batch ID (optional)</label>
                  <input
                    type="text"
                    value={form.relatedBatchId}
                    onChange={(e) => setField('relatedBatchId', e.target.value)}
                    placeholder="e.g. UPLOAD-2026-05-31-001"
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* ── Operational assistance fields ─────────────────────────────── */}
            {form.category === 'operational_assistance' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Assistance type <span className="text-red-500">*</span>
                </label>
                <Select
                  value={form.assistanceType}
                  onChange={(e) => setField('assistanceType', e.target.value as OperationalAssistanceType)}
                >
                  <option value="">Select assistance type…</option>
                  <option value="special_handling">Special Handling</option>
                  <option value="high_volume_dispatch">High-Volume Dispatch Coordination</option>
                  <option value="warehouse_coordination">Warehouse / Branch Coordination</option>
                </Select>
              </div>
            )}

            {/* Notes */}
            {form.category && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Additional context for the Operations team…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setFormOpen(false); setForm(emptyForm()); }}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!formValid() || submitting}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ── Address picker dialog ───────────────────────────────────────────── */}
      <Dialog
        open={addressPickerOpen}
        onClose={() => setAddressPickerOpen(false)}
        title="Select Address"
        size="lg"
      >
        <AddressBook
          mode="select"
          onSelectAddress={handleAddressPicked}
          onClose={() => setAddressPickerOpen(false)}
        />
      </Dialog>
    </div>
  );
}
