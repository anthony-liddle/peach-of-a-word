/**
 * Rewrite source-pool.json's reveal content from the vendored orchard corpus.
 *
 *   pnpm data:refresh-reveals
 *
 * Run it after `pnpm lexicon:update` whenever etymology.tsv moved. Offline and
 * idempotent: it reads vendor/lexicon/etymology.tsv and rewrites the reveal
 * fields of every pool entry, touching no membership.
 *
 * The reasoning for the rules it applies lives in lib/reveals.ts, next to the
 * function that applies them. The short version: this file is a derived
 * artifact that had no producer, which is why it went nineteen days stale and
 * served `Lua error in Module:etymology/templates at line 71` to anyone dealt
 * `dripping`. The same gap `data:rebundle` closed for the per-rack bundles,
 * and the same answer.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceEntry } from '../src/data/types.ts';
import { parseRevealCorpus, refreshReveals } from './lib/reveals.ts';
import { ASSET_DIR, VENDOR_DIR } from './lib/util.ts';

async function main(): Promise<void> {
  const poolPath = join(ASSET_DIR, 'source-pool.json');
  const pool = JSON.parse(await readFile(poolPath, 'utf8')) as SourceEntry[];
  const corpus = parseRevealCorpus(
    await readFile(join(VENDOR_DIR, 'etymology.tsv'), 'utf8'),
  );

  const report = refreshReveals(pool, corpus);
  await writeFile(poolPath, `${JSON.stringify(report.pool)}\n`, 'utf8');

  console.log(
    `\n  Rewrote ${report.pool.length} pool entries from the ` +
      `${corpus.size}-row reveal corpus.\n` +
      `  ${report.refreshed.length} refreshed from the corpus.\n` +
      `  ${report.cleared.length} cleared to a quiet card, the corpus ` +
      `does not carry them:\n` +
      (report.cleared.length > 0 ? `    ${report.cleared.join(', ')}\n` : ''),
  );
}

main().catch((err) => {
  console.error('\nreveal refresh failed:', err);
  process.exitCode = 1;
});
