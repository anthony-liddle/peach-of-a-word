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
 * All three halves of the patch now apply, deny, demote and allow, so these
 * pools say what the runtime says. A demoted word has to come out here as well
 * as at runtime, because set size IS the eligibility test: leaving a demoted
 * word in these pools would count it toward a floor it no longer contributes
 * to. The allowlist has to go in for the mirror-image reason: leaving it out
 * withheld set size a player could already earn.
 *
 * One divergence from the runtime is still open and still reported, not fixed
 * in passing: the boundary here is ENABLE alone, where the runtime uses ENABLE
 * union SCOWL 95. A wider boundary is addition, and addition to the crown pool
 * is a curation decision of its own.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formableFrom } from '../../src/engine/formability.ts';
import type { Dictionary, WordSource } from '../../src/engine/types.ts';
import { ASSET_DIR } from './util.ts';

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
 * The lists carry the whole patch baked in, so nothing needs undoing here: the
 * deny and demote halves are already gone, and the allowlist is already in.
 *
 * The allowlist used to be subtracted, to hold the derivation exactly where it
 * was while the patch moved to build time. That was the right call for that
 * change and it was always meant to be revisited, because it made the build
 * disagree with the runtime: a player could already find an allowlisted word in
 * one of these racks and have it counted, while the build pretended otherwise.
 * The subtraction is gone now, and with it the one divergence it caused,
 * appalled and approach sitting at set size 14 against a floor of 15 when the
 * allowlist lifts each to exactly 15. See lib/pools.test.ts.
 */
export async function loadPatchedPools(): Promise<Pools> {
  const read = (f: string) => readFile(join(ASSET_DIR, f), 'utf8');
  const [enable, common, beyond70, beyond95] = await Promise.all([
    read('enable.txt'),
    read('common-pool.txt'),
    read('beyond-size-70.txt'),
    read('beyond-size-95.txt'),
  ]);

  const lists = {
    enable: parseWordList(enable),
    common: parseWordList(common),
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
