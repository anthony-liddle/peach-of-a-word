/**
 * Derive the slur deny rows and write them into the dictionary patch.
 *
 *   pnpm data:denylist
 *
 * Reads the vendored NWL2020 purge and the reviewed exclusion list, intersects
 * with the committed validation boundary, and rewrites the nwl2020 block of
 * scripts/data-raw/dictionary-patch.tsv. Idempotent: the block is replaced whole, so
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
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deriveDenylist,
  parseDenyExclusions,
  parsePurgedList,
  parseSupplementSlurs,
} from './lib/denylist.ts';
import { loadUnpatchedBoundary } from './lib/sources.ts';
import { DATA_RAW_DIR, PATCH_PATH } from './lib/util.ts';

/** The note column value that marks a row as belonging to this block. */
export const NWL2020_NOTE = 'nwl2020';

/** The note column value for the hand-curated supplement block. */
export const SUPPLEMENT_NOTE = 'supplement';

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

const SUPPLEMENT_HEADER = [
  '#',
  '# Denylist (slurs, supplement): slurs the 2020 revision does not cover.',
  '# It was written for a tournament lexicon, so it kept any word carrying a',
  '# non-offensive sense somewhere (faggot as a bundle of sticks, fag as a',
  '# cigarette, coon as a raccoon), and it predates transphobic slurs being a',
  '# category anyone audited. Right for competitive Scrabble, wrong here.',
  '#',
  '# Source:     scripts/data-raw/supplement-slurs.tsv (hand-curated, with',
  '#             reasons; no public list solves this the way NWL2020 solves',
  '#             the main case)',
  '# Generated:  pnpm data:denylist. Edit the source file, not these rows.',
  '#',
  '# Held to the same bar as the exclusions, pointing the other way: denied',
  '# only where there is no neutral primary sense in ordinary modern English.',
  '# lame, deaf, queer, creole, dyke, poof, moron and idiot are deliberately',
  '# NOT here; the source file records why for each.',
  '#',
];

/** Strip an existing generated block: its comment header and its noted rows. */
export function stripBlock(tsv: string, marker: string, note: string): string {
  const lines = tsv.split('\n');
  const start = lines.findIndex((l) => l.startsWith(marker));
  if (start === -1) return tsv.replace(/\n+$/, '\n');
  // Walk back over the bare "#" spacer that opens the block.
  let from = start;
  while (from > 0 && lines[from - 1]?.trim() === '#') from--;
  const kept = [
    ...lines.slice(0, from),
    ...lines
      .slice(from)
      .filter((l) => !l.startsWith('#') && l.split('\t')[3] !== note),
  ];
  return kept.join('\n').replace(/\n+$/, '\n');
}

async function main(): Promise<void> {
  console.log('Deriving the slur denylist.\n');

  const raw = (f: string) => readFile(join(DATA_RAW_DIR, f), 'utf8');
  const [purgedText, exclusionsText, supplementText, boundaryWords, patchText] =
    await Promise.all([
      raw('nwl2020-purged.txt'),
      raw('nwl2020-exclusions.tsv'),
      raw('supplement-slurs.tsv'),
      // The boundary before the patch. Deriving from the shipped lists would be
      // circular now that they carry the denylist baked in: the words this is
      // meant to find are already gone from them.
      loadUnpatchedBoundary(),
      readFile(PATCH_PATH, 'utf8'),
    ]);

  const boundary = new Set(boundaryWords);

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

  // The supplement: slurs the source keeps because a tournament lexicon can
  // justify them. Intersected with the boundary the same way, so an entry the
  // game never had is reported rather than silently written as a dead row.
  const supplement = parseSupplementSlurs(supplementText);
  const supplementDenied = supplement
    .map((s) => s.word)
    .filter((w) => boundary.has(w))
    .sort();
  const supplementNoOps = supplement
    .map((s) => s.word)
    .filter((w) => !boundary.has(w));
  console.log(
    `\n  supplement: ${supplementDenied.length} denied, ` +
      `${supplementNoOps.length} no-ops${supplementNoOps.length ? ` (${supplementNoOps.join(', ')})` : ''}.`,
  );
  console.log(
    `\n  ${denied.length + supplementDenied.length} denied in total.`,
  );

  const rows = denied.map((w) => `${w}\tdeny\t\t${NWL2020_NOTE}`);
  const supplementRows = supplementDenied.map(
    (w) => `${w}\tdeny\t\t${SUPPLEMENT_NOTE}`,
  );
  // Strip the later block first. Stripping a block drops every comment line
  // after its header, which would take the next block's header with it and
  // leave that block's rows orphaned and undetectable on the following run.
  const base = stripBlock(
    stripBlock(patchText, '# Denylist (slurs, supplement)', SUPPLEMENT_NOTE),
    '# Denylist (slurs):',
    NWL2020_NOTE,
  );
  const next =
    base +
    `${BLOCK_HEADER.join('\n')}\n${rows.join('\n')}\n` +
    `${SUPPLEMENT_HEADER.join('\n')}\n${supplementRows.join('\n')}\n`;
  await writeFile(PATCH_PATH, next, 'utf8');

  console.log(
    '\nDone. Wrote scripts/data-raw/dictionary-patch.tsv.\n' +
      'Run pnpm data:bake to carry the change into the shipped lists.',
  );
}

main().catch((err) => {
  console.error('\nDenylist build failed:', err);
  process.exitCode = 1;
});
