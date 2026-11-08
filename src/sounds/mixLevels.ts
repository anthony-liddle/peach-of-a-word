import type { MixId } from './mixes.ts';

/**
 * Each mix's numbers, as the page shows them: measured on 8 November 2026 from
 * every cue of each mix rendered offline through Soundscape at 48 kHz, mono,
 * from the moment it is called.
 *
 * - **dbtp:** the true peak, by BS.1770-4's 4x interpolation (`truePeak`).
 * - **lufs:** the loudest momentary loudness, BS.1770's K-weighted 400 ms
 *   (`momentaryLoudness`). As played, both channels carry the same sound, so a
 *   meter on the output reads every cue 3.01 dB higher; the gaps don't move.
 * - **underDb:** how far under the peach of a word, in those LUFS.
 * - **underPhon:** the same gap by ISO 532-1's time-varying loudness
 *   (Zwicker, through MoSQITo 1.2.1), with full scale at 75 dB SPL. It models
 *   what LUFS doesn't: a sound of a few milliseconds is heard quieter than its
 *   energy says, and a lone low tone quieter than a chord of the same energy.
 *   So it puts the tile tap closer to the big two than LUFS does, and the miss
 *   much further under. The mixes are set by it.
 * - **worst:** the highest true peak of any stack the game can make, from
 *   every cue's render in Chromium, Firefox, WebKit and Soundscape for Swift
 *   0.2.2 (`CueRenderer`, and `CuePlayer`'s own output). In both new mixes it
 *   is a find landing half a second into the full basket, with two taps in one
 *   audio cycle on top.
 *
 * `mixes.browser.test.ts` holds dbtp and lufs to each browser's own render
 * within 0.15 dB. The phon gaps are read off those same renders, which it holds
 * to today's times each mix's gain, sample for sample, but no test here
 * recomputes ISO 532-1 itself.
 */
export interface MixRow {
  cue: string;
  label: string;
  dbtp: number;
  lufs: number;
  underDb: number;
  underPhon: number;
}

export interface MixLevels {
  rows: MixRow[];
  /** Every one of the 30 finds, lowest and highest. */
  finds: { lufs: [number, number]; dbtp: [number, number] };
  worst: number;
}

export const LEVELS: Record<MixId, MixLevels> = {
  today: {
    rows: [
      {
        cue: 'tick',
        label: 'Tile tap',
        dbtp: -35.9,
        lufs: -63.5,
        underDb: 36.1,
        underPhon: 33.2,
      },
      {
        cue: 'shuffle',
        label: 'Shuffle',
        dbtp: -37.6,
        lufs: -63.0,
        underDb: 35.5,
        underPhon: 34.7,
      },
      {
        cue: 'found-3-set',
        label: 'Find, length 3',
        dbtp: -15.3,
        lufs: -33.5,
        underDb: 6.0,
        underPhon: 7.1,
      },
      {
        cue: 'found-5-set',
        label: 'Find, length 5',
        dbtp: -15.5,
        lufs: -33.4,
        underDb: 6.0,
        underPhon: 7.1,
      },
      {
        cue: 'found-8-mythic-cute',
        label: 'Find, length 8, Mythic',
        dbtp: -15.4,
        lufs: -33.1,
        underDb: 5.6,
        underPhon: 5.5,
      },
      {
        cue: 'invalid',
        label: 'Miss',
        dbtp: -21.3,
        lufs: -38.2,
        underDb: 10.7,
        underPhon: 17.9,
      },
      {
        cue: 'source',
        label: 'The peach of a word',
        dbtp: -16.1,
        lufs: -27.5,
        underDb: 0,
        underPhon: 0,
      },
      {
        cue: 'edition',
        label: 'The full basket',
        dbtp: -10.3,
        lufs: -24.5,
        underDb: -3.0,
        underPhon: -5.0,
      },
    ],
    finds: { lufs: [-33.5, -33.1], dbtp: [-15.6, -15.3] },
    worst: -6.1,
  },
  raised: {
    rows: [
      {
        cue: 'tick',
        label: 'Tile tap',
        dbtp: -14.4,
        lufs: -42.0,
        underDb: 14.6,
        underPhon: 10.7,
      },
      {
        cue: 'shuffle',
        label: 'Shuffle',
        dbtp: -16.1,
        lufs: -41.5,
        underDb: 14.0,
        underPhon: 12.6,
      },
      {
        cue: 'found-3-set',
        label: 'Find, length 3',
        dbtp: -12.3,
        lufs: -30.5,
        underDb: 3.0,
        underPhon: 4.0,
      },
      {
        cue: 'found-5-set',
        label: 'Find, length 5',
        dbtp: -12.5,
        lufs: -30.4,
        underDb: 3.0,
        underPhon: 4.0,
      },
      {
        cue: 'found-8-mythic-cute',
        label: 'Find, length 8, Mythic',
        dbtp: -12.4,
        lufs: -30.1,
        underDb: 2.6,
        underPhon: 2.5,
      },
      {
        cue: 'invalid',
        label: 'Miss',
        dbtp: -18.3,
        lufs: -35.2,
        underDb: 7.7,
        underPhon: 14.7,
      },
      {
        cue: 'source',
        label: 'The peach of a word',
        dbtp: -16.1,
        lufs: -27.5,
        underDb: 0,
        underPhon: 0,
      },
      {
        cue: 'edition',
        label: 'The full basket',
        dbtp: -10.3,
        lufs: -24.5,
        underDb: -3.0,
        underPhon: -5.0,
      },
    ],
    finds: { lufs: [-30.5, -30.1], dbtp: [-12.6, -12.3] },
    worst: -1.1,
  },
  closer: {
    rows: [
      {
        cue: 'tick',
        label: 'Tile tap',
        dbtp: -12.8,
        lufs: -40.4,
        underDb: 11.1,
        underPhon: 7.0,
      },
      {
        cue: 'shuffle',
        label: 'Shuffle',
        dbtp: -14.5,
        lufs: -39.9,
        underDb: 10.5,
        underPhon: 8.9,
      },
      {
        cue: 'found-3-set',
        label: 'Find, length 3',
        dbtp: -12.7,
        lufs: -30.9,
        underDb: 1.5,
        underPhon: 2.4,
      },
      {
        cue: 'found-5-set',
        label: 'Find, length 5',
        dbtp: -12.9,
        lufs: -30.8,
        underDb: 1.5,
        underPhon: 2.4,
      },
      {
        cue: 'found-8-mythic-cute',
        label: 'Find, length 8, Mythic',
        dbtp: -12.8,
        lufs: -30.5,
        underDb: 1.1,
        underPhon: 0.9,
      },
      {
        cue: 'invalid',
        label: 'Miss',
        dbtp: -18.7,
        lufs: -35.6,
        underDb: 6.2,
        underPhon: 13.1,
      },
      {
        cue: 'source',
        label: 'The peach of a word',
        dbtp: -18.0,
        lufs: -29.4,
        underDb: 0,
        underPhon: 0,
      },
      {
        cue: 'edition',
        label: 'The full basket',
        dbtp: -12.2,
        lufs: -26.4,
        underDb: -3.0,
        underPhon: -5.1,
      },
    ],
    finds: { lufs: [-30.9, -30.5], dbtp: [-13.0, -12.7] },
    worst: -1.1,
  },
};
