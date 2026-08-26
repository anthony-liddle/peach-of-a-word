/**
 * Rebuild every per-rack reveal bundle from the committed definitions corpus.
 *
 *   pnpm data:rebundle
 *
 * Offline and idempotent. Reads `vendor/lexicon/definitions.tsv` and the
 * validation lists, and rewrites `public/data/defs/<rack>.json` for every rack
 * in `source-pool.json`.
 *
 * Why this exists. `pnpm lexicon:update` pulls a new orchard release into
 * `vendor/lexicon/`, but nothing propagated that corpus into the bundles the
 * game actually serves. `pnpm data:admit` writes bundles only for racks it has
 * just admitted, by design: "Only these racks are touched, so no existing
 * bundle is rewritten." So a release that corrected 1,077 glosses updated the
 * vendored corpus, passed `pnpm lexicon:check`, passed the suite, and changed
 * nothing a player could see. This closes that gap.
 *
 * Run it after every `pnpm lexicon:update` that moves definitions.tsv.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildBundles } from './lib/emit-definitions.ts';
import { parseDefinitions } from './lib/definitions.ts';
import { loadValidation } from './lib/sources.ts';
import { ASSET_DIR, VENDOR_DIR, writeAsset } from './lib/util.ts';

interface SourceEntry {
  readonly word: string;
}

async function main(): Promise<void> {
  const pool = JSON.parse(
    await readFile(join(ASSET_DIR, 'source-pool.json'), 'utf8'),
  ) as SourceEntry[];
  const racks = pool.map((e) => e.word);

  const [validation, defsText] = await Promise.all([
    loadValidation(),
    readFile(join(VENDOR_DIR, 'definitions.tsv'), 'utf8'),
  ]);
  const defs = parseDefinitions(defsText);

  const bundles = buildBundles(racks, validation, defs);
  let glossed = 0;
  const distinct = new Set<string>();
  for (const [word, bundle] of bundles) {
    await writeAsset(`defs/${word}.json`, JSON.stringify(bundle));
    const words = Object.keys(bundle);
    glossed += words.length;
    for (const w of words) distinct.add(w);
  }

  // ------------------------------------------------------------------
  // meta.json's definitionsCovered IS WRITTEN HERE, and nowhere else.
  //
  // The same gap this script exists to close, one layer further along.
  // `pnpm lexicon:update` deliberately preserves sourcePool and
  // definitionsCovered because both are crown-dependent and it has no crown
  // knowledge. That left definitionsCovered describing the bundles as they
  // were BEFORE this script rewrote them: orchard v1.4.0 denied 392 words, the
  // bundles dropped to 24,596 distinct glossed words, and meta.json still said
  // 24,833.
  //
  // This is the step that changes the thing the count describes, so it is the
  // step that owes the count. meta.test.ts catches the stale state, which is
  // how it was found rather than shipped.
  // ------------------------------------------------------------------
  const metaPath = join(ASSET_DIR, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as {
    counts: Record<string, number>;
  };
  const wasCovered = meta.counts.definitionsCovered;
  meta.counts.definitionsCovered = distinct.size;
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  console.log(
    `\n  Rewrote ${bundles.size.toLocaleString()} per-rack bundles from the ` +
      `${defs.size.toLocaleString()}-row definitions corpus.\n` +
      `  ${glossed.toLocaleString()} gloss entries across all bundles ` +
      `(a word's gloss ships in every rack that can form it).\n` +
      `  meta.json definitionsCovered: ${wasCovered?.toLocaleString()} -> ` +
      `${distinct.size.toLocaleString()}\n`,
  );
}

main().catch((err) => {
  console.error('\nbundle refresh failed:', err);
  process.exitCode = 1;
});
