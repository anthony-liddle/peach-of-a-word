/**
 * Update the committed word lists from a pinned orchard release.
 *
 *   pnpm lexicon:update          fetch the pinned version and write the lists
 *   pnpm lexicon:check           verify the committed lists match the pin, no writes
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FETCHES ON DEMAND RATHER THAN AT BUILD TIME.
 *
 * The obvious design is for `pnpm build` to fetch the lexicon. It was rejected.
 * This repository's build is offline and reproducible today, deliberately:
 * data-raw/PROVENANCE.md opens with "these raw lists are committed so the build
 * is fully offline and reproducible", and package.json's build is `tsc -b &&
 * vite build` with no network step at all. Fetching at build time would not
 * swap one fetch for another, it would introduce the first one, and with it a
 * deploy that can fail because GitHub is down.
 *
 * So the artifact stays committed and this command updates it. The version is
 * explicit, the update is one command, and the change arrives as a reviewable
 * diff in a pull request rather than as a version bump whose contents nobody
 * sees. That last part matters more here than it sounds: a definitions change
 * is something Bea should be able to look at before it reaches her.
 *
 * The cost is that a committed copy can drift from upstream. That is what
 * `pnpm lexicon:check` is for, run in CI, which turns silent drift into a
 * failing job.
 * ---------------------------------------------------------------------------
 *
 * INTEGRITY. The archive's SHA-256 is verified before anything is unpacked, and
 * each file's SHA-256 is verified after. Two levels because they answer
 * different questions: the archive hash says the download is the reviewed one,
 * and the per-file hashes say the content is, independently of how it was
 * packed. tar is not reproducible across platforms, so the second is not
 * derivable from the first.
 *
 * A version tag is not an integrity guarantee. A GitHub release asset can be
 * replaced in place without the tag moving, so pinning only the version means
 * every run consumes whatever currently sits at that URL. This is the same
 * argument, and the same shape of fix, as the XcodeGen pin in the Swift repo's
 * ci_post_clone.sh.
 *
 * Update the lock deliberately, together, never to make a failure go away.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMeta, serialiseMeta } from './lib/meta.ts';
import { ASSET_DIR, REPO_ROOT } from './lib/util.ts';

interface Lock {
  readonly repo: string;
  readonly version: string;
  /** Each release asset, by name, with the sha256 of the download itself. */
  readonly assets: Readonly<Record<string, string>>;
  /** Every file, by name, with the sha256 of its content after unpacking. */
  readonly files: Readonly<Record<string, string>>;
}

const LOCK_PATH = join(REPO_ROOT, 'scripts', 'lexicon.lock.json');

/**
 * Where fetched build inputs land: the patch and the definitions corpus.
 *
 * Deliberately NOT scripts/data-raw, and deliberately not public/. Not public
 * because neither is ever served: the patch is baked in at build time and the
 * definitions are a build input. Not data-raw because that directory holds the
 * vendored lexicons this repo still derives from, and writing fetched copies
 * over them would make "is this test reading the fetched copy or the local one"
 * unanswerable. A separate path makes a silent fallback impossible to miss:
 * break the fetched copy and the readers fail, rather than quietly succeeding
 * against a stale local file.
 */
const VENDOR_DIR = join(REPO_ROOT, 'vendor', 'lexicon');

/**
 * The five files that ship from public/data. Named explicitly rather than taken
 * as "everything in the lock", because the lock also pins two build inputs that
 * live elsewhere and must never be copied into the served directory.
 */
const SHIPPED_LISTS = [
  'enable.txt',
  'scowl95-additions.txt',
  'common-pool.txt',
  'beyond-size-70.txt',
  'beyond-size-95.txt',
] as const;

/** Build inputs: fetched, never served, and read only by tests and the pipeline. */
const BUILD_INPUTS = ['dictionary-patch.tsv', 'definitions.tsv'] as const;
const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as Lock;

const checkOnly = process.argv.includes('--check');

const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

function fail(message: string): never {
  console.error(`\n[lexicon] ERROR: ${message}`);
  process.exit(1);
}

/**
 * Verify the committed lists against the lock, without touching the network.
 *
 * This is the CI job. It answers "do the files in this repository still match
 * the release we say we are on", which is the question a committed artifact
 * makes it possible to get wrong.
 */
function check(): void {
  console.log(`[lexicon] checking committed lists against ${lock.version}\n`);
  let bad = 0;
  const VENDORED = new Set<string>(BUILD_INPUTS);
  for (const [file, expected] of Object.entries(lock.files)) {
    // The lists ship from public/data; the build inputs live in vendor/lexicon.
    const path = VENDORED.has(file)
      ? join(VENDOR_DIR, file)
      : join(ASSET_DIR, file);
    let actual: string;
    try {
      actual = sha256(path);
    } catch {
      bad += 1;
      console.log(`  MISSING  ${file}`);
      continue;
    }
    if (actual === expected) {
      console.log(`  ok       ${file}`);
    } else {
      bad += 1;
      console.log(`  MISMATCH ${file}`);
      console.log(`    committed ${actual}`);
      console.log(`    ${lock.version}   ${expected}`);
    }
  }
  if (bad > 0) {
    fail(
      `${bad} committed list(s) do not match ${lock.version}. Either run ` +
        `pnpm lexicon:update, or work out why they diverged. Do not edit the ` +
        `lock to make this pass.`,
    );
  }
  console.log(`\n[lexicon] committed lists match ${lock.version}.`);
}

/**
 * Recompute the list-derived counts in meta.json from the lists just written.
 *
 * ---------------------------------------------------------------------------
 * THIS EXISTS BECAUSE THE FIRST VERSION OF THIS SCRIPT DID NOT HAVE IT, AND
 * THAT REINTRODUCED THE meta.json DEFECT THROUGH A NEW DOOR.
 *
 * meta.json used to be rewritten by pnpm data:bake, which was the only thing
 * that wrote the word lists. This command is now the thing that writes them,
 * and it did not touch the metadata, so a lexicon update left every list count
 * describing the previous release. That is precisely the failure that had
 * meta.json claiming 430,172 boundary words against 427,290 shipped for six
 * weeks, and it came straight back the first time the lists moved.
 *
 * It was caught by src/data/meta.test.ts on the round-trip test, which is what
 * that test is for. Worth stating plainly: fixing a defect does not retire it.
 * Moving the thing that writes the data moves the obligation with it.
 * ---------------------------------------------------------------------------
 *
 * Only the six list counts are recomputed. sourcePool and definitionsCovered
 * describe the crown pool and the definition bundles, which are this game's and
 * are not in the lexicon archive, so they are read back unchanged.
 */
function rewriteMeta(): void {
  const metaPath = join(ASSET_DIR, 'meta.json');
  const current = JSON.parse(readFileSync(metaPath, 'utf8')) as {
    counts: Record<string, number>;
  };

  const count = (file: string): number =>
    readFileSync(join(ASSET_DIR, file), 'utf8')
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean).length;

  const enable = count('enable.txt');
  const additions = count('scowl95-additions.txt');

  const meta = buildMeta({
    enable,
    scowl95Additions: additions,
    boundary: enable + additions,
    common: count('common-pool.txt'),
    beyond70: count('beyond-size-70.txt'),
    beyond95: count('beyond-size-95.txt'),
    // Game-owned, untouched by a lexicon update.
    sourcePool: current.counts.sourcePool ?? 0,
    definitionsCovered: current.counts.definitionsCovered ?? 0,
  });

  writeFileSync(metaPath, serialiseMeta(meta), 'utf8');
  console.log(
    `  meta.json rewritten: ${meta.counts.boundary.toLocaleString()} boundary words`,
  );
}

function update(): void {
  const work = mkdtempSync(join(tmpdir(), 'lexicon-'));
  try {
    console.log(`[lexicon] fetching ${lock.repo} ${lock.version}\n`);

    // `gh` rather than curl because orchard is private. On a public repo this
    // becomes a plain https download with no auth and no extra dependency.
    for (const asset of Object.keys(lock.assets)) {
      execFileSync(
        'gh',
        [
          'release',
          'download',
          lock.version,
          '--repo',
          lock.repo,
          '--pattern',
          asset,
          '--dir',
          work,
        ],
        { stdio: 'inherit' },
      );
      const expected = lock.assets[asset]!;
      const actualAsset = sha256(join(work, asset));
      if (actualAsset !== expected) {
        fail(
          `${asset} checksum mismatch, refusing to use it.\n` +
            `    expected ${expected}\n    actual   ${actualAsset}\n` +
            `  The asset at that tag is not the reviewed one. Do not update the ` +
            `lock to make this pass without establishing why it changed.`,
        );
      }
    }
    console.log(
      `\n[lexicon] all ${Object.keys(lock.assets).length} asset checksums verified`,
    );

    const archive = join(work, 'lexicon.tar.gz');

    execFileSync('tar', ['-xzf', archive, '-C', work], { stdio: 'inherit' });
    const unpacked = join(work, 'lexicon');

    // Per-file, after unpacking. Only the five lists are touched: the calendar,
    // the source pool, the definition bundles and meta.json are this game's and
    // are not in the archive.
    for (const file of SHIPPED_LISTS) {
      const expected = lock.files[file]!;
      const from = join(unpacked, file);
      const actualFile = sha256(from);
      if (actualFile !== expected) {
        fail(
          `${file} checksum mismatch after unpacking.\n` +
            `    expected ${expected}\n    actual   ${actualFile}`,
        );
      }
      copyFileSync(from, join(ASSET_DIR, file));
      console.log(`  wrote  ${file}`);
    }

    // The two build inputs, into vendor/lexicon rather than public/ or
    // data-raw. Neither is ever served, and neither may overwrite the local
    // vendored copies while those still exist, or a fallback would be
    // indistinguishable from a fetch.
    mkdirSync(VENDOR_DIR, { recursive: true });

    const patchName = 'dictionary-patch.tsv';
    const patchExpected = lock.files[patchName]!;
    const patchActual = sha256(join(work, patchName));
    if (patchActual !== patchExpected) {
      fail(`${patchName} content checksum mismatch after download.`);
    }
    copyFileSync(join(work, patchName), join(VENDOR_DIR, patchName));
    console.log(`  wrote  vendor/lexicon/${patchName}`);

    execFileSync(
      'tar',
      ['-xzf', join(work, 'definitions.tar.gz'), '-C', work],
      {
        stdio: 'inherit',
      },
    );
    const defsName = 'definitions.tsv';
    const defsExpected = lock.files[defsName]!;
    const defsActual = sha256(join(work, 'definitions', defsName));
    if (defsActual !== defsExpected) {
      fail(`${defsName} content checksum mismatch after unpacking.`);
    }
    copyFileSync(
      join(work, 'definitions', defsName),
      join(VENDOR_DIR, defsName),
    );
    console.log(`  wrote  vendor/lexicon/${defsName}`);

    rewriteMeta();

    // Nothing else is written into public/data, and that is deliberate on two
    // counts.
    //
    // The archive also carries ATTRIBUTION.md and PROVENANCE.md, and copying
    // them in would be a second record of what this repo's own ATTRIBUTION.md
    // already says. Likewise a version marker file: the version is in
    // lexicon.lock.json, which is the thing consulted, so a copy beside the
    // data could only ever disagree with it.
    //
    // And public/data is content-hashed into its own URL (lib/dataVersion.ts),
    // so ANY file added here changes that hash and makes every returning player
    // re-download 8MB of word lists. Doing that to ship a version string, on an
    // update where not one word changed, is exactly the cost that mechanism
    // exists to avoid.

    console.log(
      `\n[lexicon] updated to ${lock.version}. Review the diff: an empty one ` +
        `means the committed lists already matched.`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (checkOnly) check();
else update();
