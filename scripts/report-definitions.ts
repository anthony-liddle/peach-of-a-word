/**
 * ANALYSIS ONLY. Manual, read-only tool. Not wired into the build, CI, or tests.
 *
 * Read-only definitions report. Derives every number from files already on
 * disk: the committed definitions.tsv, the emitted per-puzzle bundles, the
 * vendored ENABLE list, source-pool.json, and (for exact truncation) the local
 * wiktionary-defs cache. No network, no re-acquisition, no changes to the emit
 * or the data. Not part of the build; run by hand:  pnpm tsx scripts/report-definitions.ts
 *
 * Sizes are reported raw and gzipped (level 6, the usual ship default), because
 * gzipped is what a browser actually downloads.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DEFINITION_MAX_LENGTH } from './lib/lexicon-config.ts';
import { parseDefinitions, shapeDefinition } from './lib/definitions.ts';
import { formableUnion } from './lib/formable.ts';
import { loadEnable } from './lib/sources.ts';
import { ASSET_DIR, CACHE_DIR, DATA_RAW_DIR } from './lib/util.ts';

const raw = (s: string): number => Buffer.byteLength(s, 'utf8');
const gz = (s: string): number => gzipSync(Buffer.from(s, 'utf8')).length;
const pct = (n: number, d: number): string =>
  d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a';

async function readCachedDefinitionJson(word: string): Promise<string | null> {
  try {
    const txt = await readFile(
      join(CACHE_DIR, 'wiktionary-defs', `${word}.json`),
      'utf8',
    );
    return (JSON.parse(txt) as { definitionJson: string | null })
      .definitionJson;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const out: string[] = [];
  const line = (s = ''): void => void out.push(s);

  // --- Inputs -----------------------------------------------------------
  const tsvText = await readFile(join(DATA_RAW_DIR, 'definitions.tsv'), 'utf8');
  const defs = parseDefinitions(tsvText);
  const sourceJson = await readFile(
    join(ASSET_DIR, 'source-pool.json'),
    'utf8',
  );
  const sourceWords = (JSON.parse(sourceJson) as { word: string }[]).map(
    (e) => e.word,
  );
  const enable = await loadEnable();

  // --- Coverage ---------------------------------------------------------
  // Union total (incl. misses) is not stored in the TSV or bundles, so it is
  // recomputed from the committed ENABLE list and source words. On disk,
  // deterministic, no network. Matches the union the build computed.
  const union = formableUnion(sourceWords, enable);
  const definedInUnion = union.filter((w) => defs.has(w)).length;
  const misses = union.length - definedInUnion;

  line('=== DEFINITIONS MEASUREMENT REPORT ===');
  line(`generated: ${new Date().toISOString()}`);
  line('source: committed definitions.tsv + emitted bundles + vendored ENABLE');
  line(
    '         + source-pool.json + local wiktionary-defs cache. No network.',
  );
  line(`gzip: level 6 (zlib default), per-file, matches per-asset transfer.`);
  line('');
  line('--- COVERAGE ---');
  line(
    `formable union (unique words across all ${sourceWords.length} racks): ${union.length}`,
  );
  line(`words with a definition in the TSV (within union): ${definedInUnion}`);
  line(`coverage: ${pct(definedInUnion, union.length)}`);
  line(`misses (union words with no definition): ${misses}`);
  line(
    `total TSV entries: ${defs.size}` +
      (defs.size === definedInUnion
        ? ''
        : ` (note: ${defs.size - definedInUnion} TSV entries fall outside the recomputed union)`),
  );

  // --- Gloss cap (exact, via the cache) ---------------------------------
  const BIG = 100000;
  let truncated = 0;
  let undeterminable = 0;
  let longestUntruncated = 0;
  let longestUntruncatedWord = '';
  let longestUncappedSentence = 0;
  let longestUncappedWord = '';
  for (const [word, gloss] of defs) {
    const json = await readCachedDefinitionJson(word);
    if (json === null) {
      undeterminable++;
      continue;
    }
    const capped = shapeDefinition(json, DEFINITION_MAX_LENGTH);
    const uncapped = shapeDefinition(json, BIG);
    if (uncapped === null) {
      undeterminable++;
      continue;
    }
    if (uncapped.length > longestUncappedSentence) {
      longestUncappedSentence = uncapped.length;
      longestUncappedWord = word;
    }
    const wasTruncated = capped !== uncapped;
    if (wasTruncated) {
      truncated++;
    } else if (gloss.length > longestUntruncated) {
      longestUntruncated = gloss.length;
      longestUntruncatedWord = word;
    }
  }

  line('');
  line('--- GLOSS CAP ---');
  line(`length cap (DEFINITION_MAX_LENGTH): ${DEFINITION_MAX_LENGTH}`);
  line(
    `glosses truncated at the cap: ${truncated} (${pct(truncated, defs.size)} of definitions)`,
  );
  line(
    `longest untruncated gloss: ${longestUntruncated} chars (word: ${longestUntruncatedWord})`,
  );
  line(
    `longest uncapped first-sentence gloss (what the cap would allow uncut): ${longestUncappedSentence} chars (word: ${longestUncappedWord})`,
  );
  if (undeterminable > 0) {
    line(
      `truncation undeterminable for ${undeterminable} words (no usable cached source); excluded from the truncated count.`,
    );
  }

  // --- Per-puzzle bundles (the chosen scheme) ---------------------------
  const files = (await readdir(join(ASSET_DIR, 'defs'))).filter((f) =>
    f.endsWith('.json'),
  );
  let combinedRaw = 0;
  let combinedGz = 0;
  let maxRaw = 0;
  let maxRawWord = '';
  let maxGz = 0;
  let maxGzWord = '';
  for (const f of files) {
    const content = await readFile(join(ASSET_DIR, 'defs', f), 'utf8');
    const r = raw(content);
    const g = gz(content);
    combinedRaw += r;
    combinedGz += g;
    if (r > maxRaw) {
      maxRaw = r;
      maxRawWord = f.replace(/\.json$/, '');
    }
    if (g > maxGz) {
      maxGz = g;
      maxGzWord = f.replace(/\.json$/, '');
    }
  }
  const n = files.length;
  line('');
  line('--- PER-PUZZLE BUNDLES (chosen scheme) ---');
  line(`bundles: ${n}`);
  line(`combined size: raw ${combinedRaw} bytes, gzipped ${combinedGz} bytes`);
  line(
    `average single bundle: raw ${Math.round(combinedRaw / n)} bytes, gzipped ${Math.round(combinedGz / n)} bytes`,
  );
  line(
    `MAX single bundle (what one session loads): raw ${maxRaw} bytes (rack: ${maxRawWord}), gzipped ${maxGz} bytes (rack: ${maxGzWord})`,
  );

  // --- First-letter shard projection (comparison only, not emitted) -----
  const shards = new Map<string, Record<string, string>>();
  for (const word of union) {
    const def = defs.get(word);
    if (def === undefined) continue;
    const letter = word[0] ?? '_';
    const shard = shards.get(letter) ?? {};
    shard[word] = def;
    shards.set(letter, shard);
  }
  const shardRows = [...shards.entries()]
    .map(([letter, obj]) => {
      const json = JSON.stringify(obj);
      return {
        letter,
        words: Object.keys(obj).length,
        raw: raw(json),
        gz: gz(json),
      };
    })
    .sort((a, b) => b.raw - a.raw);
  const shardCombinedRaw = shardRows.reduce((s, r) => s + r.raw, 0);
  const shardCombinedGz = shardRows.reduce((s, r) => s + r.gz, 0);

  line('');
  line('--- FIRST-LETTER SHARD PROJECTION (comparison only, NOT emitted) ---');
  line(`shards: ${shardRows.length}`);
  line(
    `combined size: raw ${shardCombinedRaw} bytes, gzipped ${shardCombinedGz} bytes`,
  );
  line(`per shard (sorted largest first): letter words rawBytes gzipBytes`);
  for (const r of shardRows) {
    line(`  ${r.letter}  ${r.words}  ${r.raw}  ${r.gz}`);
  }

  // --- TSV size ---------------------------------------------------------
  line('');
  line('--- TSV ---');
  line(
    `definitions.tsv: raw ${raw(tsvText)} bytes, gzipped ${gz(tsvText)} bytes`,
  );
  line('======================================');

  process.stdout.write(out.join('\n') + '\n');
}

main().catch((err) => {
  console.error('Report failed:', err);
  process.exitCode = 1;
});
