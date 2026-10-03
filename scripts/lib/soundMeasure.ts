/**
 * Measurements of one rendered sound, for the baseline the Soundscape port will
 * be held to. Each one is defined here, in METHOD, in words, and written into
 * the fixture beside the numbers, so the later pass can compute the same thing
 * on the new engine rather than something with the same name.
 */

/** Onset and end are where the level first and last reach this far below peak. */
export const THRESHOLD_DB = -40;

/** The fundamental is read over this long a window from the onset. */
export const PITCH_WINDOW_S = 0.04;

/**
 * The envelope is the largest sample magnitude in a window this wide, centred on
 * each point. A peak rather than an RMS: over a window this short, RMS moves by
 * a few tenths of a dB with the phase the window happens to catch, and a peak
 * over at least one period does not. 10 ms is a whole period down to 100 Hz,
 * and the lowest note the engine plays is 174.61 Hz.
 */
export const ENVELOPE_WINDOW_S = 0.01;

/** Fixed points, in seconds after the cue is called, where the envelope is read. */
export const ENVELOPE_TIMES_S = [
  0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6,
] as const;

export const METHOD = {
  time: 'Seconds from the moment the cue is called. Every cue schedules its first note at that moment.',
  onset: `The first sample whose magnitude is within ${-THRESHOLD_DB} dB of the sound's own peak.`,
  end: `The last sample whose magnitude is within ${-THRESHOLD_DB} dB of the sound's own peak.`,
  duration: 'end minus onset.',
  stop: 'The time just after the last non-zero sample: where the oscillators stop.',
  peak: 'The largest sample magnitude, in dBFS (1.0 is 0 dBFS).',
  rms: 'The RMS level from onset to end, in dBFS.',
  fundamental: `The pitch of the first note to sound, over ${PITCH_WINDOW_S * 1000} ms from the onset: a YIN period estimate, refined to the peak of the Hann-windowed spectrum within 3% of it. For source and edition that is the first arpeggio note, for invalid the first of the pair; for a found word it is the note its length plays, under the octave shimmer and any sparkle.`,
  envelope: `The largest sample magnitude, in dBFS, within a ${ENVELOPE_WINDOW_S * 1000} ms window centred on each time in envelopeTimes. null where every sample in the window is zero.`,
} as const;

export interface Measurement {
  onset: number;
  end: number;
  duration: number;
  stop: number;
  peakDbfs: number;
  rmsDbfs: number;
  fundamentalHz: number | null;
  envelopeDbfs: (number | null)[];
}

const dbfs = (linear: number): number => 20 * Math.log10(linear);

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

function rms(x: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
}

function peakOf(x: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(x[i]!));
  return peak;
}

/**
 * The period of the strongest repeating shape, in samples, by YIN: the
 * cumulative-mean-normalised difference function, its first dip under 0.1, and
 * a parabola through that dip.
 */
function yinPeriod(x: Float32Array, minTau: number, maxTau: number): number {
  const width = x.length - maxTau;
  const d = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < width; j++) {
      const diff = x[j]! - x[j + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmnd = new Float64Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau]!;
    cmnd[tau] = running === 0 ? 1 : (d[tau]! * tau) / running;
  }
  let best = -1;
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmnd[tau]! < 0.1) {
      while (tau + 1 < maxTau && cmnd[tau + 1]! < cmnd[tau]!) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    best = minTau;
    for (let tau = minTau; tau < maxTau; tau++)
      if (cmnd[tau]! < cmnd[best]!) best = tau;
  }
  const a = cmnd[best - 1] ?? cmnd[best]!;
  const b = cmnd[best]!;
  const c = cmnd[best + 1] ?? cmnd[best]!;
  const denom = a - 2 * b + c;
  return denom === 0 ? best : best + (a - c) / (2 * denom);
}

/** Magnitude of the Hann-windowed spectrum of `x` at `hz`. */
function spectrumAt(x: Float32Array, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  const n = x.length;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re += hann * x[i]! * Math.cos(w * i);
    im -= hann * x[i]! * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/** Golden-section search for the spectral peak between lo and hi. */
function refinePeak(
  x: Float32Array,
  lo: number,
  hi: number,
  sampleRate: number,
): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = spectrumAt(x, c, sampleRate);
  let fd = spectrumAt(x, d, sampleRate);
  while (b - a > 1e-4) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = spectrumAt(x, c, sampleRate);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = spectrumAt(x, d, sampleRate);
    }
  }
  return (a + b) / 2;
}

/** The fundamental of `x`, between 80 Hz and 4 kHz, or null if it is silent. */
export function fundamental(
  x: Float32Array,
  sampleRate: number,
): number | null {
  if (rms(x, 0, x.length) === 0) return null;
  const minTau = Math.floor(sampleRate / 4000);
  const maxTau = Math.min(
    Math.floor(sampleRate / 80),
    Math.floor(x.length / 2),
  );
  const coarse = sampleRate / yinPeriod(x, minTau, maxTau);
  return refinePeak(x, coarse * 0.97, coarse * 1.03, sampleRate);
}

export function measure(x: Float32Array, sampleRate: number): Measurement {
  let peak = 0;
  let last = -1;
  for (let i = 0; i < x.length; i++) {
    const m = Math.abs(x[i]!);
    if (m > peak) peak = m;
    if (m > 0) last = i;
  }
  if (peak === 0) throw new Error('The render is silent.');

  const floor = peak * 10 ** (THRESHOLD_DB / 20);
  let onset = 0;
  while (Math.abs(x[onset]!) < floor) onset++;
  let end = x.length - 1;
  while (Math.abs(x[end]!) < floor) end--;

  const pitchTo = Math.min(
    end + 1,
    onset + Math.round(PITCH_WINDOW_S * sampleRate),
  );
  const half = Math.round((ENVELOPE_WINDOW_S * sampleRate) / 2);
  const envelopeDbfs = ENVELOPE_TIMES_S.map((t) => {
    const at = Math.round(t * sampleRate);
    const level = peakOf(
      x,
      Math.max(0, at - half),
      Math.min(x.length, at + half),
    );
    return level === 0 ? null : round(dbfs(level), 2);
  });

  const hz = fundamental(x.subarray(onset, pitchTo), sampleRate);
  return {
    onset: round(onset / sampleRate, 5),
    end: round(end / sampleRate, 5),
    duration: round((end - onset) / sampleRate, 5),
    stop: round((last + 1) / sampleRate, 5),
    peakDbfs: round(dbfs(peak), 2),
    rmsDbfs: round(dbfs(rms(x, onset, end + 1)), 2),
    fundamentalHz: hz === null ? null : round(hz, 2),
    envelopeDbfs,
  };
}
