import { describe, expect, test } from 'vitest';
import type { Measurement } from './soundMeasure.ts';
import { NO_SPREAD, spreadBetween, toleranceFrom } from './renderSpread.ts';

const base: Measurement = {
  onset: 0.0068,
  end: 0.1449,
  duration: 0.1381,
  stop: 0.3,
  peakDbfs: -15.31,
  rmsDbfs: -28.2,
  fundamentalHz: 392,
  envelopeDbfs: [-29.6, -15.31, null],
  spectrum: [
    {
      t: 0.065,
      dbfs: -18,
      partials: [
        { hz: 392, db: 0 },
        { hz: 1176, db: -14.5 },
      ],
    },
  ],
};

const withPartials = (partials: Measurement['spectrum'][0]['partials']) => ({
  ...base,
  spectrum: [{ ...base.spectrum[0]!, partials }],
});

describe('spreadBetween', () => {
  test('two identical measurements do not spread', () => {
    expect(spreadBetween(base, structuredClone(base))).toEqual(NO_SPREAD);
  });

  test('reads value differences by kind', () => {
    const s = spreadBetween(base, {
      ...withPartials([
        { hz: 392.01, db: 0 },
        { hz: 1176, db: -14.52 },
      ]),
      end: 0.14492,
      rmsDbfs: -28.21,
    });
    expect(s.seconds).toBeCloseTo(0.00002, 8);
    expect(s.db).toBeCloseTo(0.01, 8);
    expect(s.partialHz).toBeCloseTo(0.01, 8);
    expect(s.partialDb).toBeCloseTo(0.02, 8);
    expect(s.membershipChanges).toBe(0);
  });

  test('counts a partial that comes or goes, and a change of strongest', () => {
    expect(
      spreadBetween(base, withPartials([{ hz: 392, db: 0 }])).membershipChanges,
    ).toBe(1);
    expect(
      spreadBetween(
        base,
        withPartials([
          { hz: 1176, db: 0 },
          { hz: 392, db: -0.1 },
        ]),
      ).strongestChanges,
    ).toBe(1);
  });

  test('counts an envelope point or a window that turns silent', () => {
    const s = spreadBetween(base, {
      ...base,
      envelopeDbfs: [-29.6, -15.31, -140],
      spectrum: [{ t: 0.065, dbfs: null, partials: [] }],
    });
    expect(s.membershipChanges).toBe(1 + 1 + 2);
  });
});

describe('toleranceFrom', () => {
  test('allows one recording step when nothing spread', () => {
    expect(toleranceFrom(NO_SPREAD)).toEqual({
      seconds: 0.00001,
      db: 0.01,
      hz: 0.01,
      partialHz: 0.01,
      partialDb: 0.01,
    });
  });

  test('rounds a spread up to the step, then adds one', () => {
    const t = toleranceFrom({ ...NO_SPREAD, seconds: 0.0000208, db: 0.013 });
    expect(t.seconds).toBe(0.00004);
    expect(t.db).toBe(0.03);
  });
});
