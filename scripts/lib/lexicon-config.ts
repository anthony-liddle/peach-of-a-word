/**
 * Lexicon knobs: the constants that shape the DICTIONARY, not the game.
 *
 * Split out of the old lib/config.ts on 2026-08-11. That file mixed two kinds of
 * decision that look alike and are not: which SCOWL bands define a rarity cut (a
 * fact about the word list) and how many words the set should hold (a playtest
 * decision about how the game feels). The second kind now lives in
 * lib/curation-config.ts.
 *
 * The split is for the planned extraction. These constants describe the lexicon
 * and would travel with it to a dictionary repo. The curation ones would not: a
 * second game consuming this dictionary would bring its own.
 */

/**
 * SCOWL bands up to and including size 70: the first rarity cutoff. A found word
 * is at most "uncommon" when it sits in this union. The baked beyond-size-70 set
 * is the boundary minus this union (the compact complement shipped for the
 * ladder).
 *
 * Dictionary, not game. This decides which words the file contains. What the
 * resulting band is called, what it scores, and where the ladder thresholds sit
 * are all game decisions and live in src/engine/config.ts.
 */
export const SIZE_70_SIZES = [10, 20, 35, 40, 50, 55, 60, 70] as const;

/**
 * SCOWL bands up to and including size 95: the second rarity cutoff. A word
 * beyond size 70 but inside this union is "rare"; one beyond it is "mythic". The
 * baked beyond-size-95 set is the boundary minus this union.
 */
export const SIZE_95_SIZES = [10, 20, 35, 40, 50, 55, 60, 70, 80, 95] as const;

/** SCOWL spelling variants to include. American + the shared English core. */
export const SCOWL_VARIANTS = ['english', 'american'] as const;

/**
 * Minimum playable word length, and the source word's fixed length.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE DUPLICATED IN src/engine/config.ts, AND THAT IS DELIBERATE.
 *
 * They are game rules, and the pipeline needs them to build the lists, so both
 * sides carry a copy. Importing the engine's copy here is the obvious "fix" and
 * it is wrong: lib/formable.ts exists precisely so the build has no dependency
 * on the app's module graph ("Mirrors src/engine/formability.ts; kept local so
 * the scripts have no dependency on the app's module graph"), and the pipeline
 * was just untangled from src/ so the dictionary can be lifted into its own
 * repo. Collapsing these two would re-couple it.
 *
 * Two records of one fact is normally the bug this project keeps finding. The
 * difference here is that the duplication is load-bearing rather than
 * accidental, so it is kept and **asserted** instead: config-agreement.test.ts
 * fails if the two ever disagree. Duplication you can verify is not drift.
 *
 * On extraction these become inputs the consumer supplies rather than constants
 * the dictionary owns.
 * ---------------------------------------------------------------------------
 */
export const MIN_WORD_LENGTH = 3;

/** The source word is always exactly 8 letters. See the note above. */
export const SOURCE_WORD_LENGTH = 8;

/** Polite User-Agent. Wiktionary throttles clients that omit one. */
export const WIKTIONARY_USER_AGENT =
  '8LettersInSearchOfAWord/1.0 (gift project; anthonyliddle@gmail.com)';

/** Concurrency for Wiktionary fetches. Polite, not aggressive. */
export const WIKTIONARY_CONCURRENCY = 4;

/** Short gloss length cap for tappable definitions. Roughly one sentence. */
export const DEFINITION_MAX_LENGTH = 140;
