/**
 * Official GoGo Xpress brand assets.
 *
 * Source of truth: the "GGX Logos" asset pack and the GoGo Xpress Brand
 * Guidelines document (2019). Logo files are the original vendor exports,
 * renamed to kebab-case; the usage illustrations are the guideline artwork
 * extracted from the brand guidelines PDF (pages 3 and 7).
 *
 * Files live in `public/brand/` so download links resolve on any deployment
 * without a backend. Reference JPGs from the asset pack are intentionally
 * excluded — SVG and PNG are the only approved distribution formats.
 */

export type BrandPreviewSurface = 'light' | 'dark';

export interface BrandLogo {
  /** Shared filename stem for the SVG/PNG pair — also the download filename. */
  file: string;
  /** Display title, derived from the asset filename. */
  title: string;
  description: string;
  /** Preview surface that keeps the variant legible. */
  surface: BrandPreviewSurface;
  svg?: string;
  png?: string;
}

/** All variants shipped in the asset pack, preferred version first. */
export const BRAND_LOGOS: BrandLogo[] = [
  {
    file: 'full-color',
    title: 'Full Color',
    description: 'Preferred version. Use on all branded materials whenever possible.',
    surface: 'light',
    svg: '/brand/logos/full-color.svg',
    png: '/brand/logos/full-color.png',
  },
  {
    file: 'full-color-border',
    title: 'Full Color Border',
    description: 'Full color with a white keyline, for photography and busy or colored backgrounds.',
    surface: 'dark',
    svg: '/brand/logos/full-color-border.svg',
    png: '/brand/logos/full-color-border.png',
  },
  {
    file: 'black',
    title: 'Black',
    description: 'Reverse version for light backgrounds and one-color printing.',
    surface: 'light',
    svg: '/brand/logos/black.svg',
    png: '/brand/logos/black.png',
  },
  {
    file: 'white',
    title: 'White',
    description: 'Reverse version for dark backgrounds and one-color printing.',
    surface: 'dark',
    svg: '/brand/logos/white.svg',
    png: '/brand/logos/white.png',
  },
  {
    file: 'grayscale',
    title: 'Grayscale',
    description: 'Alternate version for grayscale printing.',
    surface: 'light',
    svg: '/brand/logos/grayscale.svg',
    png: '/brand/logos/grayscale.png',
  },
];

/** Approved versions, in the order the brand guidelines present them. */
export const APPROVED_VERSIONS: { file: string; caption: string }[] = [
  { file: 'full-color', caption: 'Full Color (Preferred)' },
  { file: 'black', caption: 'Black' },
  { file: 'white', caption: 'White' },
  { file: 'grayscale', caption: 'Grayscale' },
];

export const CLEAR_SPACE_ILLUSTRATION = '/brand/usage/clear-space.png';

/** Improper-usage illustrations from the brand guidelines. */
export const INCORRECT_USAGE: { src: string; caption: string }[] = [
  { src: '/brand/usage/misuse-distort.png', caption: 'Do not distort the logo.' },
  { src: '/brand/usage/misuse-tilt.png', caption: 'Do not tilt the logo.' },
  { src: '/brand/usage/misuse-recolor.png', caption: 'Do not recolor the logo.' },
  { src: '/brand/usage/misuse-effects.png', caption: 'Do not apply effects to the logo.' },
  { src: '/brand/usage/misuse-icon-shading.png', caption: 'Do not drop the icon shading from the black logo.' },
  { src: '/brand/usage/misuse-reposition.png', caption: 'Do not reposition logo elements.' },
];
