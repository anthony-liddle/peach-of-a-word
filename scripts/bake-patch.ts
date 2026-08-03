/**
 * Bake the curated patch into the shipped word lists.
 *
 *   pnpm data:bake
 *
 * Derives the five lists from the vendored lexicons, applies the patch, and
 * writes the result to public/data/. The client then fetches lists that are
 * already correct, with no patch file to download and no patch parsing at
 * runtime.
 *
 * It derives the base rather than reading the shipped files, and that matters.
 * Re-reading the shipped lists and removing the denylist again works only while
 * the denylist grows. Taking a word OFF the denylist could never put it back,
 * because the word is already gone from the file being read, so a deny row would
 * be a ratchet nobody could release. Deriving from the vendored lexicons makes
 * the output a pure function of those lexicons and the patch, so the lists
 * always say whatever the patch currently says. That is what lets a denial be
 * reversed.
 *
 * Pure, offline, and idempotent. Every input is committed: the ENABLE list and
 * the SCOWL bands under scripts/data-raw, and the patch beside them. Unlike
 * pnpm data:build it touches no network and rewrites no timestamps, so it is
 * safe to run any time the patch changes. See the note at the top of
 * build-data.ts for why that distinction exists.
 *
 * Strict by design. parsePatch throws on a malformed row and that is correct
 * here: a typo must hard-fail the build. It was only ever wrong at runtime,
 * where it took the player's game down with it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePatch } from '../src/data/patch.ts';
import {
  assertBakedEquivalent,
  bakeLists,
  type ShippedLists,
} from './lib/bake.ts';
import { loadUnpatchedLists } from './lib/sources.ts';
import { ASSET_DIR, PATCH_PATH, writeAsset } from './lib/util.ts';

/** The shipped list files, in the order bakeLists takes them. */
const FILES: ReadonlyArray<readonly [keyof ShippedLists, string]> = [
  ['enable', 'enable.txt'],
  ['additions', 'scowl95-additions.txt'],
  ['common', 'common-pool.txt'],
  ['beyond70', 'beyond-size-70.txt'],
  ['beyond95', 'beyond-size-95.txt'],
];

function parseWordList(text: string): string[] {
  return text
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
}

/** What the currently committed file holds, or nothing if it is not there yet. */
async function readCommitted(file: string): Promise<Set<string>> {
  try {
    return new Set(
      parseWordList(await readFile(join(ASSET_DIR, file), 'utf8')),
    );
  } catch {
    return new Set();
  }
}

async function main(): Promise<void> {
  console.log('Baking the dictionary patch into the shipped lists.\n');

  const patch = parsePatch(await readFile(PATCH_PATH, 'utf8'));
  console.log(
    `Patch: ${patch.allow.length} allow, ${patch.deny.length} deny, ` +
      `${patch.demote.length} demote.\n`,
  );

  const base = await loadUnpatchedLists();
  const baked = bakeLists(base, patch);

  // The equivalence proof, run every time rather than once by hand: the baked
  // pools must be the same sets applying the patch to the unpatched lists
  // produces. This is the check that the bake is a representation change and
  // never a curation change.
  assertBakedEquivalent(base, patch, baked);
  console.log(
    'Equivalence proved against the patch applied to the raw lists.\n',
  );

  // The delta against what is committed, which the equivalence proof cannot
  // see. It says the bake is internally consistent, not that it changed only
  // what someone meant to change. A vendored file drifting, or a patch edit
  // with a wider reach than intended, shows up here and nowhere else.
  let changed = 0;
  for (const [key, file] of FILES) {
    const committed = await readCommitted(file);
    const next = baked[key];
    const nextSet = new Set(next);
    const added = next.filter((w) => !committed.has(w)).length;
    const removed = [...committed].filter((w) => !nextSet.has(w)).length;
    changed += added + removed;
    await writeAsset(file, next.join('\n'));
    console.log(
      `  ${file.padEnd(24)} ${next.length.toLocaleString().padStart(8)} words` +
        (added || removed ? `  (+${added} / -${removed})` : '  (unchanged)'),
    );
  }

  console.log(
    changed === 0
      ? '\nDone. The shipped lists were already correct.'
      : `\nDone. ${changed} membership changes across the shipped lists.`,
  );
}

main().catch((err) => {
  console.error('\nPatch bake failed:', err);
  process.exitCode = 1;
});
