import { useState } from 'react';

/**
 * Accessible two-handle price range slider — two overlapping native
 * `<input type="range">` elements (a well-established CSS-only technique:
 * each input's own thumb is clickable, its track is transparent so only the
 * thumbs capture pointer events), so both handles get real browser
 * keyboard/focus/screen-reader support for free without a new dependency.
 *
 * `value`/`onChange` update live while dragging (for the on-screen ₱ labels);
 * `onCommit` fires once when the interaction ends (pointer up / key up), so
 * callers can defer an expensive re-fetch until the buyer settles on a range
 * instead of firing one per pixel of drag.
 */
export function PriceRangeSlider({
  min,
  max,
  value,
  onChange,
  onCommit,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  onCommit: (value: [number, number]) => void;
}) {
  const [low, high] = value;
  const [dragging, setDragging] = useState(false);

  if (min >= max) {
    // Every product costs the same — a range slider has nothing to express.
    return <p className="text-sm text-gray-500">All items are ₱{min.toLocaleString('en-PH')}</p>;
  }

  const commit = () => onCommit([low, high]);
  const setLow = (v: number) => onChange([Math.min(v, high), high]);
  const setHigh = (v: number) => onChange([low, Math.max(v, low)]);

  const lowPct = ((low - min) / (max - min)) * 100;
  const highPct = ((high - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-gray-700 mb-2">
        <span>₱{low.toLocaleString('en-PH')}</span>
        <span>₱{high.toLocaleString('en-PH')}</span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-200" />
        <div
          className="absolute h-1.5 rounded-full bg-blue-600"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        <input
          type="range"
          aria-label="Minimum price"
          min={min}
          max={max}
          value={low}
          onChange={(e) => setLow(Number(e.target.value))}
          onMouseDown={() => setDragging(true)}
          onMouseUp={commit}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="range-slider-thumb absolute inset-x-0 w-full h-5 m-0 bg-transparent appearance-none pointer-events-none"
          style={{ zIndex: low > max - (max - min) / 2 ? 5 : 3 }}
        />
        <input
          type="range"
          aria-label="Maximum price"
          min={min}
          max={max}
          value={high}
          onChange={(e) => setHigh(Number(e.target.value))}
          onMouseDown={() => setDragging(true)}
          onMouseUp={commit}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="range-slider-thumb absolute inset-x-0 w-full h-5 m-0 bg-transparent appearance-none pointer-events-none"
          style={{ zIndex: 4 }}
        />
      </div>
      {dragging && <span className="sr-only" aria-live="polite">₱{low.toLocaleString('en-PH')} to ₱{high.toLocaleString('en-PH')}</span>}
      <style>{`
        .range-slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #fff;
          border: 2px solid #2563eb;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        }
        .range-slider-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #fff;
          border: 2px solid #2563eb;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        }
        .range-slider-thumb::-webkit-slider-runnable-track { background: transparent; }
        .range-slider-thumb::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  );
}
