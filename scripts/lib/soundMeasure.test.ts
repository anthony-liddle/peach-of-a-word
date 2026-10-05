import { describe, expect, test } from 'vitest';
import {
  ENVELOPE_TIMES_S,
  fundamental,
  measure,
  notePair,
} from './soundMeasure.ts';

/**
 * The measurements are checked against signals whose answers are known, so a
 * number in the baseline means what METHOD says it means.
 */
const SR = 48000;

function signal(
  seconds: number,
  at: (t: number) => number,
  from = 0,
  to = seconds,
): Float32Array {
  const x = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if (t >= from && t < to) x[i] = at(t - from);
  }
  return x;
}

const sine =
  (hz: number, amp = 1) =>
  (t: number) =>
    amp * Math.sin(2 * Math.PI * hz * t);

describe('measure', () => {
  // Half a second of 440 Hz at half scale, from 0.1 s to 0.6 s, in 2 s.
  const steady = measure(signal(2, sine(440, 0.5), 0.1, 0.6), SR);

  test('finds the onset, the end, the duration and the stop', () => {
    expect(steady.onset).toBeCloseTo(0.1, 3);
    expect(steady.end).toBeCloseTo(0.6, 3);
    expect(steady.duration).toBeCloseTo(0.5, 3);
    expect(steady.stop).toBeCloseTo(0.6, 3);
  });

  test('reads peak and RMS in dBFS', () => {
    expect(steady.peakDbfs).toBeCloseTo(-6.02, 1);
    expect(steady.rmsDbfs).toBeCloseTo(-9.03, 1);
  });

  test('reads the envelope at the fixed times, null where silent', () => {
    const at = (t: number) =>
      steady.envelopeDbfs[ENVELOPE_TIMES_S.indexOf(t as never)];
    expect(at(0.005)).toBeNull();
    expect(at(0.2)).toBeCloseTo(-6.02, 1);
    expect(at(0.4)).toBeCloseTo(-6.02, 1);
    expect(at(0.8)).toBeNull();
    expect(at(1.6)).toBeNull();
  });

  test('reads the fundamental', () => {
    expect(steady.fundamentalHz).toBeCloseTo(440, 1);
  });

  test('refuses a silent render rather than measuring nothing', () => {
    expect(() => measure(new Float32Array(SR), SR)).toThrow('silent');
  });
});

describe('fundamental, over the 40 ms window the baseline uses', () => {
  const window = (at: (t: number) => number) => signal(0.04, at);

  test('a found note under its octave shimmer reads as the note', () => {
    const x = window((t) => sine(392, 0.9)(t) + sine(784, 0.18)(t));
    expect(fundamental(x, SR)).toBeCloseTo(392, 1);
  });

  test('the lowest note the engine plays first, the invalid pair', () => {
    expect(fundamental(window(sine(196)), SR)).toBeCloseTo(196, 1);
  });

  test('a square wave reads at its fundamental, not a harmonic', () => {
    const square = (t: number) =>
      Math.sin(2 * Math.PI * 880 * t) >= 0 ? 0.1 : -0.1;
    expect(fundamental(window(square), SR)).toBeCloseTo(880, 0);
  });

  test('a triangle wave reads at its fundamental', () => {
    const triangle = (t: number) =>
      (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * 523.25 * t));
    expect(fundamental(window(triangle), SR)).toBeCloseTo(523.25, 1);
  });

  test('an enveloped note, attack and decay, still reads true', () => {
    const env = (t: number) =>
      t < 0.012
        ? 0.0001 * (0.9 / 0.0001) ** (t / 0.012)
        : 0.9 * (0.0001 / 0.9) ** ((t - 0.012) / 0.268);
    expect(
      fundamental(
        window((t) => env(t) * sine(659.25)(t)),
        SR,
      ),
    ).toBeCloseTo(659.25, 1);
  });

  test('silence has no fundamental', () => {
    expect(fundamental(new Float32Array(1920), SR)).toBeNull();
  });
});

describe('notePair, the rejected guess read one note at a time', () => {
  // The engine's note: up to its peak in 12 ms, down to 1e-4 by its end, off
  // 20 ms later. Two of them 80 ms apart, as playInvalid schedules them.
  const note =
    (hz: number, t0: number, phase = 0) =>
    (t: number) => {
      const u = t - t0;
      if (u < 0 || u > 0.18) return 0;
      const env =
        u < 0.012
          ? 1e-4 * (0.5 / 1e-4) ** (u / 0.012)
          : 0.5 * (1e-4 / 0.5) ** ((u - 0.012) / 0.148);
      return 0.18 * env * Math.sin(2 * Math.PI * hz * u + phase);
    };
  const pair = (second: number, phase = 0) =>
    signal(0.26, (t) => note(196, 0)(t) + note(second, 0.08, phase)(t));

  test('reads each note at its own pitch, a whole tone apart, at one level', () => {
    const { notes, intervalSemitones } = notePair(pair(174.61), SR, 0.08);
    expect(notes[0].hz).toBeCloseTo(196, 0);
    expect(notes[1].hz).toBeCloseTo(174.61, 0);
    expect(intervalSemitones).toBeCloseTo(2, 1);
    expect(Math.abs(notes[1].db)).toBeLessThan(0.5);
    expect(notes[0]).toMatchObject({ from: 0, to: 0.08 });
    expect(notes[1]).toMatchObject({ from: 0.08, to: 0.26 });
  });

  test('a second note a minor third down reads as three semitones', () => {
    expect(notePair(pair(164.81), SR, 0.08).intervalSemitones).toBeCloseTo(
      3,
      1,
    );
  });

  test('where the crest falls moves the level by under 0.3 dB, a peak sample by over 1', () => {
    const phases = Array.from({ length: 8 }, (_, k) => (2 * Math.PI * k) / 8);
    const swing = (values: number[]) =>
      Math.max(...values) - Math.min(...values);
    const spectral = phases.map(
      (ph) => notePair(pair(174.61, ph), SR, 0.08).notes[1].db,
    );
    const peakSample = phases.map((ph) => {
      const x = pair(174.61, ph);
      const peak = (from: number, to: number) =>
        Math.max(...Array.from(x.subarray(from, to), Math.abs));
      return 20 * Math.log10(peak(3840, x.length) / peak(0, 3840));
    });
    expect(swing(spectral)).toBeLessThan(0.3);
    expect(swing(peakSample)).toBeGreaterThan(1);
  });
});
