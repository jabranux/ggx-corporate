import { DSPage } from '../../layout/DSPage';
import { Section } from '../../components/DocPrimitives';

interface ChangeEntry {
  date: string;
  title: string;
  changes: string[];
  type: 'major' | 'minor' | 'fix';
}

const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-07-30',
    title: 'Brand Guidelines page',
    type: 'minor',
    changes: [
      'Added a top-level Brand section with a Brand Guidelines page at /design-system/brand-guidelines.',
      'Published the five official logo variants (Full Color, Full Color Border, Black, White, Grayscale) with SVG and PNG downloads served from public/brand/logos.',
      'Documented approved logo versions, clear space, and incorrect usage using the illustrations from the GoGo Xpress Brand Guidelines document (public/brand/usage).',
      'Reference JPGs from the asset pack are intentionally not distributed — SVG and PNG only.',
    ],
  },
  {
    date: '2026-06-30',
    title: 'IA correction: flat component nav, right sidebar on detail pages',
    type: 'minor',
    changes: [
      'Replaced type-based component category dividers (Display, Actions, Inputs, Structure, Overlays, Data) with two flat lists: Shared Components and GGX Components — both alphabetical.',
      'Moved OTP Dialog and Payment Options from Shared/Patterns nav positions into the GGX Components list.',
      'Removed Payment options from the Patterns nav group; it is a component, not a pattern.',
      'Updated ComponentsOverviewPage to match the new flat structure.',
      'Right "On this page" sidebar now appears on all substantial pages including component detail pages (Button, Alert, etc.).',
      'Subsection headings are now discoverable as TOC anchors via IntersectionObserver on single-section component pages.',
      'Header active-section highlight correctly maps patterns/payment-options to the Components section.',
      'Prev/Next footer navigation recalculated to reflect new nav order.',
    ],
  },
  {
    date: '2026-06-30',
    title: 'Navigation and layout rebuild',
    type: 'major',
    changes: [
      'Rebuilt DSLayout with three-column documentation shell: persistent header, collapsible left nav, sticky right TOC sidebar.',
      'Added five top-level navigation sections: Getting Started, Foundations, Components, Patterns, Resources.',
      'Reorganized component nav with category dividers (Display, Actions, Inputs, Structure, Overlays, Data, GGX Components).',
      'Added full-page search (⌘K) covering all pages, components, and blurbs.',
      'Added dark mode toggle with localStorage persistence.',
      'Added Previous / Next footer navigation following doc order.',
      'Added right "On this page" sidebar with IntersectionObserver active-section tracking.',
      'Added collapsible left nav groups with auto-expand on active page.',
      'Added mobile navigation drawer replacing the previous fixed overlay.',
      'Added new pages: How this reference works, Foundations overview, Elevation & Shadows, Responsive behavior, Components overview, Patterns overview, Booking flows, Bulk upload, Transactions & tracking, Forms & validation, Empty/loading/error, Resources overview, Traceability, Changelog, Contributing, Documentation standards.',
      'Updated DocPrimitives with dark: Tailwind variants for Section, PreviewBox, CodeBlock, ImplementationMeta, AccessibilityNotes, DoDont, and SpecTable.',
      'Moved Payment options from "GGX Components & Patterns" to Patterns section.',
      'Kept all existing routes and component pages unchanged.',
    ],
  },
  {
    date: '2026-06-26',
    title: 'Design tokens, Empty State, Filter Bar',
    type: 'minor',
    changes: [
      'Added Design Tokens page documenting the tokens.json → CSS custom properties pipeline.',
      'Added Empty State GGX component page.',
      'Added Filter Bar GGX component page.',
      'Removed DesignSystemPage (dead code).',
    ],
  },
  {
    date: 'Before 2026-06-26',
    title: 'Initial documentation build',
    type: 'minor',
    changes: [
      'Documented all GGX-SHADCN primitive components: Accordion, Alert, Avatar, Badge, Breadcrumb, Button, Calendar, Card, Checkbox, Combobox, Dialog, Field, Icon Container, Input, Page Header, Pagination, Popover, Progress, Radio Group, Scroll Area, Search Input, Segmented Control, Select, Separator, Switch, Table, Tabs, Textarea, Tooltip.',
      'Documented GGX-specific components: Access Denied, Address Display Card, Checkout Delivery Options, Delivery Status Badge, Enablement Gate, Location Cascade, Module Card, OTP Dialog, Stat Card.',
      'Added componentRegistry.ts cross-referencing Figma keys, source paths, and usage.',
      'Added DSLayout with left sidebar and fixed header.',
      'Added live component previews via actual production imports.',
    ],
  },
];

const TYPE_COLORS = {
  major: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  minor: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  fix: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
};
const TYPE_LABELS = { major: 'Major', minor: 'Update', fix: 'Fix' };

export function ChangelogPage() {
  return (
    <DSPage title="Changelog">
      <Section
        id="changelog"
        title="Changelog"
        intro="Significant additions, restructures, and documentation changes. Each entry represents meaningful work — minor typo fixes and copy tweaks are not listed."
      >
        <div className="space-y-8">
          {CHANGELOG.map((entry) => (
            <div key={entry.date} className="relative border-l-2 border-gray-200 dark:border-gray-700 pl-6">
              <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0088C9] bg-white dark:bg-[#111113]" />
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_COLORS[entry.type]}`}>
                  {TYPE_LABELS[entry.type]}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{entry.date}</span>
              </div>
              <ul className="space-y-1.5">
                {entry.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </DSPage>
  );
}
