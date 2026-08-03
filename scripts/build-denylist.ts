/**
 * Derive the slur deny rows and write them into the dictionary patch.
 *
 *   pnpm data:denylist
 *
 * Reads the vendored NWL2020 purge and the reviewed exclusion list, intersects
 * with the committed validation boundary, and rewrites the nwl2020 block of
 * public/data/dictionary-patch.tsv. Idempotent: the block is replaced whole, so
 * re-running after a vendor refresh or an exclusion edit converges. Offline; the
 * network step lives in vendor-lists.ts.
 *
 * The rows go in the existing patch rather than a file of their own. The patch
 * layer is already where bulk, scan-derived denial lives: it carries 2,644
 * proper-noun rows and 6 foreign ones, each with a provenance note, grouped
 * under a comment block. One more block with a note of nwl2020 is the shape the
 * file already has, and it keeps applyPatch, the parser, and the runtime load
 * path untouched. A separate file would have needed all three widened to say
 * the same thing twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deriveDenylist,
  parseDenyExclusions,
  parsePurgedList,
} from './lib/denylist.ts';
import { ASSET_DIR, DATA_RAW_DIR, writeAsset } from './lib/util.ts';

/** The note column value that marks a row as belonging to this block. */
export const NWL2020_NOTE = 'nwl2020';

const BLOCK_HEADER = [
  '#',
  '# Denylist (slurs): the 2020 NASPA Word List purge, the slurs removed from',
  '# the North American Scrabble tournament lexicon in its 2020 revision.',
  '# ENABLE is a Scrabble tournament lexicon and carries slurs deliberately, so',
  '# most of these arrived with it rather than with the SCOWL boundary swap.',
  '#',
  '# Source:     scripts/data-raw/nwl2020-purged.txt (vendored, 259 words)',
  '# Held back:  scripts/data-raw/nwl2020-exclusions.tsv (reviewed, with reasons)',
  '# Generated:  pnpm data:denylist. Do not hand-edit these rows; edit the',
  '#             exclusion list and re-run, so every decision keeps its reason.',
  '#',
  '# Whole words only. Nothing here is matched as a prefix or a substring, so',
  '# niggard, niggardly and denigrate are untouched, and so are nip (formable',
  '# from 28 of the shipped racks), nips, spade and coot. The source list does',
  '# not contain any of them, which is much of why it was chosen over a generic',
  '# profanity list: importing one of those unfiltered would take nip.',
  '#',
  '# A denied word is removed from validation and from every pool before the',
  '# pools are derived, so par, the common set, completion counts and the rarity',
  '# bands all recompute without it. It is then rejected with the ordinary',
  '# not-in-the-word-list response: a distinct message would tell the player the',
  '# block was deliberate, which is its own acknowledgement.',
  '#',
];

/** Strip the existing block: its comment header and every row noted nwl2020. */
export function stripBlock(tsv: string): string {
  const lines = tsv.split('\n');
  const start = lines.findIndex((l) => l.startsWith('# Denylist (slurs)'));
  if (start === -1) return tsv.replace(/\n+$/, '\n');
  // Walk back over the bare "#" spacer that opens the block.
  let from = start;
  while (from > 0 && lines[from - 1]?.trim() === '#') from--;
  const kept = [
    ...lines.slice(0, from),
    ...lines
      .slice(from)
      .filter((l) => !l.startsWith('#') && l.split('\t')[3] !== NWL2020_NOTE),
  ];
  return kept.join('\n').replace(/\n+$/, '\n');
}

async function main(): Promise<void> {
  console.log('Deriving the slur denylist.\n');

  const raw = (f: string) => readFile(join(DATA_RAW_DIR, f), 'utf8');
  const [purgedText, exclusionsText, enableText, additionsText, patchText] =
    await Promise.all([
      raw('nwl2020-purged.txt'),
      raw('nwl2020-exclusions.tsv'),
      readFile(join(ASSET_DIR, 'enable.txt'), 'utf8'),
      readFile(join(ASSET_DIR, 'scowl95-additions.txt'), 'utf8'),
      readFile(join(ASSET_DIR, 'dictionary-patch.tsv'), 'utf8'),
    ]);

  const words = (text: string) =>
    text
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean);
  const boundary = new Set([...words(enableText), ...words(additionsText)]);

  const purged = parsePurgedList(purgedText);
  const exclusions = parseDenyExclusions(exclusionsText);
  const { denied, noOps, excluded } = deriveDenylist(
    purged,
    exclusions,
    boundary,
  );

  console.log(`  ${purged.length} in the vendored source.`);
  console.log(`  ${excluded.length} held back by review:`);
  for (const { word, reason } of excluded) {
    console.log(`      ${word.padEnd(16)} ${reason}`);
  }
  console.log(`  ${noOps.length} no-ops the boundary never had.`);
  console.log(`  ${denied.length} denied.`);

  const rows = denied.map((w) => `${w}\tdeny\t\t${NWL2020_NOTE}`);
  const next = `${stripBlock(patchText)}${BLOCK_HEADER.join('\n')}\n${rows.join('\n')}\n`;
  await writeAsset('dictionary-patch.tsv', next);

  console.log('\nDone. Wrote public/data/dictionary-patch.tsv.');
}

main().catch((err) => {
  console.error('\nDenylist build failed:', err);
  process.exitCode = 1;
});
