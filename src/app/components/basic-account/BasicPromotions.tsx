import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArrowRight } from '@tabler/icons-react';
import { getPromotionsFor } from '../../lib/basicPromotions';
import { cn } from '../../lib/utils';

/**
 * Promotional carousel for the Basic home (spec §4) — Corporate design-
 * system styling (plain cards, not the legacy `/basic` module's glass
 * treatment), horizontally scrollable with snap + pagination dots, same
 * interaction model as the legacy reference used for this redesign.
 */
export function BasicPromoCarousel() {
  const navigate = useNavigate();
  const slides = getPromotionsFor('carousel');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.min(Math.max(idx, 0), slides.length - 1));
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto scrollbar-none snap-x snap-mandatory"
      >
        {slides.map((slide) => {
          const Icon = slide.icon;
          return (
            <div key={slide.id} className="w-full flex-shrink-0 snap-start px-0.5">
              <button
                onClick={() => navigate(slide.href)}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-2.5 text-left cursor-pointer shadow-sm active:bg-gray-50 transition-colors"
              >
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0', slide.iconClassName)}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{slide.title}</p>
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-blue-600 truncate">
                    {slide.cta} <IconArrowRight className="w-3 h-3 flex-shrink-0" />
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {slides.map((slide, i) => (
            <span
              key={slide.id}
              className="block h-1.5 rounded-full bg-blue-600 transition-all"
              style={{ width: i === active ? 18 : 6, opacity: i === active ? 1 : 0.3 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Desktop-only featured promotion for the supporting column (spec §1/§4) —
 * a distinct placement from the carousel, drawing from promotions tagged
 * `featured` only, so the same message never repeats in both spots.
 */
export function BasicFeaturedPromo() {
  const navigate = useNavigate();
  const featured = getPromotionsFor('featured')[0];
  if (!featured) return null;
  const Icon = featured.icon;

  return (
    <button
      onClick={() => navigate(featured.href)}
      className="flex w-full flex-col items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left cursor-pointer shadow-sm hover:shadow transition-shadow"
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', featured.iconClassName)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 leading-snug">{featured.title}</p>
        <p className="text-xs text-gray-500 leading-snug mt-1">{featured.body}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
        {featured.cta} <IconArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}
