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
import { STORAGE_EPOCH } from '@/engine/config.ts';
import type { Theme } from './useTheme.ts';

export type CostumeId =
  | 'witch-hat'
  | 'lantern'
  | 'ghost'
  | 'pie-crust'
  | 'beanie'
  | 'antlers'
  | 'santa-hat'
  | 'top-hat';

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
  'pie-crust': {
    id: 'pie-crust',
    spoken: 'wearing a pie crust hat',
    replacesFace: false,
    parts: [
      // The dish's side, under the rim, sitting into the head.
      {
        d: 'M17 21 L83 21 L76 30 C64 33.5 36 33.5 24 30 Z',
        fill: '#B66E2C',
      },
      // The filling, domed, which the lattice is laid over. It covers the leaf.
      {
        d: 'M18 21 C19 7 34 3 50 3 C66 3 81 7 82 21 Z',
        fill: '#9C3434',
      },
      // The lattice: two strips across, then four down over them.
      {
        d: 'M30.5 6.1 L69.5 6.1 L76 9.9 L24 9.9 Z',
        fill: '#F6C677',
      },
      {
        d: 'M21.5 12.7 L78.5 12.7 L80.5 16.5 L19.5 16.5 Z',
        fill: '#F6C677',
      },
      {
        d: 'M27.7 7.7 L32.3 5.8 L32.3 21 L27.7 21 Z',
        fill: '#F6C677',
      },
      {
        d: 'M41.2 4.1 L45.8 3.7 L45.8 21 L41.2 21 Z',
        fill: '#F6C677',
      },
      {
        d: 'M54.2 3.7 L58.8 4.1 L58.8 21 L54.2 21 Z',
        fill: '#F6C677',
      },
      {
        d: 'M67.7 5.8 L72.3 7.7 L72.3 21 L67.7 21 Z',
        fill: '#F6C677',
      },
      // The crimped rim, its top edge in scallops, outlined so it holds on the
      // peach's own orange.
      {
        d:
          'M15 25.5 L15 19.5 C15.8 15.5 22 15.5 22.8 19.5 ' +
          'C23.6 15.5 29.8 15.5 30.6 19.5 C31.3 15.5 37.6 15.5 38.3 19.5 ' +
          'C39.1 15.5 45.3 15.5 46.1 19.5 C46.9 15.5 53.1 15.5 53.9 19.5 ' +
          'C54.7 15.5 60.9 15.5 61.7 19.5 C62.4 15.5 68.7 15.5 69.4 19.5 ' +
          'C70.2 15.5 76.4 15.5 77.2 19.5 C78 15.5 84.2 15.5 85 19.5 ' +
          'L85 25.5 C70 27.5 30 27.5 15 25.5 Z',
        fill: '#E09A48',
        stroke: '#8A4E1E',
        strokeWidth: 1.4,
      },
      // The dome's edge, so the pie's outline reads at the chip's size.
      {
        d: 'M18 21 C19 7 34 3 50 3 C66 3 81 7 82 21',
        stroke: '#8A4E1E',
        strokeWidth: 1.4,
      },
    ],
  },
  beanie: {
    id: 'beanie',
    spoken: 'wearing a knit beanie and scarf',
    replacesFace: false,
    parts: [
      // The knit dome, leaning 14 degrees about the head's centre. Lowered to
      // seat the pompom on top, upright it would leave the leaf peeking out
      // beside the pompom, and the lean carries the pompom over it.
      {
        d:
          'M26.7 24.5 C29.2 10.2 43.8 3.5 61.2 7.9 ' +
          'C78.7 12.2 88.4 25 83.9 38.8 C73.8 40.4 34.9 30.7 26.7 24.5 Z',
        fill: '#4C7FD3',
      },
      // The dome's knit ribs, fanning from the top, at the sizes that show a
      // face.
      {
        d: 'M46.6 8.9 C42.8 15.7 40 18.6 36.5 24.4',
        opacity: 0.55,
        stroke: '#355FAF',
        strokeWidth: 1.5,
        faceOnly: true,
      },
      {
        d: 'M53.4 10.6 C50.6 17.6 48.8 20.7 46.2 26.8',
        opacity: 0.55,
        stroke: '#355FAF',
        strokeWidth: 1.5,
        faceOnly: true,
      },
      {
        d: 'M60.2 12.2 C58.3 19.5 57.5 22.9 55.9 29.2',
        opacity: 0.55,
        stroke: '#355FAF',
        strokeWidth: 1.5,
        faceOnly: true,
      },
      {
        d: 'M67 13.9 C66.1 21.5 66.2 25.1 65.6 31.6',
        opacity: 0.55,
        stroke: '#355FAF',
        strokeWidth: 1.5,
        faceOnly: true,
      },
      {
        d: 'M73.7 15.6 C73.9 23.4 75 27.3 75.3 34.1',
        opacity: 0.55,
        stroke: '#355FAF',
        strokeWidth: 1.5,
        faceOnly: true,
      },
      // The cuff, folded up and hugging the head, with soft round ends where it
      // wraps out of sight.
      {
        d:
          'M28.3 20.3 C37.1 26.1 74 35.3 84.5 34.3 ' +
          'C88.2 36.2 87.7 42.3 83.8 43.4 C71.7 44.5 34.8 35.3 24.6 28.6 ' +
          'C21.7 25.9 24.1 20.3 28.3 20.3 Z',
        fill: '#5E8CDB',
      },
      // Its ribs, the knit's up-and-down, at the sizes that show a face.
      {
        d: 'M32.3 24.7 L30.9 30.3',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M37.9 27 L36.5 32.6',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M43.6 28.9 L42.2 34.6',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M49.4 30.8 L48 36.4',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M55.2 32.3 L53.7 38',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M61 33.7 L59.6 39.3',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M66.9 34.8 L65.5 40.4',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M72.9 35.7 L71.5 41.3',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      {
        d: 'M78.9 36.3 L77.5 41.9',
        opacity: 0.55,
        stroke: '#3D68B8',
        strokeWidth: 1.3,
        faceOnly: true,
      },
      // The fold along its top, lit.
      {
        d: 'M28.3 20.3 C37.1 26.1 74 35.3 84.5 34.3',
        stroke: '#7FA6E8',
        strokeWidth: 1.4,
      },
      // The pompom, on top, fluffy: white, with a faint edge on its bumps so it
      // holds on a cream page and a light tab strip.
      {
        d:
          'M62.4 3.1 C64.1 1.7 67.3 4 66.3 6.1 C68 6.1 68.7 8.7 67.3 9.5 ' +
          'C69.3 11 67.3 15 64.9 14.3 C65.1 16.1 62.2 17.2 61.2 15.7 ' +
          'C60.1 17.6 56.7 16.5 56.9 14.3 C55.5 14.8 54 12.8 54.8 11.6 ' +
          'C52.6 11 52.8 6.9 55.1 6.5 C54.2 4.9 56.1 2.8 57.8 3.7 ' +
          'C58 1.5 61.7 1.1 62.4 3.1 Z',
        fill: '#FFFFFF',
        stroke: '#BFD0EE',
        strokeWidth: 1.4,
      },
      // The scarf, round the neck, its tail hanging down the front with a white
      // stripe, and its top edge lit.
      {
        d: 'M17 70.5 C33 76 67 76 83 70.5 L81 79 C66 84.5 34 84.5 19 79 Z',
        fill: '#4C7FD3',
      },
      {
        d: 'M58 78 L69 76.5 L74 94 L63 96 Z',
        fill: '#4C7FD3',
      },
      {
        d: 'M60.2 85 L70.6 83.3 L71.9 87.5 L61.4 89.3 Z',
        fill: '#FFFFFF',
        opacity: 0.9,
      },
      {
        d: 'M17 70.5 C33 76 67 76 83 70.5',
        stroke: '#7FA6E8',
        strokeWidth: 1.4,
      },
    ],
  },
  antlers: {
    id: 'antlers',
    spoken: 'wearing antlers and a red nose',
    replacesFace: false,
    parts: [
      // The antlers: thick strokes, since a hairline vanishes at the chip's
      // size. Each is a beam swept up and out, a tine out and a tine up,
      // mirrored. They keep clear of the crown's band, so the crown stands
      // between them, and the leaf shows whole between them.
      {
        d: 'M37 22 L31 13 L25 3.5',
        stroke: '#9A6238',
        strokeWidth: 6.5,
      },
      {
        d: 'M63 22 L69 13 L75 3.5',
        stroke: '#9A6238',
        strokeWidth: 6.5,
      },
      {
        d: 'M31.5 14 L19 11.5',
        stroke: '#9A6238',
        strokeWidth: 6.5,
      },
      {
        d: 'M68.5 14 L81 11.5',
        stroke: '#9A6238',
        strokeWidth: 6.5,
      },
      {
        d: 'M27.5 7.5 L18.5 4',
        stroke: '#9A6238',
        strokeWidth: 6.5,
      },
      {
        d: 'M72.5 7.5 L81.5 4',
        stroke: '#9A6238',
        strokeWidth: 6.5,
      },
      // Ears, low beside the antlers, at the sizes that show a face.
      {
        d: 'M33 26 C27 22 19 22 15 25 C19 30 27 31 33 26 Z',
        fill: '#C98D5E',
        faceOnly: true,
      },
      {
        d: 'M67 26 C73 22 81 22 85 25 C81 30 73 31 67 26 Z',
        fill: '#C98D5E',
        faceOnly: true,
      },
      {
        d: 'M31 26 C27 24 22 24 19 25.3 C22 28 27 28.5 31 26 Z',
        fill: '#F2B9A8',
        faceOnly: true,
      },
      {
        d: 'M69 26 C73 24 78 24 81 25.3 C78 28 73 28.5 69 26 Z',
        fill: '#F2B9A8',
        faceOnly: true,
      },
      // The red nose, between the eyes and the smile, with a glint. It goes
      // with the face: where the face drops, the antlers carry the day.
      {
        d:
          'M45.4 61.5 C45.4 59 47.5 56.9 50 56.9 ' +
          'C52.5 56.9 54.6 59 54.6 61.5 C54.6 64 52.5 66.1 50 66.1 ' +
          'C47.5 66.1 45.4 64 45.4 61.5 Z',
        fill: '#E5383B',
        faceOnly: true,
      },
      {
        d:
          'M47.1 59.9 C47.1 59.2 47.7 58.6 48.4 58.6 ' +
          'C49.1 58.6 49.7 59.2 49.7 59.9 C49.7 60.6 49.1 61.2 48.4 61.2 ' +
          'C47.7 61.2 47.1 60.6 47.1 59.9 Z',
        fill: '#FFFFFF',
        opacity: 0.85,
        faceOnly: true,
      },
    ],
  },
  'santa-hat': {
    id: 'santa-hat',
    spoken: 'wearing a Santa hat',
    replacesFace: false,
    parts: [
      // The elf hat's body and its fold, in Santa's red, the tip flopping over
      // to the side.
      {
        d:
          'M22 25 C26 16 36 6 50 3 C62 1 74 4 84 12 C78 11 70 11 64 14 ' +
          'C70 17 74 21 78 25 Z',
        fill: '#D93A36',
      },
      {
        d: 'M50 3 C62 1 74 4 84 12 C76 9 66 8 58 11 Z',
        fill: '#AE2A2A',
        opacity: 0.6,
      },
      // The fur trim, following the band's curve round the head, its lower edge
      // in soft bumps. White, with an edge so it holds on a cream page and a
      // light tab strip.
      {
        d:
          'M19 24.5 C21.3 23.2 24.4 21.6 26.8 23 ' +
          'C29.1 21.6 32.2 20.6 34.5 21.9 C36.8 20.6 39.9 19.9 42.2 21.2 ' +
          'C44.6 19.9 47.7 19.7 50 21 C52.3 19.7 55.4 19.9 57.8 21.2 ' +
          'C60.1 19.9 63.2 20.6 65.5 21.9 C67.8 20.6 70.9 21.6 73.2 23 ' +
          'C75.6 21.6 78.7 23.2 81 24.5 C83.6 26 83.6 30.5 81 32 ' +
          'C79.5 34.2 74.8 32.7 73.2 30.5 C71.7 32.7 67 31.6 65.5 29.4 ' +
          'C64 31.6 59.3 30.9 57.8 28.7 C56.2 30.9 51.5 30.7 50 28.5 ' +
          'C48.5 30.7 43.8 30.9 42.2 28.7 C40.7 30.9 36 31.6 34.5 29.4 ' +
          'C33 31.6 28.3 32.7 26.8 30.5 C25.2 32.7 20.6 34.2 19 32 ' +
          'C16.4 30.5 16.4 26 19 24.5 Z',
        fill: '#FFFFFF',
        stroke: '#E2D3D3',
        strokeWidth: 1.6,
      },
      // The pompom, where the elf's bell hangs, fluffy, with the same edge.
      {
        d:
          'M84 10.1 C85 8.8 87.8 10 87.5 11.6 ' +
          'C88.8 11.4 89.8 13.5 88.9 14.4 C90.5 15.5 89.1 18.9 87.2 18.7 ' +
          'C87.4 20.2 84.9 21.1 84 19.9 C82.9 21.3 79.9 19.8 80.2 18.1 ' +
          'C79 18.1 78.2 16 79.1 15.2 C77.7 14.1 79 11.1 80.8 11.3 ' +
          'C80.6 9.9 83.1 8.9 84 10.1 Z',
        fill: '#FFFFFF',
        stroke: '#E2D3D3',
        strokeWidth: 1.6,
      },
    ],
  },
  'top-hat': {
    id: 'top-hat',
    spoken: 'wearing a top hat',
    replacesFace: false,
    parts: [
      // The brim, tilted with the hat.
      {
        d:
          'M21.2 20.5 C21.8 16 79.3 24.1 78.6 28.5 ' +
          'C78 33 20.6 24.9 21.2 20.5 Z',
        fill: '#2E2A3A',
      },
      // The crown. It stands tall enough, tilted, to keep the leaf covered.
      {
        d: 'M35 1.7 C35.2 0.2 70.8 5.2 70.6 6.7 L65.8 26.2 L34.2 21.8 Z',
        fill: '#2E2A3A',
      },
      // Its gold band.
      {
        d: 'M34.5 14.8 L67.4 19.4 L66.1 24.7 L34.4 20.3 Z',
        fill: '#FFD34D',
      },
      // The lit edges, which hold it on a dark tab strip.
      {
        d: 'M36.3 2.9 L35.8 21',
        stroke: '#6C6588',
        strokeWidth: 1.6,
      },
      {
        d: 'M23.4 19.3 C34.6 18.8 66.3 23.3 76.9 26.8',
        stroke: '#6C6588',
        strokeWidth: 1.4,
      },
      // A sparkle beside it.
      {
        d:
          'M20 4.5 C21.4 10.7 21.4 10.7 27.5 12 ' +
          'C21.4 13.3 21.4 13.3 20 19.5 C18.6 13.3 18.6 13.3 12.5 12 ' +
          'C18.6 10.7 18.6 10.7 20 4.5 Z',
        fill: '#FFD34D',
        stroke: '#D9A52B',
        strokeWidth: 1.1,
      },
    ],
  },
};

/** In a fixed order, so the table hashes the same in both apps. */
export const COSTUME_ORDER: readonly CostumeId[] = [
  'witch-hat',
  'lantern',
  'ghost',
  'pie-crust',
  'beanie',
  'antlers',
  'santa-hat',
  'top-hat',
];

/**
 * The table as one canonical text, which both apps hash, the days included, so
 * a day changed in one app fails the other's suite as a drawing does.
 *
 * - One line per part: id, d, fill, opacity, stroke, strokeWidth, faceOnly,
 *   empty where unset, and the costume's own line before its parts.
 * - Then one line per day, in COSTUME_DAYS' order: month, day, weekday, nth,
 *   costume and occasion, empty where unset.
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
  for (const d of COSTUME_DAYS) {
    const [day, weekday, nth] =
      'day' in d ? [d.day, '', ''] : ['', d.weekday, d.nth];
    lines.push([d.month, day, weekday, nth, d.costume, d.occasion].join('|'));
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

/**
 * A day the peach dresses up, and what it wears: a fixed date, or a day that
 * moves, named by its weekday and which of the month's it is.
 */
export type CostumeDay = {
  month: number; // 1-12
  costume: CostumeId;
  /** What the day is, for whoever reads this table. Never shown. */
  occasion: string;
} & (
  | { day: number }
  | {
      /** 0 for Sunday to 6 for Saturday, as getUTCDay counts. */
      weekday: number;
      /** Which of the month's: 1 for the first. */
      nth: number;
    }
);

const THURSDAY = 4;

/**
 * The days the peach dresses up. Other occasions may follow; each is a row.
 *
 * The costume goes by the board's date, not today's: today's board on the day
 * wears it, and so does that day's board played later, while any other day's
 * board does not, even if it is played on the day.
 */
export const COSTUME_DAYS: readonly CostumeDay[] = [
  { month: 10, day: 31, costume: 'ghost', occasion: 'Halloween' },
  {
    month: 11,
    weekday: THURSDAY,
    nth: 4,
    costume: 'pie-crust',
    occasion: 'Thanksgiving',
  },
  { month: 12, day: 21, costume: 'beanie', occasion: 'Winter solstice' },
  { month: 12, day: 24, costume: 'antlers', occasion: 'Christmas Eve' },
  { month: 12, day: 25, costume: 'santa-hat', occasion: 'Christmas Day' },
  { month: 12, day: 31, costume: 'top-hat', occasion: "New Year's Eve" },
  { month: 1, day: 1, costume: 'top-hat', occasion: "New Year's Day" },
];

/** Whether `d` falls on `day` of its month in `year`. */
function fallsOn(d: CostumeDay, year: number, day: number): boolean {
  if ('day' in d) return d.day === day;
  const weekday = new Date(Date.UTC(year, d.month - 1, day)).getUTCDay();
  return weekday === d.weekday && Math.ceil(day / 7) === d.nth;
}

/** The costume for a calendar date, or null. */
export function costumeForDate(
  year: number,
  month: number,
  day: number,
): CostumeId | null {
  return (
    COSTUME_DAYS.find((d) => d.month === month && fallsOn(d, year, day))
      ?.costume ?? null
  );
}

/**
 * The costume for the board on screen.
 *
 * - `dayIndex` is the board's own day, as useGame keys it: days since
 *   STORAGE_EPOCH. Endless has none, so it never dresses.
 * - Letterpress never dresses: the costumes are the cute peach's.
 * - `search` is the address's query string in a development build only
 *   (the caller passes null otherwise). `?costumeDate=YYYY-MM-DD` previews
 *   any date, standing in for the board's.
 */
export function boardCostume(
  dayIndex: number | null,
  theme: Theme,
  search: string | null,
): CostumeId | null {
  if (theme !== 'cute') return null;
  const preview = search?.match(
    /[?&]costumeDate=(\d{4})-(\d{2})-(\d{2})(?:&|$)/,
  );
  if (preview)
    return costumeForDate(
      Number(preview[1]),
      Number(preview[2]),
      Number(preview[3]),
    );
  if (dayIndex === null) return null;
  const date = new Date(
    Date.UTC(
      STORAGE_EPOCH.year,
      STORAGE_EPOCH.month - 1,
      STORAGE_EPOCH.day + dayIndex,
    ),
  );
  return costumeForDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}
