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
 * Only the deny half of the patch is applied, and that is deliberate. Two other
 * divergences from the runtime predate this work, and closing either one grows
 * the calendar:
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
import { applyPatch, parsePatch } from '../../src/data/patch.ts';
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

/** Read the committed lists and apply the patch, then wrap them for the engine. */
export async function loadPatchedPools(): Promise<Pools> {
  const read = (f: string) => readFile(join(ASSET_DIR, f), 'utf8');
  const [enable, common, beyond70, beyond95, patchText] = await Promise.all([
    read('enable.txt'),
    read('common-pool.txt'),
    read('beyond-size-70.txt'),
    read('beyond-size-95.txt'),
    read('dictionary-patch.tsv'),
  ]);

  const lists = applyPatch(
    {
      enable: parseWordList(enable),
      common: parseWordList(common),
      beyond70: parseWordList(beyond70),
      beyond95: parseWordList(beyond95),
    },
    { allow: [], deny: parsePatch(patchText).deny },
  );

  return {
    dictionary: listDictionary(lists.enable),
    commonPool: listWordSource(lists.common),
    beyond70Pool: listWordSource(lists.beyond70),
    beyond95Pool: listWordSource(lists.beyond95),
  };
}
