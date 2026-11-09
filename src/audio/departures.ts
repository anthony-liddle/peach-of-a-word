/**
 * Where the game's sound leaves the old engine's, on purpose.
 *
 * Every cue in peach.cues.json began as ReferenceAudioEngine's sound, written
 * from it note for note and held to it sample by sample. These no longer are.
 * Each was chosen by ear on the sounds page after Soundscape came, so each is
 * held to its own numbers instead, as they were measured when it was chosen.
 * Every test that holds a cue to the old engine leaves out exactly these, and
 * reads them from here, never by pattern.
 *
 * ReferenceAudioEngine itself does not change: it records how the game
 * sounded before, and a departure is a change to the game, not to the past.
 *
 * Both were chosen on 5 November 2026 from candidates on the preview of
 * peach-of-a-word#182, never merged: the tick is candidate A's first take,
 * Shuffle candidate E's, each at the level it was heard at. Since 9 November
 * both play in Bea's mix (mix.ts), louder by the click's gain; `heard` stays
 * as they were measured when chosen, and the tests add the gain.
 */
export interface Departure {
  /** The day it was chosen. */
  chosen: string;
  /** What it is now. */
  is: string;
  /** What the old engine played for it, to follow "it was", or null where it played nothing. */
  was: string | null;
  /**
   * As it was measured when it was chosen: through Soundscape, in Chromium,
   * at 48 kHz, from the moment the cue is called.
   */
  heard: {
    /** Onset to end, each within 40 dB of the peak, as measure() reads it. */
    durationMs: number;
    /** The largest sample, in dBFS. */
    peakDbfs: number;
    /** The loudest K-weighted 400 ms, BS.1770's momentary loudness, in LUFS. */
    lufs: number;
  };
}

export const DEPARTURES: Record<string, Departure> = {
  tick: {
    chosen: '2026-11-05',
    is: 'A tile moved: two bright clicks about 9 ms apart, each a tile ringing in three sine partials from 3 to 8 kHz.',
    was: 'an 880 Hz square, 30 ms long.',
    heard: { durationMs: 14.17, peakDbfs: -35.93, lufs: -63.55 },
  },
  shuffle: {
    chosen: '2026-11-05',
    is: 'A few tiles knocking together: four bright clicks spread over about 120 ms.',
    was: null,
    heard: { durationMs: 123.23, peakDbfs: -37.61, lufs: -63.03 },
  },
};

/** Is this sound, by its cue's name, no longer the old engine's? */
export const departed = (id: string): boolean =>
  Object.prototype.hasOwnProperty.call(DEPARTURES, id);

/** The sounds that are new with Soundscape: the old engine made nothing for them. */
export const NEW_WITH_SOUNDSCAPE = Object.keys(DEPARTURES).filter(
  (id) => DEPARTURES[id]!.was === null,
);
