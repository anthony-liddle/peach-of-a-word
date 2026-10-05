import { describe, expect, test } from 'vitest';
import { partialsAt } from './spectrum.ts';

/**
 * The partials are checked against signals whose answers are known, including
 * the two things the baseline leans on: a level ratio read to the hundredth of
 * a dB, and notes 125 Hz apart read as separate partials.
 */
const SR = 48000;

function tones(parts: [hz: number, amp: number][], seconds = 0.2) {
  const x = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < x.length; i++)
    for (const [hz, amp] of parts)
      x[i]! += amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

const near = (hz: number) => (p: { hz: number }) => Math.abs(p.hz - hz) < 1;

describe('partialsAt', () => {
  test('one sine is one partial, at its frequency and level', () => {
    const w = partialsAt(tones([[440, 0.5]]), 0.1, SR);
    expect(w.partials).toHaveLength(1);
    expect(w.partials[0]!.hz).toBeCloseTo(440, 1);
    expect(w.partials[0]!.db).toBe(0);
    expect(w.dbfs).toBeCloseTo(-6.02, 1);
  });

  test('reads the rare sparkle against the uncommon one, 0.08 to 0.06, as 2.50 dB', () => {
    const w = partialsAt(
      tones([
        [1000, 0.08],
        [3000, 0.06],
      ]),
      0.1,
      SR,
    );
    expect(w.partials).toHaveLength(2);
    expect(w.partials[1]!.hz).toBeCloseTo(3000, 1);
    expect(w.partials[1]!.db).toBeCloseTo(20 * Math.log10(0.06 / 0.08), 2);
  });

  test('resolves the Edition chord, notes 125 Hz apart, as three partials', () => {
    const w = partialsAt(
      tones([
        [523.25, 0.7],
        [659.25, 0.7],
        [783.99, 0.7],
      ]),
      0.1,
      SR,
    );
    for (const hz of [523.25, 659.25, 783.99])
      expect(w.partials.find(near(hz)), `${hz} Hz`).toBeDefined();
    expect(w.partials).toHaveLength(3);
  });

  test('finds a partial 50 dB down, and records no sidelobe as a partial', () => {
    const w = partialsAt(
      tones([
        [392, 0.5],
        [1960, 0.5 * 10 ** (-50 / 20)],
      ]),
      0.1,
      SR,
    );
    expect(w.partials).toHaveLength(2);
    expect(w.partials[1]!.hz).toBeCloseTo(1960, 0);
    expect(w.partials[1]!.db).toBeCloseTo(-50, 1);
  });

  test('cannot resolve the invalid pair, 21 Hz apart: a known limit at 40 ms', () => {
    const w = partialsAt(
      tones([
        [196, 0.5],
        [174.61, 0.5],
      ]),
      0.1,
      SR,
    );
    const inPair = w.partials.filter((p) => p.hz > 150 && p.hz < 220);
    expect(inPair.length).toBeLessThan(2);
  });

  test('a silent window, or one past the end, has no partials', () => {
    expect(partialsAt(new Float32Array(SR), 0.1, SR)).toEqual({
      t: 0.1,
      dbfs: null,
      partials: [],
    });
    expect(partialsAt(tones([[440, 0.5]], 0.1), 0.5, SR).partials).toEqual([]);
  });

  test('a window under the absolute floor records nothing', () => {
    expect(partialsAt(tones([[440, 1e-7]]), 0.1, SR).dbfs).toBeNull();
  });
});
