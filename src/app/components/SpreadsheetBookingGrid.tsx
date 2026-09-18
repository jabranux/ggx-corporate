import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPlus, IconCopy, IconTrash, IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { cn } from '../lib/utils';
import { LocationCascadeCells } from './LocationCascadeCells';
import { ProductAttachDialog } from './ProductAttachDialog';
import {
  BOOKING_COLUMNS, ROW_NUMBER_WIDTH, ROW_ACTIONS_WIDTH, makeEmptyRow, validateRows,
  attachmentSubtotal, attachmentTotalQty,
  type BookingRow, type BookingField, type RowsValidationResult,
  type AttachedProduct, type ProductAvailability,
} from '../lib/bookingValidation';
import type { InventoryProduct } from '../services/inventoryService';

/** Extra column for the Custom-size dimensions editor (not a BookingField). */
const DIMS_COL_WIDTH = 180;

/** Total fixed table width (px) — forces horizontal scroll on narrow viewports. */
const TABLE_WIDTH =
  ROW_NUMBER_WIDTH + ROW_ACTIONS_WIDTH + DIMS_COL_WIDTH +
  BOOKING_COLUMNS.reduce((sum, c) => sum + c.width, 0);

export interface GridValidationState extends RowsValidationResult {
  rows: BookingRow[];
}

/** Compact editable summary label for a row that has Custom dimensions filled in. */
function dimsLabel(row: BookingRow): string {
  const l = row.lengthCm.trim();
  const w = row.widthCm.trim();
  const h = row.heightCm.trim();
  const wt = row.weightKg.trim();
  if (!l || !w || !h || !wt) return '';
  return `${l} × ${w} × ${h} cm · ${wt} kg`;
}

/** True when s is a non-empty string representing a strictly positive number. */
const isPosNum = (s: string) => {
  const n = Number(s.trim());
  return s.trim() !== '' && !Number.isNaN(n) && n > 0;
};

/**
 * "Type in Spreadsheet" editable grid — an INPUT METHOD inside Bulk Booking
 * (not a separate module). Reuses the shared validation pipeline
 * (lib/bookingValidation) so it applies the same rules as the uploaded-file path,
 * and the GGX-supported location cascade for province/city/barangay.
 *
 * The grid is intake-only: it reports its live validation state via
 * `onValidationChange` so the page can show counts, fee estimates, and own the
 * final review/confirm CTA. "Add row" sits at the bottom-left (where the user
 * naturally reaches the end of entered rows).
 *
 * When Inventory is enabled for the scope (`inventoryEnabled` + `products`), the
 * Product / SKU cell becomes a product picker: attach one or more products per
 * row (compact "chip + N more" summary), which auto-fills Qty (total items) and
 * Declared value (subtotal) and re-validates stock live — no draft-stage
 * deduction. See docs/spreadsheet_booking_rules.md + docs/inventory_rules.md.
 *
 * Custom parcel size: instead of adding four permanent dimension/weight columns
 * (which makes the sheet very wide), each Custom row shows an inline
 * "Enter dimensions" button in a dedicated Dimensions column. Clicking opens a
 * compact dialog; once filled the cell shows a compact summary (L × W × H cm ·
 * Wt kg) that can be clicked again to edit. Switching away from Custom clears
 * the dimension values and reverts to normal parcel-size pricing.
 */
export function SpreadsheetBookingGrid({
  onValidationChange,
  inventoryEnabled = false,
  products = [],
  metroOnly = false,
}: {
  onValidationChange?: (state: GridValidationState) => void;
  /** When true, the Product / SKU cell attaches Inventory products (vs free text). */
  inventoryEnabled?: boolean;
  /** Scope's inventory products (used for attachment + live stock validation). */
  products?: InventoryProduct[];
  /** When true (Same-Day / On-Demand), non-Metro-Manila provinces are flagged. */
  metroOnly?: boolean;
}) {
  const nextId = useRef(4);
  const [rows, setRows] = useState<BookingRow[]>(() => [
    makeEmptyRow('row-1'), makeEmptyRow('row-2'), makeEmptyRow('row-3'),
  ]);
  // Row whose product picker is open (null = closed).
  const [attachRowId, setAttachRowId] = useState<string | null>(null);
  // Row whose Custom dimensions editor is open (null = closed).
  const [dimEditRowId, setDimEditRowId] = useState<string | null>(null);
  // Draft state inside the dimensions dialog.
  const [dimDraft, setDimDraft] = useState({ l: '', w: '', h: '', wt: '' });
  // Rows where codAmount has been manually edited — once dirty we stop auto-syncing.
  const codDirtyRows = useRef<Set<string>>(new Set());

  // Live availability index for attached-product validation (stock + status).
  const productIndex = useMemo(() => {
    const m = new Map<string, ProductAvailability>();
    for (const p of products) {
      // ProductAvailability's status vocabulary is a simplified 'active' |
      // 'inactive' (booking-attachment concern only) — the backend's richer
      // 'draft' | 'active' | 'archived' collapses to 'inactive' for anything
      // that isn't sellable. A variant-carrying product's OWN stockQuantity
      // doesn't reflect real per-variant availability (same reasoning as
      // `ProductAttachDialog.tsx`'s `stockCap`) — treated as unlimited here
      // too, so a previously-attached variant product's row is never
      // incorrectly flagged as out of stock against its base row's own count.
      m.set(p.id, { stockQuantity: (p.unlimitedStock || p.hasVariants) ? Infinity : p.stockQuantity, status: p.status === 'active' ? 'active' : 'inactive' });
    }
    return m;
  }, [products]);

  const result = useMemo(
    () => validateRows(rows, inventoryEnabled ? productIndex : undefined, { metroOnly }),
    [rows, inventoryEnabled, productIndex, metroOnly],
  );
  const { validations, validRows, invalidRows, emptyCount } = result;

  // Report live validation state upward (page shows counts/fees + owns the CTA).
  // Intentionally excludes onValidationChange from deps to avoid a re-render loop
  // if the parent passes an inline callback — it only fires when data changes.
  useEffect(() => {
    onValidationChange?.({ ...result, rows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, rows]);

  const genId = () => `row-${nextId.current++}`;

  const updateCell = (rowId: string, field: BookingField, value: string) => {
    if (field === 'parcelSize' && value.toUpperCase() !== 'CUSTOM') {
      // Clear dimension/weight values when switching away from Custom size so
      // stale dims don't affect pricing or payload if the user switches back.
      setRows((prev) => prev.map((r) => r.id === rowId
        ? { ...r, parcelSize: value, lengthCm: '', widthCm: '', heightCm: '', weightKg: '' }
        : r
      ));
    } else if (field === 'codAmount') {
      codDirtyRows.current.add(rowId);
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, codAmount: value } : r)));
    } else if (field === 'declaredValue') {
      setRows((prev) => prev.map((r) => {
        if (r.id !== rowId) return r;
        const next: BookingRow = { ...r, declaredValue: value };
        // When products are attached, codAmount tracks the subtotal (set by
        // setRowProducts), not the manually-edited declared value.
        if (!codDirtyRows.current.has(rowId) && !r.products?.length) next.codAmount = value;
        return next;
      }));
    } else {
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
    }
  };

  const updateRowFields = (rowId: string, partial: Partial<BookingRow>) =>
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...partial } : r)));

  // Attach products to a row: Qty (total items) + Declared value (subtotal) are
  // derived from the selection and locked; clearing it restores manual entry.
  // codAmount syncs with the subtotal unless the user has manually edited it.
  const setRowProducts = (rowId: string, attached: AttachedProduct[]) =>
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      if (attached.length === 0) {
        codDirtyRows.current.delete(rowId);
        const next = { ...r, quantity: '', declaredValue: '', codAmount: '' };
        delete next.products;
        return next;
      }
      const subtotal = String(attachmentSubtotal(attached));
      const next: BookingRow = {
        ...r,
        products: attached,
        quantity: String(attachmentTotalQty(attached)),
        declaredValue: subtotal,
      };
      if (!codDirtyRows.current.has(rowId)) next.codAmount = subtotal;
      return next;
    }));

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow(genId())]);

  const duplicateRow = (rowId: string) =>
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId);
      if (idx === -1) return prev;
      const newId = genId();
      const copy = { ...prev[idx], id: newId };
      if (codDirtyRows.current.has(rowId)) codDirtyRows.current.add(newId);
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });

  const deleteRow = (rowId: string) => {
    codDirtyRows.current.delete(rowId);
    setRows((prev) => (prev.length === 1 ? [makeEmptyRow(genId())] : prev.filter((r) => r.id !== rowId)));
  };

  // Paste from Excel/Google Sheets: a TSV block fills cells starting at the
  // focused cell, creating rows as needed.
  const handlePaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    e.preventDefault();
    const matrix = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      matrix.forEach((cells, r) => {
        const targetIndex = rowIndex + r;
        while (next.length <= targetIndex) next.push(makeEmptyRow(genId()));
        cells.forEach((val, c) => {
          const col = BOOKING_COLUMNS[colIndex + c];
          if (col) next[targetIndex][col.key] = val.trim();
        });
      });
      return next;
    });
  };

  // ── Custom dimensions dialog ────────────────────────────────────────────────

  const openDimEditor = (row: BookingRow) => {
    setDimDraft({ l: row.lengthCm, w: row.widthCm, h: row.heightCm, wt: row.weightKg });
    setDimEditRowId(row.id);
  };

  const saveDims = () => {
    if (!dimEditRowId) return;
    updateRowFields(dimEditRowId, {
      lengthCm: dimDraft.l,
      widthCm:  dimDraft.w,
      heightCm: dimDraft.h,
      weightKg: dimDraft.wt,
    });
    setDimEditRowId(null);
  };

  const canSaveDims = isPosNum(dimDraft.l) && isPosNum(dimDraft.w) && isPosNum(dimDraft.h) && isPosNum(dimDraft.wt);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="border-collapse text-xs table-fixed" style={{ width: TABLE_WIDTH, minWidth: TABLE_WIDTH }}>
          <colgroup>
            <col style={{ width: ROW_NUMBER_WIDTH }} />
            {BOOKING_COLUMNS.flatMap((col) => {
              const base = <col key={col.key} style={{ width: col.width }} />;
              if (col.key === 'parcelSize') {
                return [base, <col key="dims" style={{ width: DIMS_COL_WIDTH }} />];
              }
              return [base];
            })}
            <col style={{ width: ROW_ACTIONS_WIDTH }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 text-gray-400 font-medium text-center">#</th>
              {BOOKING_COLUMNS.flatMap((col) => {
                const th = (
                  <th key={col.key} className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                    {col.label}
                  </th>
                );
                if (col.key === 'parcelSize') {
                  return [th, (
                    <th key="dims" className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                      Dimensions
                    </th>
                  )];
                }
                return [th];
              })}
              <th className="px-2 py-2 text-center text-gray-400 font-medium">Row</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const v = validations[row.id];
              const rowInvalid = v && !v.isEmpty && !v.isValid;
              return (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 text-center text-gray-400">{rIdx + 1}</td>
                  {BOOKING_COLUMNS.flatMap((col, cIdx) => {
                    // Province/City/Barangay render as the GGX location cascade
                    // (3 cells) at the province column; skip the other two.
                    if (col.key === 'city' || col.key === 'barangay') return [null];
                    if (col.key === 'province') {
                      return [(
                        <LocationCascadeCells
                          key="location"
                          compact
                          province={row.province}
                          city={row.city}
                          barangay={row.barangay}
                          onChange={(p, c, b) => updateRowFields(row.id, { province: p, city: c, barangay: b })}
                          errors={{
                            province: !!v?.errors.province,
                            city: !!v?.errors.city,
                            barangay: !!v?.errors.barangay,
                          }}
                        />
                      )];
                    }

                    const err = v?.errors[col.key];

                    // Product / SKU: attach Inventory products when enabled,
                    // otherwise the existing free-text cell.
                    if (col.key === 'productSku' && inventoryEnabled) {
                      const attached = row.products ?? [];
                      return [(
                        <td key={col.key} className="px-1 py-1 align-top" title={err}>
                          <button
                            type="button"
                            onClick={() => setAttachRowId(row.id)}
                            className={cn(
                              'w-full min-h-8 px-2 py-1 rounded border bg-white text-left text-xs flex items-center gap-1.5 hover:bg-gray-50 cursor-pointer',
                              err ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200',
                            )}
                          >
                            {attached.length === 0 ? (
                              <span className="text-gray-400 flex items-center gap-1">
                                <IconPlus className="w-3.5 h-3.5" /> Attach products
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="inline-block rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 truncate max-w-[160px]">
                                  {attached[0].name}
                                </span>
                                {attached.length > 1 && (
                                  <span className="text-gray-500 whitespace-nowrap">+{attached.length - 1} more</span>
                                )}
                              </span>
                            )}
                          </button>
                          {err && <p className="text-[10px] leading-tight text-red-600 mt-0.5">{err}</p>}
                        </td>
                      )];
                    }

                    // parcelSize: render the size select + the Custom dimensions
                    // interaction cell together. Switching to Custom activates the
                    // dims cell; switching away clears stored dims and hides it.
                    if (col.key === 'parcelSize') {
                      const isCustomRow = row.parcelSize.trim().toUpperCase() === 'CUSTOM';
                      const dimsHasError = isCustomRow && (
                        !!v?.errors.lengthCm || !!v?.errors.widthCm ||
                        !!v?.errors.heightCm || !!v?.errors.weightKg
                      );
                      const summary = isCustomRow ? dimsLabel(row) : '';
                      return [
                        <td key={col.key} className="px-1 py-1 align-top" title={err}>
                          <select
                            value={row.parcelSize}
                            onChange={(e) => updateCell(row.id, 'parcelSize', e.target.value)}
                            onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                            className={cn(
                              'w-full h-8 px-2 rounded border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                              err ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200',
                            )}
                          >
                            <option value="">—</option>
                            {col.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>,
                        <td key="customDims" className="px-1 py-1 align-top">
                          {isCustomRow ? (
                            <button
                              type="button"
                              onClick={() => openDimEditor(row)}
                              title={
                                dimsHasError
                                  ? 'Dimensions required for Custom size — click to enter'
                                  : summary
                                    ? 'Click to edit dimensions'
                                    : 'Click to enter dimensions'
                              }
                              className={cn(
                                'w-full min-h-8 px-2 py-1 rounded border text-xs text-left leading-snug',
                                dimsHasError
                                  ? 'border-red-400 bg-red-50 text-red-600 ring-1 ring-red-300'
                                  : summary
                                    ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                    : 'border-dashed border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100',
                              )}
                            >
                              {summary || (
                                <span className="flex items-center gap-1">
                                  <IconPlus className="w-3 h-3 shrink-0" />
                                  Enter dimensions
                                </span>
                              )}
                            </button>
                          ) : null}
                        </td>,
                      ];
                    }

                    // Qty is derived (locked) when products are attached.
                    // Declared value is pre-filled from the subtotal but stays editable.
                    const derived =
                      inventoryEnabled && !!row.products?.length &&
                      col.key === 'quantity';
                    const common = cn(
                      'w-full h-8 px-2 rounded border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                      err ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200',
                      derived && 'bg-gray-50 text-gray-500 cursor-not-allowed',
                    );
                    return [(
                      <td
                        key={col.key}
                        className="px-1 py-1 align-top"
                        title={derived ? 'Set by attached products' : err}
                      >
                        {col.options ? (
                          <select
                            value={row[col.key]}
                            onChange={(e) => updateCell(row.id, col.key, e.target.value)}
                            onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                            className={common}
                          >
                            <option value="">—</option>
                            {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={row[col.key]}
                            disabled={derived}
                            onChange={(e) => updateCell(row.id, col.key, e.target.value)}
                            onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                            className={common}
                          />
                        )}
                      </td>
                    )];
                  })}
                  <td className="px-2 py-1">
                    <div className="flex items-center justify-center gap-1">
                      {!v?.isEmpty && (rowInvalid
                        ? <IconAlertCircle className="w-3.5 h-3.5 text-red-500" />
                        : <IconCircleCheck className="w-3.5 h-3.5 text-emerald-500" />)}
                      <button onClick={() => duplicateRow(row.id)} title="Duplicate row"
                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer">
                        <IconCopy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteRow(row.id)} title="Delete row"
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add row sits at the bottom-left, where the user reaches the end of rows. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={addRow}>
          <IconPlus className="w-4 h-4" /> Add row
        </Button>
        <span className="text-xs text-gray-500">
          Tip: {inventoryEnabled ? 'attach products from Inventory or ' : ''}paste rows directly from Excel or Google Sheets. {validRows.length} valid · {invalidRows.length} need fixing
          {emptyCount > 0 ? ` · ${emptyCount} empty` : ''}
        </span>
      </div>

      {inventoryEnabled && attachRowId && (
        <ProductAttachDialog
          open
          onClose={() => setAttachRowId(null)}
          products={products}
          initial={rows.find((r) => r.id === attachRowId)?.products ?? []}
          onConfirm={(sel) => { setRowProducts(attachRowId, sel); setAttachRowId(null); }}
        />
      )}

      {/* Custom dimensions editor — opens when a row's Pouch/Box Size is Custom. */}
      {dimEditRowId && (
        <Dialog
          open
          onClose={() => setDimEditRowId(null)}
          size="sm"
          title="Custom Dimensions"
        >
          <p className="text-sm text-gray-500 mb-4">
            Custom parcels use dimensional-weight pricing. Chargeable weight is the higher of
            actual weight and volumetric weight (L × W × H ÷ 5000).
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { label: 'Length (cm)', val: dimDraft.l, set: (v: string) => setDimDraft((d) => ({ ...d, l: v })), ph: 'e.g. 30' },
                { label: 'Width (cm)',  val: dimDraft.w, set: (v: string) => setDimDraft((d) => ({ ...d, w: v })), ph: 'e.g. 20' },
                { label: 'Height (cm)', val: dimDraft.h, set: (v: string) => setDimDraft((d) => ({ ...d, h: v })), ph: 'e.g. 15' },
                { label: 'Weight (kg)', val: dimDraft.wt, set: (v: string) => setDimDraft((d) => ({ ...d, wt: v })), ph: 'e.g. 2.5' },
              ] as const
            ).map(({ label, val, set, ph }) => {
              const hasContent = val.trim() !== '';
              const invalid = hasContent && !isPosNum(val);
              return (
                <div key={label}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder={ph}
                    className={cn(
                      'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2',
                      invalid
                        ? 'border-red-400 focus:ring-red-400 bg-red-50'
                        : 'border-gray-300 focus:ring-blue-500',
                    )}
                  />
                  {invalid && (
                    <p className="text-[11px] text-red-500 mt-0.5">Must be greater than zero</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDimEditRowId(null)}>Cancel</Button>
            <Button size="sm" disabled={!canSaveDims} onClick={saveDims}>Save</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
