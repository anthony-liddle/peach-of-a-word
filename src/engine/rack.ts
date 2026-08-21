import { seededPermutation } from './shuffle.ts';

/**
 * Rack ordering that will not hand the player the crown.
 *
 * The rack shows the source word's letters SORTED (see `createPuzzle`), so the
 * identity permutation spells `AEEMNPTV`, not `PAVEMENT`, and is harmless. What
 * gives the day away is a permutation that happens to undo that sort. With one
 * repeated letter that is a 1-in-20,160 event per draw, and it reached a real
 * player: the rack read PAVE / MENT.
 *
 * Two things are guarded, and one predicate covers both. Under 540px the rack
 * is a 4-column grid, so the first four tiles are a visible top row; PAVE above
 * a scrambled MENT is most of the answer on its own. A full spell necessarily
 * begins with that same prefix, so testing the prefix catches the whole-word
 * case too. Above 540px the grid is one row of 8 and only the full spell is
 * legible, which the same test already rejects.
 */

/** Tiles per row in the narrow (phone) rack grid. Tracks `.case` in index.css. */
/** Tiles per row in the narrow (phone) rack grid. Tracks `.case` in index.css. */
export const RACK_ROW = 4;

/**
 * True when the rack, read left to right, leads with the source word.
 *
 * `letters` is the sorted rack; `order` indexes into it. Comparing the rendered
 * string against the source word is the honest test: comparing `order` against
 * the identity permutation would test the wrong thing entirely.
 */
export function rackGivesAway(
  order: readonly number[],
  letters: string,
  word: string,
): boolean {
  const span = Math.min(RACK_ROW, order.length, word.length);
  // A rack with nothing on it gives nothing away. Stated rather than left to
  // fall out of the loop, because the Swift port has to agree here too and an
  // empty-span disagreement is exactly the kind of divergence no eight-letter
  // fixture would ever reach.
  if (span === 0) return false;
  for (let i = 0; i < span; i++) {
    if (letters[order[i]!] !== word[i]) return false;
  }
  return true;
}

/**
 * Break a giving-away order by moving a differing letter to the front.
 *
 * A total escape hatch for the redraw loops below, so neither can spin. It can
 * only fail if every tile carries `word[0]`, which no eight-letter source word
 * does, and in that case there is no non-revealing order to find anyway.
 */
function forceDiffer(
  order: readonly number[],
  letters: string,
  word: string,
): number[] {
  const out = [...order];
  const swap = out.findIndex((id) => letters[id] !== word[0]);
  if (swap > 0) [out[0], out[swap]] = [out[swap]!, out[0]!];
  return out;
}

/**
 * A guarded rack order, redrawing from `draw` until the rack keeps its secret.
 *
 * The caller owns the stream: the daily passes a seeded one so every player
 * gets the same rack, and the Shuffle button passes the live RNG so a press
 * still surprises. Both reject the same orders, which is the point of sharing
 * this. Expected draws is 1.001, so the loop is a formality in practice; the
 * bound and the fallback are there so it is a formality in theory too.
 */
export function guardedRackOrder(
  letters: string,
  word: string,
  draw: (attempt: number) => number[],
): number[] {
  for (let attempt = 0; attempt < 32; attempt++) {
    const order = draw(attempt);
    if (!rackGivesAway(order, letters, word)) return order;
  }
  return forceDiffer(draw(0), letters, word);
}

/**
 * A 32-bit FNV-1a hash of the source word. Ported byte-for-byte in the Swift
 * engine, so both platforms deal the same rack for a given day.
 *
 * The seed comes from the WORD, not the day index. Two day indices exist
 * (DAILY_EPOCH selects the crown, STORAGE_EPOCH keys progress) and the first is
 * explicitly re-anchorable by a calendar regeneration, which would silently
 * re-deal every rack. The word is the thing the rack is actually made of, so
 * seeding from it survives re-anchoring and the append-only calendar alike.
 */
function seedForWord(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Salt the word seed per redraw, so attempt N is a different permutation. */
function seedForAttempt(word: string, attempt: number): number {
  // A DOUBLE multiply then a mod-2^32 coercion, matching `seedForCycle`. The
  // Swift port widens to Int64 for the same reason it does there: a wrapping
  // 32-bit multiply would look equivalent and produce different numbers.
  return (seedForWord(word) + attempt * 0x9e3779b1) >>> 0;
}

/**
 * The daily rack order: seeded, so identical for every player on a given day,
 * and guarded, so it never leads with the crown.
 *
 * "Take the next seeded permutation" rather than "reshuffle on first open" is
 * load-bearing. A reshuffle would be a fresh random draw per device, which is
 * exactly the bug this replaces; walking the seed stream keeps the rack a
 * function of the word alone.
 */
export function dailyRackOrder(letters: string, word: string): number[] {
  return guardedRackOrder(letters, word, (attempt) =>
    seededPermutation(letters.length, seedForAttempt(word, attempt)),
  );
}
