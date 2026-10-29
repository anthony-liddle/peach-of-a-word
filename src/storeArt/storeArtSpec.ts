/**
 * Apple's sizes and safe areas for the header and search results art. The
 * capture script reads the same table, so a size changed here is the size
 * saved.
 *
 * **The sizes** are from "Creative assets specifications" in App Store Connect
 * Help, read 29 October 2026.
 *
 * **The safe areas** are the "Art Safe Area" rectangles in Apple's Sketch
 * template, `creative_assets-templates.sketch` from
 * developer.apple.com/app-store/asset-best-practices (6,215,912 bytes, last
 * modified 28 August 2026), read the same day.
 */

export type PlacementId = 'header' | 'search' | 'universal';

/** A rectangle in the artwork's own pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  label: string;
  /** The saved file's name, without its size. */
  file: string;
  width: number;
  height: number;
  /** Where every focal element must sit. */
  safe: Rect;
  /** Whether this is a file to upload, rather than one for comparison. */
  upload: boolean;
}

export const PLACEMENTS: Record<PlacementId, Placement> = {
  header: {
    label: 'Header, 21:9',
    file: 'header',
    width: 3840,
    height: 1646,
    safe: { x: 1097, y: 493, w: 1646, h: 661 },
    upload: true,
  },
  search: {
    label: 'Search results, 3:2',
    file: 'search-results',
    width: 3840,
    height: 2560,
    safe: { x: 836, y: 765, w: 2168, h: 1030 },
    upload: true,
  },
  // The one asset App Store Connect can use in both places. Not uploaded: its
  // safe area is the narrowest, so the stages come out smaller in search
  // results than on the 3:2 asset (see the report).
  universal: {
    label: 'Universal, 16:9, for both',
    file: 'universal',
    width: 5244,
    height: 2950,
    safe: { x: 1921, y: 660, w: 1402, h: 962 },
    upload: false,
  },
};

/**
 * The search asset's width in an iPhone's search results, in points. Apple
 * gives only the 3:2 aspect; this is objectgraph.com's "about 365 points".
 */
export const SEARCH_POINTS_ON_A_PHONE = 365;
