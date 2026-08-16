import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import {
  IconArrowLeft, IconCircleCheck, IconCircleX, IconAlertCircle, IconAlertTriangle,
  IconDownload, IconArrowRight, IconUpload, IconTruckDelivery, IconBuildingStore,
  IconMapPin, IconRefresh, IconInfoCircle, IconClock, IconPhone, IconTrash, IconX,
  IconExternalLink,
} from '@tabler/icons-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { PaymentMethodTabs, type SelectedPaymentMethod } from '../components/PaymentMethodTabs';
import { PayoutBankModal } from '../components/PayoutBankModal';
import { DROPOFF_LOCATIONS } from '../data/dropoffLocations';
import { isBillingAccount } from '../services/paymentService';
import { getBulkUploadById, getSpreadsheetBatchRows, updateUploadStatus, type SpreadsheetBatchRow } from '../services/bulkUploadService';
import { hasEligiblePayoutBank } from '../services/payoutBankService';
import { RECEPTACLE_SIZES, BULK_FIELD_LABELS as L } from '../data/bulkTemplate';
import {
  COD_MAX, isPosNum, isCustomParcelSize, customParcelDimErrors, addressAdvisory,
  duplicateReferenceKeys, CUSTOM_DIM_REQUIRED_MESSAGE, DUPLICATE_REF_MESSAGE,
} from '../lib/bookingValidation';
import { LocationCascadeCells } from '../components/LocationCascadeCells';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useUploadExitGuard } from '../hooks/useUploadExitGuard';

// ---------------------------------------------------------------------------
// Shared field styles for the editable review grid.
// ---------------------------------------------------------------------------

const TABLE_INPUT_BASE = 'w-full h-8 px-2 rounded-md border text-sm focus:outline-none focus:ring-1';
const TABLE_SELECT_CLS = 'w-full h-8 px-2 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';

// Compact inline text input. Supports a disabled/muted state (used for the
// dimweight fields when the parcel size is not Custom).
function ErrInput({ value, onChange, error, placeholder, disabled, onBlur }: {
  value: string; onChange: (v: string) => void; error: boolean;
  placeholder?: string; disabled?: boolean; onBlur?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? () => onBlur() : undefined}
      disabled={disabled}
      placeholder={placeholder}
      className={`${TABLE_INPUT_BASE} ${
        disabled
          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
          : error
            ? 'border-red-500 focus:ring-red-500 bg-red-50'
            : 'border-gray-300 focus:ring-primary'
      }`}
    />
  );
}

// Compact segmented Yes/No control used for COD?, Recipient Pays Fees, and
// Insure full item value?. Supports an unset state (value === '').
function YesNoToggle({ value, onChange, error = false }: {
  value: string; onChange: (v: string) => void; error?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-md border overflow-hidden ${error ? 'border-red-500' : 'border-gray-300'}`}>
      {['Yes', 'No'].map((opt, i) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 h-8 text-xs font-medium transition-colors ${i === 0 ? 'border-r border-gray-300' : ''} ${
              selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock data for the review screen
// ---------------------------------------------------------------------------

const VALID_ORDERS = [
  { recipient: 'Lia Santos',   itemName: 'UNO FLIP! Double Sided Card...', itemPrice: 600, feesPaidBy: 'Sender', fees: 120 },
  { recipient: 'Marco Alonzo', itemName: 'UNO FLIP! Double Sided Card...', itemPrice: 600, feesPaidBy: 'Sender', fees: 120 },
  { recipient: 'Tessa Cruz',   itemName: 'UNO FLIP! Double Sided Card...', itemPrice: 600, feesPaidBy: 'Sender', fees: 120 },
  { recipient: 'Rico Mendoza', itemName: 'UNO FLIP! Double Sided Card...', itemPrice: 600, feesPaidBy: 'Sender', fees: 120 },
  { recipient: 'Nina Reyes',   itemName: 'UNO FLIP! Double Sided Card...', itemPrice: 600, feesPaidBy: 'Sender', fees: 120 },
];
const TOTAL_VALID_INITIAL = 100;

// ---------------------------------------------------------------------------
// Review-row model — one editable row shape shared by BOTH the "Rows needing
// fixes" and "Needs review" sections, so the two surfaces use identical fields,
// labels, controls, and validation rules (the only difference is the messages
// shown and the row theme). `seedErrors` records the originally-detected
// required-field issues so they clear individually as the user edits.
// ---------------------------------------------------------------------------

interface ReviewRowData {
  row: number;
  seedErrors: string[];
  recipientName: string;
  mobileNumber: string;
  streetAddress: string;
  province: string;
  cityMunicipality: string;
  barangay: string;
  landmarks: string;
  itemName: string;
  pouchSize: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
  cod: string;
  codAmount: string;
  declaredValue: string;
  insureFull: string;
  recipientPaysFees: string;
  referenceId: string;
}

// 5 rows needing fixes (rows 3,4,7,8,9) + 5 rows needing review (rows 5,6,10–12).
// Fixes: missing required fields, invalid size, COD over cap, and Custom parcels
// with missing/partial dimensions. Needs review (valid, non-blocking): duplicate
// Reference IDs and present-but-suspicious street addresses.
const INITIAL_REVIEW_ROWS: ReviewRowData[] = [
  {
    row: 3,
    seedErrors: ['"Mobile" field is required', '"Pouch/box size" field is required', '"Insure full item value?" field is required'],
    recipientName: 'Jen Ramos', mobileNumber: '', streetAddress: '123 Penarubia St.',
    province: 'Metro Manila', cityMunicipality: 'Mandaluyong City', barangay: 'Malamig', landmarks: '–',
    itemName: 'UNO FLIP! Double Sided Card', pouchSize: '', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '599', insureFull: '', recipientPaysFees: 'No', referenceId: '',
  },
  {
    row: 4,
    seedErrors: ['Invalid pouch size', 'COD must not exceed ₱50,000.00'],
    recipientName: 'Rome Jans', mobileNumber: '+639101234567', streetAddress: '2287 Allegro Center, Chinatown',
    province: 'Metro Manila', cityMunicipality: 'Makati City', barangay: 'Bel-Air', landmarks: '–',
    itemName: 'UNO FLIP! Double Sided Card', pouchSize: 'SUPERSIZED', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'Yes', codAmount: '75000', declaredValue: '75000', insureFull: 'Yes', recipientPaysFees: 'No', referenceId: 'REF-004',
  },
  {
    row: 7,
    seedErrors: [],
    recipientName: 'Luz Fernandez', mobileNumber: '+639181234567', streetAddress: '45 Delgado St.',
    province: 'Metro Manila', cityMunicipality: 'Pasig City', barangay: 'Bagong Ilog', landmarks: '',
    itemName: 'Custom Package', pouchSize: 'CUSTOM', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '1500', insureFull: 'Yes', recipientPaysFees: 'No', referenceId: 'REF-007',
  },
  {
    row: 8,
    seedErrors: ['"Name" field is required', '"Street Address" field is required'],
    recipientName: '', mobileNumber: '+639170001122', streetAddress: '',
    province: 'Metro Manila', cityMunicipality: 'Taguig City', barangay: 'Ususan', landmarks: '–',
    itemName: 'Notebook Set', pouchSize: 'SMALL', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '450', insureFull: 'No', recipientPaysFees: 'No', referenceId: 'REF-008',
  },
  {
    row: 9,
    seedErrors: [],
    recipientName: 'Mateo Cruz', mobileNumber: '+639170002233', streetAddress: '88 Sampaguita St.',
    province: 'Metro Manila', cityMunicipality: 'Quezon City', barangay: 'Tandang Sora', landmarks: '',
    itemName: 'Gift Hamper', pouchSize: 'CUSTOM', lengthCm: '30', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '2000', insureFull: 'Yes', recipientPaysFees: 'No', referenceId: 'REF-005',
  },
  {
    row: 5,
    seedErrors: [],
    recipientName: 'Rome Jans', mobileNumber: '+639101234567', streetAddress: '2287 Allegro Center, Chinatown',
    province: 'Metro Manila', cityMunicipality: 'Makati City', barangay: 'Bel-Air', landmarks: '–',
    itemName: 'UNO FLIP! Double Sided Card', pouchSize: 'SMALL', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'Yes', codAmount: '500', declaredValue: '500', insureFull: 'No', recipientPaysFees: 'No', referenceId: 'REF-005',
  },
  {
    row: 6,
    seedErrors: [],
    recipientName: 'Romeo Jans', mobileNumber: '+639101234567', streetAddress: '2287 Allegro Center, Chinatown',
    province: 'Metro Manila', cityMunicipality: 'Makati City', barangay: 'Bel-Air', landmarks: '–',
    itemName: 'UNO FLIP! Double Sided Card', pouchSize: 'SMALL', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'Yes', codAmount: '500', declaredValue: '500', insureFull: 'No', recipientPaysFees: 'No', referenceId: 'REF-005',
  },
  {
    row: 10,
    seedErrors: [],
    recipientName: 'Carlo Reyes', mobileNumber: '+639170003344', streetAddress: 'Blk 5',
    province: 'Metro Manila', cityMunicipality: 'Pasay City', barangay: 'Barangay 76', landmarks: '',
    itemName: 'UNO FLIP! Double Sided Card', pouchSize: 'MEDIUM', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '650', insureFull: 'No', recipientPaysFees: 'No', referenceId: 'REF-010',
  },
  {
    row: 11,
    seedErrors: [],
    recipientName: 'Mara Lim', mobileNumber: '+639170004455', streetAddress: '123 Mainnnnnn Street',
    province: 'Metro Manila', cityMunicipality: 'Mandaluyong City', barangay: 'Plainview', landmarks: '',
    itemName: 'Board Game Night Bundle', pouchSize: 'LARGE', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '1200', insureFull: 'No', recipientPaysFees: 'No', referenceId: 'REF-011',
  },
  {
    row: 12,
    seedErrors: [],
    recipientName: 'Diego Santos', mobileNumber: '+639170005566', streetAddress: 'Purok',
    province: 'Metro Manila', cityMunicipality: 'Marikina City', barangay: 'Concepcion Uno', landmarks: '',
    itemName: 'Desk Organizer Set', pouchSize: 'BOX', lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
    cod: 'No', codAmount: '', declaredValue: '900', insureFull: 'No', recipientPaysFees: 'No', referenceId: 'REF-012',
  },
];

type EditableField =
  | 'recipientName' | 'mobileNumber' | 'streetAddress'
  | 'province' | 'cityMunicipality' | 'barangay' | 'landmarks'
  | 'itemName' | 'pouchSize' | 'lengthCm' | 'widthCm' | 'heightCm' | 'weightKg'
  | 'cod' | 'codAmount' | 'declaredValue'
  | 'insureFull' | 'recipientPaysFees' | 'referenceId';

type RowEdits = Record<EditableField, string>;

function rowToEdits(row: ReviewRowData): RowEdits {
  return {
    recipientName:     row.recipientName,
    mobileNumber:      row.mobileNumber,
    streetAddress:     row.streetAddress,
    province:          row.province,
    cityMunicipality:  row.cityMunicipality,
    barangay:          row.barangay,
    landmarks:         row.landmarks,
    itemName:          row.itemName,
    pouchSize:         row.pouchSize,
    lengthCm:          row.lengthCm,
    widthCm:           row.widthCm,
    heightCm:          row.heightCm,
    weightKg:          row.weightKg,
    cod:               row.cod,
    codAmount:         row.codAmount,
    declaredValue:     row.declaredValue,
    insureFull:        row.insureFull,
    recipientPaysFees: row.recipientPaysFees,
    referenceId:       row.referenceId,
  };
}

/**
 * Item Protection Fee. If insured for full value, a fee applies on the declared
 * value above the free ₱500 tier: Fee = (Declared Value − 500) × 0.01.
 */
function computeItemProtectionFee(edits: RowEdits): number {
  if (edits.insureFull !== 'Yes') return 0;
  const declared = parseFloat(edits.declaredValue.replace(/[^0-9.]/g, '')) || 0;
  if (declared <= 500) return 0;
  return parseFloat(((declared - 500) * 0.01).toFixed(2));
}

/**
 * Blocking errors for a row (these prevent the row from booking). Required-field
 * issues are gated on the originally-seeded errors so each clears individually as
 * the user edits; the deterministic rules (invalid size, COD cap, Custom dims)
 * are always live. Custom-dimension problems collapse to a single message; the
 * affected fields are highlighted separately via `fieldHasError`.
 */
function rowBlockingErrors(row: ReviewRowData, edits: RowEdits): string[] {
  const errs: string[] = [];
  const seeded = (frag: string) => row.seedErrors.some((e) => e.includes(frag));

  if (seeded('"Mobile"')         && !edits.mobileNumber.trim())  errs.push('"Mobile" field is required');
  if (seeded('"Name"')           && !edits.recipientName.trim()) errs.push('"Name" field is required');
  if (seeded('"Street Address"') && !edits.streetAddress.trim()) errs.push('"Street Address" field is required');
  if (seeded('Insure full item value') && !edits.insureFull.trim()) errs.push('"Insure full item value?" field is required');
  if (seeded('Pouch/box size')   && !edits.pouchSize.trim())     errs.push('"Pouch/box size" field is required');

  if (row.seedErrors.some((e) => e === 'Invalid pouch size')
    && !(RECEPTACLE_SIZES as readonly string[]).includes(edits.pouchSize)) {
    errs.push('Invalid pouch size');
  }

  if (seeded('COD must not exceed')) {
    const amt = parseFloat(edits.codAmount.replace(/[^0-9.]/g, ''));
    if (isNaN(amt) || amt > COD_MAX) errs.push(`COD must not exceed ₱${COD_MAX.toLocaleString()}.00`);
  }

  // Custom parcel dimensions (always live) — one combined message.
  if (Object.keys(customParcelDimErrors(edits.pouchSize, edits)).length > 0) {
    errs.push(CUSTOM_DIM_REQUIRED_MESSAGE);
  }

  return errs;
}

/** Whether a specific field should render in its error state. */
function fieldHasError(field: EditableField, row: ReviewRowData, edits: RowEdits): boolean {
  const isCustom = isCustomParcelSize(edits.pouchSize);
  const seeded = (frag: string) => row.seedErrors.some((e) => e.includes(frag));
  switch (field) {
    case 'mobileNumber':  return seeded('"Mobile"')         && !edits.mobileNumber.trim();
    case 'recipientName': return seeded('"Name"')           && !edits.recipientName.trim();
    case 'streetAddress': return seeded('"Street Address"') && !edits.streetAddress.trim();
    case 'insureFull':    return seeded('Insure full item value') && !edits.insureFull.trim();
    case 'pouchSize':
      if (seeded('Pouch/box size') && !edits.pouchSize.trim()) return true;
      if (row.seedErrors.some((e) => e === 'Invalid pouch size') && !(RECEPTACLE_SIZES as readonly string[]).includes(edits.pouchSize)) return true;
      return false;
    case 'codAmount': {
      if (!seeded('COD must not exceed')) return false;
      const n = parseFloat(edits.codAmount.replace(/[^0-9.]/g, ''));
      return isNaN(n) || n > COD_MAX;
    }
    case 'lengthCm':  return isCustom && !isPosNum(edits.lengthCm);
    case 'widthCm':   return isCustom && !isPosNum(edits.widthCm);
    case 'heightCm':  return isCustom && !isPosNum(edits.heightCm);
    case 'weightKg':  return isCustom && !isPosNum(edits.weightKg);
    default: return false;
  }
}

interface RowValidationState {
  blocking: string[];
  addressNote: string | null;
}

function validateRowState(row: ReviewRowData, edits: RowEdits): RowValidationState {
  return {
    blocking: rowBlockingErrors(row, edits),
    addressNote: addressAdvisory(edits.streetAddress),
  };
}

/** Recompute the cross-row duplicate Reference ID set from current edits. */
function computeDupRows(rows: ReviewRowData[], edits: Record<number, RowEdits>): Set<number> {
  const dupes = duplicateReferenceKeys(
    rows,
    (r) => r.row,
    (r) => (edits[r.row]?.referenceId ?? r.referenceId),
  );
  return new Set([...dupes].map((k) => Number(k)));
}

type SectionKey = 'fix' | 'review' | 'ready';

/** Which section a row belongs to, by priority: fixes → needs review → ready. */
function sectionFor(v: RowValidationState, isDuplicate: boolean): SectionKey {
  if (v.blocking.length > 0) return 'fix';
  if (isDuplicate || v.addressNote) return 'review';
  return 'ready';
}

/** Build the full section snapshot for a set of rows from their current edits. */
function computeSections(rows: ReviewRowData[], edits: Record<number, RowEdits>): Record<number, SectionKey> {
  const dup = computeDupRows(rows, edits);
  const out: Record<number, SectionKey> = {};
  rows.forEach((r) => {
    out[r.row] = sectionFor(validateRowState(r, edits[r.row] ?? rowToEdits(r)), dup.has(r.row));
  });
  return out;
}

/** Human-readable copy for each payment method type. */
function paymentCopy(method: SelectedPaymentMethod | null, billingAvailable: boolean): string {
  if (!method) return billingAvailable ? 'To be invoiced after service' : 'To be paid on pick-up';
  switch (method.type) {
    case 'billing':  return 'To be invoiced after service';
    case 'cash':     return method.cashOption === 'deduct' ? 'Deducted from COD collections' : 'To be paid on pick-up';
    case 'ewallet':  return `Payment completed — prepaid via ${method.wallet}`;
    case 'card':     return 'Payment completed — prepaid via card';
    case 'banking':  return method.bank ? `Payment completed — prepaid via ${method.bank}` : 'Payment completed — prepaid via online banking';
  }
}

// ---------------------------------------------------------------------------
// One editable review row — used by BOTH sections so fields/labels/controls are
// identical. `variant` only changes the issue column and the row accent.
// ---------------------------------------------------------------------------

/** A non-blocking review concern: full message + short label for secondary text. */
interface ReviewConcern { message: string; label: string; }

interface ReviewRowProps {
  row: ReviewRowData;
  edits: RowEdits;
  /** Section accent only (snapshot); does not change as the row is edited. */
  variant: 'fix' | 'review';
  /** Live blocking errors — shown red whichever section the row is in. */
  errors: string[];
  /** Live non-blocking concerns — amber (or secondary when errors are present). */
  concerns: ReviewConcern[];
  onEdit: (field: EditableField, value: string) => void;
  onLocation: (province: string, city: string, barangay: string) => void;
  onCommit: (patch?: Partial<RowEdits>) => void;
  onDelete: () => void;
}

function ReviewRow({ row, edits, variant, errors, concerns, onEdit, onLocation, onCommit, onDelete }: ReviewRowProps) {
  const fe = (f: EditableField) => fieldHasError(f, row, edits);
  const isCustom = isCustomParcelSize(edits.pouchSize);
  const dimsDisabled = !isCustom;
  const protectionFee = computeItemProtectionFee(edits);
  // Field-level hint for a present-but-suspicious address (only when nothing
  // blocking is on the street field). Independent of which section the row sits in.
  const addrSuspicious = !fe('streetAddress') && !!addressAdvisory(edits.streetAddress);
  // Discrete controls (size, Yes/No, location) commit immediately with the new
  // value so validation re-runs at once — e.g. switching off Custom clears the
  // dimension error without waiting for Revalidate changes.
  const commitEdit = (f: EditableField, v: string) => { onEdit(f, v); onCommit({ [f]: v }); };

  const rowTone = variant === 'fix'
    ? 'border-red-100 bg-white hover:bg-red-50/20'
    : 'border-amber-100 border-l-4 border-l-amber-300 bg-white hover:bg-amber-50/30';

  return (
    <tr className={`border-b ${rowTone} align-top`}>
      <td className="px-3 py-2.5"><span className="text-sm font-medium text-gray-900">{row.row}</span></td>

      {/* Issue column — LIVE: updates the instant the user edits, but never moves
          the row between sections. Blocking errors (red) take priority; otherwise
          remaining review concerns (amber). A resolved row shows no message until
          the user clicks Revalidate changes. */}
      <td className="px-3 py-2.5">
        {errors.length > 0 ? (
          <div className="space-y-1.5">
            <ul className="space-y-0.5">
              {errors.map((m, i) => (
                <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                  <span className="mt-0.5 shrink-0">•</span>{m}
                </li>
              ))}
            </ul>
            {concerns.length > 0 && (
              <p className="text-xs text-amber-600">
                Also review after fixing: {concerns.map((c) => c.label).join(', ')}
              </p>
            )}
          </div>
        ) : concerns.length > 0 ? (
          <ul className="space-y-0.5">
            {concerns.map((c, i) => (
              <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                <span className="mt-0.5 shrink-0">•</span>{c.message}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <ErrInput value={edits.recipientName} onChange={(v) => onEdit('recipientName', v)} onBlur={onCommit} error={fe('recipientName')} />
        {fe('recipientName') && <p className="text-xs text-red-600 mt-0.5">Name is required</p>}
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.mobileNumber} onChange={(v) => onEdit('mobileNumber', v)} onBlur={onCommit} error={fe('mobileNumber')} placeholder="e.g. +639170000000" />
        {fe('mobileNumber') && <p className="text-xs text-red-600 mt-0.5">Mobile is required</p>}
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.streetAddress} onChange={(v) => onEdit('streetAddress', v)} onBlur={onCommit} error={fe('streetAddress')} />
        {fe('streetAddress') && <p className="text-xs text-red-600 mt-0.5">Street Address is required</p>}
        {addrSuspicious && <p className="text-xs text-amber-600 mt-0.5">Review this address</p>}
      </td>

      <LocationCascadeCells
        province={edits.province}
        city={edits.cityMunicipality}
        barangay={edits.barangay}
        onChange={(p, c, b) => { onLocation(p, c, b); onCommit({ province: p, cityMunicipality: c, barangay: b }); }}
      />

      <td className="px-3 py-2.5">
        <ErrInput value={edits.landmarks} onChange={(v) => onEdit('landmarks', v)} onBlur={onCommit} error={false} placeholder="Optional" />
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.itemName} onChange={(v) => onEdit('itemName', v)} onBlur={onCommit} error={false} />
      </td>

      {/* Pouch/box size */}
      <td className="px-3 py-2.5">
        <select
          value={edits.pouchSize}
          onChange={(e) => commitEdit('pouchSize', e.target.value)}
          className={`${TABLE_SELECT_CLS} ${fe('pouchSize') ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`}
        >
          <option value="">Select size</option>
          {RECEPTACLE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {fe('pouchSize') && <p className="text-xs text-red-600 mt-0.5">Select a valid size</p>}
      </td>

      {/* Dimweight fields — enabled + required only for Custom; muted otherwise */}
      <td className="px-3 py-2.5">
        <ErrInput value={edits.lengthCm} onChange={(v) => onEdit('lengthCm', v)} onBlur={onCommit} error={fe('lengthCm')} disabled={dimsDisabled} placeholder={isCustom ? 'e.g. 30' : '—'} />
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.widthCm} onChange={(v) => onEdit('widthCm', v)} onBlur={onCommit} error={fe('widthCm')} disabled={dimsDisabled} placeholder={isCustom ? 'e.g. 20' : '—'} />
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.heightCm} onChange={(v) => onEdit('heightCm', v)} onBlur={onCommit} error={fe('heightCm')} disabled={dimsDisabled} placeholder={isCustom ? 'e.g. 15' : '—'} />
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.weightKg} onChange={(v) => onEdit('weightKg', v)} onBlur={onCommit} error={fe('weightKg')} disabled={dimsDisabled} placeholder={isCustom ? 'e.g. 2.5' : '—'} />
      </td>

      <td className="px-3 py-2.5">
        <YesNoToggle value={edits.cod} onChange={(v) => commitEdit('cod', v)} />
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.codAmount} onChange={(v) => onEdit('codAmount', v)} onBlur={onCommit} error={fe('codAmount')} placeholder="0.00" />
        {fe('codAmount') && <p className="text-xs text-red-600 mt-0.5">Exceeds ₱50,000 limit</p>}
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.declaredValue} onChange={(v) => onEdit('declaredValue', v)} onBlur={onCommit} error={false} placeholder="0.00" />
      </td>
      <td className="px-3 py-2.5">
        <YesNoToggle value={edits.insureFull} onChange={(v) => commitEdit('insureFull', v)} error={fe('insureFull')} />
        {fe('insureFull') && <p className="text-xs text-red-600 mt-0.5">Select Yes or No</p>}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-sm font-medium ${protectionFee > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
          ₱{protectionFee.toFixed(2)}
        </span>
        {edits.insureFull !== 'Yes' && <p className="text-xs text-gray-400 mt-0.5">Free ₱500 coverage</p>}
      </td>
      <td className="px-3 py-2.5">
        <YesNoToggle value={edits.recipientPaysFees} onChange={(v) => commitEdit('recipientPaysFees', v)} />
      </td>
      <td className="px-3 py-2.5">
        <ErrInput value={edits.referenceId} onChange={(v) => onEdit('referenceId', v)} onBlur={onCommit} error={false} placeholder="Optional" />
      </td>

      {/* Actions — every row is removable */}
      <td className="px-3 py-2.5">
        <button
          onClick={onDelete}
          title="Remove row from this batch"
          aria-label={`Remove row ${row.row}`}
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <IconTrash className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

/** Shared header row for both review grids. */
function ReviewGridHead({ issueLabel, theme }: { issueLabel: string; theme: 'red' | 'amber' }) {
  const head = theme === 'red' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  return (
    <thead className={`${head} border-b`}>
      <tr>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 w-12">Row</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[280px]">{issueLabel}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[160px]">{L.name}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[175px]">{L.mobile}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[200px]">{L.streetAddress}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[175px]">{L.province}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[190px]">{L.cityMunicipality}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[175px]">{L.barangay}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[210px]">{L.landmarks}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[185px]">{L.itemName}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[150px]">{L.pouchSize}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[120px]">
          {L.lengthCm}<span className="font-normal text-gray-400 block text-xs leading-tight">Custom size only</span>
        </th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[120px]">
          {L.widthCm}<span className="font-normal text-gray-400 block text-xs leading-tight">Custom size only</span>
        </th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[120px]">
          {L.heightCm}<span className="font-normal text-gray-400 block text-xs leading-tight">Custom size only</span>
        </th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[120px]">
          {L.weightKg}<span className="font-normal text-gray-400 block text-xs leading-tight">Custom size only</span>
        </th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[170px]">{L.cod}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[130px]">{L.codAmount}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[150px]">{L.declaredValue}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[150px]">{L.insureFull}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[145px]">
          Item Protection Fee
          <span className="font-normal text-gray-400 block text-xs leading-tight">Auto-calculated · (Declared − ₱500) × 1%</span>
        </th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[150px]">{L.recipientPaysFees}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[160px]">{L.referenceId}</th>
        <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2.5 min-w-[80px]">Actions</th>
      </tr>
    </thead>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkUploadSummary() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { getCurrentAccountName, getCurrentAccountId } = useSubAccounts();

  const activeAccountName = getCurrentAccountName();

  // Batch-filtered transactions deep link (opens in a new tab; uploader stays open).
  const txnUrl = `/dashboard/transactions?view=batches&batch=${encodeURIComponent(id ?? '')}`;

  // Billing eligibility (Contract Manager-owned in the end state).
  const [billingAvailable, setBillingAvailable] = useState(true);
  useEffect(() => {
    let active = true;
    isBillingAccount(activeAccountName)
      .then((b) => { if (active) setBillingAvailable(b); })
      .catch(() => { if (active) setBillingAvailable(true); });
    return () => { active = false; };
  }, [activeAccountName]);

  const [batchDate, setBatchDate] = useState('2026-05-19 10:30 AM');
  const [isSpreadsheet, setIsSpreadsheet] = useState(false);
  // Payment state: a successfully-processed batch that still needs payment opens
  // this same page as "Review and pay" — no fixes/needs-review, just pay.
  const [paymentMode, setPaymentMode] = useState(false);
  const [validBaseCount, setValidBaseCount] = useState(TOTAL_VALID_INITIAL);
  const [spreadsheetRows, setSpreadsheetRows] = useState<SpreadsheetBatchRow[]>([]);
  useEffect(() => {
    let active = true;
    getBulkUploadById(id ?? '')
      .then((record) => {
        if (!active || !record) return;
        setBatchDate(record.uploadedAt);
        if (record.status === 'awaiting-payment') {
          setPaymentMode(true);
          setValidBaseCount(record.validRows);
        }
        if (record.source === 'spreadsheet') {
          setIsSpreadsheet(true);
          setValidBaseCount(record.validRows);
          setSpreadsheetRows(getSpreadsheetBatchRows(record.id));
        }
      })
      .catch(() => { /* keep fallback date */ });
    return () => { active = false; };
  }, [id]);

  // ── Review-row state ──────────────────────────────────────────────────────
  const [rows, setRows] = useState<ReviewRowData[]>(INITIAL_REVIEW_ROWS);
  const [edits, setEdits] = useState<Record<number, RowEdits>>(() => {
    const init: Record<number, RowEdits> = {};
    INITIAL_REVIEW_ROWS.forEach((r) => { init[r.row] = rowToEdits(r); });
    return init;
  });
  // Always-current view of `edits` so an on-blur commit validates the latest typed
  // values (not a render-time snapshot) and never clobbers a concurrent field edit.
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const [validation, setValidation] = useState<Record<number, RowValidationState>>(() => {
    const init: Record<number, RowValidationState> = {};
    INITIAL_REVIEW_ROWS.forEach((r) => { init[r.row] = validateRowState(r, rowToEdits(r)); });
    return init;
  });
  const [dupRows, setDupRows] = useState<Set<number>>(() => {
    const initEdits: Record<number, RowEdits> = {};
    INITIAL_REVIEW_ROWS.forEach((r) => { initEdits[r.row] = rowToEdits(r); });
    return computeDupRows(INITIAL_REVIEW_ROWS, initEdits);
  });
  // Snapshot of each row's section. Only Revalidate (and delete/undo) changes it,
  // so editing a row never moves it out of the section the user is working in.
  const [sectionAssignment, setSectionAssignment] = useState<Record<number, SectionKey>>(() => {
    const initEdits: Record<number, RowEdits> = {};
    INITIAL_REVIEW_ROWS.forEach((r) => { initEdits[r.row] = rowToEdits(r); });
    return computeSections(INITIAL_REVIEW_ROWS, initEdits);
  });

  // Spreadsheet batches arrive pre-validated, and already-processed (payment)
  // batches have nothing to correct — neither shows the review grids.
  useEffect(() => {
    if (isSpreadsheet || paymentMode) { setRows([]); setDupRows(new Set()); setSectionAssignment({}); }
  }, [isSpreadsheet, paymentMode]);

  // Undo support for row deletion.
  const [undoState, setUndoState] = useState<{ row: ReviewRowData; edits: RowEdits; validation: RowValidationState; section: SectionKey } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => { setToast(null); setUndoState(null); }, 6000);
  };
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  // ── Booking / bottom section state ────────────────────────────────────────
  const [firstMile, setFirstMile] = useState<'pickup' | 'dropoff'>('pickup');
  const [pickupDate, setPickupDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [selectedPayment, setSelectedPayment] = useState<SelectedPaymentMethod | null>(null);
  const [showDropoffs, setShowDropoffs] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Exit protection — reaching this page means parsed upload data is already
  // in review, so the guard is armed for the whole page lifetime and only
  // released once the batch is successfully booked/paid.
  const reviewActiveRef = useRef(true);
  reviewActiveRef.current = !showSuccess;
  const exitGuard = useUploadExitGuard(reviewActiveRef);

  // COD payout-account guard — checked at final submission (Complete Booking),
  // the latest point the batch's COD content is fully known.
  const [showPayoutBankModal, setShowPayoutBankModal] = useState(false);

  // ── Live per-row info (messages) vs. snapshot section membership ──────────
  // The issue MESSAGES below are recomputed live from the current edits so they
  // update the instant a user edits a row. The SECTION a row sits in, however, is
  // a snapshot (`sectionAssignment`) that only changes on Revalidate / delete — so
  // a row a user is correcting never jumps, re-sorts, or disappears mid-edit.
  const rowInfo = (r: ReviewRowData) => {
    const e = edits[r.row] ?? rowToEdits(r);
    const v = validation[r.row] ?? validateRowState(r, e);
    const concerns: ReviewConcern[] = [];
    if (dupRows.has(r.row)) concerns.push({ message: DUPLICATE_REF_MESSAGE, label: 'Duplicate Reference ID' });
    if (v.addressNote) {
      concerns.push({
        message: v.addressNote,
        label: v.addressNote.toLowerCase().includes('incomplete') ? 'Incomplete street address' : 'Unusual street address',
      });
    }
    return { data: r, edits: e, blocking: v.blocking, concerns };
  };
  const fixList = rows.filter((r) => sectionAssignment[r.row] === 'fix').map(rowInfo);
  const reviewList = rows.filter((r) => sectionAssignment[r.row] === 'review').map(rowInfo);
  const readyFromFlagged = rows.filter((r) => sectionAssignment[r.row] === 'ready').length;

  // ── Derived totals (from the snapshot — recalculated on Revalidate/delete) ──
  const readyCount = validBaseCount + readyFromFlagged;
  // Everything bookable (ready + needs-review): the full batch you continue with.
  const totalValidCount = readyCount + reviewList.length;
  const shippingFee = 1200; // mock flat
  const totalItemProtectionFee = parseFloat(
    [...fixList, ...reviewList].filter((c) => c.blocking.length === 0)
      .reduce((sum, c) => sum + computeItemProtectionFee(c.edits), 0).toFixed(2),
  );
  const totalFees = shippingFee + totalItemProtectionFee;
  const canBook = totalValidCount > 0 && fixList.length === 0;

  const formatDate = (iso: string) => {
    if (!iso) return 'Tomorrow';
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const formattedPickup = formatDate(pickupDate);
  const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const updateEdit = (rowNum: number, field: EditableField, value: string) =>
    setEdits((prev) => ({ ...prev, [rowNum]: { ...prev[rowNum], [field]: value } }));

  const updateLocation = (rowNum: number, province: string, city: string, barangay: string) =>
    setEdits((prev) => ({
      ...prev,
      [rowNum]: { ...prev[rowNum], province, cityMunicipality: city, barangay },
    }));

  /**
   * Local per-row revalidation (on blur / control change) — no cross-row work, no
   * section movement. `override` carries the just-changed value for discrete
   * controls (parcel size, Yes/No, location) so they revalidate immediately; text
   * fields commit on blur and read the LATEST edits from the ref (never a stale
   * render snapshot, never overwriting another field). This only refreshes the
   * row's own inline messages — section membership stays put until Revalidate, and
   * the row/input elements are not recreated, so focus and cursor are preserved.
   */
  const commitRow = (rowNum: number, patch?: Partial<RowEdits>) => {
    setValidation((prev) => {
      const row = rows.find((r) => r.row === rowNum);
      if (!row) return prev;
      // Merge the just-changed value (patch) onto the LATEST edits — so a discrete
      // control validates with its new value while every other field keeps its
      // current typed value.
      const e = { ...(editsRef.current[rowNum] ?? rowToEdits(row)), ...(patch ?? {}) };
      return { ...prev, [rowNum]: validateRowState(row, e) };
    });
  };

  /**
   * Full batch revalidation. This is the ONLY action that reorganizes rows into
   * sections: it re-checks every row (incl. cross-row duplicate Reference IDs),
   * recomputes the snapshot section assignment, and the summary counts follow.
   */
  const handleRevalidate = () => {
    const nextValidation: Record<number, RowValidationState> = {};
    rows.forEach((r) => { nextValidation[r.row] = validateRowState(r, edits[r.row] ?? rowToEdits(r)); });
    const nextDup = computeDupRows(rows, edits);
    const nextSection: Record<number, SectionKey> = {};
    rows.forEach((r) => { nextSection[r.row] = sectionFor(nextValidation[r.row], nextDup.has(r.row)); });
    setValidation(nextValidation);
    setDupRows(nextDup);
    setSectionAssignment(nextSection);
  };

  /** Payment-state CTA — completes payment for an already-processed batch. */
  const handleContinueToPayment = () => {
    // Best-effort: mark the batch paid (session records only; seed rows are a no-op).
    if (id) updateUploadStatus(id, 'completed');
    setShowSuccess(true);
  };

  /**
   * Whether the batch being booked contains at least one COD row, from the
   * fix/needs-review rows' current edits (the parsed data available on this
   * page). Rows already booked as valid don't carry payment fields here.
   */
  const hasCodInBatch = rows.some((r) => (edits[r.row]?.cod ?? r.cod) === 'Yes');

  /**
   * Final-submission CTA for a fresh batch. COD content requires an eligible
   * payout bank account before booking can complete — gated here, the latest
   * point the batch's COD content is fully known and right before submission.
   */
  const handleCompleteBooking = async () => {
    if (hasCodInBatch && !(await hasEligiblePayoutBank(getCurrentAccountId()))) {
      setShowPayoutBankModal(true);
      return;
    }
    setShowSuccess(true);
  };

  const handleDelete = (rowNum: number) => {
    const removed = rows.find((r) => r.row === rowNum);
    if (!removed) return;
    const removedEdits = edits[rowNum] ?? rowToEdits(removed);
    const removedValidation = validation[rowNum] ?? validateRowState(removed, removedEdits);
    const removedSection = sectionAssignment[rowNum] ?? 'fix';

    const nextRows = rows.filter((r) => r.row !== rowNum);
    const nextEdits = { ...edits }; delete nextEdits[rowNum];
    setRows(nextRows);
    setEdits(nextEdits);
    setValidation((prev) => { const n = { ...prev }; delete n[rowNum]; return n; });
    setSectionAssignment((prev) => { const n = { ...prev }; delete n[rowNum]; return n; });
    // Removing a row can resolve a duplicate for its partner — recompute the live
    // message set. Other rows keep their section snapshot until Revalidate.
    setDupRows(computeDupRows(nextRows, nextEdits));

    setUndoState({ row: removed, edits: removedEdits, validation: removedValidation, section: removedSection });
    showToast(`Row ${rowNum} removed from this batch.`);
  };

  const handleUndo = () => {
    if (!undoState) return;
    const { row, edits: re, validation: rv, section } = undoState;
    const nextRows = [...rows, row].sort((a, b) => a.row - b.row);
    const nextEdits = { ...edits, [row.row]: re };
    setRows(nextRows);
    setEdits(nextEdits);
    setValidation((prev) => ({ ...prev, [row.row]: rv }));
    setSectionAssignment((prev) => ({ ...prev, [row.row]: section }));
    setDupRows(computeDupRows(nextRows, nextEdits));
    setUndoState(null);
    setToast(null);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/bulk-uploader')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Bulk Upload
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">{paymentMode ? 'Review and pay' : 'Review before booking'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Date uploaded: <span className="text-gray-700 font-medium">{batchDate}</span>
          &nbsp;·&nbsp;
          Batch ID: <span className="text-gray-700 font-medium">{id ?? 'UPLOAD-2026-05-19-001'}</span>
        </p>
        {paymentMode ? (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold text-blue-900">
              {totalValidCount} {totalValidCount === 1 ? 'booking' : 'bookings'} awaiting payment
            </p>
            <p className="text-xs text-blue-800 mt-0.5">
              Your upload was processed successfully. Review the delivery and payment details, then complete payment for this batch.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-1.5">
            {/* Lead with the positive ready-to-book count (restrained, not a banner). */}
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <IconCircleCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
              {readyCount} {readyCount === 1 ? 'row' : 'rows'} ready to book
            </p>
            {(fixList.length > 0 || reviewList.length > 0) && (
              <>
                <p className="text-sm text-gray-600">
                  {[
                    fixList.length > 0 ? `${fixList.length} ${fixList.length === 1 ? 'row needs' : 'rows need'} fixes` : null,
                    reviewList.length > 0 ? `${reviewList.length} ${reviewList.length === 1 ? 'row needs' : 'rows need'} review` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {fixList.length > 0 && (
                  <p className="text-sm text-gray-500">
                    Most of your upload is ready. Resolve the rows needing fixes, then you can continue with the full batch.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 1. Ready to book (valid orders) — always first, even with issues ── */}
      <Card className="border-green-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <IconCircleCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">
                  {paymentMode ? 'Bookings in this batch' : 'Ready to book'}
                </p>
                <p className="text-sm text-gray-500">
                  {paymentMode ? (
                    <>{totalValidCount} {totalValidCount === 1 ? 'booking' : 'bookings'} ready for payment.</>
                  ) : (
                    <>{readyCount} {readyCount === 1 ? 'order' : 'orders'} with no issues · created as <span className="font-medium text-gray-700">Awaiting payment</span>.</>
                  )}
                </p>
              </div>
            </div>
            <a
              href={txnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View all in Transactions
              <IconExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {!isSpreadsheet ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{L.name}</TableHead>
                      <TableHead>{L.itemName}</TableHead>
                      <TableHead className="text-right">Item Price</TableHead>
                      <TableHead>Fees paid by</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {VALID_ORDERS.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-gray-900">{row.recipient}</TableCell>
                        <TableCell className="text-gray-600">{row.itemName}</TableCell>
                        <TableCell className="text-right text-gray-900">₱{row.itemPrice.toLocaleString()}.00</TableCell>
                        <TableCell className="text-gray-600">{row.feesPaidBy}</TableCell>
                        <TableCell className="text-right text-gray-900">₱{row.fees}.00</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {readyCount > VALID_ORDERS.length && (
                <p className="text-center text-sm text-blue-600 mt-3 font-medium">
                  View all {readyCount} in transactions page
                </p>
              )}
            </>
          ) : spreadsheetRows.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{L.name}</TableHead>
                      <TableHead>{L.mobile}</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>{L.itemName}</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">{L.declaredValue}</TableHead>
                      <TableHead>{L.pouchSize}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spreadsheetRows.map((row, i) => {
                      const declared = Number(row.declaredValue);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-gray-900">{row.recipientName || '—'}</TableCell>
                          <TableCell className="text-gray-600">{row.recipientMobile || '—'}</TableCell>
                          <TableCell className="text-gray-600">{row.location || '—'}</TableCell>
                          <TableCell className="text-gray-600">{row.product}</TableCell>
                          <TableCell className="text-right text-gray-900">{row.quantity || '—'}</TableCell>
                          <TableCell className="text-right text-gray-900">
                            {row.declaredValue && !Number.isNaN(declared) ? peso(declared) : '—'}
                          </TableCell>
                          <TableCell className="text-gray-600">{row.parcelSize || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Showing {spreadsheetRows.length} {spreadsheetRows.length === 1 ? 'row' : 'rows'} entered in the in-app
                spreadsheet. Confirm the booking details below to complete booking.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {totalValidCount} valid {totalValidCount === 1 ? 'row' : 'rows'} from your spreadsheet
              {totalValidCount === 1 ? ' is' : ' are'} ready to book. Confirm the booking details below to
              complete booking — you can view them in Transactions afterwards.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Rows needing fixes (blocking) ── */}
      {!paymentMode && fixList.length > 0 && (
        <Card className="border-red-200">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <IconCircleX className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">Rows needing fixes</p>
                  <p className="text-sm text-gray-500">These rows cannot be uploaded until the listed issues are resolved.</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <IconDownload className="w-3.5 h-3.5 mr-1.5" />
                Download Failed Orders
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-red-200">
              <table className="w-full min-w-[3230px] border-collapse text-sm">
                <ReviewGridHead issueLabel="Issue" theme="red" />
                <tbody>
                  {fixList.map((c) => (
                    <ReviewRow
                      key={c.data.row}
                      row={c.data}
                      edits={c.edits}
                      variant="fix"
                      errors={c.blocking}
                      concerns={c.concerns}
                      onEdit={(f, v) => updateEdit(c.data.row, f, v)}
                      onLocation={(p, ci, b) => updateLocation(c.data.row, p, ci, b)}
                      onCommit={(patch) => commitRow(c.data.row, patch)}
                      onDelete={() => handleDelete(c.data.row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Needs review (non-blocking) ── */}
      {!paymentMode && reviewList.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <IconAlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Needs review</p>
                <p className="text-sm text-gray-500">These rows can still be uploaded. Review or edit them if needed.</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-amber-200">
              <table className="w-full min-w-[3230px] border-collapse text-sm">
                <ReviewGridHead issueLabel="Needs review" theme="amber" />
                <tbody>
                  {reviewList.map((c) => (
                    <ReviewRow
                      key={c.data.row}
                      row={c.data}
                      edits={c.edits}
                      variant="review"
                      errors={c.blocking}
                      concerns={c.concerns}
                      onEdit={(f, v) => updateEdit(c.data.row, f, v)}
                      onLocation={(p, ci, b) => updateLocation(c.data.row, p, ci, b)}
                      onCommit={(patch) => commitRow(c.data.row, patch)}
                      onDelete={() => handleDelete(c.data.row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Revalidation banner + CTA ── */}
      {!paymentMode && (fixList.length > 0 || reviewList.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <IconInfoCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              Edits validate as you go. Use <strong>Revalidate changes</strong> to re-check the whole batch,
              including cross-row checks like duplicate Reference IDs. Use the <strong>trash icon</strong> to
              remove a row from this batch (you can undo).
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            className="flex-shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
            onClick={handleRevalidate}
          >
            <IconRefresh className="w-3.5 h-3.5 mr-1.5" />
            Revalidate changes
          </Button>
        </div>
      )}

      {/* ── Bottom booking section ── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{paymentMode ? 'Delivery & Payment Details' : 'Confirm Booking Details'}</h2>
        <div className="grid md:grid-cols-3 gap-6">

          {/* Col 1 — Pickup / drop-off */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Pick-up options</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFirstMile('pickup')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${firstMile === 'pickup' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                <IconTruckDelivery className="w-4 h-4 shrink-0" />Pick-up
              </button>
              <button
                onClick={() => setFirstMile('dropoff')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${firstMile === 'dropoff' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                <IconBuildingStore className="w-4 h-4 shrink-0" />Drop-off
              </button>
            </div>

            {firstMile === 'pickup' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Complete your booking before 10:00 AM for same-day pick-up.</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pick-up Date</label>
                  <Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="h-8 text-sm" />
                </div>
                {pickupDate && (
                  <p className="text-sm text-gray-700 font-medium">
                    {formattedPickup}
                    <button onClick={() => setPickupDate('')} className="ml-2 text-xs text-blue-600 hover:text-blue-700">
                      Change pick-up date
                    </button>
                  </p>
                )}
              </div>
            )}

            {firstMile === 'dropoff' && (
              <div>
                <p className="text-sm text-gray-600">Drop off at any GoGo Xpress branch. No scheduling needed.</p>
                <button onClick={() => setShowDropoffs(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
                  <IconMapPin className="w-4 h-4" />
                  Check drop-off locations
                </button>
              </div>
            )}
          </div>

          {/* Col 2 — Payment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Choose how to pay for GoGo Xpress fees</h3>
            <PaymentMethodTabs
              key={activeAccountName}
              billingAvailable={billingAvailable}
              onPaymentMethodChange={setSelectedPayment}
            />
          </div>

          {/* Col 3 — Fee summary + CTA */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Summary</h3>
            <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Number of orders:</span>
                <span className="font-medium text-gray-900">{totalValidCount}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fees</p>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping Fee</span>
                  <span className="text-gray-900">₱{shippingFee.toLocaleString()}.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Item Protection Fee</span>
                  <span className={totalItemProtectionFee > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    {peso(totalItemProtectionFee)}
                  </span>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
                <span className="text-gray-900">Total fees:</span>
                <span className="text-blue-700 text-base">{peso(totalFees)}</span>
              </div>
              <p className="text-xs text-gray-500">{paymentCopy(selectedPayment, billingAvailable)}</p>
            </div>
            <Button className="w-full" disabled={!canBook} onClick={paymentMode ? handleContinueToPayment : handleCompleteBooking}>
              {paymentMode ? 'Continue to payment' : 'Complete Booking'}
            </Button>
            {!paymentMode && fixList.length > 0 ? (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <IconAlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Resolve the {fixList.length} {fixList.length === 1 ? 'row' : 'rows'} needing fixes before booking.
              </p>
            ) : totalValidCount === 0 ? (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <IconAlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                No valid orders to book.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Drop-off locations dialog ── */}
      <Dialog open={showDropoffs} onClose={() => setShowDropoffs(false)} size="md" title="Drop-off locations">
        <p className="text-sm text-gray-500 mb-4">Bring your parcels to any of these GoGo Xpress branches.</p>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {DROPOFF_LOCATIONS.map((loc) => (
            <div key={loc.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <IconMapPin className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{loc.address}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><IconPhone className="w-3 h-3" />{loc.contact}</span>
                    <span className="inline-flex items-center gap-1"><IconClock className="w-3 h-3" />{loc.hours}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="outline" size="sm" onClick={() => setShowDropoffs(false)}>Close</Button>
        </div>
      </Dialog>

      {/* ── Booking success dialog ── */}
      <Dialog open={showSuccess} onClose={() => {}} size="sm">
        <div className="text-center space-y-4 py-2">
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">{paymentMode ? 'Payment Complete' : 'Your Booking is Complete'}</h3>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <IconCircleCheck className="w-9 h-9 text-green-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">
              {paymentMode
                ? `Payment received for ${totalValidCount} ${totalValidCount === 1 ? 'booking' : 'bookings'}`
                : `${totalValidCount} ${totalValidCount === 1 ? 'order' : 'orders'} scheduled for ${firstMile === 'pickup' ? 'pick-up' : 'drop-off'}`}
            </p>
            {!paymentMode && firstMile === 'pickup' && pickupDate && (
              <p className="text-sm text-gray-600 mt-1">
                Est. Pick-up Date: <span className="font-medium">{formattedPickup}</span>
              </p>
            )}
            <p className="text-sm text-gray-600 mt-0.5">
              {paymentMode ? (
                <>Payment for this batch — {paymentCopy(selectedPayment, billingAvailable)}:&nbsp;
                  <span className="font-semibold text-gray-900">{peso(totalFees)}</span></>
              ) : (
                <>Created as <span className="font-medium text-gray-900">Awaiting payment</span> — {paymentCopy(selectedPayment, billingAvailable)}:&nbsp;
                  <span className="font-semibold text-gray-900">{peso(totalFees)}</span></>
              )}
            </p>
          </div>
          <div className="space-y-2.5 pt-1">
            <Button className="w-full" onClick={() => navigate('/dashboard/bulk-uploader')}>
              <IconUpload className="w-4 h-4 mr-2" />
              Upload Another Batch
            </Button>
            <a
              href={txnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View transactions
              <IconExternalLink className="w-4 h-4" />
            </a>
            <Link to="/dashboard" className="block w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700 py-1">
              Go to Home
            </Link>
          </div>
        </div>
      </Dialog>

      {/* ── Undo toast (row deletion) ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] max-w-sm">
          <div className="flex items-center gap-3 rounded-xl bg-gray-900 text-white shadow-xl px-4 py-3">
            <IconTrash className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <p className="text-sm flex-1">{toast}</p>
            {undoState && (
              <button onClick={handleUndo} className="text-sm font-semibold text-blue-300 hover:text-blue-200">
                Undo
              </button>
            )}
            <button onClick={() => { setToast(null); setUndoState(null); }} className="text-gray-400 hover:text-white" aria-label="Dismiss">
              <IconX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── COD payout-account guard — opened in place of booking success ── */}
      <PayoutBankModal
        open={showPayoutBankModal}
        accountId={getCurrentAccountId()}
        onClose={() => setShowPayoutBankModal(false)}
        onEnrolled={() => { setShowPayoutBankModal(false); setShowSuccess(true); }}
        title="Add a payout bank account"
        description="Your upload contains COD transactions. Add a payout bank account so we have somewhere to send your COD collections."
      />

      {/* ── Exit protection — in-app navigation away from this review page ── */}
      {exitGuard.state === 'blocked' && (
        <ConfirmDialog
          open
          onClose={() => exitGuard.reset()}
          onConfirm={() => exitGuard.proceed()}
          title="Leave bulk upload?"
          description="Your current upload progress will be lost if you leave this page."
          cancelLabel="Continue upload"
          confirmLabel="Leave uploader"
          variant="destructive"
        />
      )}
    </div>
  );
}
