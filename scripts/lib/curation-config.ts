/**
 * Curation knobs: the constants that shape THIS GAME, applied at build time.
 *
 * Split out of the old lib/config.ts on 2026-08-11, alongside lib/lexicon-config.ts.
 * Everything here answers a question about how Peach of a Word should feel, and
 * most of it was decided by watching someone play. None of it is a fact about
 * English, and a second game consuming the same dictionary would want its own
 * values or none at all.
 *
 * The seam matters for the planned extraction: lexicon-config travels to the
 * dictionary repo, this file stays with the game. Where the dictionary pipeline
 * needs one of these, it becomes a parameter the game supplies rather than a
 * constant the dictionary owns.
 */

/**
 * SCOWL "size" bands to include in the common pool (the completion denominator).
 * Smaller size = more common. Tightened to size 20 (bands 10, 20) after the
 * first playtest. Measured across the source pool: size 50 left racks reaching
 * 200 words in the set and size 35 still hit a median of 48 with a long tail
 * past 90, both well above the comfortable completion band the denominator split
 * exists to protect. Size 20 lands a median near 27 with the 90+ tail nearly
 * gone. Add band 35 back if puzzles feel too sparse.
 *
 * The clearest example of why this file exists. It reads like a lexicon setting
 * and it is a difficulty setting: the number was chosen by playing, and the
 * comment is a record of a playtest, not of English.
 */
export const COMMON_POOL_SIZES = [10, 20] as const;

/**
 * Tighter band for the source-word candidate pool. Source words are the answer
 * Bea should recognize, so we keep them to the two most common bands (about
 * 1,600 eight-letter words). This is the lever to pull if answers feel too
 * obscure (this is already tight) or too few (add band 35, much larger).
 */
export const SOURCE_POOL_SIZES = [10, 20] as const;

/**
 * Cap on how many source candidates we enrich with Wiktionary data. Set above
 * the size of bands 10 and 20 so the whole common set is enriched, with no
 * alphabetical bias from slicing. Lower it only to bound a first trial run.
 */
export const MAX_SOURCE_WORDS = 2000;

/**
 * Require a source word to carry BOTH a definition and an etymology. The
 * etymology reveal is the emotional center of the gift, so a word that cannot
 * deliver it does not earn a place as an answer.
 *
 * As game-specific as a constant gets. It encodes what this particular present
 * is for.
 */
export const REQUIRE_ETYMOLOGY = true;

// ---------------------------------------------------------------------------
// Absorbed from lib/lexicon-config.ts when the dictionary left.
//
// That file split cleanly into "facts about the word list", which went to
// orchard with the pipeline that used them, and these, which the game's
// remaining scripts still need. Rather than keep a one-sided lexicon-config
// holding the leftovers, the leftovers moved here and that file is gone.
//
// SIZE_70_SIZES, SIZE_95_SIZES and SCOWL_VARIANTS are NOT here, deliberately.
// They defined which SCOWL bands produce which list, and nothing in this repo
// derives a list any more. They live in orchard, which is the only place that
// question can now be asked.
// ---------------------------------------------------------------------------

/**
 * Minimum playable word length, and the source word's fixed length.
 *
 * Still duplicated with src/engine/config.ts, still deliberately, and still
 * asserted by lib/config-agreement.test.ts. lib/formable.ts exists so the
 * build has no dependency on the app's module graph, and collapsing these
 * would undo that. Duplication you can verify is not drift.
 */
export const MIN_WORD_LENGTH = 3;

/** The source word is always exactly 8 letters. See the note above. */
export const SOURCE_WORD_LENGTH = 8;

/** Polite User-Agent. Wiktionary throttles clients that omit one. */
export const WIKTIONARY_USER_AGENT =
  '8LettersInSearchOfAWord/1.0 (gift project; anthonyliddle@gmail.com)';

/** Concurrency for Wiktionary refetches during crown admission. */
export const WIKTIONARY_CONCURRENCY = 4;
