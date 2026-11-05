/**
 * Pure icon-art generators, kept apart from the build-icons pipeline so they
 * carry no side effects (no rasterizer, no filesystem, no top-level build) and
 * can be unit-tested directly. build-icons.ts imports these and does the I/O.
 */

import type { PeachPart } from '@/ui/peachArt.ts';

/**
 * The peach the raster icons were last drawn from: the home-screen icons, the
 * link-preview card, and the App Store icon, which is the 512 icon drawn at
 * 1024. They are binaries, so this records what they show.
 *
 * The game's peach is `peachArt.ts`'s, and the tab icon follows it. An edit to
 * the peach in Inkscape changes that and leaves this alone, so the icons stay
 * as they were until Antoine asks for them (4 November 2026). The import lists
 * them as out of date while the two differ, and
 * `scripts/illustrations/redraw.ts` brings this up to the game's peach and
 * redraws them.
 */
export const ICON_PEACH: readonly PeachPart[] = [
  { d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' },
  {
    d: 'M50 16c20 0 34 16 34 36 0 22-16 38-34 38S16 74 16 52c0-20 14-36 34-36z',
    fill: '#FFC27A',
  },
  {
    d: 'M50 16c-9 0-17 4-23 11 7 4 15 5 23 5s16-1 23-5c-6-7-14-11-23-11z',
    fill: '#FFD79B',
    opacity: 0.7,
  },
  { circle: [40, 58, 3.4], fill: '#7A4A33' },
  { circle: [60, 58, 3.4], fill: '#7A4A33' },
  { circle: [34, 66, 4.5], fill: '#FF9DAE', opacity: 0.7 },
  { circle: [66, 66, 4.5], fill: '#FF9DAE', opacity: 0.7 },
  { d: 'M45 67c3 3 7 3 10 0', stroke: '#7A4A33', strokeWidth: 2.2 },
];

/** An opacity as the files write one: `.7`, not `0.7`. */
const short = (n: number) => String(n).replace(/^0\./, '.');

/** One part as an SVG element. Strokes are round at their ends and joins. */
function element(p: PeachPart): string {
  const shape = p.circle
    ? `<circle cx="${p.circle[0]}" cy="${p.circle[1]}" r="${p.circle[2]}"`
    : `<path d="${p.d}"`;
  const paint = p.stroke
    ? `stroke="${p.stroke}" stroke-width="${p.strokeWidth ?? 1}" fill="${p.fill ?? 'none'}"`
    : `fill="${p.fill ?? 'none'}"`;
  const opacity =
    p.opacity === undefined ? '' : ` opacity="${short(p.opacity)}"`;
  const ends = p.stroke
    ? ' stroke-linecap="round" stroke-linejoin="round"'
    : '';
  return `${shape} ${paint}${opacity}${ends}/>`;
}

/** A peach's parts as SVG markup on its 0-100 canvas, one element to a line. */
export function peachMarkup(parts: readonly PeachPart[]): string {
  return parts.map(element).join('\n    ');
}

/**
 * The smiling peach mark as the raster icons draw it, on its native 0-100
 * canvas: the OG card and the home-screen icons, one peach.
 */
export const PEACH_MARK_PATHS = peachMarkup(ICON_PEACH);

/**
 * The cute tab icon, `public/favicon-cute.svg`: the game's peach on its own,
 * on a transparent field. Given the game's parts, so it follows the peach.
 */
export function faviconCuteSvg(parts: readonly PeachPart[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${peachMarkup(parts)}
</svg>`;
}

/** The home-screen icon canvas. 512 is the largest size and the source of all. */
export const ICON_SIZE = 512;

/**
 * Background-only padding on each side, as a fraction of the icon. The maskable
 * icon keeps the peach inside the center safe zone: Android launchers crop the
 * icon to a circle or squircle, cutting roughly 10 percent per side, so the
 * mark must sit within the central 80 percent. The standard icon can be fuller
 * since iOS only rounds the corners, it does not crop to a circle.
 */
export const ICON_SAFE_PADDING = { standard: 0.09, maskable: 0.16 } as const;

interface IconOpts {
  /** Compose for the maskable safe zone (more padding), or the fuller standard. */
  maskable: boolean;
  /** The full-bleed background fill (the cute peach-cream). */
  background: string;
}

/**
 * A home-screen icon: the peach mark centered on a full-bleed background. The
 * background bleeds to every edge so a maskable crop only ever cuts background,
 * never the peach. The mark is the same shared peach as the tab and the card.
 */
export function pwaIconSvg(opts: IconOpts): string {
  const pad = opts.maskable
    ? ICON_SAFE_PADDING.maskable
    : ICON_SAFE_PADDING.standard;
  const box = ICON_SIZE * (1 - 2 * pad);
  const offset = (ICON_SIZE - box) / 2;
  const scale = box / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">
  <rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="${opts.background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    ${PEACH_MARK_PATHS}
  </g>
</svg>`;
}
