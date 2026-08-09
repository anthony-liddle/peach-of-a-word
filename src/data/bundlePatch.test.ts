/**
 * The gap this closes.
 *
 * The patch was baked into the five word lists and nowhere else. Denying a word
 * removed it from validation and from all three rarity bands, so it could never
 * be found in play, but its gloss stayed in every per-puzzle bundle under
 * public/data/defs until someone reran the full pnpm data:build. That is a
 * network-touching rebuild nobody reaches for casually, so the glosses simply
 * stayed, served publicly, for every deny row ever added.
 *
 * boundary.test.ts and shippedData.test.ts assert the shipped lists against the
 * current patch and passed clean throughout. The bundles sat outside what they
 * checked, which is precisely why this survived.
 *
 * The rule these guard: every artifact derived from the word lists must have the
 * patch applied, not just the lists themselves.
 *
 * Counts and rack names appear in failures; the offending words never do. These
 * are words a player is protected from, and a CI log is not the place to reprint
 * them. Following assertBakedEquivalent in scripts/lib/bake.ts.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCommittedPatch } from './shippedLists.ts';

const SHIPPED = join(process.cwd(), 'public', 'data');

interface DeniedGloss {
  readonly rack: string;
  readonly count: number;
}

/**
 * Every bundle under `root` that carries a gloss for a denied word.
 *
 * Written against a root directory rather than a fixed path so the same check
 * can run against a deliberately corrupted copy. A guard nobody has seen fail is
 * not known to work.
 */
function deniedGlossesUnder(root: string): DeniedGloss[] {
  const denied = new Set(readCommittedPatch().deny);
  const defs = join(root, 'defs');
  const found: DeniedGloss[] = [];
  for (const file of readdirSync(defs).filter((f) => f.endsWith('.json'))) {
    const bundle = JSON.parse(readFileSync(join(defs, file), 'utf8')) as Record<
      string,
      string
    >;
    const count = Object.keys(bundle).filter((w) => denied.has(w)).length;
    if (count > 0) found.push({ rack: file.replace(/\.json$/, ''), count });
  }
  return found;
}

/** A throwaway copy of the shipped data, for the corruption run. */
const temps: string[] = [];
function copyOfShipped(): string {
  const dir = mkdtempSync(join(tmpdir(), 'peach-bundles-'));
  temps.push(dir);
  cpSync(SHIPPED, join(dir, 'data'), { recursive: true });
  return join(dir, 'data');
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('the patch reaches the definition bundles', () => {
  it('ships no gloss for any denied word', () => {
    const offenders = deniedGlossesUnder(SHIPPED);
    const total = offenders.reduce((sum, o) => sum + o.count, 0);
    expect(
      offenders.length === 0,
      `${total} denied glosses across ${offenders.length} bundles ` +
        `(racks: ${offenders.map((o) => o.rack).join(', ')})`,
    ).toBe(true);
  });

  it('catches a denied gloss planted in a bundle', () => {
    // The teeth. Without this, the guard above could pass because it never looks
    // at anything, and nobody would know until the next deny row shipped.
    const root = copyOfShipped();
    const denied = readCommittedPatch().deny[0] as string;
    const rack = 'postcard';
    const path = join(root, 'defs', `${rack}.json`);
    const bundle = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      string
    >;
    bundle[denied] = 'a gloss that must never ship';
    writeFileSync(path, JSON.stringify(bundle), 'utf8');

    const offenders = deniedGlossesUnder(root);

    expect(offenders).toEqual([{ rack, count: 1 }]);
  });

  it('ships exactly one bundle per source word, with no orphans', () => {
    // pnpm data:build clears the directory before writing, so a rack dropped
    // from the pool leaves no file behind. The bake has to match that or it
    // reintroduces the same class of staleness from the other direction.
    const pool = (
      JSON.parse(readFileSync(join(SHIPPED, 'source-pool.json'), 'utf8')) as {
        word: string;
      }[]
    ).map((e) => e.word);
    const files = readdirSync(join(SHIPPED, 'defs'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));

    expect([...files].sort()).toEqual([...pool].sort());
  });
});
