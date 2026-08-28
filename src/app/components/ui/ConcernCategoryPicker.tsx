import { useEffect, useRef, useState, useId } from 'react';
import { IconChevronDown, IconChevronRight, IconChevronLeft, IconCheck } from '@tabler/icons-react';
import { cn } from '../../lib/utils';
import type { ConcernCategory, ConcernSubcategory } from '../../services/ticketsService';

export interface ConcernCategoryPickerProps {
  id?: string;
  categories: ConcernCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ConcernCategoryPicker({
  id: externalId,
  categories,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a category…',
  className,
}: ConcernCategoryPickerProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const [open, setOpen] = useState(false);
  const [hoveredParentId, setHoveredParentId] = useState<string | null>(null);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check viewport width for mobile drill-in vs desktop fly-out
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Resolve hierarchy label: "Parent Category > Subcategory" or "Parent Category"
  const selectedHierarchy = (() => {
    if (!value) return null;
    for (const cat of categories) {
      if (cat.id === value) return { parent: cat };
      if (cat.subcategories) {
        const sub = cat.subcategories.find((s) => s.id === value);
        if (sub) return { parent: cat, subcategory: sub };
      }
    }
    return null;
  })();

  // On open, default hovered parent to selected parent or first parent with subcategories
  useEffect(() => {
    if (open) {
      const initialParent = selectedHierarchy?.parent.id
        ?? categories.find((c) => c.subcategories && c.subcategories.length > 0)?.id
        ?? null;
      setHoveredParentId(initialParent);
      setActiveParentId(null);
    }
  }, [open]);

  const label = selectedHierarchy
    ? selectedHierarchy.subcategory
      ? `${selectedHierarchy.parent.name} > ${selectedHierarchy.subcategory.name}`
      : selectedHierarchy.parent.name
    : placeholder;

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  const activeParent = categories.find((c) => c.id === activeParentId);
  const hoveredParent = categories.find((c) => c.id === hoveredParentId);

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          !selectedHierarchy && 'text-gray-500',
        )}
      >
        <span className="truncate">{label}</span>
        <IconChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
      </button>

      {/* Popover Menu */}
      {open && (
        <div
          role="listbox"
          aria-label="Support concern categories"
          className={cn(
            'absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg focus:outline-none overflow-hidden',
            isMobile ? 'p-2 max-h-72 overflow-y-auto' : 'p-0',
          )}
        >
          {isMobile ? (
            /* Mobile View: Drill-in with Back Button */
            activeParent ? (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveParentId(null)}
                  className="flex items-center gap-1.5 w-full text-left text-xs font-semibold text-gray-600 hover:text-gray-900 pb-2 border-b border-gray-100 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <IconChevronLeft className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  <span>Back to categories</span>
                </button>
                <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {activeParent.name}
                </div>
                <div className="space-y-0.5">
                  {activeParent.subcategories.map((sub) => {
                    const isSelected = value === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(sub.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors',
                          isSelected && 'font-semibold text-blue-600 bg-blue-50/50',
                        )}
                      >
                        <span className="truncate">{sub.name}</span>
                        {isSelected && <IconCheck className="h-4 w-4 flex-shrink-0 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                {categories.map((cat) => {
                  const hasSub = cat.subcategories && cat.subcategories.length > 0;
                  const isSelected = value === cat.id || (hasSub && cat.subcategories.some((s) => s.id === value));
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        if (hasSub) {
                          setActiveParentId(cat.id);
                        } else {
                          handleSelect(cat.id);
                        }
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors',
                        isSelected && 'font-semibold text-blue-600 bg-blue-50/50',
                      )}
                    >
                      <span className="truncate">{cat.name}</span>
                      {hasSub ? (
                        <IconChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      ) : isSelected ? (
                        <IconCheck className="h-4 w-4 flex-shrink-0 text-blue-600" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            /* Desktop View: Integrated 2-column panel (Parent categories left, Subcategories right) */
            <div className="flex w-full divide-x divide-gray-100 bg-white min-h-[160px]">
              {/* Left Column: Top-level categories */}
              <div className="w-1/2 p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
                {categories.map((cat) => {
                  const hasSub = cat.subcategories && cat.subcategories.length > 0;
                  const isHovered = hoveredParentId === cat.id;
                  const isSelected = value === cat.id || (hasSub && cat.subcategories.some((s) => s.id === value));

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHoveredParentId(hasSub ? cat.id : null)}
                      onFocus={() => setHoveredParentId(hasSub ? cat.id : null)}
                      onClick={() => {
                        if (hasSub) {
                          setHoveredParentId(cat.id);
                        } else {
                          handleSelect(cat.id);
                        }
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-gray-100/80 transition-colors',
                        (isHovered || isSelected) && 'bg-gray-50',
                        isSelected && 'font-medium text-blue-600',
                      )}
                    >
                      <span className="truncate">{cat.name}</span>
                      {hasSub ? (
                        <IconChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      ) : isSelected ? (
                        <IconCheck className="h-4 w-4 flex-shrink-0 text-blue-600" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Subcategories submenu */}
              <div className="w-1/2 p-1.5 bg-gray-50/50 max-h-64 overflow-y-auto">
                {hoveredParent && hoveredParent.subcategories.length > 0 ? (
                  <div className="space-y-0.5">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
                      {hoveredParent.name}
                    </div>
                    {hoveredParent.subcategories.map((sub) => {
                      const isSubSelected = value === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          role="option"
                          aria-selected={isSubSelected}
                          onClick={() => handleSelect(sub.id)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-white transition-colors',
                            isSubSelected && 'font-semibold text-blue-600 bg-blue-50/50',
                          )}
                        >
                          <span className="truncate">{sub.name}</span>
                          {isSubSelected && <IconCheck className="h-4 w-4 flex-shrink-0 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-gray-400">
                    {hoveredParent ? 'No subcategories' : 'Hover a category'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
