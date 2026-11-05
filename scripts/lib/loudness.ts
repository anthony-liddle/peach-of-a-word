/**
 * Loudness for short sounds, beside the peak and RMS that measure() reads.
 *
 * measure()'s RMS runs from a sound's onset to its end, so a sparse cluster of
 * clicks reads quieter than it sounds, and a sound of 2 to 5 kHz sounds louder
 * per dB than one at 880 Hz. Momentary loudness answers both: ITU-R BS.1770's
 * K-weighting, which leans toward what the ear hears as loud, and a fixed 400
 * ms window, so every sound shorter than that is held to its whole energy
 * however it is spread.
 */

/** BS.1770's two K-weighting stages at 48 kHz: the head's shelf, then the RLB highpass. */
const SHELF = {
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [1, -1.69065929318241, 0.73248077421585],
};
const HIGHPASS = {
  b: [1, -2, 1],
  a: [1, -1.99004745483398, 0.99007225036621],
};

export const LOUDNESS_RATE = 48000;

/** The momentary window, in seconds. */
export const MOMENTARY_S = 0.4;

function biquad(
  x: Float64Array,
  { b, a }: { b: number[]; a: number[] },
): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = b[0]! * x0 + b[1]! * x1 + b[2]! * x2 - a[1]! * y1 - a[2]! * y2;
    y[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return y;
}

/**
 * The loudest momentary loudness of a mono render at 48 kHz, in LUFS: the
 * K-weighted mean square over any 400 ms, as -0.691 + 10 log10 of it. A full
 * scale 997 Hz sine reads -3.01. Silence reads -Infinity.
 */
export function momentaryLoudness(x: Float32Array, sampleRate: number): number {
  if (sampleRate !== LOUDNESS_RATE) {
    throw new Error(
      `K-weighting is written for ${LOUDNESS_RATE} Hz, not ${sampleRate}`,
    );
  }
  const window = Math.round(MOMENTARY_S * sampleRate);
  // Padded with a window of silence either side, so a sound at the very start
  // or end of the render is still seen whole, and the filters ring out.
  const padded = new Float64Array(x.length + 2 * window);
  padded.set(x, window);
  const k = biquad(biquad(padded, SHELF), HIGHPASS);
  let sum = 0;
  for (let i = 0; i < window; i++) sum += k[i]! ** 2;
  let most = sum;
  for (let i = window; i < k.length; i++) {
    sum += k[i]! ** 2 - k[i - window]! ** 2;
    if (sum > most) most = sum;
  }
  return -0.691 + 10 * Math.log10(most / window);
}

/**
 * How periodic a sound is: the deepest dip of YIN's cumulative mean
 * normalised difference over periods of 80 Hz to 4 kHz, the range
 * measure()'s fundamental searches, from the onset over `seconds`. Near 0 is a
 * clear period, a pitch; YIN calls anything under 0.1 one. A click with no
 * pitch to speak of stays well above it.
 */
export function periodicity(
  x: Float32Array,
  sampleRate: number,
  onsetS: number,
  seconds: number,
): number {
  const from = Math.round(onsetS * sampleRate);
  const segment = x.subarray(from, from + Math.round(seconds * sampleRate));
  const minTau = Math.floor(sampleRate / 4000);
  const maxTau = Math.min(
    Math.floor(sampleRate / 80),
    Math.floor(segment.length / 2),
  );
  const width = segment.length - maxTau;
  let running = 0;
  let deepest = Infinity;
  for (let tau = 1; tau <= maxTau; tau++) {
    let d = 0;
    for (let j = 0; j < width; j++) {
      const diff = segment[j]! - segment[j + tau]!;
      d += diff * diff;
    }
    running += d;
    const cmnd = running === 0 ? 1 : (d * tau) / running;
    if (tau >= minTau && cmnd < deepest) deepest = cmnd;
  }
  return deepest;
}
