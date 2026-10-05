import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  glintFailures,
  ladderFailures,
  lengths,
  pairFailures,
  uncommonVersusRare,
  type Fixture,
} from './guard.ts';

/**
 * The baseline can see what a port is likeliest to lose: the rung ladder, the
 * cute glint, and the rejected guess's two notes.
 *
 * Reads the committed baseline. SOUND_BASELINE_DIR points it at another
 * capture instead, such as one from `pnpm sounds:baseline --out <dir>` with the
 * engine changed, which is how this test was shown red.
 */
const DIR =
  process.env.SOUND_BASELINE_DIR ??
  resolve(process.cwd(), 'src/audio/baseline');

const fixture = JSON.parse(
  readFileSync(resolve(DIR, 'sounds.json'), 'utf8'),
) as Fixture;

describe('the sound baseline sees the rung ladder and the glint', () => {
  test('holds all six found lengths', () => {
    expect(lengths(fixture)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  test('every rung has its own sparkle, louder rung by rung', () => {
    expect(ladderFailures(fixture)).toEqual([]);
  });

  test('every cute mythic has the 5x glint its letterpress twin lacks', () => {
    expect(glintFailures(fixture)).toEqual([]);
  });

  test('the rejected guess is a descending whole tone, its two notes level', () => {
    expect(pairFailures(fixture)).toEqual([]);
  });

  /**
   * The case the partials were added for. By every summary scalar (peak, RMS,
   * onset, end, duration, stop, pitch) uncommon and rare are within the
   * render-to-render tolerance of each other, so a comparison on those cannot
   * tell them apart. The envelope does separate them, by 0.03 to 0.2 dB: real,
   * but far too little to survive a change of engine. The sparkle separates
   * them by over 2 dB.
   */
  test.each(uncommonVersusRare(fixture))(
    'length $length: the summary cannot tell uncommon from rare, and the sparkle can',
    ({ scalarsInTolerances, summaryDb, sparkleDb }) => {
      const tol = fixture.tolerance.allow.partialDb;
      expect(scalarsInTolerances).toBeLessThanOrEqual(1);
      expect(summaryDb).toBeLessThan(0.25);
      expect(sparkleDb).toBeGreaterThanOrEqual(1);
      expect(sparkleDb).toBeGreaterThanOrEqual(100 * tol);
      expect(sparkleDb).toBeGreaterThanOrEqual(10 * summaryDb);
    },
  );
});
