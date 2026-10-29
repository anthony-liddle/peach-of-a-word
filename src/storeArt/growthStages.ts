import type { CostumePart } from '@/ui/costumes.ts';
import type { Rect } from './storeArtSpec.ts';

/**
 * The iOS title's growing peach: one drawing for each of the six ranks, then
 * the crown once the basket is full, as SVG path data in the peach's 100 by
 * 100 box. The web game doesn't draw these. They are here for the store art
 * page only.
 *
 * Copied from the iOS app's `Sources/PeachEngine/GrowthStages.swift`, which
 * `tools/growth-stages.py` generates from the drawings Antoine approved on 24
 * October 2026. `growthStages.test.ts` pins the same SHA-256 the iOS app's
 * `GrowthStageTests` does, so a copy that drifts fails here.
 */
export interface GrowthStage {
  /** The iOS `GrowthStage` raw value. */
  id: string;
  /** What the peach is at this stage, said after "The peach is". */
  spoken: string;
  parts: readonly CostumePart[];
}

export const GROWTH_STAGES: readonly GrowthStage[] = [
  {
    id: 'first-sprout',
    spoken: 'a first sprout',
    parts: [
      { d: 'M50 72 C50 62 49 54 50 46', stroke: '#6FBF9C', strokeWidth: 4 },
      { d: 'M50 54 C43 42 31 39 23 44 C29 53 41 57 50 54 Z', fill: '#8FD3B6' },
      { d: 'M50 49 C56 35 70 30 79 35 C74 46 61 52 50 49 Z', fill: '#8FD3B6' },
      {
        d: 'M16 88 C16 74 32 68 50 68 C68 68 84 74 84 88 C84 92 16 92 16 88 Z',
        fill: '#C99A74',
      },
      {
        d: 'M24 80 C34 75 66 75 76 80',
        opacity: 0.6,
        stroke: '#B5835E',
        strokeWidth: 2,
      },
      {
        d: 'M41.5 81 C41.5 79.8 42.5 78.8 43.7 78.8 C44.9 78.8 45.9 79.8 45.9 81 C45.9 82.2 44.9 83.2 43.7 83.2 C42.5 83.2 41.5 82.2 41.5 81 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M54.1 81 C54.1 79.8 55.1 78.8 56.3 78.8 C57.5 78.8 58.5 79.8 58.5 81 C58.5 82.2 57.5 83.2 56.3 83.2 C55.1 83.2 54.1 82.2 54.1 81 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M46.9 86.4 C48.6 88.7 51.4 88.7 53.1 86.4',
        stroke: '#7A4A33',
        strokeWidth: 1.62,
        faceOnly: true,
      },
    ],
  },
  {
    id: 'little-bud',
    spoken: 'a little bud',
    parts: [
      { d: 'M50 92 C50 80 50 66 50 54', stroke: '#6FBF9C', strokeWidth: 4 },
      { d: 'M50 80 C42 70 30 70 24 76 C30 85 42 86 50 80 Z', fill: '#8FD3B6' },
      { d: 'M50 74 C58 64 70 64 76 70 C70 79 58 80 50 74 Z', fill: '#8FD3B6' },
      {
        d: 'M50 18 C61 26 67 37 65 46 C63 55 37 55 35 46 C33 37 39 26 50 18 Z',
        fill: '#FFC4CF',
      },
      {
        d: 'M50 22 C47 31 46 40 47 52',
        opacity: 0.7,
        stroke: '#FF9DAE',
        strokeWidth: 1.8,
      },
      {
        d: 'M36 46 C40 54 46 57 50 57 C54 57 60 54 64 46 C60 50 55 52 50 52 C45 52 40 50 36 46 Z',
        fill: '#6FBF9C',
      },
      {
        d: 'M43 37 C43 36 43.8 35.2 44.8 35.2 C45.7 35.2 46.5 36 46.5 37 C46.5 38 45.7 38.8 44.8 38.8 C43.8 38.8 43 38 43 37 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M53.5 37 C53.5 36 54.3 35.2 55.2 35.2 C56.2 35.2 57 36 57 37 C57 38 56.2 38.8 55.2 38.8 C54.3 38.8 53.5 38 53.5 37 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M47.4 41.5 C48.9 43.4 51.1 43.4 52.6 41.5',
        stroke: '#7A4A33',
        strokeWidth: 1.35,
        faceOnly: true,
      },
    ],
  },
  {
    id: 'blossom',
    spoken: 'in blossom',
    parts: [
      { d: 'M60 70 C72 72 80 82 78 94 C66 92 58 82 60 70 Z', fill: '#8FD3B6' },
      {
        d: 'M50 44 C61 38 62.1 17 50 17 C37.9 17 39 38 50 44 Z',
        fill: '#FFC4CF',
      },
      {
        d: 'M53.8 46.8 C62.9 55.4 83.2 49.9 79.5 38.4 C75.7 26.9 56.1 34.4 53.8 46.8 Z',
        fill: '#FFC4CF',
      },
      {
        d: 'M52.4 51.2 C47 62.6 58.4 80.2 68.2 73.1 C78 66 64.8 49.6 52.4 51.2 Z',
        fill: '#FFC4CF',
      },
      {
        d: 'M47.6 51.2 C35.2 49.6 22 66 31.8 73.1 C41.6 80.2 53 62.6 47.6 51.2 Z',
        fill: '#FFC4CF',
      },
      {
        d: 'M46.2 46.8 C43.9 34.4 24.3 26.9 20.5 38.4 C16.8 49.9 37.1 55.4 46.2 46.8 Z',
        fill: '#FFC4CF',
      },
      {
        d: 'M50 44 C54.5 38 55 26 50 26 C45 26 45.5 38 50 44 Z',
        fill: '#FF9DAE',
        opacity: 0.45,
      },
      {
        d: 'M53.8 46.8 C60.9 49.2 72.5 45.9 70.9 41.2 C69.4 36.5 58.1 40.6 53.8 46.8 Z',
        fill: '#FF9DAE',
        opacity: 0.45,
      },
      {
        d: 'M52.4 51.2 C52.2 58.7 58.9 68.7 62.9 65.8 C66.9 62.9 59.5 53.4 52.4 51.2 Z',
        fill: '#FF9DAE',
        opacity: 0.45,
      },
      {
        d: 'M47.6 51.2 C40.5 53.4 33.1 62.9 37.1 65.8 C41.1 68.7 47.8 58.7 47.6 51.2 Z',
        fill: '#FF9DAE',
        opacity: 0.45,
      },
      {
        d: 'M46.2 46.8 C41.9 40.6 30.6 36.5 29.1 41.2 C27.5 45.9 39.1 49.2 46.2 46.8 Z',
        fill: '#FF9DAE',
        opacity: 0.45,
      },
      {
        d: 'M39 48 C39 41.9 43.9 37 50 37 C56.1 37 61 41.9 61 48 C61 54.1 56.1 59 50 59 C43.9 59 39 54.1 39 48 Z',
        fill: '#FFE08A',
      },
      {
        d: 'M42.5 46 C42.5 44.9 43.3 44.1 44.4 44.1 C45.5 44.1 46.3 44.9 46.3 46 C46.3 47.1 45.5 47.9 44.4 47.9 C43.3 47.9 42.5 47.1 42.5 46 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M53.7 46 C53.7 44.9 54.5 44.1 55.6 44.1 C56.7 44.1 57.5 44.9 57.5 46 C57.5 47.1 56.7 47.9 55.6 47.9 C54.5 47.9 53.7 47.1 53.7 46 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M47.2 50.8 C48.8 52.8 51.2 52.8 52.8 50.8',
        stroke: '#7A4A33',
        strokeWidth: 1.44,
        faceOnly: true,
      },
    ],
  },
  {
    id: 'ripening',
    spoken: 'ripening',
    parts: [
      {
        d: 'M50 32.6 C52.9 26.9 60.1 26.2 63 29.8 C61.5 34.1 56.5 36.2 52.9 35.5 Z',
        fill: '#8FD3B6',
      },
      {
        d: 'M50 35.5 C64.4 35.5 74.5 47 74.5 61.4 C74.5 77.3 63 88.8 50 88.8 C37 88.8 25.5 77.3 25.5 61.4 C25.5 47 35.6 35.5 50 35.5 Z',
        fill: '#CFE3A0',
      },
      {
        d: 'M50 35.5 C43.5 35.5 37.8 38.4 33.4 43.4 C38.5 46.3 44.2 47 50 47 C55.8 47 61.5 46.3 66.6 43.4 C62.2 38.4 56.5 35.5 50 35.5 Z',
        fill: '#E3EFC3',
        opacity: 0.7,
      },
      {
        d: 'M40.4 65.8 C40.4 64.4 41.4 63.3 42.8 63.3 C44.2 63.3 45.2 64.4 45.2 65.8 C45.2 67.1 44.2 68.2 42.8 68.2 C41.4 68.2 40.4 67.1 40.4 65.8 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M54.8 65.8 C54.8 64.4 55.8 63.3 57.2 63.3 C58.6 63.3 59.6 64.4 59.6 65.8 C59.6 67.1 58.6 68.2 57.2 68.2 C55.8 68.2 54.8 67.1 54.8 65.8 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M35.2 71.5 C35.2 69.7 36.7 68.3 38.5 68.3 C40.3 68.3 41.7 69.7 41.7 71.5 C41.7 73.3 40.3 74.8 38.5 74.8 C36.7 74.8 35.2 73.3 35.2 71.5 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M58.3 71.5 C58.3 69.7 59.7 68.3 61.5 68.3 C63.3 68.3 64.8 69.7 64.8 71.5 C64.8 73.3 63.3 74.8 61.5 74.8 C59.7 74.8 58.3 73.3 58.3 71.5 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M46.4 72.2 C48.6 74.4 51.4 74.4 53.6 72.2',
        stroke: '#7A4A33',
        strokeWidth: 1.58,
        faceOnly: true,
      },
    ],
  },
  {
    id: 'sweet',
    spoken: 'ripe and sweet',
    parts: [
      {
        d: 'M50 22.3 C53.4 15.4 62 14.6 65.5 18.9 C63.8 24 57.7 26.6 53.4 25.8 Z',
        fill: '#8FD3B6',
      },
      {
        d: 'M50 25.8 C67.2 25.8 79.2 39.5 79.2 56.7 C79.2 75.6 65.5 89.4 50 89.4 C34.5 89.4 20.8 75.6 20.8 56.7 C20.8 39.5 32.8 25.8 50 25.8 Z',
        fill: '#FFC27A',
      },
      {
        d: 'M50 25.8 C42.3 25.8 35.4 29.2 30.2 35.2 C36.2 38.7 43.1 39.5 50 39.5 C56.9 39.5 63.8 38.7 69.8 35.2 C64.6 29.2 57.7 25.8 50 25.8 Z',
        fill: '#FFD79B',
        opacity: 0.7,
      },
      {
        d: 'M38.5 61.9 C38.5 60.2 39.8 59 41.4 59 C43 59 44.3 60.2 44.3 61.9 C44.3 63.5 43 64.8 41.4 64.8 C39.8 64.8 38.5 63.5 38.5 61.9 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M55.7 61.9 C55.7 60.2 57 59 58.6 59 C60.2 59 61.5 60.2 61.5 61.9 C61.5 63.5 60.2 64.8 58.6 64.8 C57 64.8 55.7 63.5 55.7 61.9 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M32.4 68.8 C32.4 66.6 34.1 64.9 36.2 64.9 C38.4 64.9 40.1 66.6 40.1 68.8 C40.1 70.9 38.4 72.6 36.2 72.6 C34.1 72.6 32.4 70.9 32.4 68.8 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M59.9 68.8 C59.9 66.6 61.6 64.9 63.8 64.9 C65.9 64.9 67.6 66.6 67.6 68.8 C67.6 70.9 65.9 72.6 63.8 72.6 C61.6 72.6 59.9 70.9 59.9 68.8 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M45.7 69.6 C48.3 72.2 51.7 72.2 54.3 69.6',
        stroke: '#7A4A33',
        strokeWidth: 1.89,
        faceOnly: true,
      },
    ],
  },
  {
    id: 'perfectly-peachy',
    spoken: 'perfectly peachy',
    parts: [
      { d: 'M50 12 C54 4 64 3 68 8 C66 14 59 17 54 16 Z', fill: '#8FD3B6' },
      {
        d: 'M50 16 C70 16 84 32 84 52 C84 74 68 90 50 90 C32 90 16 74 16 52 C16 32 30 16 50 16 Z',
        fill: '#FFC27A',
      },
      {
        d: 'M50 16 C41 16 33 20 27 27 C34 31 42 32 50 32 C58 32 66 31 73 27 C67 20 59 16 50 16 Z',
        fill: '#FFD79B',
        opacity: 0.7,
      },
      {
        d: 'M36.6 58 C36.6 56.1 38.1 54.6 40 54.6 C41.9 54.6 43.4 56.1 43.4 58 C43.4 59.9 41.9 61.4 40 61.4 C38.1 61.4 36.6 59.9 36.6 58 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M56.6 58 C56.6 56.1 58.1 54.6 60 54.6 C61.9 54.6 63.4 56.1 63.4 58 C63.4 59.9 61.9 61.4 60 61.4 C58.1 61.4 56.6 59.9 56.6 58 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M29.5 66 C29.5 63.5 31.5 61.5 34 61.5 C36.5 61.5 38.5 63.5 38.5 66 C38.5 68.5 36.5 70.5 34 70.5 C31.5 70.5 29.5 68.5 29.5 66 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M61.5 66 C61.5 63.5 63.5 61.5 66 61.5 C68.5 61.5 70.5 63.5 70.5 66 C70.5 68.5 68.5 70.5 66 70.5 C63.5 70.5 61.5 68.5 61.5 66 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M45 67 C48 70 52 70 55 67',
        stroke: '#7A4A33',
        strokeWidth: 2.2,
        faceOnly: true,
      },
    ],
  },
  {
    id: 'crown',
    spoken: 'wearing its crown',
    parts: [
      {
        d: 'M50 16 C70 16 84 32 84 52 C84 74 68 90 50 90 C32 90 16 74 16 52 C16 32 30 16 50 16 Z',
        fill: '#FFC27A',
      },
      {
        d: 'M50 16 C41 16 33 20 27 27 C34 31 42 32 50 32 C58 32 66 31 73 27 C67 20 59 16 50 16 Z',
        fill: '#FFD79B',
        opacity: 0.7,
      },
      {
        d: 'M36.6 58 C36.6 56.1 38.1 54.6 40 54.6 C41.9 54.6 43.4 56.1 43.4 58 C43.4 59.9 41.9 61.4 40 61.4 C38.1 61.4 36.6 59.9 36.6 58 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M56.6 58 C56.6 56.1 58.1 54.6 60 54.6 C61.9 54.6 63.4 56.1 63.4 58 C63.4 59.9 61.9 61.4 60 61.4 C58.1 61.4 56.6 59.9 56.6 58 Z',
        fill: '#7A4A33',
        faceOnly: true,
      },
      {
        d: 'M29.5 66 C29.5 63.5 31.5 61.5 34 61.5 C36.5 61.5 38.5 63.5 38.5 66 C38.5 68.5 36.5 70.5 34 70.5 C31.5 70.5 29.5 68.5 29.5 66 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M61.5 66 C61.5 63.5 63.5 61.5 66 61.5 C68.5 61.5 70.5 63.5 70.5 66 C70.5 68.5 68.5 70.5 66 70.5 C63.5 70.5 61.5 68.5 61.5 66 Z',
        fill: '#FF9DAE',
        opacity: 0.7,
        faceOnly: true,
      },
      {
        d: 'M45 67 C48 70 52 70 55 67',
        stroke: '#7A4A33',
        strokeWidth: 2.2,
        faceOnly: true,
      },
      {
        d: 'M29 33 L26 11 L39 21 L50 5 L61 21 L74 11 L71 33 C62 36.5 38 36.5 29 33 Z',
        fill: '#FF9E58',
      },
      {
        d: 'M29 33 C38 36.5 62 36.5 71 33 L70.4 28 C62 31.2 38 31.2 29.6 28 Z',
        fill: '#F07F36',
      },
      {
        d: 'M23 11 C23 9.3 24.3 8 26 8 C27.7 8 29 9.3 29 11 C29 12.7 27.7 14 26 14 C24.3 14 23 12.7 23 11 Z',
        fill: '#FFE08A',
        faceOnly: true,
      },
      {
        d: 'M46.6 5 C46.6 3.1 48.1 1.6 50 1.6 C51.9 1.6 53.4 3.1 53.4 5 C53.4 6.9 51.9 8.4 50 8.4 C48.1 8.4 46.6 6.9 46.6 5 Z',
        fill: '#FFC4CF',
        faceOnly: true,
      },
      {
        d: 'M71 11 C71 9.3 72.3 8 74 8 C75.7 8 77 9.3 77 11 C77 12.7 75.7 14 74 14 C72.3 14 71 12.7 71 11 Z',
        fill: '#FFE08A',
        faceOnly: true,
      },
    ],
  },
];

/**
 * The table as one canonical text, as the iOS app's `canonicalGrowthTable()`
 * writes it: the stage's own line, then one line per part, fields joined by
 * `|`, empty where unset.
 */
export function canonicalGrowthTable(): string {
  const lines: string[] = [];
  for (const s of GROWTH_STAGES) {
    lines.push(`${s.id}|${s.spoken}`);
    for (const p of s.parts) {
      lines.push(
        [
          s.id,
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
 * A drawing's extent in the peach's box: every point of every path, plus half
 * of any stroke. A cubic lies inside the hull of its points, so this can only
 * be a little generous, never short.
 */
export function bounds(parts: readonly CostumePart[]): Rect {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const p of parts) {
    const n = (p.d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const pad = (p.strokeWidth ?? 0) / 2;
    for (let i = 0; i + 1 < n.length; i += 2) {
      l = Math.min(l, n[i]! - pad);
      r = Math.max(r, n[i]! + pad);
      t = Math.min(t, n[i + 1]! - pad);
      b = Math.max(b, n[i + 1]! + pad);
    }
  }
  return { x: l, y: t, w: r - l, h: b - t };
}
