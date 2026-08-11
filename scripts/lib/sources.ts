/**
 * What is left of the loaders after the extraction.
 *
 * This file used to read the vendored ENABLE and SCOWL lists and derive the
 * five shipped lists from them. Those lexicons live in orchard now, and so does
 * the derivation. What remains is the one loader the game still needs: the
 * validation boundary, read from the lists orchard produced and this repo
 * committed.
 *
 * loadEnable, loadScowlWords, loadCommonPool, loadSourceCandidates,
 * loadUnpatchedLists and loadUnpatchedBoundary are all gone with the lexicons
 * they read. If you need one, you need orchard.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSET_DIR } from './util.ts';

/**
 * The validation boundary: ENABLE unioned with the SCOWL 95 additions, patched.
 *
 * Reads the two shipped lists rather than deriving them from the vendored
 * lexicons. Those lexicons no longer live here; they moved to orchard, which is
 * now the only place the lists are derived.
 *
 * The two are the same set, and that was verified before the lexicons were
 * deleted rather than assumed: the derivation produced 427,290 words and the
 * shipped pair produced 427,290, with zero words on either side of the
 * difference. It has to be so, because the bake asserts exactly this
 * equivalence on every run, but a migration is a poor time to trust an
 * invariant without looking at it.
 */
export async function loadValidation(): Promise<string[]> {
  const read = (f: string) => readFile(join(ASSET_DIR, f), 'utf8');
  const parse = (text: string) =>
    text
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean);
  const [enable, additions] = await Promise.all([
    read('enable.txt'),
    read('scowl95-additions.txt'),
  ]);
  return [...parse(enable), ...parse(additions)];
}
