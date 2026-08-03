/**
 * Admit hand-picked words to the source pool, and emit their reveal bundles.
 *
 *   pnpm data:admit
 *
 * Manual and network-touching, like vendor-lists.ts. Never called by the build,
 * CI, or tests.
 *
 * Why widen the pool at all. The eligible crowns minus the Phase 2 cull are
 * exactly the committed calendar, so retiring a crown leaves nothing to put in
 * its place. The cull cannot supply one: every word in it violates one of the
 * three rules by construction, and a plural has no etymology of its own to
 * reveal, which is the whole point of a crown. So the pool grows by the minimum
 * needed, and each admission is recorded with its reason in
 * scripts/data-raw/source-admissions.tsv.
 *
 * Every gate the normal pipeline applies is re-applied here, and the script
 * refuses to write if any one fails. The one thing it does differently is
 * re-fetch from the network rather than trusting the cached raw response, which
 * is the only way past a cached null etymology (see enrichWord in
 * lib/wiktionary.ts).
 *
 * Run it, then `pnpm defs:acquire` to fill in glosses for the newly reachable
 * words, then run it again to emit the bundles with full coverage. It is
 * idempotent, so the second run only rewrites the bundles.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MIN_SET_SIZE, SOURCE_WORD_LENGTH } from '../src/engine/config.ts';
import { sourceSetSize } from '../src/engine/eligibility.ts';
import type { SourceEntry } from '../src/data/types.ts';
import { parseDefinitions } from './lib/definitions.ts';
import { parseReasonedWords } from './lib/denylist.ts';
import { buildBundles } from './lib/emit-definitions.ts';
import { parseExclusions } from './lib/exclusions.ts';
import { loadPatchedPools } from './lib/pools.ts';
import { loadValidation } from './lib/sources.ts';
import { refetchWord } from './lib/wiktionary.ts';
import { ASSET_DIR, DATA_RAW_DIR, writeAsset } from './lib/util.ts';

/**
 * The three Phase 2 cull rules, as a shape test on the candidate itself.
 *
 * The committed cull was derived from Wiktionary form_of tags, which is the
 * authority; this is the cheap guard that stops an obvious inflection being
 * admitted by hand. It is deliberately conservative: it rejects more than the
 * cull would, because a false reject here costs one candidate and a false
 * accept ships a plural as a crown.
 */
export function looksInflected(
  word: string,
  lemmas: ReadonlySet<string>,
): boolean {
  const stem = (suffix: string) => word.slice(0, -suffix.length);
  // A plural or third-person form whose singular is itself a word.
  if (word.endsWith('s') && lemmas.has(stem('s'))) return true;
  if (word.endsWith('es') && lemmas.has(stem('es'))) return true;
  if (word.endsWith('ies') && lemmas.has(`${stem('ies')}y`)) return true;
  // A past tense or participle whose base is itself a word.
  if (word.endsWith('ed') && lemmas.has(stem('ed'))) return true;
  if (word.endsWith('ed') && lemmas.has(`${stem('ed')}e`)) return true;
  // A degree form. The -e variants matter: stranger is strange plus -r, and
  // the cull holds it for exactly that reason.
  if (word.endsWith('er') && lemmas.has(stem('er'))) return true;
  if (word.endsWith('er') && lemmas.has(`${stem('er')}e`)) return true;
  if (word.endsWith('est') && lemmas.has(stem('est'))) return true;
  if (word.endsWith('est') && lemmas.has(`${stem('est')}e`)) return true;
  // An -ing form whose base is itself a word.
  if (word.endsWith('ing') && lemmas.has(stem('ing'))) return true;
  if (word.endsWith('ing') && lemmas.has(`${stem('ing')}e`)) return true;
  return false;
}

async function main(): Promise<void> {
  console.log('Admitting source words (manual, network).\n');

  const [admissionsText, poolJson, commonText, defsText, exclusionsText] =
    await Promise.all([
      readFile(join(DATA_RAW_DIR, 'source-admissions.tsv'), 'utf8'),
      readFile(join(ASSET_DIR, 'source-pool.json'), 'utf8'),
      readFile(join(ASSET_DIR, 'common-pool.txt'), 'utf8'),
      readFile(join(DATA_RAW_DIR, 'definitions.tsv'), 'utf8'),
      readFile(join(DATA_RAW_DIR, 'source-exclusions.tsv'), 'utf8'),
    ]);

  const admissions = parseReasonedWords(admissionsText, 'Source admission');
  const pool = JSON.parse(poolJson) as SourceEntry[];
  const have = new Map(pool.map((e) => [e.word, e]));
  const common = new Set(
    commonText
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean),
  );
  const cull = parseExclusions(exclusionsText);
  const pools = await loadPatchedPools();
  const validation = await loadValidation();
  const validationSet = new Set(validation);

  const failures: string[] = [];
  const admitted: SourceEntry[] = [];

  for (const { word, reason } of admissions) {
    const fail = (why: string) => failures.push(`${word}: ${why}`);

    if (word.length !== SOURCE_WORD_LENGTH) fail('not 8 letters');
    if (!common.has(word)) fail('not in the common pool, so outside the bands');
    if (!validationSet.has(word)) fail('not in validation, or denied');
    if (cull.has(word)) fail(`in the Phase 2 cull as ${cull.get(word)}`);
    if (looksInflected(word, validationSet)) fail('reads as an inflected form');

    const setSize = sourceSetSize(
      word,
      pools.dictionary,
      pools.commonPool,
      pools.beyond70Pool,
      pools.beyond95Pool,
    );
    if (setSize < MIN_SET_SIZE) fail(`set size ${setSize} is under the floor`);

    // Re-fetch rather than trust the cache: a cached null etymology is exactly
    // what kept these words out of the pool in the first place.
    const existing = have.get(word);
    const entry = existing ?? (await refetchWord(word));
    if (!entry.definition) fail('no definition');
    if (!entry.etymology)
      fail('no etymology, so the reveal has nothing to show');

    if (!existing && entry.definition && entry.etymology) {
      admitted.push(entry);
    }
    console.log(
      `  ${word.padEnd(10)} set=${String(setSize).padStart(3)} ` +
        `${existing ? 'already in pool' : 'admitted'}  ${reason}`,
    );
  }

  if (failures.length) {
    throw new Error(`Admission rejected:\n  ${failures.join('\n  ')}`);
  }

  if (admitted.length) {
    const next = [...pool, ...admitted].sort((a, b) =>
      a.word.localeCompare(b.word),
    );
    await writeAsset('source-pool.json', JSON.stringify(next));
    console.log(
      `\n  Source pool ${pool.length} -> ${next.length} ` +
        `(+${admitted.length}).`,
    );
  } else {
    console.log(
      '\n  Source pool unchanged; every admission was already in it.',
    );
  }

  // Emit the reveal bundles for the admitted racks. Only these racks are
  // touched, so no existing bundle is rewritten.
  const defs = parseDefinitions(defsText);
  const words = admissions.map((a) => a.word);
  const bundles = buildBundles(words, validation, defs);
  for (const [word, bundle] of bundles) {
    await writeAsset(`defs/${word}.json`, JSON.stringify(bundle));
  }
  console.log(`\n  Bundles for ${bundles.size} racks:`);
  for (const [word, bundle] of bundles) {
    console.log(
      `    ${word.padEnd(10)} ${Object.keys(bundle).length} words carry a gloss`,
    );
  }
  console.log(
    '\n  If coverage looks thin, run: pnpm defs:acquire, then re-run this.',
  );
  console.log('\nDone.');
}

// Only run when invoked directly. The test imports looksInflected from here,
// and this script touches the network and rewrites committed assets, so it must
// never fire as an import side effect.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(
      '\nAdmission failed:',
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  });
}
