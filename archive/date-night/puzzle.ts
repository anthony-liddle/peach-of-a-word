import { findScore, type Puzzle } from '@/engine/index.ts';
import type { SourceEntry } from '@/data/types.ts';

/**
 * The accepted words: the common-pool words this rack can spell, and nothing
 * else.
 *
 * This is the deliberate difference from the daily, where the basket is far too
 * big to empty. Twenty is finishable on a blanket, and every one is a word she
 * already knows. Generated from orchard's common-pool.txt at three letters or
 * more, with no letter used more often than the rack holds it, then inlined
 * rather than fetched: the list is the puzzle, and it is twenty short words.
 */
const WORDS: readonly string[] = [
  'ego',
  'get',
  'got',
  'her',
  'hog',
  'hot',
  'rot',
  'the',
  'toe',
  'ergo',
  'here',
  'hero',
  'thee',
  'tore',
  'tree',
  'other',
  'teeth',
  'there',
  'three',
  'together',
];

/** The eight-letter word the rack is made of, and the crown. */
const SOURCE = WORDS[WORDS.length - 1]!;

/**
 * A real `Puzzle`, built by hand rather than by `createPuzzle`.
 *
 * `createPuzzle` derives its bands from the four shipped word lists, which
 * together are several megabytes fetched at runtime. This rack's bands are
 * known in full at build time: the validation set and the set are both exactly
 * the twenty, and all three rarity rungs are empty, because a word outside the
 * common pool is not accepted here at all.
 *
 * Building the same shape by hand means every consumer downstream works with no
 * changes: `validateGuess` reads `validationWords`, `classifyWord` reads the
 * four bands, `computeTier` reads `reachableScore`, and the glossary's length
 * groups read `commonWords`. None of them can tell this puzzle from a daily one,
 * which is the point.
 */
export const DATE_NIGHT_PUZZLE: Puzzle = {
  sourceWord: SOURCE,
  // The same canonical form createPuzzle stores: the rack letters sorted. The
  // rack order is a permutation of THIS, so sorting here is load-bearing.
  letters: [...SOURCE].sort().join(''),
  validationWords: new Set(WORDS),
  commonWords: new Set(WORDS),
  // Empty, and empty on purpose. Nothing off the common pool is accepted, so
  // there is no rung for a word to land on.
  uncommonWords: new Set<string>(),
  rareWords: new Set<string>(),
  mythicWords: new Set<string>(),
  // The same sum createPuzzle takes over the set, through the same scoring
  // path, so the number is the one the engine would have produced.
  reachableScore: WORDS.reduce(
    (total, word) => total + findScore(word, 'set'),
    0,
  ),
};

/** How many words fill the basket. Read from the puzzle so the two cannot drift. */
export const TOTAL_WORDS = DATE_NIGHT_PUZZLE.commonWords.size;

/**
 * The crown's card, in the corpus voice and the corpus conventions: the part of
 * speech leading the gloss, cited forms plain, glosses in curly quotes, and the
 * reconstruction marked with its asterisk. The shipped corpus carries its own
 * entry for this word; this is the one Antoine wrote, so it is given here
 * rather than read from the data.
 */
export const DATE_NIGHT_ENTRY: SourceEntry = {
  word: SOURCE,
  definition:
    'adverb. In or into one place, group, or body. In company with each other.',
  etymology:
    'From Middle English togeder, from Old English tōgædere (“so as to be in one place”), from tō (“to”) + gædere (“together”), related to gaderian (“to gather”). Ultimately from Proto-Indo-European *ghedh- (“to unite, join, fit”), the root that also gives gather and good.',
};
