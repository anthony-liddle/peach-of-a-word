import { describe, expect, test } from 'vitest';
import {
  momentaryLoudness,
  periodicity,
  shortTermLoudness,
  truePeak,
} from './loudness.ts';

const RATE = 48000;

function sine(hz: number, amplitude: number, seconds: number): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE),
  );
}

describe('momentaryLoudness', () => {
  test("reads BS.1770's calibration: a full scale 997 Hz sine is -3.01 LUFS", () => {
    expect(momentaryLoudness(sine(997, 1, 1), RATE)).toBeCloseTo(-3.01, 1);
  });

  test('falls 20 dB with a tenth of the amplitude', () => {
    expect(momentaryLoudness(sine(997, 0.1, 1), RATE)).toBeCloseTo(-23.01, 1);
  });

  test('holds a sound shorter than its window to its whole energy, however spread', () => {
    const burst = sine(997, 0.5, 0.01);
    const together = new Float32Array(RATE);
    together.set(burst, 1000);
    together.set(burst, 1000 + burst.length);
    const apart = new Float32Array(RATE);
    apart.set(burst, 1000);
    apart.set(burst, 1000 + 0.2 * RATE);
    expect(momentaryLoudness(apart, RATE)).toBeCloseTo(
      momentaryLoudness(together, RATE),
      1,
    );
  });

  test('hears 4 kHz as louder than 880 Hz at the same level, as the ear does', () => {
    expect(momentaryLoudness(sine(4000, 0.1, 0.2), RATE)).toBeGreaterThan(
      momentaryLoudness(sine(880, 0.1, 0.2), RATE) + 3,
    );
  });
});

describe('shortTermLoudness', () => {
  test("reads BS.1770's calibration over its 3 s window", () => {
    expect(shortTermLoudness(sine(997, 1, 4), RATE)).toBeCloseTo(-3.01, 1);
  });

  test('reads a sound under 400 ms 8.75 dB under its momentary loudness: the same energy over 3 s, not 0.4', () => {
    const burst = sine(997, 0.5, 0.1);
    expect(
      momentaryLoudness(burst, RATE) - shortTermLoudness(burst, RATE),
    ).toBeCloseTo(10 * Math.log10(3 / 0.4), 1);
  });
});

describe('truePeak', () => {
  /** A sine at a quarter of the rate, started at 45 degrees: every sample lands 3 dB under its crest. */
  const quarter = Float32Array.from({ length: RATE }, (_, i) =>
    Math.sin((Math.PI * i) / 2 + Math.PI / 4),
  );
  /** The steady middle, so the ends' ringing stays out of it. */
  const middle = quarter.subarray(1000, RATE - 1000);

  test("finds the crest between samples: BS.1770's quarter-rate sine reads 3 dB over its samples", () => {
    const samples = 20 * Math.log10(Math.max(...middle.map(Math.abs)));
    expect(samples).toBeCloseTo(-3.01, 2);
    // BS.1770-4's own filter reads a steady sine up to 0.14 dB high
    expect(truePeak(middle)).toBeGreaterThan(-0.01);
    expect(truePeak(middle)).toBeLessThan(0.15);
  });

  test("reads a 997 Hz sine at its crest, within the filter's ripple", () => {
    // Faded in and out over 10 ms: a sine cut off mid-cycle overshoots between
    // samples, as a true peak meter rightly shows
    const fade = 0.01 * RATE;
    const faded = sine(997, 0.5, 1).map((v, i, all) => {
      const edge = Math.min(i, all.length - 1 - i);
      return edge < fade
        ? v * (0.5 - 0.5 * Math.cos((Math.PI * edge) / fade))
        : v;
    });
    expect(truePeak(faded)).toBeCloseTo(20 * Math.log10(0.5), 1);
  });

  test('is never under the sample peak', () => {
    const click = new Float32Array(400);
    click[200] = 0.25;
    click[201] = -0.25;
    expect(truePeak(click)).toBeGreaterThanOrEqual(20 * Math.log10(0.25));
  });

  test('reads silence as -Infinity', () => {
    expect(truePeak(new Float32Array(100))).toBe(-Infinity);
  });
});

describe('periodicity', () => {
  test('is near 0 for a steady tone', () => {
    expect(periodicity(sine(880, 0.1, 0.1), RATE, 0, 0.04)).toBeLessThan(0.01);
  });

  test("stays far above YIN's 0.1 for noise", () => {
    let seed = 1;
    const noise = Float32Array.from({ length: RATE / 10 }, () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 31 - 1;
    });
    expect(periodicity(noise, RATE, 0, 0.04)).toBeGreaterThan(0.5);
  });
});
