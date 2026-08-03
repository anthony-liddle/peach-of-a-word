/**
 * The word pools the calendar build derives eligibility from, loaded from the
 * committed assets with the dictionary patch applied.
 *
 * Why this exists: the calendar generator IS pool derivation. It computes each
 * candidate's set size through createPuzzle and keeps the ones that clear the
 * floor, so a word still present here is inside a completion count and a par
 * value. Loading the raw lists without the patch left every denied word sitting
 * in those denominators even though the runtime had removed it. Applying the
 * patch here is what makes "denied before pool derivation" true of the build and
 * not just of the app.
 *
 * Both subtracting halves of the patch are applied, deny and demote, and the
 * adding half is not. That is deliberate. A demoted word has to come out here
 * as well as at runtime, because set size IS the eligibility test: leaving a
 * demoted word in these pools would count it toward a floor it no longer
 * contributes to. Two other divergences from the runtime predate this work, and
 * closing either one grows the calendar:
 *
 *   The allowlist is not applied. Its 32 common words raise some set sizes, and
 *   measured against the committed data that lifts appalled and approach over
 *   the floor, appending two crowns nobody asked for.
 *
 *   The boundary is ENABLE alone, where the runtime uses ENABLE union SCOWL 95.
 *
 * Both are real and both are reported, not fixed in passing: this change is
 * subtraction, and a wider boundary is addition. Denial is the half that has to
 * be here, because a denied word left in these pools would sit inside a par
 * value and a completion count even though the runtime had already dropped it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formableFrom } from '../../src/engine/formability.ts';
import type { Dictionary, WordSource } from '../../src/engine/types.ts';
import { parsePatch } from '../../src/data/patch.ts';
import { ASSET_DIR, PATCH_PATH } from './util.ts';

/** The four sources createPuzzle needs, in the order it takes them. */
export interface Pools {
  readonly dictionary: Dictionary;
  readonly commonPool: WordSource;
  readonly beyond70Pool: WordSource;
  readonly beyond95Pool: WordSource;
}

// List-backed sources, identical to src/data/listSource.ts but built here so the
// script avoids the app's @/ alias under tsx.
function listDictionary(words: Iterable<string>): Dictionary {
  const set = new Set(words);
  return { has: (w) => set.has(w), formableWords: (r) => formableFrom(r, set) };
}
function listWordSource(words: Iterable<string>): WordSource {
  const list = [...words];
  return { formableWords: (r) => formableFrom(r, list) };
}

function parseWordList(text: string): string[] {
  return text
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Read the committed lists and wrap them for the engine.
 *
 * The lists now carry the whole patch baked in, so the deny and demote halves
 * need no work here: they are already gone. The allowlist has to be taken back
 * out, which is the awkward part and is deliberate.
 *
 * Baking closed the first divergence described above by accident. The shipped
 * common pool now contains the 32 allowlisted words, so set sizes rise, appalled
 * and approach clear the floor, and the eligible pool grows by two. That would
 * move the committed calendar. Growing the calendar is a curation decision and
 * not part of moving the patch to build time, so the allowlist is subtracted
 * here to hold the derivation exactly where it was. The divergence stays open,
 * documented, and someone's deliberate choice to make later.
 */
export async function loadPatchedPools(): Promise<Pools> {
  const read = (f: string) => readFile(join(ASSET_DIR, f), 'utf8');
  const [enable, common, beyond70, beyond95, patchText] = await Promise.all([
    read('enable.txt'),
    read('common-pool.txt'),
    read('beyond-size-70.txt'),
    read('beyond-size-95.txt'),
    readFile(PATCH_PATH, 'utf8'),
  ]);

  const allowed = new Set(parsePatch(patchText).allow.map((a) => a.word));
  const withoutAllowlist = (words: string[]) =>
    words.filter((w) => !allowed.has(w));

  const lists = {
    enable: withoutAllowlist(parseWordList(enable)),
    common: withoutAllowlist(parseWordList(common)),
    beyond70: parseWordList(beyond70),
    beyond95: parseWordList(beyond95),
  };

  return {
    dictionary: listDictionary(lists.enable),
    commonPool: listWordSource(lists.common),
    beyond70Pool: listWordSource(lists.beyond70),
    beyond95Pool: listWordSource(lists.beyond95),
  };
}
