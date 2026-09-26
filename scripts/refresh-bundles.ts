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
import { buildMeta, serialiseMeta, type Meta } from './lib/meta.ts';
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
  //
  // BUILT AND SERIALISED THROUGH lib/meta.ts, not through an inline
  // JSON.stringify. This wrote `${JSON.stringify(meta, null, 2)}\n` until
  // v1.6.0, one byte longer than what lib/meta.ts documents as the committed
  // form, so whichever writer ran last decided whether the file ended in a
  // newline. peach-of-a-word-swift's Data/meta.json was then held
  // byte-identical to this one, so the stray newline made the two disagree on
  // every release this script touched. (Since 2026-09-26 only the attribution
  // strings are held equal across the two; definitionsCovered, which this
  // script writes, is web-only.) lib/meta.ts says it
  // exists "because two writers produce it"; this was a third one, and it went
  // around the reason rather than through it. src/data/metaParity.test.ts now
  // fails when the committed file is not exactly what serialiseMeta writes.
  const metaPath = join(ASSET_DIR, 'meta.json');
  const current = JSON.parse(await readFile(metaPath, 'utf8')) as Meta;
  const wasCovered = current.counts.definitionsCovered;
  const meta = buildMeta({
    ...current.counts,
    definitionsCovered: distinct.size,
  });
  await writeFile(metaPath, serialiseMeta(meta), 'utf8');

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
