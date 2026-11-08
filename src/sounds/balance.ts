import { AudioEngine as Soundscape, type CueDocument } from 'soundscape-engine';
import { MIXES, mixDocument, type MixId } from './mixes.ts';

/**
 * A short game, played the way the game plays it: a few letters ticking and
 * the word they set, a Shuffle, finds of three more lengths, a miss, the peach
 * of a word, then the full basket. Each word's letters tick before it is set,
 * as they do in play, and the last set word fills the basket, so the basket's
 * cue takes over from the find's, as in the game.
 *
 * The pace is a quick player's on a phone: a letter every 150 ms, a word set
 * 300 ms after its last letter, and 600 ms before the next word starts.
 */
export interface Beat {
  /** The cue's name in the cue file. */
  cue: string;
  /** Seconds from the start. */
  at: number;
}

const LETTER_S = 0.15;
const SET_S = 0.3;
const NEXT_S = 0.6;

/** Each word: how many letters it ticks, then the cue it sets. */
const WORDS: { letters: number; then: string }[] = [
  { letters: 4, then: 'found-4-set' },
  { letters: 0, then: 'shuffle' },
  { letters: 3, then: 'found-3-set' },
  { letters: 5, then: 'found-5-rare' },
  { letters: 7, then: 'found-7-mythic-cute' },
  { letters: 3, then: 'invalid' },
  { letters: 8, then: 'source' },
  { letters: 4, then: 'edition' },
];

export const BALANCE: readonly Beat[] = (() => {
  const beats: Beat[] = [];
  let at = 0;
  for (const word of WORDS) {
    for (let i = 0; i < word.letters; i++) {
      beats.push({ cue: 'tick', at });
      at += LETTER_S;
    }
    if (word.letters > 0) at += SET_S - LETTER_S;
    beats.push({ cue: word.then, at });
    at += NEXT_S;
  }
  return beats.map((b) => ({ ...b, at: Math.round(b.at * 1000) / 1000 }));
})();

/** How long the sequence lasts, to its last beat's start. */
export const BALANCE_S = BALANCE[BALANCE.length - 1]!.at;

/** What the page asks of the mixes' player. */
export interface MixPlayer {
  /** Play the sequence in this mix, stopping anything still sounding first. */
  play(mix: MixId): void;
  /** Stop whatever is sounding. */
  stop(): void;
}

/** How far ahead the first beat is put, so it is not already late. */
const LEAD_S = 0.05;

/**
 * The sequence on its own Soundscape engine, on the page's one AudioContext,
 * each beat scheduled on the audio clock. A press makes a fresh engine and
 * destroys the last one, which cuts off anything of it still to sound: two
 * mixes never overlap, so neither is heard louder than it is.
 */
export function mixPlayerOn(
  context: () => AudioContext | null,
): () => MixPlayer | null {
  const docs = new Map<MixId, CueDocument>(
    MIXES.map((mix) => [mix.id, mixDocument(mix)]),
  );
  let current: Soundscape | null = null;
  const stop = () => {
    current?.destroy();
    current = null;
  };
  const player: MixPlayer = {
    play(mix) {
      const ctx = context();
      if (!ctx) return;
      stop();
      const engine = new Soundscape({ context: ctx });
      void engine.initialize();
      engine.loadCues(docs.get(mix)!);
      const start = ctx.currentTime + LEAD_S;
      for (const beat of BALANCE) engine.playCue(beat.cue, start + beat.at);
      current = engine;
    },
    stop,
  };
  return () => (context() ? player : null);
}
