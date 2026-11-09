import cues from './peach.cues.json';

/**
 * Bea's mix: how loud each family of the game's sounds plays, as a gain on
 * the sound it had before.
 *
 * Bea found every sound but the two big moments too quiet: the tile tap,
 * Shuffle and the ordinary finds. Antoine chose this mix on 9 November 2026,
 * by ear, from the three on the preview of peach-of-a-word#187, never merged,
 * where it was "Closer still". The peach of a word and the full basket stay on
 * top, by less, and nothing the game can pile up passes -1 dBTP.
 *
 * A gain is the sound itself, louder. Each is applied to every note's level
 * of its instrument in peach.cues.json, and to that instrument's
 * `envelopeFloor`. The floor matters: a note ramps from it to its level and
 * back, and it is absolute, so raising the levels alone would steepen every
 * decay. With the floor raised too, each cue is the sound it was times its
 * gain, sample for sample.
 *
 * So every test that holds a cue to the old engine, or a departure to the
 * numbers it was chosen at, expects that sound times its gain here, and reads
 * the gain from here. ReferenceAudioEngine and the departures' numbers stay as
 * they were: they record how the game sounded before.
 */
type Instrument = keyof typeof cues.instruments;

export const MIX: {
  chosen: string;
  name: string;
  /**
   * dB, by instrument: the click is the tile tap and Shuffle, the sine every
   * find and the miss, the triangle the peach of a word and the full basket.
   */
  gains: Record<Instrument, number>;
  /**
   * Each gain as the factor the cue file was multiplied by, 10^(dB/20), kept
   * as the double it was. `10 **` can round its last bit differently on
   * another platform, and a factor written down multiplies the same on all of
   * them, so the file is the old sound times these, to the last bit,
   * everywhere.
   */
  factors: Record<Instrument, number>;
} = {
  chosen: '2026-11-09',
  name: 'Closer still',
  gains: { click: 23.1, sine: 2.6, triangle: -1.9 },
  factors: {
    click: 14.288939585111029,
    sine: 1.3489628825916535,
    triangle: 0.8035261221856173,
  },
};

/** The mix's gain on an instrument, in dB. */
export function gainDbOf(instrument: string): number {
  const db = (MIX.gains as Record<string, number>)[instrument];
  if (db === undefined)
    throw new Error(`no gain for an instrument named ${instrument}`);
  return db;
}

/** The mix's gain on an instrument, as the factor the cue file was multiplied by. */
export function gainOf(instrument: string): number {
  const factor = (MIX.factors as Record<string, number>)[instrument];
  if (factor === undefined)
    throw new Error(`no gain for an instrument named ${instrument}`);
  return factor;
}

/** The instrument a cue plays: every note of a cue is one instrument's. */
function instrumentOf(id: string): string {
  const cue = (
    cues.cues as Record<string, { notes: { instrument: string }[] }>
  )[id];
  if (!cue) throw new Error(`no cue named ${id}`);
  return cue.notes[0]!.instrument;
}

/** The mix's gain on a cue, in dB. */
export const cueGainDb = (id: string): number => gainDbOf(instrumentOf(id));

/** The mix's gain on a cue, as a factor. */
export const cueGain = (id: string): number => gainOf(instrumentOf(id));
