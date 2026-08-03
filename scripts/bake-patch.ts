/**
 * Bake the curated patch into the shipped word lists.
 *
 *   pnpm data:bake
 *
 * Reads the five committed lists in public/data/ and the patch in
 * scripts/data-raw/, applies the patch, and writes the lists back. The client
 * then fetches lists that are already correct, with no patch file to download
 * and no patch parsing at runtime.
 *
 * Why this exists as its own step rather than living inside pnpm data:build:
 * data:build reaches the network and cannot be re-run casually. See the note at
 * the top of build-data.ts. This step is pure, offline, and idempotent, so it
 * can be re-run any time the patch changes without touching the pipeline that
 * derived the lists in the first place.
 *
 * Idempotent: applying the patch to already-baked lists is a no-op, because
 * every operation is a set membership test. Re-running is always safe.
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

async function main(): Promise<void> {
  console.log('Baking the dictionary patch into the shipped lists.\n');

  const patch = parsePatch(await readFile(PATCH_PATH, 'utf8'));
  console.log(
    `Patch: ${patch.allow.length} allow, ${patch.deny.length} deny, ` +
      `${patch.demote.length} demote.\n`,
  );

  const entries = await Promise.all(
    FILES.map(async ([key, file]) => {
      const text = await readFile(join(ASSET_DIR, file), 'utf8');
      return [key, parseWordList(text)] as const;
    }),
  );
  const base = Object.fromEntries(entries) as unknown as ShippedLists;

  const baked = bakeLists(base, patch);

  // The equivalence proof, run every time rather than once by hand: the baked
  // pools must be the same sets the retired runtime merge produced. This is what
  // makes rewriting the committed lists a representation change rather than a
  // curation change.
  assertBakedEquivalent(base, patch, baked);
  console.log('Equivalence proved against the retired runtime merge.\n');

  for (const [key, file] of FILES) {
    const before = base[key].length;
    const after = baked[key].length;
    const delta = after - before;
    await writeAsset(file, baked[key].join('\n'));
    console.log(
      `  ${file.padEnd(24)} ${after.toLocaleString().padStart(8)} words ` +
        `(${delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : ''}${delta}`})`,
    );
  }

  console.log('\nDone. The shipped lists carry the patch.');
}

main().catch((err) => {
  console.error('\nPatch bake failed:', err);
  process.exitCode = 1;
});
