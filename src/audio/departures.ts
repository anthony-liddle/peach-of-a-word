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
 *
 * Peach rush's two, at 10 seconds left and at time's up, were drafted on 24
 * November 2026 and kept by Antoine on the sounds page's preview on 25
 * November. The app plays them, and the web game too since Peach rush came
 * to it. They were drafted in Bea's mix, so `heard` is as they play, and the
 * tests add nothing.
 */
export interface Departure {
  /** The day it was chosen, or null while it is a draft, not yet heard and kept. */
  chosen: string | null;
  /** What it is now. */
  is: string;
  /** What the old engine played for it, to follow "it was", or null where it played nothing. */
  was: string | null;
  /** One of Peach rush's two, which the run plays, in the app and on the web. */
  rush: boolean;
  /**
   * Whether `heard` was measured in Bea's mix (mix.ts). The tick and Shuffle
   * were chosen before it, so the tests add their instrument's gain to theirs.
   */
  inTheMix: boolean;
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
    rush: false,
    inTheMix: false,
    heard: { durationMs: 14.17, peakDbfs: -35.93, lufs: -63.55 },
  },
  shuffle: {
    chosen: '2026-11-05',
    is: 'A few tiles knocking together: four bright clicks spread over about 120 ms.',
    was: null,
    rush: false,
    inTheMix: false,
    heard: { durationMs: 123.23, peakDbfs: -37.61, lufs: -63.03 },
  },
  'rush-ten': {
    chosen: '2026-11-25',
    is: 'Ten seconds left: two soft A5 pings, the second a little softer.',
    was: null,
    rush: true,
    inTheMix: true,
    heard: { durationMs: 255.81, peakDbfs: -18.53, lufs: -35.19 },
  },
  'rush-end': {
    chosen: '2026-11-25',
    is: "Time's up: G, E and C, falling to rest on the C, with a faint octave over it, as a find has.",
    was: null,
    rush: true,
    inTheMix: true,
    heard: { durationMs: 581.33, peakDbfs: -18.01, lufs: -30.47 },
  },
};

/** Is this sound, by its cue's name, no longer the old engine's? */
export const departed = (id: string): boolean =>
  Object.prototype.hasOwnProperty.call(DEPARTURES, id);

/** The sounds that are new with Soundscape: the old engine made nothing for them. */
export const NEW_WITH_SOUNDSCAPE = Object.keys(DEPARTURES).filter(
  (id) => DEPARTURES[id]!.was === null,
);
