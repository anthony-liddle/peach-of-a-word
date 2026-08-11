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
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET_DIR, REPO_ROOT } from './lib/util.ts';

interface Lock {
  readonly repo: string;
  readonly version: string;
  readonly archive: string;
  readonly archiveSha256: string;
  readonly files: Readonly<Record<string, string>>;
}

const LOCK_PATH = join(REPO_ROOT, 'scripts', 'lexicon.lock.json');
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
  for (const [file, expected] of Object.entries(lock.files)) {
    const path = join(ASSET_DIR, file);
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

function update(): void {
  const work = mkdtempSync(join(tmpdir(), 'lexicon-'));
  try {
    console.log(`[lexicon] fetching ${lock.repo} ${lock.version}\n`);

    // `gh` rather than curl because orchard is private. On a public repo this
    // becomes a plain https download with no auth and no extra dependency.
    execFileSync(
      'gh',
      [
        'release',
        'download',
        lock.version,
        '--repo',
        lock.repo,
        '--pattern',
        lock.archive,
        '--dir',
        work,
      ],
      { stdio: 'inherit' },
    );

    const archive = join(work, lock.archive);

    // Verified BEFORE unpacking. An archive is untrusted input until its hash
    // matches, and tar acts on the archive's own contents.
    const actual = sha256(archive);
    if (actual !== lock.archiveSha256) {
      fail(
        `archive checksum mismatch, refusing to unpack.\n` +
          `    expected ${lock.archiveSha256}\n` +
          `    actual   ${actual}\n` +
          `  The asset at that tag is not the reviewed one. Do not update the ` +
          `lock to make this pass without establishing why it changed.`,
      );
    }
    console.log(`\n[lexicon] archive checksum verified`);

    execFileSync('tar', ['-xzf', archive, '-C', work], { stdio: 'inherit' });
    const unpacked = join(work, 'lexicon');

    // Per-file, after unpacking. Only the five lists are touched: the calendar,
    // the source pool, the definition bundles and meta.json are this game's and
    // are not in the archive.
    for (const [file, expected] of Object.entries(lock.files)) {
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
