// scripts/acquire-definitions.ts
// Manual, network-touching, occasional. Computes the union of every findable
// word across the shipped source words, fetches a short definition for each from
// Wiktionary (cached, rate limited), and writes the committed definitions.tsv.
// Idempotent and resumable: words already present are skipped, per-word REST
// responses are cached, and progress is flushed periodically.
//
//   pnpm defs:acquire
//
// Never called by the build, CI, or tests. Wiktionary is CC BY-SA; see
// scripts/data-raw/PROVENANCE.md and the colophon.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFINITION_MAX_LENGTH } from './lib/lexicon-config.ts';
import {
  mergeDefinitions,
  parseDefinitions,
  serializeDefinitions,
  shapeDefinition,
} from './lib/definitions.ts';
import { formableUnion } from './lib/formable.ts';
import { loadValidation } from './lib/sources.ts';
import { ASSET_DIR, DATA_RAW_DIR, mapWithConcurrency } from './lib/util.ts';
import { fetchDefinitionJson } from './lib/wiktionary.ts';

const TSV_PATH = join(DATA_RAW_DIR, 'definitions.tsv');
const FLUSH_EVERY = 200;
const CONCURRENCY = 4;

async function loadExisting(): Promise<Map<string, string>> {
  try {
    return parseDefinitions(await readFile(TSV_PATH, 'utf8'));
  } catch {
    return new Map();
  }
}

async function loadSourceWords(): Promise<string[]> {
  const json = await readFile(join(ASSET_DIR, 'source-pool.json'), 'utf8');
  return (JSON.parse(json) as { word: string }[]).map((e) => e.word);
}

async function flush(defs: Map<string, string>): Promise<void> {
  await writeFile(TSV_PATH, serializeDefinitions(defs), 'utf8');
}

async function main(): Promise<void> {
  console.log('Acquiring definitions (manual, network).');
  const [validation, sourceWords, existing] = await Promise.all([
    loadValidation(),
    loadSourceWords(),
    loadExisting(),
  ]);
  const union = formableUnion(sourceWords, validation);
  const todo = union.filter((w) => !existing.has(w));
  console.log(
    `  Union ${union.length.toLocaleString()} words, ` +
      `${existing.size.toLocaleString()} already have definitions, ` +
      `${todo.length.toLocaleString()} to fetch.`,
  );

  const found = new Map<string, string>();
  let processed = 0;
  await mapWithConcurrency(
    todo,
    CONCURRENCY,
    async (word) => {
      const gloss = shapeDefinition(
        await fetchDefinitionJson(word),
        DEFINITION_MAX_LENGTH,
      );
      if (gloss) found.set(word, gloss);
    },
    (done, total) => {
      processed = done;
      if (done % FLUSH_EVERY === 0 || done === total) {
        void flush(mergeDefinitions(existing, found));
        process.stdout.write(`  ${done}/${total} (${found.size} found)\r`);
      }
    },
  );
  process.stdout.write('\n');

  await flush(mergeDefinitions(existing, found));
  console.log(
    `Done. ${found.size.toLocaleString()} new definitions ` +
      `(${processed.toLocaleString()} words checked). Wrote ${TSV_PATH}.`,
  );
}

main().catch((err) => {
  console.error('\nAcquisition failed:', err);
  process.exitCode = 1;
});
