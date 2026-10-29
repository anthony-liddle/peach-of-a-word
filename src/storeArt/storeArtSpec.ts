/**
 * Apple's sizes and safe areas for the header and search results art, and the
 * directions drawn at them. The capture script reads the same table, so a size
 * changed here is the size saved.
 *
 * **The sizes are Apple's,** from "Creative assets specifications" in App
 * Store Connect Help, read 29 October 2026.
 *
 * **The safe areas are not.** Apple publishes them only inside its templates
 * (developer.apple.com/app-store/asset-best-practices), so these are one
 * third-party measurement of Apple's Sketch template, by blakecrosley.com.
 * Each is centred on its canvas, except the universal asset's, which sits 334
 * pixels above centre, as the measurement says. Check them against the
 * template before the final files.
 */

export type PlacementId = 'header' | 'search' | 'universal';
export type DirectionId = 'a' | 'b' | 'c';

/** A rectangle in the artwork's own pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  label: string;
  width: number;
  height: number;
  /** Where every focal element must sit. */
  safe: Rect;
}

export const PLACEMENTS: Record<PlacementId, Placement> = {
  header: {
    label: 'Header, 21:9',
    width: 3840,
    height: 1646,
    safe: { x: 1097, y: 493, w: 1646, h: 661 },
  },
  search: {
    label: 'Search results, 3:2',
    width: 3840,
    height: 2560,
    safe: { x: 836, y: 765, w: 2168, h: 1030 },
  },
  universal: {
    label: 'Universal, 16:9, for both',
    width: 5244,
    height: 2950,
    safe: { x: 1921, y: 660, w: 1402, h: 962 },
  },
};

/**
 * The search asset's width in an iPhone's search results, in points. Apple
 * gives only the 3:2 aspect; this is objectgraph.com's "about 365 points".
 */
export const SEARCH_POINTS_ON_A_PHONE = 365;

export const DIRECTIONS: Record<DirectionId, { name: string }> = {
  a: { name: 'A, the peach' },
  b: { name: 'B, the growth' },
  c: { name: 'C, the word underneath' },
};
