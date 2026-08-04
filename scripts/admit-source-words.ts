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
 * admitted by hand, including one the derivation has never been run over. It is
 * deliberately conservative: it rejects more than the cull would, because a
 * false reject costs one candidate and a false accept ships a plural as a crown.
 *
 * Where it disagrees with the derivation, the derivation wins, and the
 * disagreement is recorded word by word in source-lemma-clearances.tsv rather
 * than settled by loosening these patterns. Loosening them to admit consumer
 * and clothing would also wave through earliest, happiest, notified and
 * stripped, which is exactly what this is for. See admissionFailures.
 */
export function looksInflected(
  word: string,
  lemmas: ReadonlySet<string>,
): boolean {
  /**
   * Every base a suffix could have been added to, accounting for the spelling
   * changes English makes when it inflects: a silent e dropped (adhere to
   * adhering, strange to stranger), a final y turning to i (early to earliest,
   * notify to notified), and a final consonant doubling (strip to stripped).
   * Without the last two the guard waves through earliest, happiest, notified
   * and stripped, all of which sit in the common pool at 8 letters and are
   * exactly what must never become a crown.
   */
  const basesFor = (suffix: string): string[] => {
    const stem = word.slice(0, -suffix.length);
    const out = [stem, `${stem}e`];
    if (stem.endsWith('i')) out.push(`${stem.slice(0, -1)}y`);
    const last = stem.at(-1);
    if (last && stem.at(-2) === last) out.push(stem.slice(0, -1));
    return out;
  };
  const inflects = (suffix: string): boolean =>
    word.endsWith(suffix) &&
    word.length > suffix.length + 1 &&
    basesFor(suffix).some((base) => lemmas.has(base));

  // A plural or third-person form, a past form, a degree form, or an -ing form,
  // in each case only when the base it would come from is itself a word.
  return ['s', 'es', 'ies', 'ed', 'er', 'est', 'ing'].some(inflects);
}

/** Everything an admission is judged against that does not need the network. */
export interface AdmissionContext {
  /** The baked common pool: inside the SOURCE_POOL_SIZES bands. */
  readonly common: ReadonlySet<string>;
  /** The patched validation boundary. A denied word is absent from it. */
  readonly validation: ReadonlySet<string>;
  /** The Phase 2 cull, word to reason. */
  readonly cull: ReadonlyMap<string, string>;
  /** Words the form_of derivation clears despite the shape guard. */
  readonly clearances: ReadonlySet<string>;
  /** Set size through the engine's own createPuzzle. */
  readonly setSize: (word: string) => number;
}

/**
 * Every reason this word may not be admitted, or an empty list to admit it.
 *
 * Returned rather than thrown so one run reports all of a candidate's problems
 * at once, and so the gates can be tested by planting a word that must fail.
 * The network gates (a definition and an etymology must exist) live in main,
 * since they cannot be decided offline.
 */
export function admissionFailures(
  word: string,
  ctx: AdmissionContext,
): string[] {
  const failures: string[] = [];
  if (word.length !== SOURCE_WORD_LENGTH) failures.push('not 8 letters');
  if (!ctx.common.has(word))
    failures.push('not in the common pool, so outside the bands');
  if (!ctx.validation.has(word)) failures.push('not in validation, or denied');
  if (ctx.cull.has(word))
    failures.push(`in the Phase 2 cull as ${ctx.cull.get(word)}`);
  if (looksInflected(word, ctx.validation) && !ctx.clearances.has(word)) {
    failures.push(
      'reads as an inflected form and the derivation has not cleared it',
    );
  }
  const setSize = ctx.setSize(word);
  if (setSize < MIN_SET_SIZE)
    failures.push(`set size ${setSize} is under the floor`);
  return failures;
}

/** Parse the clearance list: word in the first column, comments and header skipped. */
export function parseClearances(tsv: string): Set<string> {
  const out = new Set<string>();
  for (const line of tsv.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const word = (line.split('\t')[0] ?? '').trim().toLowerCase();
    if (word === '' || word === 'word') continue;
    out.add(word);
  }
  return out;
}

async function main(): Promise<void> {
  console.log('Admitting source words (manual, network).\n');

  const [
    admissionsText,
    poolJson,
    commonText,
    defsText,
    exclusionsText,
    clearancesText,
  ] = await Promise.all([
    readFile(join(DATA_RAW_DIR, 'source-admissions.tsv'), 'utf8'),
    readFile(join(ASSET_DIR, 'source-pool.json'), 'utf8'),
    readFile(join(ASSET_DIR, 'common-pool.txt'), 'utf8'),
    readFile(join(DATA_RAW_DIR, 'definitions.tsv'), 'utf8'),
    readFile(join(DATA_RAW_DIR, 'source-exclusions.tsv'), 'utf8'),
    readFile(join(DATA_RAW_DIR, 'source-lemma-clearances.tsv'), 'utf8'),
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
  const clearances = parseClearances(clearancesText);
  const pools = await loadPatchedPools();
  const validation = await loadValidation();
  const validationSet = new Set(validation);

  const failures: string[] = [];
  const admitted: SourceEntry[] = [];

  const ctx: AdmissionContext = {
    common,
    validation: validationSet,
    cull,
    clearances,
    setSize: (w) =>
      sourceSetSize(
        w,
        pools.dictionary,
        pools.commonPool,
        pools.beyond70Pool,
        pools.beyond95Pool,
      ),
  };

  for (const { word, reason } of admissions) {
    const fail = (why: string) => failures.push(`${word}: ${why}`);

    for (const why of admissionFailures(word, ctx)) fail(why);
    const setSize = ctx.setSize(word);

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
