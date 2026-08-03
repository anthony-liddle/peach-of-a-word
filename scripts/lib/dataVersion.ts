/**
 * The content hash that versions the shipped data directory.
 *
 * The problem it solves: public/data used to live at a URL that never changed
 * across deploys, while Vite content-hashes the JS bundle. A returning visitor
 * could therefore pair a cached bundle with data from a later deploy. That is
 * exactly the skew that broke the game, and it stays possible for any future
 * change to the shape of these files.
 *
 * So the directory carries a hash of its own contents: dist/data-<hash>/. An old
 * bundle asks for the directory it was built against, and if the data has moved
 * on, that path is not in the current deploy and the request 404s. A 404 is a
 * clean, loud failure the app can act on. Silently parsing newer data is not.
 *
 * Hashing the contents rather than stamping a build id is deliberate. A build id
 * changes every deploy, so every deploy would invalidate 8MB of word lists for
 * every returning visitor and re-download data that had not changed. A content
 * hash changes only when the data changes, which is exactly when an old bundle
 * has to be stopped. Deploys that touch only the app keep the same data URL, and
 * the browser cache survives.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every file under a directory, as repo-relative paths, in a stable order. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

/**
 * A short hash over the names and contents of every file in the data directory.
 *
 * Names are hashed alongside contents so that renaming a file changes the
 * version even when the bytes are identical. Path separators are normalised so
 * the hash does not differ between platforms.
 */
export function dataVersion(dataDir: string): string {
  const hash = createHash('sha256');
  for (const file of walk(dataDir)) {
    hash.update(relative(dataDir, file).split(sep).join('/'));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 8);
}
