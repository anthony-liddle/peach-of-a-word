// scripts/vendor-lists.ts
// Manual, network-touching, one-time. Downloads the raw ENABLE list and the
// SCOWL tarball, writes the lists the offline build reads into scripts/data-raw,
// and records provenance. Run by hand:  pnpm data:vendor
// Never called by the build, CI, or tests.
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SCOWL_VARIANTS, SIZE_95_SIZES } from './lib/lexicon-config.ts';
import { extractNwl2020Purged, NWL2020_EXPECTED } from './lib/denylist.ts';
import {
  CACHE_DIR,
  DATA_RAW_DIR,
  ensureDir,
  fetchText,
  sleep,
} from './lib/util.ts';

const execFileAsync = promisify(execFile);

const ENABLE_URL =
  'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
const SCOWL_VERSION = '2020.12.07';
const SCOWL_TARBALL_URL = `https://downloads.sourceforge.net/project/wordlist/SCOWL/${SCOWL_VERSION}/scowl-${SCOWL_VERSION}.tar.gz`;
const NWL2020_URL = 'http://www.seattlescrabble.org/expurg.php';

async function vendorEnable(): Promise<void> {
  const raw = await fetchText(ENABLE_URL);
  await writeFile(join(DATA_RAW_DIR, 'enable1.txt'), raw, 'utf8');
}

/**
 * Vendor the 2020 NASPA Word List purge: the slurs the North American Scrabble
 * tournament lexicon removed in its 2020 revision.
 *
 * The page tracks OSPD expurgations across editions and marks each word with why
 * it was cut. Only two of those classes are the 2020 slur purge, and only those
 * are taken:
 *
 *   nwl2020purge      already expurgated from OSPD, now purged from NWL2020
 *   nwl2020newexpurge newly expurgated and purged in the 2020 revision
 *
 * Everything unmarked or marked for an earlier OSPD edition is general vulgarity
 * rather than a slur, and is left alone: this game is culling slurs, not
 * profanity. Words in [BRACKETS] are the page's marker for related words that
 * DO have a non-offensive definition, so they are dropped: that bracket
 * convention is a hand-built over-blocking guard and it would be perverse to
 * import the list while discarding it. {CURLY BRACES} only record which OSPD
 * edition dropped a word, so the braces are stripped and the word is kept.
 *
 * Parsing the markup rather than the rendered text is what makes this auditable:
 * the class names carry the provenance, and the extracted count is checked
 * against the 259 NASPA published so a silent page change cannot pass unnoticed.
 */
async function vendorNwl2020(): Promise<void> {
  const html = await fetchText(NWL2020_URL);
  const purged = extractNwl2020Purged(html);
  if (purged.length !== NWL2020_EXPECTED) {
    throw new Error(
      `Extracted ${purged.length} NWL2020 purged words, expected ${NWL2020_EXPECTED}. ` +
        'The source page markup has changed; re-check the parse before committing.',
    );
  }
  const header = [
    '# The 2020 NASPA Word List purge: the 259 slurs removed from the North',
    '# American Scrabble tournament lexicon in its 2020 revision.',
    '#',
    `# Source: ${NWL2020_URL}`,
    '# Taken from the nwl2020purge and nwl2020newexpurge classes only, so this is',
    '# the slur purge and not the wider OSPD expurgation of general vulgarity.',
    '# Words the page brackets as having a non-offensive definition are dropped.',
    '#',
    '# Vendored verbatim. Do NOT hand-edit: to hold a word back from the denylist,',
    '# add it to nwl2020-exclusions.tsv with a reason instead, so the review is',
    '# recorded rather than the source being quietly rewritten.',
    `# Refresh with: pnpm data:vendor`,
    '',
  ].join('\n');
  await writeFile(
    join(DATA_RAW_DIR, 'nwl2020-purged.txt'),
    header + purged.join('\n') + '\n',
    'utf8',
  );
}

async function downloadBinary(url: string, retries = 3): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function vendorScowl(): Promise<void> {
  await ensureDir(CACHE_DIR);
  const tarball = join(CACHE_DIR, 'scowl.tar.gz');
  const extractRoot = join(CACHE_DIR, 'scowl');
  const buf = await downloadBinary(SCOWL_TARBALL_URL);
  await writeFile(tarball, buf);
  await ensureDir(extractRoot);
  await execFileAsync('tar', [
    'xzf',
    tarball,
    '-C',
    extractRoot,
    '--strip-components=1',
  ]);
  const outDir = join(DATA_RAW_DIR, 'scowl');
  await ensureDir(outDir);
  for (const variant of SCOWL_VARIANTS) {
    for (const size of SIZE_95_SIZES) {
      const name = `${variant}-words.${size}`;
      try {
        const band = await readFile(join(extractRoot, 'final', name), 'latin1');
        await writeFile(join(outDir, name), band, 'latin1');
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        // Missing variant/size combinations are expected; skip them.
      }
    }
  }
}

async function writeProvenance(): Promise<void> {
  const note = [
    '# Vendored word list provenance',
    '',
    'These raw lists are committed so the build is fully offline and reproducible.',
    'The ENABLE list and SCOWL are frozen, so reading these local files is safe forever.',
    'Refresh them only by re-running:  pnpm data:vendor',
    '',
    '## ENABLE',
    '',
    `- Source: ${ENABLE_URL}`,
    '- License: public domain.',
    `- Vendored: ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '## SCOWL',
    '',
    `- Source: ${SCOWL_TARBALL_URL}`,
    `- Version: ${SCOWL_VERSION}.`,
    '- License: permissive (Kevin Atkinson). See ATTRIBUTION.md.',
    `- Vendored bands: ${SCOWL_VARIANTS.join(', ')} at sizes ${SIZE_95_SIZES.join(', ')}.`,
    `- Vendored: ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '## NWL2020 slur purge',
    '',
    `- Source: ${NWL2020_URL}`,
    `- The ${NWL2020_EXPECTED} slurs removed from the NASPA Word List in its 2020 revision.`,
    '- Vendored to nwl2020-purged.txt; held-back entries are audited in',
    '  nwl2020-exclusions.tsv. Derived into deny rows by: pnpm data:denylist.',
    `- Vendored: ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '## Wiktionary (definitions and etymology)',
    '',
    '- Definitions in definitions.tsv and source-pool etymology come from Wiktionary.',
    '- License: CC BY-SA 4.0. Attribution carried here and surfaced in the colophon.',
    '',
  ].join('\n');
  await writeFile(join(DATA_RAW_DIR, 'PROVENANCE.md'), note, 'utf8');
}

async function main(): Promise<void> {
  await ensureDir(DATA_RAW_DIR);
  console.log('Vendoring ENABLE.');
  await vendorEnable();
  console.log('Vendoring SCOWL bands.');
  await vendorScowl();
  console.log('Vendoring the NWL2020 slur purge.');
  await vendorNwl2020();
  await writeProvenance();
  console.log('Done. Wrote scripts/data-raw/.');
}

main().catch((err) => {
  console.error('Vendoring failed:', err);
  process.exitCode = 1;
});
