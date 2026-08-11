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
