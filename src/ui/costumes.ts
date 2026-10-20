/**
 * What the peach can wear. Drawn over PeachMark's own geometry, in its 100x100
 * box, so a costume never changes the peach's footprint: costumes.test.ts holds
 * every coordinate inside the box.
 *
 * Absolute commands only (M, L, C, Z), for two reasons. A cubic curve lies
 * inside the hull of its points, so checking the points proves the shape stays
 * in the box. And the iOS app parses these same strings into SwiftUI paths
 * rather than keeping a second drawing that could drift: both repos pin the
 * table to one hash, COSTUME_TABLE_SHA256.
 */
export type CostumeId = 'witch-hat' | 'lantern' | 'ghost';

export interface CostumePart {
  /** SVG path data, absolute M, L, C and Z only. */
  d: string;
  fill?: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  /**
   * Drawn only where the peach shows its face. The face is dropped at mark
   * size, where it turns to mud, and a costume's face goes with it.
   */
  faceOnly?: boolean;
}

export interface Costume {
  id: CostumeId;
  /** What a screen reader says the peach is wearing, after "the peach". */
  spoken: string;
  /** The peach's own face is hidden, because the costume draws another. */
  replacesFace: boolean;
  parts: readonly CostumePart[];
}

const COCOA = '#7A4A33';
const LEAF = '#8FD3B6';

/** The peach's own leaf, `M50 12c4-8 14-9 18-4-2 6-9 9-14 8z`, made absolute. */
const LEAF_PATH = 'M50 12 C54 4 64 3 68 8 C66 14 59 17 54 16 Z';

export const COSTUMES: Record<CostumeId, Costume> = {
  'witch-hat': {
    id: 'witch-hat',
    spoken: "in a witch's hat",
    replacesFace: false,
    parts: [
      // The cone, its tip bent over to the right. It covers the leaf.
      {
        d: 'M33 27 C37 19 41 11 47 7 C54 2 63 1 72 3 C65 6 61 11 61 18 L66 27 Z',
        fill: '#5B3F8C',
      },
      // A lighter fold down the cone, so it reads as cloth on a dark surface.
      {
        d: 'M47 7 C54 2 63 1 72 3 C64 5 57 8 52 14 Z',
        fill: '#8A6BC9',
        opacity: 0.8,
      },
      // The band, in the leaf's mint.
      {
        d: 'M35 24 C45 27 55 27 64 24 L62 19 C54 22 46 22 37 19 Z',
        fill: LEAF,
      },
      // The brim, sitting low on the peach's head.
      {
        d: 'M16 29 C16 22 84 22 84 29 C84 35 16 35 16 29 Z',
        fill: '#4B3470',
      },
      // The brim's top edge, lit.
      {
        d: 'M20 27 C30 23 70 23 80 27',
        stroke: '#8A6BC9',
        strokeWidth: 2,
      },
      // A star on the cone, which only the larger sizes show.
      {
        d: 'M52 9 L53.6 12.6 L57.4 12.9 L54.5 15.4 L55.4 19.1 L52 17.1 L48.6 19.1 L49.5 15.4 L46.6 12.9 L50.4 12.6 Z',
        fill: '#FFE08A',
        faceOnly: true,
      },
    ],
  },
  lantern: {
    id: 'lantern',
    spoken: "carved as a jack-o'-lantern",
    replacesFace: true,
    parts: [
      // A deeper orange over the peach's body, `M50 16c20 0 34 16 34 36 0 22-16
      // 38-34 38S16 74 16 52c0-20 14-36 34-36z` made absolute.
      {
        d: 'M50 16 C70 16 84 32 84 52 C84 74 68 90 50 90 C32 90 16 74 16 52 C16 32 30 16 50 16 Z',
        fill: '#FF9A3D',
        opacity: 0.55,
      },
      // The ribs.
      {
        d: 'M38 19 C27 34 27 72 38 88',
        stroke: '#E07A2A',
        strokeWidth: 2.5,
        opacity: 0.75,
      },
      {
        d: 'M62 19 C73 34 73 72 62 88',
        stroke: '#E07A2A',
        strokeWidth: 2.5,
        opacity: 0.75,
      },
      {
        d: 'M50 17 C46 38 46 68 50 89',
        stroke: '#E07A2A',
        strokeWidth: 2.5,
        opacity: 0.45,
      },
      // The stem, in front of the leaf.
      { d: 'M46 18 L47 9 C48 6 53 6 54 9 L55 18 Z', fill: '#7A5230' },
      // The carved face: eyes pointing up, a small nose, a toothy grin.
      { d: 'M33 53 L45 53 L39 43 Z', fill: COCOA, faceOnly: true },
      { d: 'M55 53 L67 53 L61 43 Z', fill: COCOA, faceOnly: true },
      { d: 'M47.5 61 L52.5 61 L50 57 Z', fill: COCOA, faceOnly: true },
      {
        d: 'M29 64 C38 76 62 76 71 64 L65 66 L62 70 L58 67 L54 72 L50 68 L46 72 L42 67 L38 70 L35 66 Z',
        fill: COCOA,
        faceOnly: true,
      },
    ],
  },
  ghost: {
    id: 'ghost',
    spoken: 'in a ghost sheet',
    replacesFace: true,
    parts: [
      // The sheet, with a scalloped hem the bottom of the peach shows under.
      {
        d:
          'M50 9 C72 9 85 26 85 48 L85 80 C81.1 76 77.2 76 73.3 80 C69.4 84 65.6 84 61.7 80 ' +
          'C57.8 76 53.9 76 50 80 C46.1 84 42.2 84 38.3 80 C34.4 76 30.6 76 26.7 80 ' +
          'C22.8 84 18.9 84 15 80 L15 48 C15 26 28 9 50 9 Z',
        fill: '#FFFFFF',
        stroke: '#D6C9EE',
        strokeWidth: 2.5,
      },
      // The leaf, through a hole in the top.
      { d: LEAF_PATH, fill: LEAF },
      // The eye holes, which stay at every size: they are what make it a ghost.
      { d: 'M35 46 C35 38 45 38 45 46 C45 54 35 54 35 46 Z', fill: COCOA },
      { d: 'M55 46 C55 38 65 38 65 46 C65 54 55 54 55 46 Z', fill: COCOA },
      // A small "oo", and the peach's own blush, on the sheet.
      {
        d: 'M47 61 C47 56 53 56 53 61 C53 66 47 66 47 61 Z',
        fill: COCOA,
        faceOnly: true,
      },
      {
        d: 'M27 58 C27 53 35 53 35 58 C35 63 27 63 27 58 Z',
        fill: '#FF9DAE',
        opacity: 0.6,
        faceOnly: true,
      },
      {
        d: 'M65 58 C65 53 73 53 73 58 C73 63 65 63 65 58 Z',
        fill: '#FF9DAE',
        opacity: 0.6,
        faceOnly: true,
      },
    ],
  },
};

/** In a fixed order, so the table hashes the same in both apps. */
export const COSTUME_ORDER: readonly CostumeId[] = [
  'witch-hat',
  'lantern',
  'ghost',
];

/**
 * The table as one canonical text, which both apps hash. One line per part:
 * id, d, fill, opacity, stroke, strokeWidth, faceOnly, empty where unset, and
 * the costume's own line before its parts.
 */
export function canonicalCostumeTable(): string {
  const lines: string[] = [];
  for (const id of COSTUME_ORDER) {
    const c = COSTUMES[id];
    lines.push(`${c.id}|${c.spoken}|${c.replacesFace}`);
    for (const p of c.parts) {
      lines.push(
        [
          c.id,
          p.d,
          p.fill ?? '',
          p.opacity ?? '',
          p.stroke ?? '',
          p.strokeWidth ?? '',
          p.faceOnly ?? false,
        ].join('|'),
      );
    }
  }
  return lines.join('\n');
}

/**
 * The web's source-word mark is a different peach from PeachMark: a little
 * smaller, with a cleft rather than a highlight (index.css, `.mark--source`).
 * A costume drawn for PeachMark sits on it after this transform, which maps
 * PeachMark's body (16 to 84 across, 16 to 90 down) onto the mark's (18 to 82,
 * 19 to 87) about their shared centre, x 50 and y 53.
 */
export const SOURCE_MARK_TRANSFORM = 'matrix(0.9412 0 0 0.9189 2.941 4.297)';
