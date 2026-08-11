// scripts/rederive-definitions.ts
// Manual, offline, occasional. Re-runs the gloss-selection step over the
// already-cached Wiktionary responses to pick a better sense per word, then
// rewrites the committed definitions.tsv in place. No network: it reads only
// the disk cache, and keeps the prior gloss when a word has no cache entry, so
// no word is ever blanked.
//
//   pnpm defs:rederive
//
// Never called by the build, CI, or tests. After running, rebuild the
// per-puzzle bundles with `pnpm data:build`. Wiktionary is CC BY-SA; see
// scripts/data-raw/PROVENANCE.md and the colophon.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFINITION_MAX_LENGTH } from './lib/lexicon-config.ts';
import {
  parseDefinitions,
  rederiveGlosses,
  serializeDefinitions,
} from './lib/definitions.ts';
import { DATA_RAW_DIR, mapWithConcurrency, readCacheJson } from './lib/util.ts';
import { isJunkSense } from './lib/wiktionary.ts';

const TSV_PATH = join(DATA_RAW_DIR, 'definitions.tsv');
const READ_CONCURRENCY = 16;

interface RawDefinition {
  definitionJson: string | null;
}

/** Split a committed gloss into its lowercased pos prefix and the rest. */
function splitGloss(gloss: string): { pos: string | null; text: string } {
  const match = gloss.match(/^([a-z ]+)\. ([\s\S]*)$/);
  return match
    ? { pos: match[1] ?? null, text: match[2] ?? '' }
    : { pos: null, text: gloss };
}

/** Whether a committed gloss reads as a reliably-junk sense. */
function glossIsJunk(gloss: string): boolean {
  const { pos, text } = splitGloss(gloss);
  return isJunkSense(pos, text);
}

async function loadCacheJson(
  words: string[],
): Promise<Map<string, string | null>> {
  const byWord = new Map<string, string | null>();
  await mapWithConcurrency(words, READ_CONCURRENCY, async (word) => {
    const cached = await readCacheJson<RawDefinition>(
      `wiktionary-defs/${word}.json`,
    );
    byWord.set(word, cached?.definitionJson ?? null);
  });
  return byWord;
}

async function main(): Promise<void> {
  console.log('Re-deriving definitions from cache (offline).');
  const existing = parseDefinitions(await readFile(TSV_PATH, 'utf8'));
  console.log(`  ${existing.size.toLocaleString()} committed glosses.`);

  const jsonByWord = await loadCacheJson([...existing.keys()]);
  const result = rederiveGlosses(
    existing,
    (word) => jsonByWord.get(word) ?? null,
    DEFINITION_MAX_LENGTH,
  );

  const junkBefore = [...existing.values()].filter(glossIsJunk).length;
  const junkAfter = [...result.next.values()].filter(glossIsJunk).length;
  // The over-filter signal: a change whose old gloss read fine. This set should
  // be tiny; it is where a real sense risks being demoted, so it is worth eyes.
  const cleanChanged = result.changed.filter((c) => !glossIsJunk(c.before));

  console.log('\n=== Re-derivation report ===');
  console.log(`  Words:            ${existing.size.toLocaleString()}`);
  console.log(
    `  Cache misses:     ${result.cacheMisses.length.toLocaleString()} (gloss kept)`,
  );
  console.log(`  Glosses changed:  ${result.changed.length.toLocaleString()}`);
  console.log(
    `  Junk-shaped:      ${junkBefore.toLocaleString()} before, ` +
      `${junkAfter.toLocaleString()} after ` +
      `(${(junkBefore - junkAfter).toLocaleString()} fixed).`,
  );
  console.log(
    `  Clean -> changed: ${cleanChanged.length.toLocaleString()} ` +
      `(over-filter watch list).`,
  );

  const offenders = ['car', 'app', 'cap', 'bus', 'cat', 'tea', 'gym', 'jet'];
  console.log('\n  Named offenders:');
  for (const word of offenders) {
    const after = result.next.get(word);
    if (after) console.log(`    ${word}\t${after}`);
  }

  if (cleanChanged.length > 0) {
    console.log('\n  Clean -> changed sample (review for over-filtering):');
    for (const c of cleanChanged.slice(0, 40)) {
      console.log(`    ${c.word}\n      - ${c.before}\n      + ${c.after}`);
    }
  }
  console.log('============================\n');

  await writeFile(TSV_PATH, serializeDefinitions(result.next), 'utf8');
  console.log(`Wrote ${TSV_PATH}.`);
}

main().catch((err) => {
  console.error('\nRe-derivation failed:', err);
  process.exitCode = 1;
});
