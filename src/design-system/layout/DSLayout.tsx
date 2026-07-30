import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  IconBrandFigma,
  IconChevronDown,
  IconMenu2,
  IconMoon,
  IconSearch,
  IconSun,
  IconX,
} from '@tabler/icons-react';
import { cn } from '../../app/lib/utils';
import { ScrollArea } from '../../app/components/ui/ScrollArea';
import {
  DS_FLAT_PAGES,
  DS_NAV_GROUPS,
  navItemHref,
  type DSNavItem,
} from '../nav/DSNavConfig';
import { DSProvider, useDSTheme } from './DSContext';
import { COMPONENT_META, GGX_SHADCN_URL } from '../data/componentRegistry';

// ── Right sidebar (Table of Contents) ────────────────────────────────────────

interface TocItem { id: string; label: string; }

function useToc(pathname: string): { items: TocItem[]; active: string } {
  const [items, setItems] = useState<TocItem[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      // Level 1: section[id] → h2-level items (multi-section pages like Foundations, Resources)
      const sections = Array.from(document.querySelectorAll<HTMLElement>('section[id]'));
      const sectionItems = sections
        .map((s) => ({ id: s.getAttribute('id') ?? '', label: s.querySelector('h2')?.textContent?.trim() ?? '' }))
        .filter((i) => i.id && i.label);

      if (sectionItems.length >= 2) {
        setItems(sectionItems);
        setActive(sectionItems[0].id);
        return;
      }

      // Level 2: single-section pages (component detail pages) — h2 + Subsection h3s
      const allItems: TocItem[] = [...sectionItems];
      Array.from(document.querySelectorAll<HTMLElement>('[data-toc][id]')).forEach((el) => {
        const id = el.getAttribute('id') ?? '';
        const label = el.querySelector('h3')?.textContent?.trim() ?? '';
        if (id && label) allItems.push({ id, label });
      });

      setItems(allItems);
      if (allItems.length > 0) setActive(allItems[0].id);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (items.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-8% 0px -70% 0px', threshold: 0 },
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return { items, active };
}

// ── Search modal ──────────────────────────────────────────────────────────────

interface SearchResult { label: string; sublabel: string; path: string; }

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];
  DS_FLAT_PAGES.forEach((page) => {
    const group = DS_NAV_GROUPS.find((g) =>
      g.items.some((e) => e.type !== 'divider' && (e as DSNavItem).path === page.path),
    );
    // Add blurb from COMPONENT_META if available
    const id = page.path.replace(/^(components|ggx-components)\//, '');
    const meta = COMPONENT_META[id];
    results.push({
      label: page.label,
      sublabel: meta?.blurb ?? group?.label ?? '',
      path: page.path,
    });
  });
  return results;
}

const SEARCH_INDEX = buildSearchIndex();

function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEARCH_INDEX.slice(0, 8);
    return SEARCH_INDEX.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sublabel.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [query]);

  const go = useCallback(
    (path: string) => { navigate(navItemHref(path)); onClose(); },
    [navigate, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4">
          <IconSearch className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { onClose(); return; }
              if (e.key === 'ArrowDown') { setCursor((c) => Math.min(c + 1, results.length - 1)); e.preventDefault(); return; }
              if (e.key === 'ArrowUp') { setCursor((c) => Math.max(c - 1, 0)); e.preventDefault(); return; }
              if (e.key === 'Enter' && results[cursor]) go(results[cursor].path);
            }}
            placeholder="Search pages, components, patterns…"
            className="h-12 flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">No results for &ldquo;{query}&rdquo;</p>
          )}
          {results.map((item, i) => (
            <button
              key={item.path}
              type="button"
              onClick={() => go(item.path)}
              className={cn(
                'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors',
                cursor === i
                  ? 'bg-blue-50 dark:bg-blue-950/40'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</span>
              {item.sublabel && (
                <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{item.sublabel}</span>
              )}
            </button>
          ))}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2">
          <span className="text-[11px] text-gray-400">↑↓ navigate · ↵ select · esc close</span>
        </div>
      </div>
    </div>
  );
}

// ── Left sidebar ──────────────────────────────────────────────────────────────

function LeftSidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DS_NAV_GROUPS.map((g) => [g.label, g.defaultOpen !== false])),
  );

  // Auto-expand the group containing the active page.
  useEffect(() => {
    DS_NAV_GROUPS.forEach((group) => {
      const hasActive = group.items.some(
        (e) => e.type !== 'divider' && pathname === navItemHref((e as DSNavItem).path),
      );
      if (hasActive) setOpenGroups((prev) => ({ ...prev, [group.label]: true }));
    });
  }, [pathname]);

  const toggle = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <nav aria-label="Documentation navigation">
      {DS_NAV_GROUPS.map((group, gi) => {
        const isOpen = openGroups[group.label] !== false;
        return (
          <div key={group.label}>
            {/* Group header button */}
            <button
              type="button"
              onClick={() => toggle(group.label)}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
              aria-expanded={isOpen}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {group.label}
              </span>
              <IconChevronDown
                className={cn(
                  'h-3 w-3 text-gray-400 transition-transform duration-150',
                  !isOpen && '-rotate-90',
                )}
              />
            </button>

            {/* Group items */}
            {isOpen && (
              <ul className="mb-1 mt-0.5 space-y-px">
                {group.items.map((entry, i) => {
                  if (entry.type === 'divider') {
                    return (
                      <li key={`${gi}-div-${i}`} aria-hidden className="px-3 pb-0.5 pt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                          {entry.label}
                        </span>
                      </li>
                    );
                  }
                  const item = entry as DSNavItem;
                  const href = navItemHref(item.path);
                  const isActive = pathname === href;
                  return (
                    <li key={item.path}>
                      <Link
                        to={href}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'block rounded-md px-3 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'bg-blue-50 font-medium text-[#0088C9] dark:bg-blue-950/50 dark:text-blue-400'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Section divider (between top-level groups) */}
            <div className="my-2 border-b border-gray-100 dark:border-gray-800" />
          </div>
        );
      })}
    </nav>
  );
}

// ── Inner layout (consumes dark-mode context) ─────────────────────────────────

function DSLayoutInner() {
  const { pathname } = useLocation();
  const { darkMode, toggleDarkMode } = useDSTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { items: tocItems, active: tocActive } = useToc(pathname);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // ⌘K / Ctrl+K shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen((o) => !o); }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Prev / Next pages
  const currentPath = pathname === '/design-system' ? '' : pathname.replace('/design-system/', '');
  const currentIndex = DS_FLAT_PAGES.findIndex((p) => p.path === currentPath);
  const prevPage = currentIndex > 0 ? DS_FLAT_PAGES[currentIndex - 1] : null;
  const nextPage = currentIndex >= 0 && currentIndex < DS_FLAT_PAGES.length - 1
    ? DS_FLAT_PAGES[currentIndex + 1] : null;
  const isLandingPage = pathname === '/design-system';

  // Active section for header nav highlight
  const activeSection = (() => {
    if (pathname === '/design-system/brand-guidelines') return 'Brand';
    if (pathname.startsWith('/design-system/foundations/') || pathname === '/design-system/icons') return 'Foundations';
    if (pathname.startsWith('/design-system/components/') || pathname.startsWith('/design-system/ggx-components/') || pathname === '/design-system/patterns/payment-options') return 'Components';
    if (pathname.startsWith('/design-system/patterns/')) return 'Patterns';
    if (pathname.startsWith('/design-system/resources/')) return 'Resources';
    return '';
  })();

  const headerNavLinks = [
    { label: 'Brand', href: '/design-system/brand-guidelines' },
    { label: 'Foundations', href: '/design-system/foundations/overview' },
    { label: 'Components', href: '/design-system/components/overview' },
    { label: 'Patterns', href: '/design-system/patterns/overview' },
    { label: 'Resources', href: '/design-system/resources/overview' },
  ];

  const showRightSidebar = tocItems.length >= 2;

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#111113] dark:text-gray-100">

      {/* ── Fixed Header ── */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-md dark:border-gray-800 dark:bg-[#111113]/95">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-5">

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label="Open navigation"
            className="mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <IconMenu2 className="h-5 w-5" />
          </button>

          {/* Brand */}
          <Link to="/design-system" className="flex flex-shrink-0 items-center gap-2.5">
            <img
              src="https://gogoxpress.com/wp-content/uploads/2022/07/gogox-logo.png"
              alt="GoGo Xpress"
              className="h-6 w-auto dark:brightness-0 dark:invert"
            />
            <span className="hidden text-sm font-semibold text-gray-800 dark:text-gray-100 sm:inline">
              Design System
            </span>
          </Link>

          {/* Desktop section nav */}
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Section navigation">
            {headerNavLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeSection === link.label
                    ? 'bg-blue-50 text-[#0088C9] dark:bg-blue-950/50 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Search button – desktop */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 md:flex"
            >
              <IconSearch className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="ml-1 rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-400 dark:border-gray-600">
                ⌘K
              </kbd>
            </button>
            {/* Search icon – mobile */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden"
            >
              <IconSearch className="h-4 w-4" />
            </button>

            {/* Figma link */}
            <a
              href={GGX_SHADCN_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open GGX-SHADCN in Figma"
              className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:flex"
            >
              <IconBrandFigma className="h-4 w-4" stroke={1.5} />
              <span className="hidden lg:inline text-sm">Figma</span>
            </a>

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {darkMode
                ? <IconSun className="h-4 w-4" stroke={1.8} />
                : <IconMoon className="h-4 w-4" stroke={1.8} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Page body ── */}
      <div className="mx-auto flex max-w-[1400px] pt-14">

        {/* Left sidebar – desktop */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[280px] flex-shrink-0 border-r border-gray-100 dark:border-gray-800 lg:block">
          <ScrollArea className="h-full">
            <div className="px-3 pt-6 pb-8">
              <LeftSidebar pathname={pathname} />
            </div>
          </ScrollArea>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div
            ref={overlayRef}
            className="fixed inset-0 z-40 lg:hidden"
            onClick={(e) => { if (e.target === overlayRef.current) setMobileOpen(false); }}
          >
            <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="relative flex h-full w-[280px] flex-col bg-white dark:bg-gray-900 shadow-2xl">
              <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Design System</span>
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconX className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pt-4 pb-8">
                <LeftSidebar pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          </div>
        )}

        {/* Content + right sidebar row */}
        <div className="flex min-w-0 flex-1">

          {/* Main content */}
          <main className="min-w-0 flex-1 px-6 py-10 sm:px-10">
            <div className="mx-auto max-w-[800px]">
              <Outlet />

              {/* Prev / Next navigation */}
              {!isLandingPage && (prevPage || nextPage) && (
                <div className="mt-12 grid grid-cols-2 gap-3 border-t border-gray-100 dark:border-gray-800 pt-8">
                  {prevPage ? (
                    <Link
                      to={navItemHref(prevPage.path)}
                      className="group flex flex-col rounded-xl border border-gray-200 px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50"
                    >
                      <span className="mb-0.5 text-xs font-medium text-gray-400 dark:text-gray-500">← Previous</span>
                      <span className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-[#0088C9] dark:text-gray-100 dark:group-hover:text-blue-400">
                        {prevPage.label}
                      </span>
                    </Link>
                  ) : <div />}

                  {nextPage ? (
                    <Link
                      to={navItemHref(nextPage.path)}
                      className="group flex flex-col items-end rounded-xl border border-gray-200 px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50"
                    >
                      <span className="mb-0.5 text-xs font-medium text-gray-400 dark:text-gray-500">Next →</span>
                      <span className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-[#0088C9] dark:text-gray-100 dark:group-hover:text-blue-400">
                        {nextPage.label}
                      </span>
                    </Link>
                  ) : <div />}
                </div>
              )}

              {/* Page footer */}
              <footer className="mt-12 border-t border-gray-100 py-6 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
                GoGo Xpress Design System · Living reference aligned to GGX-SHADCN and production code.
              </footer>
            </div>
          </main>

          {/* Right TOC sidebar – rail always reserved on xl+ for non-landing pages */}
          {!isLandingPage && (
            <aside
              className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[220px] flex-shrink-0 overflow-y-auto py-10 pl-2 pr-4 xl:block"
              aria-label={showRightSidebar ? 'On this page' : undefined}
            >
              {showRightSidebar && (
                <>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    On this page
                  </p>
                  <nav>
                    <ul className="space-y-0.5">
                      {tocItems.map((item) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            className={cn(
                              'block rounded py-1 pl-2 text-sm transition-colors',
                              tocActive === item.id
                                ? 'font-medium text-[#0088C9] dark:text-blue-400'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
                            )}
                          >
                            {item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* Search modal */}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

// ── Public export (wraps with dark-mode provider) ─────────────────────────────

export function DSLayout() {
  return (
    <DSProvider>
      <DSLayoutInner />
    </DSProvider>
  );
}
