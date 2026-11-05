/**
 * What the page prints beside each Shuffle candidate, and beside the tick and
 * the find it is compared with. Measured in Chromium at 48 kHz, through
 * Soundscape, by shuffleCandidates.browser.test.ts, which holds Chromium,
 * Firefox and WebKit to every number here within a tenth of a dB and a
 * millisecond.
 *
 * For a candidate, each number is the most of its three takes: the longest,
 * the highest peak, the loudest.
 */
export interface Heard {
  /** Onset to end, each where the level is within 40 dB of the peak, as measure() reads it. */
  durationMs: number;
  /** The largest sample, in dBFS. */
  peakDbfs: number;
  /** The loudest K-weighted 400 ms, in LUFS: BS.1770's momentary loudness. */
  lufs: number;
}

export const HEARD: Record<string, Heard> = {
  tick: { durationMs: 19, peakDbfs: -33.63, lufs: -57.01 },
  find: { durationMs: 141, peakDbfs: -15.54, lufs: -33.45 },
  a: { durationMs: 18, peakDbfs: -35.93, lufs: -62.91 },
  b: { durationMs: 44, peakDbfs: -37.61, lufs: -62.77 },
  c: { durationMs: 40, peakDbfs: -34.28, lufs: -62.7 },
  d: { durationMs: 121, peakDbfs: -34.28, lufs: -62.71 },
};
