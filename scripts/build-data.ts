/**
 * Build-time data pipeline. Bakes the static assets the engine loads.
 *
 *   pnpm data:build
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE RE-RUNNING. This pipeline is effectively one-way.
 *
 * It reaches the network (Wiktionary), and even with the disk cache warm a rerun
 * is not a no-op. It rewrites meta.json with a fresh generatedAt, re-derives all
 * 700-odd per-puzzle bundles under defs/, and reorders source-pool.json. So a
 * rerun produces a large, noisy diff whose contents nobody reviewed, in files
 * the daily calendar is anchored to.
 *
 * What it cannot do is grow the source pool. Every source word is a crown, and
 * the calendar appends newly eligible words, so a pool that grew here would ship
 * crowns nobody curated. This run reports its newly eligible candidates and
 * writes only the committed membership. Admission is pnpm data:admit alone. See
 * lib/source-gate.ts.
 *
 * The practical consequence: the committed files in public/data/ are the source
 * of truth, not this script. This script is how they came to exist, not how they
 * are maintained. Reach for a narrower tool instead:
 *
 *   pnpm data:bake       apply the dictionary patch to the shipped lists.
 *                        Pure, offline, idempotent. This is the usual one.
 *   pnpm data:denylist   re-derive the denylist rows in the patch.
 *   pnpm data:calendar   re-derive the daily calendar.
 *   pnpm defs:rederive   rebuild definition bundles from the committed TSV.
 *
 * Re-run this whole pipeline only when deliberately re-vendoring the source
 * lexicons, and expect to review the calendar and the crowns afterwards.
 * ---------------------------------------------------------------------------
 *
 * Outputs to public/data/:
 *   enable.txt             newline list, the ENABLE half of the boundary
 *   scowl95-additions.txt  newline list, within-95 SCOWL words ENABLE lacks;
 *                          the runtime unions it with ENABLE for the validation
 *                          set (ENABLE union SCOWL 95)
 *   common-pool.txt        newline list, the set / completion denominator (SCOWL small INTERSECT ENABLE)
 *   beyond-size-70.txt     newline list, boundary minus SCOWL size 70: the rarity-ladder cut at 70
 *   beyond-size-95.txt     newline list, boundary minus SCOWL size 95: the rarity-ladder cut at 95
 *   source-pool.json       [{ word, definition, etymology }], the answer pool
 *   meta.json              counts, attribution, generated timestamp
 *
 * The two beyond-size files are the compact complements that drive the off-page
 * rarity ladder. A formable validation word is uncommon if it is in neither
 * (i.e. inside size 70), rare if it is in beyond-70 but not beyond-95, and
 * mythic if it is in beyond-95. Shipping the complements rather than the full
 * positive size-70 and size-95 lists keeps the payload light and giftable while
 * classifying every word identically.
 */
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SIZE_70_SIZES,
  SIZE_95_SIZES,
  WIKTIONARY_CONCURRENCY,
} from './lib/lexicon-config.ts';
import { MAX_SOURCE_WORDS, REQUIRE_ETYMOLOGY } from './lib/curation-config.ts';
import {
  loadCommonPool,
  loadDefinitions,
  loadEnable,
  loadScowlWords,
  loadSourceCandidates,
  loadValidation,
} from './lib/sources.ts';
import { enrichWord, type WordEntry } from './lib/wiktionary.ts';
import { gateSourcePool } from './lib/source-gate.ts';
import {
  ASSET_DIR,
  DATA_RAW_DIR,
  mapWithConcurrency,
  writeAsset,
} from './lib/util.ts';
import { formableUnion } from './lib/formable.ts';
import { buildMeta, serialiseMeta } from './lib/meta.ts';
import {
  bundleStats,
  buildBundles,
  coverage,
  shardProjection,
} from './lib/emit-definitions.ts';

/**
 * The committed source pool. Read rather than derived: it is the membership the
 * gate holds this run to, and the calendar is anchored to it.
 */
async function loadCommittedSourcePool(): Promise<WordEntry[]> {
  try {
    const raw = await readFile(join(ASSET_DIR, 'source-pool.json'), 'utf8');
    return JSON.parse(raw) as WordEntry[];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  console.log('Building data assets.\n');

  console.log('ENABLE: fetching validation set.');
  const enable = await loadEnable();
  const enableSet = new Set(enable);
  await writeAsset('enable.txt', enable.join('\n'));
  console.log(`  ${enable.length.toLocaleString()} words.`);

  console.log('SCOWL: deriving common pool.');
  const commonRaw = await loadCommonPool();
  // Every counted word must be findable, so the denominator lives inside ENABLE.
  const common = commonRaw.filter((w) => enableSet.has(w));
  await writeAsset('common-pool.txt', common.join('\n'));
  console.log(
    `  ${common.length.toLocaleString()} common words ` +
      `(${(commonRaw.length - common.length).toLocaleString()} dropped as not in ENABLE).`,
  );

  console.log('SCOWL: deriving the ENABLE union SCOWL 95 boundary.');
  const scowl70 = new Set(await loadScowlWords(SIZE_70_SIZES));
  const scowl95 = new Set(await loadScowlWords(SIZE_95_SIZES));
  // The boundary is ENABLE union SCOWL 95. Ship the within-95 SCOWL words ENABLE
  // lacks as the additions complement, so no word is listed twice. The runtime
  // unions enable.txt with this to form the validation set.
  const additions = [...scowl95].filter((w) => !enableSet.has(w)).sort();
  await writeAsset('scowl95-additions.txt', additions.join('\n'));
  const boundary = [...enable, ...additions].sort();
  console.log(
    `  ${additions.length.toLocaleString()} SCOWL-95 words beyond ENABLE, ` +
      `boundary ${boundary.length.toLocaleString()}.`,
  );

  console.log(
    'SCOWL: deriving rarity bands (boundary minus size 70 and size 95).',
  );
  // beyond-70 is the whole boundary minus SCOWL 70, so the new SCOWL words land
  // in their true rung (uncommon within 70, rare between 70 and 95). beyond-95
  // is boundary minus SCOWL 95, which equals ENABLE minus SCOWL 95 because every
  // addition is within 95, so the mythic tail is unchanged.
  const beyond70 = boundary.filter((w) => !scowl70.has(w));
  const beyond95 = boundary.filter((w) => !scowl95.has(w));
  await writeAsset('beyond-size-70.txt', beyond70.join('\n'));
  await writeAsset('beyond-size-95.txt', beyond95.join('\n'));
  console.log(
    `  ${beyond70.length.toLocaleString()} beyond size 70 ` +
      `(${((beyond70.length / boundary.length) * 100).toFixed(0)}% of boundary), ` +
      `${beyond95.length.toLocaleString()} beyond size 95 ` +
      `(${((beyond95.length / boundary.length) * 100).toFixed(0)}%).`,
  );

  // No hand-exclusion step here any more. scripts/source-exclude.txt used to be
  // filtered out at this point, and it could not affect what ships: gateSourcePool
  // below reduces membership to the committed pool, and a candidate dropped here
  // simply falls back to its committed entry rather than leaving the pool. It was
  // also empty, untested, and carried no reason column. The live mechanism is
  // data-raw/source-exclusions.tsv, which records a reason per word and is read by
  // build-calendar.ts and admit-source-words.ts, where crown membership is actually
  // decided.
  console.log('SCOWL: deriving 8-letter source candidates.');
  const candidates = (await loadSourceCandidates())
    .filter((w) => enableSet.has(w)) // must be a submittable answer
    .slice(0, MAX_SOURCE_WORDS);
  console.log(`  ${candidates.length} candidates to enrich.`);

  console.log('Wiktionary: fetching definitions and etymologies.');
  const enriched = await mapWithConcurrency(
    candidates,
    WIKTIONARY_CONCURRENCY,
    enrichWord,
    (done, total) => {
      if (done % 25 === 0 || done === total) {
        process.stdout.write(`  ${done}/${total}\r`);
      }
    },
  );
  process.stdout.write('\n');

  const eligible: WordEntry[] = enriched.filter(
    (e) => e.definition && (REQUIRE_ETYMOLOGY ? e.etymology : true),
  );
  console.log(
    `  ${eligible.length} candidates carry both a definition and an etymology ` +
      `(${enriched.length - eligible.length} dropped for missing either).`,
  );

  // The gate. This pipeline reports what it found and writes only what was
  // already committed; the pool grows through pnpm data:admit alone. See
  // lib/source-gate.ts for why.
  const committedEntries = await loadCommittedSourcePool();
  const gated = gateSourcePool(
    eligible,
    new Set(committedEntries.map((e) => e.word)),
    committedEntries,
  );
  const sourcePool = gated.kept;
  await writeAsset('source-pool.json', JSON.stringify(sourcePool));
  console.log(
    `  ${sourcePool.length} source words written (the committed pool, unchanged in membership).`,
  );
  console.log(
    `  ${gated.withheld.length} newly eligible words withheld. They are crown ` +
      `candidates nobody has curated, so admit them through pnpm data:admit.`,
  );
  if (gated.stale.length) {
    console.log(
      `  ${gated.stale.length} committed words held at their committed entry ` +
        `(this run did not reproduce them): ${gated.stale.join(', ')}.`,
    );
  }

  console.log('Definitions: emitting per-puzzle bundles.');
  // Bundles are built over the full validation boundary, so an allowlisted
  // modern word (app, podcast) reaches the racks that can spell it and a
  // denylisted word never does. ENABLE alone would miss the patch layer.
  const validation = await loadValidation();
  const sourceWordsList = sourcePool.map((e) => e.word);
  const defs = await loadDefinitions();
  const union = formableUnion(sourceWordsList, validation);
  const bundles = buildBundles(sourceWordsList, validation, defs);

  const defsDir = join(ASSET_DIR, 'defs');
  await rm(defsDir, { recursive: true, force: true });
  for (const [word, bundle] of bundles) {
    await writeAsset(`defs/${word}.json`, JSON.stringify(bundle));
  }

  const cov = coverage(union, defs);
  const stats = bundleStats(bundles);
  const definedEntries = union
    .filter((w) => defs.has(w))
    .map((w) => [w, defs.get(w) as string] as [string, string]);
  const shards = shardProjection(definedEntries);
  let tsvSize: number;
  try {
    tsvSize = (await stat(join(DATA_RAW_DIR, 'definitions.tsv'))).size;
  } catch {
    tsvSize = 0;
  }

  console.log('\n=== Definitions measurement report ===');
  console.log(
    `  Formable union: ${cov.union.toLocaleString()} words, ` +
      `${cov.defined.toLocaleString()} defined (${cov.percent}% coverage).`,
  );
  console.log(`  definitions.tsv size: ${tsvSize.toLocaleString()} bytes.`);
  console.log(
    `  Per-puzzle bundles: ${stats.count} bundles, ` +
      `${stats.combined.toLocaleString()} bytes combined, ` +
      `avg ${stats.average.toLocaleString()}, max ${stats.max.toLocaleString()} ` +
      `(max is what one session loads).`,
  );
  console.log(
    `  First-letter shard projection: ${shards.combined.toLocaleString()} bytes ` +
      `combined across ${Object.keys(shards.perShard).length} shards.`,
  );
  const shardLine = Object.entries(shards.perShard)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, size]) => `${letter}:${size}`)
    .join('  ');
  console.log(`    ${shardLine}`);
  console.log('======================================\n');

  // Built through lib/meta.ts rather than inline, so this writer and pnpm
  // data:bake cannot disagree about the file's shape. definitionUnion and
  // generatedAt are deliberately not carried; see that module for why. The
  // union is still reported in the build log above, where it belongs.
  const meta = buildMeta({
    enable: enable.length,
    scowl95Additions: additions.length,
    boundary: boundary.length,
    common: common.length,
    beyond70: beyond70.length,
    beyond95: beyond95.length,
    sourcePool: sourcePool.length,
    definitionsCovered: cov.defined,
  });
  await writeAsset('meta.json', serialiseMeta(meta));

  console.log('\nDone. Assets written to public/data/.');
}

main().catch((err) => {
  console.error('\nData build failed:', err);
  process.exitCode = 1;
});
