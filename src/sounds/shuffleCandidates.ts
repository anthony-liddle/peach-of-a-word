import type { CueDocument, CueInstrument, CueNote } from 'soundscape-engine';
import game from '@/audio/peach.cues.json';

/**
 * Candidates for the Shuffle button's sound, a few letter tiles knocking
 * together, and one for the tile tap, a single click in place of tick()'s
 * square. For the preview only, to be chosen between by ear. None of this is
 * in the game: the candidates are a cue document of their own, never
 * peach.cues.json, and the chosen one is copied into that file once it is
 * chosen.
 *
 * Soundscape has no noise source, so a click is made the way a struck object
 * rings: a few sine partials at inharmonic ratios, each starting as fast as
 * the envelope allows (1 ms, exponential, so most of the rise is in its last
 * tenth) and dying away in a few milliseconds. The partials of one click are a
 * tile's modes. Every click in a cluster scales them a little, as a different
 * tile would, so no one frequency carries through the cue.
 *
 * Every partial is pitched a quarter tone between two semitones, so none of
 * them lines up with a note of the game's scale, or with its sparkles at 3, 4
 * and 5 times a note.
 */

/** The game's own floor, from peach.cues.json: about 95 dB under full scale. */
const FLOOR = 0.000018;

/** One instrument for every partial: a sine, the fastest attack, gone by its release. */
const CLICK: CueInstrument = {
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0,
  decayUntilRelease: true,
  sustain: 0,
  release: 0,
  envelopeCurve: 'exponential',
  envelopeFloor: FLOOR,
  filterType: 'none',
  filterCutoff: 1,
  filterResonance: 0,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  reverbMix: 0,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  unisonDetune: 0,
  velocityResponse: 0,
};

/** A tile's modes: the lowest, and the rest as ratios to it, each with its ring and level. */
interface Tile {
  hz: number;
  modes: { ratio: number; ringS: number; level: number }[];
}

/** A small plastic tile: high modes that ring a little. */
const BRIGHT: Tile = {
  hz: 3300,
  modes: [
    { ratio: 1, ringS: 0.008, level: 1 },
    { ratio: 1.43, ringS: 0.006, level: 0.55 },
    { ratio: 2.17, ringS: 0.004, level: 0.35 },
  ],
};

/** A wooden tile: lower modes, damped almost at once. */
const DULL: Tile = {
  hz: 1900,
  modes: [
    { ratio: 1, ringS: 0.004, level: 1 },
    { ratio: 1.58, ringS: 0.003, level: 0.4 },
    { ratio: 2.51, ringS: 0.002, level: 0.18 },
  ],
};

/** One click: when, which tile (its modes scaled), and how hard, as a share of the cue's level. */
interface Click {
  atS: number;
  scale: number;
  force: number;
}

/**
 * Three takes of the same gesture, for the game to play in turn: the same
 * count, spread and tile, with the gaps, the tiles and the forces moved
 * about, so ten presses in a row are not one sound ten times.
 */
type Takes = [Click[], Click[], Click[]];

const clicks = (
  gapsS: number[],
  scales: number[],
  forces: number[],
): Click[] => {
  let at = 0;
  return scales.map((scale, i) => {
    if (i > 0) at += gapsS[i - 1]!;
    return { atS: round(at, 6), scale, force: forces[i]! };
  });
};

/** Four clicks close together, about 40 ms end to end. */
const TIGHT: Takes = [
  clicks([0.009, 0.017, 0.012], [1, 1.12, 0.92, 1.05], [1, 0.62, 0.85, 0.5]),
  clicks([0.013, 0.01, 0.015], [1.07, 0.94, 1.13, 0.98], [0.9, 1, 0.55, 0.7]),
  clicks([0.008, 0.019, 0.009], [0.95, 1.04, 0.9, 1.1], [1, 0.75, 0.6, 0.8]),
];

/** The same four, spread out over about 120 ms. */
const SPREAD: Takes = [
  clicks([0.031, 0.043, 0.044], [1, 1.12, 0.92, 1.05], [1, 0.62, 0.85, 0.5]),
  clicks([0.038, 0.029, 0.047], [1.07, 0.94, 1.13, 0.98], [0.9, 1, 0.55, 0.7]),
  clicks([0.027, 0.051, 0.036], [0.95, 1.04, 0.9, 1.1], [1, 0.75, 0.6, 0.8]),
];

/** Two clicks: the first two of the tight four. */
const PAIR: Takes = TIGHT.map((take) => take.slice(0, 2)) as Takes;

/**
 * One click, for a tile tap: each take a little different in tile and force,
 * less than a cluster's clicks differ, so a word typed is not one sound
 * repeated and no letter sounds louder than the next.
 */
const SINGLE: Takes = [
  [{ atS: 0, scale: 1, force: 1 }],
  [{ atS: 0, scale: 1.06, force: 0.92 }],
  [{ atS: 0, scale: 0.95, force: 0.97 }],
];

export interface Candidate {
  /** Stable, for the button's data. */
  id: string;
  /** Which sound it would be: Shuffle's, or the tile tap's in place of tick(). */
  role: 'shuffle' | 'tap';
  /** Its takes are this, then the take's number: `shuffle-b-2` is B's second. */
  cue: string;
  /** What its buttons call it: "B, once". */
  short: string;
  /** The heading over its buttons. */
  label: string;
  /** What it is, in a line, and how it differs from the one before it. */
  about: string;
  tile: Tile;
  takes: Takes;
  /** The level of a click struck with a force of 1: its strongest mode's peak. */
  level: number;
}

/**
 * Five Shuffle candidates, each one change from another: A to B more clicks,
 * B to C a duller tile, C to D the same clicks spread out, and E, B spread out
 * as D is. Then one for the tile tap: A's first click alone.
 */
export const CANDIDATES: Candidate[] = [
  {
    id: 'a',
    role: 'shuffle',
    cue: 'shuffle-a',
    short: 'A',
    label: 'A: two clicks',
    about:
      'Two bright clicks about 10 ms apart, partials from 3 to 8 kHz: one tile set down on another.',
    tile: BRIGHT,
    takes: PAIR,
    level: 0.0121,
  },
  {
    id: 'b',
    role: 'shuffle',
    cue: 'shuffle-b',
    short: 'B',
    label: 'B: four, close',
    about: 'A with four clicks in about 40 ms: a small stack knocked together.',
    tile: BRIGHT,
    takes: TIGHT,
    level: 0.0099,
  },
  {
    id: 'c',
    role: 'shuffle',
    cue: 'shuffle-c',
    short: 'C',
    label: 'C: four, close, duller',
    about:
      'B with a wooden tile: partials from 1.7 to 5.4 kHz, damped almost at once.',
    tile: DULL,
    takes: TIGHT,
    level: 0.0151,
  },
  {
    id: 'd',
    role: 'shuffle',
    cue: 'shuffle-d',
    short: 'D',
    label: 'D: four, spread, duller',
    about: 'C spread over about 120 ms: tiles settling one by one.',
    tile: DULL,
    takes: SPREAD,
    level: 0.0151,
  },
  {
    id: 'e',
    role: 'shuffle',
    cue: 'shuffle-e',
    short: 'E',
    label: 'E: four, spread',
    about:
      'B spread over about 120 ms, as D spreads C: bright tiles settling one by one.',
    tile: BRIGHT,
    takes: SPREAD,
    level: 0.0099,
  },
  {
    id: 'tap',
    role: 'tap',
    cue: 'tap',
    short: 'Tap',
    label: 'Tap: one bright click',
    about:
      "A's first click alone: one bright tile, partials from 3 to 8 kHz, in place of the tile tap's square.",
    tile: BRIGHT,
    takes: SINGLE,
    level: 0.0324,
  },
];

/** The name of a candidate's take in the document: `shuffle-b-2` is B's second. */
export const cueName = (candidate: Candidate, take: number): string =>
  `${candidate.cue}-${take + 1}`;

/** Every candidate has three takes. */
export const TAKES = 3;

/**
 * The gap between presses when the page plays ten in a row: eight a second,
 * Shuffle pressed about as fast as a thumb can, or letters typed quickly.
 */
export const TEN_GAP_S = 0.125;

/** Ten presses as the game would play them in turn: takes 1, 2, 3, 1, 2, 3... */
export const tenInTurn = (candidate: Candidate): string[] =>
  Array.from({ length: 10 }, (_, i) => cueName(candidate, i % TAKES));

/** Ten presses of the first take alone, for hearing what the turns save. */
export const tenOfOne = (candidate: Candidate): string[] =>
  Array.from({ length: 10 }, () => cueName(candidate, 0));

/** A quarter tone between two semitones, nearest the frequency. */
function between(hz: number): number {
  const pitch = 69 + 12 * Math.log2(hz / 440);
  return Math.floor(pitch) + 0.5;
}

function notesOf(candidate: Candidate, take: number): CueNote[] {
  const name = cueName(candidate, take);
  return candidate.takes[take]!.flatMap((click, c) =>
    candidate.tile.modes.map((mode, m) => ({
      id: `${name}-${c + 1}-${m + 1}`,
      instrument: 'click',
      start: click.atS,
      duration: mode.ringS,
      pitch: between(candidate.tile.hz * click.scale * mode.ratio),
      level: round(candidate.level * click.force * mode.level, 7),
    })),
  );
}

/** Every take of every candidate, as one cue document. */
export const CANDIDATE_CUES: CueDocument = {
  format: 'soundscape-cues',
  version: 1,
  instruments: {
    click: CLICK,
    square: game.instruments.square as CueInstrument,
  },
  cues: {
    ...Object.fromEntries(
      CANDIDATES.flatMap((candidate) =>
        candidate.takes.map((_, take) => [
          cueName(candidate, take),
          { notes: notesOf(candidate, take) },
        ]),
      ),
    ),
    // The game's own tick, read from its file, so ten of it can be played on
    // the audio clock beside ten of the tap candidate
    'tile-tap': {
      notes: game.cues.tick.notes.map((note, i) => ({
        ...note,
        id: `tile-tap-${i + 1}`,
      })),
    },
  },
};

/** The game's tick, as the candidates' document holds it. */
export const TILE_TAP_CUE = 'tile-tap';

/**
 * How long a take lasts, in seconds: its last partial's release, plus the 20
 * ms the engine's oscillators run on after it.
 */
export function takeLength(candidate: Candidate, take: number): number {
  const notes = CANDIDATE_CUES.cues[cueName(candidate, take)]!.notes;
  return Math.max(...notes.map((n) => n.start + n.duration)) + 0.02;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
