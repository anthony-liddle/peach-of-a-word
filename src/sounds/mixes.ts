import type { CueDocument } from 'soundscape-engine';
import cues from '@/audio/peach.cues.json';

/**
 * Three mixes of the game's sounds, for Bea to choose between by ear: today's,
 * and two that bring the everyday sounds closer to the two big ones.
 *
 * A mix is a gain for each instrument in the cue file. The click is the tile
 * tap and Shuffle, the sine is every find and the miss, and the triangle is
 * the peach of a word and the full basket, which stay where they are. So a
 * gain moves a whole family, and the miss keeps its place under the finds.
 *
 * **A gain is the sound itself, louder.** Each note's level is multiplied by
 * it, and so is its instrument's `envelopeFloor`. The floor matters: a note
 * ramps from the floor up to its level and back down to it, and the floor is a
 * fixed level, not one relative to the note. Raising the levels alone would
 * steepen every decay, and the tick would come out a shorter, different click
 * from the one Antoine chose. With the floor raised too, every point of the
 * envelope moves by the same factor, so a mix's render is today's render times
 * the gain, sample for sample.
 *
 * The gains, by ISO 532-1's time-varying loudness with full scale at 75 dB SPL,
 * each held to -1 dBTP with every stack the game can make
 * (`mixes.browser.test.ts` replays the worst):
 * - **Raised:** a length 5 find 4 phon under the peach of a word, and the tile
 *   tap as close as the headroom lets it come by raising alone: two taps in one
 *   audio cycle, on a find that lands half a second into the full basket,
 *   reach -1.1 dBTP.
 * - **Closer:** a length 5 find 2.5 phon under the peach of a word, the
 *   longest finds 1 under, and the tile tap 7 under. Raising alone can't get
 *   there, so the whole mix is that balance 1.9 dB down: the peach of a word
 *   and the full basket are 1.9 dB lower than today, still on top.
 */
export type MixId = 'today' | 'raised' | 'closer';

/** The cue file's instruments, by the families they play. */
type Instrument = keyof typeof cues.instruments;

export interface Mix {
  id: MixId;
  /** The button's name. */
  title: string;
  /** One line on what it changes. */
  line: string;
  /** dB, for each instrument it moves. An instrument it leaves out stays at 0. */
  gains: Partial<Record<Instrument, number>>;
}

export const MIXES: readonly Mix[] = [
  {
    id: 'today',
    title: "Today's mix",
    line: 'The game as it sounds now.',
    gains: {},
  },
  {
    id: 'raised',
    title: 'Raised',
    line: 'Finds and the miss 3 dB louder, the tile tap and Shuffle 21.5 dB louder.',
    gains: { sine: 3, click: 21.5 },
  },
  {
    id: 'closer',
    title: 'Closer still',
    line: 'Finds and the miss 2.6 dB louder, the tile tap and Shuffle 23.1 dB louder, the peach of a word and the full basket 1.9 dB lower.',
    gains: { sine: 2.6, click: 23.1, triangle: -1.9 },
  },
];

/** dB as a linear factor. */
export const factor = (db: number): number => 10 ** (db / 20);

/** The game's cue file with a mix's gains applied. Today's mix is the file itself. */
export function mixDocument(mix: Mix): CueDocument {
  const doc = structuredClone(cues) as CueDocument;
  for (const [name, db] of Object.entries(mix.gains)) {
    const k = factor(db);
    const instrument = doc.instruments[name];
    if (instrument?.envelopeFloor === undefined)
      throw new Error(`no instrument named ${name} with an envelope floor`);
    instrument.envelopeFloor *= k;
    for (const cue of Object.values(doc.cues))
      for (const note of cue.notes)
        if (note.instrument === name) note.level *= k;
  }
  return doc;
}
