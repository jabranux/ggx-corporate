import { IconDownload } from '@tabler/icons-react';
import { cn } from '../../../app/lib/utils';
import { Section, Subsection } from '../../components/DocPrimitives';
import { DSPage } from '../../layout/DSPage';
import {
  APPROVED_VERSIONS,
  BRAND_LOGOS,
  CLEAR_SPACE_ILLUSTRATION,
  INCORRECT_USAGE,
  type BrandPreviewSurface,
} from '../../data/brandAssets';

// Preview surfaces: white/keyline variants need a dark neutral, everything else a light one.
const SURFACE_CLASS: Record<BrandPreviewSurface, string> = {
  light: 'bg-gray-100/80 dark:bg-gray-200',
  dark: 'bg-gray-900 dark:bg-gray-950',
};

/** Illustration crops from the guidelines PDF have a baked-in white background. */
const DOC_SURFACE = 'rounded-lg border border-gray-200 bg-white dark:border-gray-700';

function DownloadButton({
  href,
  filename,
  label,
  variant,
}: {
  href?: string;
  filename: string;
  label: string;
  variant: 'primary' | 'secondary';
}) {
  const base =
    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors';

  if (!href) {
    return (
      <button type="button" disabled className={cn(base, 'cursor-not-allowed border border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-600')}>
        {label} unavailable
      </button>
    );
  }

  return (
    <a
      href={href}
      download={filename}
      className={cn(
        base,
        variant === 'primary'
          ? 'bg-[#0088C9] text-white hover:bg-[#0077b3]'
          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
      )}
    >
      <IconDownload className="h-3.5 w-3.5" stroke={2} /> {label}
    </a>
  );
}

function FormatPill({ available, format, note }: { available: boolean; format: string; note: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        available
          ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          : 'bg-gray-50 text-gray-400 line-through dark:bg-gray-800/50 dark:text-gray-600',
      )}
    >
      <span className="font-semibold">{format}</span>
      <span className="font-normal">{note}</span>
    </span>
  );
}

export function BrandGuidelinesPage() {
  return (
    <DSPage title="Brand Guidelines">
      {/* ── Hero ── */}
      <div className="border-b border-gray-100 pb-10 dark:border-gray-800">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
          Brand Guidelines
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400">
          Official GoGo Xpress brand assets and logo usage guidelines.
        </p>
      </div>

      {/* ── Logos ── */}
      <Section
        id="logos"
        title="Logos"
        intro="Every approved logo variant, in the formats cleared for distribution. Download and use the files as-is — SVG for anything on screen or in print, PNG when a raster asset is required. JPG references from the asset pack are not distributed."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {BRAND_LOGOS.map((logo) => (
            <div
              key={logo.file}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <div
                className={cn(
                  'flex h-28 items-center justify-center rounded-lg px-6 sm:h-32',
                  SURFACE_CLASS[logo.surface],
                )}
              >
                <img
                  src={logo.svg ?? logo.png}
                  alt={`GoGo Xpress logo — ${logo.title}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <p className="mt-4 text-sm font-semibold text-gray-900 dark:text-gray-50">{logo.title}</p>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{logo.description}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <FormatPill available={Boolean(logo.svg)} format="SVG" note="Recommended" />
                <FormatPill available={Boolean(logo.png)} format="PNG" note="Transparent" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 sm:flex-nowrap">
                <DownloadButton href={logo.svg} filename={`${logo.file}.svg`} label="Download SVG" variant="primary" />
                <DownloadButton href={logo.png} filename={`${logo.file}.png`} label="Download PNG" variant="secondary" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Logo usage ── */}
      <Section
        id="logo-usage"
        title="Logo usage"
        intro="The logo is fundamental to GoGo Xpress communications and should never be compromised. Always reproduce it from the original artwork on this page."
      >
        <Subsection
          title="Approved logo versions"
          description="These are the only acceptable versions of the logo. Each has a specific purpose and should not be used in other ways."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {APPROVED_VERSIONS.map((version) => {
              const logo = BRAND_LOGOS.find((l) => l.file === version.file);
              if (!logo) return null;
              return (
                <div key={version.file}>
                  <div
                    className={cn(
                      'flex h-24 items-center justify-center rounded-lg px-5',
                      SURFACE_CLASS[logo.surface],
                    )}
                  >
                    <img
                      src={logo.svg ?? logo.png}
                      alt={`GoGo Xpress logo — ${logo.title}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="mt-2 text-xs font-medium text-gray-600 dark:text-gray-400">{version.caption}</p>
                </div>
              );
            })}
          </div>
        </Subsection>

        <Subsection
          title="Clear space"
          description="Adequate clear space must always surround the logo so nothing crowds it. Half the height of the logo typeface defines the minimum margin on every side — keep other elements, type, and the edge of the layout outside it."
        >
          <div className={cn(DOC_SURFACE, 'p-4 sm:p-6')}>
            <img
              src={CLEAR_SPACE_ILLUSTRATION}
              alt="Clear space diagram: half the height of the logo typeface defines the minimum margin around the logo."
              className="mx-auto w-full max-w-lg"
            />
          </div>
        </Subsection>

        <Subsection
          title="Incorrect usage"
          description="Never alter the logo artwork. The following are the most common misuses."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {INCORRECT_USAGE.map((item) => (
              <div key={item.src}>
                <div className={cn(DOC_SURFACE, 'p-4')}>
                  <img src={item.src} alt={item.caption} className="w-full" />
                </div>
                <p className="mt-2 text-xs font-medium text-gray-600 dark:text-gray-400">{item.caption}</p>
              </div>
            ))}
          </div>
        </Subsection>
      </Section>
    </DSPage>
  );
}
