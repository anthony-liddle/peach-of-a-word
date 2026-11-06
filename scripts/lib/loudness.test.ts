import { describe, expect, test } from 'vitest';
import { momentaryLoudness, periodicity } from './loudness.ts';

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
