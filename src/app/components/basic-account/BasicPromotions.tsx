import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconArrowRight } from '@tabler/icons-react';
import { getPromotionsFor } from '../../lib/basicPromotions';
import { cn } from '../../lib/utils';

/**
 * Promotional carousel for the Basic home (spec §5) — large, colorful,
 * campaign-style banners (gradient background + a big illustration from the
 * legacy `/basic` module's own assets), deliberately distinct from the
 * dashboard's plain white cards so it reads as marketing content, never as a
 * service advisory or an account reminder. Horizontally scrollable with snap
 * + pagination dots. Realistic mobile proportions — one banner is capped at a
 * fixed height (~25% taller than the previous pass, per a follow-up refinement
 * request), not an oversized hero, so it never dominates the page.
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
        {slides.map((slide) => (
          <div key={slide.id} className="w-full flex-shrink-0 snap-start px-0.5">
            <button
              onClick={() => navigate(slide.href)}
              className={cn(
                // Mobile banner is ~25% taller than before, per a follow-up
                // refinement request; `lg:` reverts every size below back to
                // its pre-refinement value so this stays mobile-only — the
                // task scope explicitly leaves desktop untouched, and this
                // component is shared with the desktop tree.
                'relative flex h-[145px] lg:h-[116px] w-full items-center overflow-hidden rounded-2xl text-left cursor-pointer shadow-sm active:brightness-95 transition-[filter]',
                slide.bannerClassName ?? 'bg-gradient-to-br from-blue-600 to-blue-500',
              )}
            >
              <div className="relative z-10 min-w-0 flex-1 py-4 lg:py-3.5 pl-4 pr-1.5">
                {slide.label && (
                  <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {slide.label}
                  </span>
                )}
                <p className="mt-2 lg:mt-1.5 text-[17px] lg:text-[15px] font-bold leading-tight text-white break-words">
                  {slide.headline ?? slide.title}
                </p>
                <p className="mt-1.5 lg:mt-1 text-xs lg:text-[11px] leading-snug text-white/85 line-clamp-2">{slide.body}</p>
                <span className="mt-2.5 lg:mt-2 inline-flex items-center rounded-lg bg-white px-3 lg:px-2.5 py-1.5 lg:py-1 text-xs lg:text-[11px] font-semibold text-gray-900">
                  {slide.cta}
                </span>
              </div>
              {slide.image && (
                <img
                  src={slide.image}
                  alt=""
                  className="relative z-10 h-[125px] w-[125px] lg:h-[100px] lg:w-[100px] flex-shrink-0 object-contain drop-shadow-md"
                />
              )}
              <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 lg:h-28 lg:w-28 rounded-full bg-white/10" />
            </button>
          </div>
        ))}
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
