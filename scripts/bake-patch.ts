/**
 * Bake the curated patch into every artifact derived from the word lists.
 *
 *   pnpm data:bake
 *
 * Derives the five lists from the vendored lexicons, applies the patch, and
 * writes the result to public/data/, then re-emits the per-puzzle definition
 * bundles from the boundary that produces. The client then fetches lists that
 * are already correct, with no patch file to download and no patch parsing at
 * runtime.
 *
 * The rule this exists to enforce, stated in README.md under "The patch is
 * applied at build time, not at runtime": every artifact derived from the word
 * lists must have the patch applied, not just the lists themselves. Baking only
 * the lists is how 44 denied words kept their glosses in public/data/defs while
 * being absent from validation, unfindable in play, and invisible to every test.
 * Anything derived from these lists in future, here or in a port, inherits the
 * same obligation.
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
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePatch } from './lib/patch.ts';
import {
  assertBakedEquivalent,
  bakeLists,
  type ShippedLists,
} from './lib/bake.ts';
import { assertNoDeniedGlosses, buildBundles } from './lib/emit-definitions.ts';
import { buildMeta, serialiseMeta } from './lib/meta.ts';
import {
  loadDefinitions,
  loadUnpatchedLists,
  loadValidation,
} from './lib/sources.ts';
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
  console.log('Baking the dictionary patch into every derived artifact.\n');

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
      ? '\n  The shipped lists were already correct.'
      : `\n  ${changed} membership changes across the shipped lists.`,
  );

  const derived = await bakeBundles(patch.deny);

  await writeMeta(baked, derived);

  console.log('\nDone.');
}

/**
 * Rewrite meta.json from the artifacts this run just produced.
 *
 * This is the step whose absence was the bug. The bake wrote the five lists and
 * the bundles and left the metadata describing the previous build, so the file
 * kept claiming 430,172 boundary words against 427,290 shipped, and a published
 * essay quoted the wrong figure out of it.
 *
 * Every count is measured from what was written rather than carried forward, so
 * the file cannot describe a build that no longer exists. See lib/meta.ts for
 * the two fields that were deliberately dropped.
 */
async function writeMeta(
  baked: ShippedLists,
  derived: DerivedCounts,
): Promise<void> {
  const meta = buildMeta({
    enable: baked.enable.length,
    scowl95Additions: baked.additions.length,
    // The runtime concatenates these two and nothing else. They are disjoint by
    // construction (the additions are what SCOWL 95 adds on top of ENABLE), so
    // the union is the sum and no deduplication is hiding here.
    boundary: baked.enable.length + baked.additions.length,
    common: baked.common.length,
    beyond70: baked.beyond70.length,
    beyond95: baked.beyond95.length,
    sourcePool: derived.sourcePool,
    definitionsCovered: derived.definitionsCovered,
  });

  await writeAsset('meta.json', serialiseMeta(meta));
  console.log(
    `\n  meta.json rewritten: ${meta.counts.boundary.toLocaleString()} boundary words, ` +
      `${meta.counts.sourcePool.toLocaleString()} crowns, ` +
      `${meta.counts.definitionsCovered.toLocaleString()} defined.`,
  );
}

/** What the bundle emit measured, for the metadata to record. */
interface DerivedCounts {
  readonly sourcePool: number;
  readonly definitionsCovered: number;
}

/**
 * Re-emit the per-puzzle definition bundles from the boundary the patch just
 * produced.
 *
 * The bundles are derived from the word lists, so the patch has to reach them
 * too. It did not, and the shape of that bug is worth stating: a deny row
 * removed a word from validation and from every rarity band, so it could never
 * be found in play, and left its gloss sitting in every bundle that could spell
 * it. Nothing broke, nothing surfaced, and the text shipped. Only a full
 * pnpm data:build rewrote the bundles, and that is a network-touching rebuild
 * nobody reaches for casually, so the glosses stayed.
 *
 * Re-derived, not scrubbed, for the same reason the lists are. Filtering the
 * committed bundles would work only while the denylist grows: taking a word off
 * the denylist could never put its gloss back, because the gloss is already gone
 * from the file being read. Deriving from the committed definitions TSV makes
 * the bundles a pure function of that TSV, the vendored lexicons, and the patch,
 * so a denial stays reversible. It is also why the TSV keeps entries for denied
 * words: the TSV is the build input that makes reversal possible without going
 * back to the network, and it is never served.
 *
 * The boundary comes from loadValidation, which is the same function
 * build-data.ts emits bundles against, so the two tools cannot disagree about
 * key order and leave the files flip-flopping. That it matches the lists this
 * bake just wrote is already proved above: assertBakedEquivalent compares the
 * baked pair against exactly this patch-applied boundary.
 *
 * Offline like the rest of the bake. Every input is committed.
 */
async function bakeBundles(deny: readonly string[]): Promise<DerivedCounts> {
  console.log('\nRe-emitting the definition bundles from the baked boundary.');

  const validation = await loadValidation();
  const defs = await loadDefinitions();
  const sourceWords = (
    JSON.parse(await readFile(join(ASSET_DIR, 'source-pool.json'), 'utf8')) as {
      word: string;
    }[]
  ).map((entry) => entry.word);

  const bundles = buildBundles(sourceWords, validation, defs);

  // Belt and braces. A correct emit cannot produce a denied gloss, because
  // buildBundles only writes words the boundary carries. This says so out loud
  // on every bake, because the failure it catches is silent by nature.
  assertNoDeniedGlosses(bundles, deny);

  // Cleared before writing, matching build-data.ts. A rack dropped from the
  // source pool must not leave its bundle behind, or the directory accumulates
  // files for racks that no longer exist.
  const defsDir = join(ASSET_DIR, 'defs');
  await rm(defsDir, { recursive: true, force: true });
  for (const [rack, bundle] of bundles) {
    await writeAsset(`defs/${rack}.json`, JSON.stringify(bundle));
  }

  const glosses = [...bundles.values()].reduce(
    (sum, bundle) => sum + Object.keys(bundle).length,
    0,
  );
  console.log(
    `  ${bundles.size.toLocaleString()} bundles written, ` +
      `${glosses.toLocaleString()} glosses, no denied words.`,
  );

  // Counted once across every bundle, which is the same set meta.test.ts
  // re-derives from the committed files. glosses above is the total including
  // the same word in many racks; this is the distinct vocabulary.
  const distinct = new Set<string>();
  for (const bundle of bundles.values()) {
    for (const word of Object.keys(bundle)) distinct.add(word);
  }

  return { sourcePool: sourceWords.length, definitionsCovered: distinct.size };
}

main().catch((err) => {
  console.error('\nPatch bake failed:', err);
  process.exitCode = 1;
});
