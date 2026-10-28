import { useRef } from 'react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconShieldCheck,
  IconShieldFilled,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';
import { POUCH_OPTIONS, type ItemState } from '../../lib/basicBookingTypes';
import { cn } from '../../lib/utils';

interface Props {
  open: boolean;
  state: ItemState;
  onChange: (patch: Partial<ItemState>) => void;
  errors: Record<string, boolean>;
  onSave: () => void;
  onClose: () => void;
  saveLabel?: string;
}

export function BasicItemDetailsDrawer({ open, state, onChange, errors, onSave, onClose, saveLabel }: Props) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollPouch = (dir: -1 | 1) =>
    carouselRef.current?.scrollBy({ left: dir * 148, behavior: 'smooth' });

  const protectionFee =
    state.itemProtection === 'full' && state.cod
      ? Math.round(Math.max(Number(state.codAmount) - 500, 0) * 0.01)
      : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.38)',
          backdropFilter: open ? 'blur(3px)' : 'none',
          WebkitBackdropFilter: open ? 'blur(3px)' : 'none',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed z-50 w-full max-w-[var(--basic-shell-max,none)] rounded-t-[28px]"
        style={{
          bottom: 0,
          left: '50%',
          transform: open ? 'translateX(-50%)' : 'translateX(-50%) translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          background: 'rgba(245,249,255,0.97)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          boxShadow: '0 -10px 50px rgba(40,70,120,0.18)',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 flex justify-center pt-3 pb-0.5" style={{ background: 'rgba(245,249,255,0.97)' }}>
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="sticky top-[22px] z-10 flex items-center justify-between px-5 py-2.5" style={{ background: 'rgba(245,249,255,0.97)' }}>
          <p className="text-base font-bold text-gray-900">Item Details</p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer"
          >
            <IconX className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-8 space-y-5 pt-1">
          {/* Item name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Item name <span className="text-red-400">*</span>
            </label>
            <input
              className={cn(
                'w-full rounded-xl border bg-white px-3 py-2.5 text-sm placeholder-gray-300 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400',
                errors.itemName ? 'border-red-400' : 'border-gray-200',
              )}
              placeholder="Enter item name"
              value={state.itemName}
              onChange={(e) => onChange({ itemName: e.target.value })}
            />
            {errors.itemName && <p className="mt-0.5 text-[10px] text-red-400">Required</p>}
          </div>

          {/* Pouch size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Select pouch size</label>
              <div className="flex gap-1">
                <button
                  onClick={() => scrollPouch(-1)}
                  className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center cursor-pointer"
                >
                  <IconChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <button
                  onClick={() => scrollPouch(1)}
                  className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center cursor-pointer"
                >
                  <IconChevronRight className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>
            <div
              ref={carouselRef}
              className="flex gap-2.5 overflow-x-auto scrollbar-none"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {POUCH_OPTIONS.map((opt) => {
                const sel = state.pouchSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => onChange({ pouchSize: opt.key })}
                    style={{ scrollSnapAlign: 'start' }}
                    className={cn(
                      'flex flex-col items-center flex-shrink-0 w-[128px] rounded-2xl border p-2.5 transition-all cursor-pointer',
                      sel
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                        : 'border-gray-200 bg-white hover:border-blue-200',
                    )}
                  >
                    <span className="text-2xl mb-1">📦</span>
                    <p className={cn('text-xs font-bold text-center leading-snug', sel ? 'text-blue-800' : 'text-gray-700')}>
                      {opt.label}
                    </p>
                    <p className="text-[9px] text-gray-400 text-center">{opt.dims}</p>
                    <p className="text-[9px] text-gray-400 text-center">Max {opt.maxWt}</p>
                    <p className={cn('mt-1.5 text-sm font-bold', sel ? 'text-blue-700' : 'text-gray-600')}>
                      ₱{opt.price}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 rounded-xl bg-blue-50 border border-blue-100 p-3">
              <p className="text-[10px] text-blue-700 leading-relaxed">
                • Our rider will provide you a printed waybill, and your selected pouch or box on pickup.<br />
                • For <strong>Oversized</strong>, kindly use your <strong>own packaging</strong> not exceeding 1 meter in diameter.
              </p>
            </div>
          </div>

          {/* COD */}
          <div
            className={cn(
              'rounded-2xl border p-3.5',
              state.cod ? 'border-blue-300/60 bg-blue-50/60' : 'border-gray-200 bg-white',
            )}
          >
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.cod}
                onChange={(e) =>
                  onChange({ cod: e.target.checked, codAmount: e.target.checked ? state.codAmount : '' })
                }
                className="w-4 h-4 rounded accent-blue-600"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Cash on Delivery (COD)</p>
                <p className="text-[10px] text-gray-500 leading-snug">
                  Our rider will collect payment when delivering your item
                </p>
              </div>
            </label>
            {state.cod && (
              <div className="mt-2.5">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
                  COD amount <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₱</span>
                  <input
                    className={cn(
                      'w-full rounded-xl border bg-white pl-7 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400',
                      errors.codAmount ? 'border-red-400' : 'border-gray-200',
                    )}
                    inputMode="numeric"
                    placeholder="0.00"
                    value={state.codAmount}
                    onChange={(e) => onChange({ codAmount: e.target.value })}
                  />
                </div>
                {errors.codAmount && <p className="mt-0.5 text-[10px] text-red-400">Enter COD amount</p>}
              </div>
            )}
          </div>

          {/* Item Protection */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-xs font-semibold text-gray-500">Item Protection</p>
              <IconInfoCircle className="w-3.5 h-3.5 text-gray-300" />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-3 mb-2.5">
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Your item is protected from loss or damage up to a maximum of{' '}
                <strong className="text-gray-800">₱500.00 for FREE!</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onChange({ itemProtection: 'free' })}
                className={cn(
                  'flex-1 flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all',
                  state.itemProtection === 'free'
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                    : 'border-gray-200 bg-white hover:border-blue-200',
                )}
              >
                <IconShieldCheck
                  className={cn('w-4 h-4 flex-shrink-0', state.itemProtection === 'free' ? 'text-blue-600' : 'text-gray-400')}
                />
                <div>
                  <p className="text-xs font-semibold text-left text-gray-800">Free</p>
                  <p className="text-[9px] text-gray-500 text-left">Up to ₱500</p>
                </div>
              </button>
              <button
                onClick={() => (state.cod ? onChange({ itemProtection: 'full' }) : undefined)}
                disabled={!state.cod}
                className={cn(
                  'flex-1 flex items-center gap-2 rounded-xl border p-2.5 transition-all',
                  !state.cod
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : state.itemProtection === 'full'
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300 cursor-pointer'
                    : 'border-gray-200 bg-white hover:border-blue-200 cursor-pointer',
                )}
              >
                <IconShieldFilled
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    state.itemProtection === 'full' && state.cod ? 'text-blue-600' : 'text-gray-400',
                  )}
                />
                <div>
                  <p className="text-xs font-semibold text-left text-gray-800">
                    {state.cod ? 'Increase protection?' : 'Full'}
                  </p>
                  <p className="text-[9px] text-gray-500 text-left leading-snug">
                    {state.cod
                      ? protectionFee > 0
                        ? `+₱${protectionFee} fee`
                        : '1% above ₱500'
                      : 'Requires COD'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Save CTA */}
          <button
            onClick={onSave}
            className="w-full rounded-[22px] py-3.5 text-sm font-extrabold text-white cursor-pointer active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #2f9be8, #1e6fd6)',
              boxShadow: '0 8px 24px rgba(30,111,214,0.3)',
            }}
          >
            {saveLabel ?? 'Save Item Details'}
          </button>
        </div>
      </div>
    </>
  );
}
