/**
 * The gap this closes.
 *
 * orchard v1.3.0 corrected 1,077 glosses in the definitions corpus. Following
 * the runbook, `pnpm lexicon:update` refreshed `vendor/lexicon/definitions.tsv`
 * and nothing rewrote `public/data/defs/`, the per-rack bundles the game
 * actually serves. 779 of the 793 shipped bundles were left stale, 7,499 gloss
 * instances in all, while `pnpm lexicon:check` reported the committed lists
 * matched the release, the suite passed, and `copal` still ended "used chiefly
 * in making" on a player's screen.
 *
 * Nothing was broken. `pnpm data:admit` writes bundles only for racks it has
 * just admitted, deliberately: "Only these racks are touched, so no existing
 * bundle is rewritten." The runbook assumed something rewrote the rest.
 *
 * Every check that existed verified an artifact: a checksum, a parse, a count.
 * None compared what ships against what it was derived from, which is the only
 * question that would have caught this. This is that check. Run
 * `pnpm data:rebundle` after any `pnpm lexicon:update` that moves the corpus,
 * and this stays green.
 *
 * Written against a root directory rather than a fixed path so the same check
 * can run against a deliberately staled copy, following shippedData.test.ts. A
 * guard nobody has seen fail is not known to work.
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

const SHIPPED = join(process.cwd(), 'public', 'data');
const CORPUS = join(process.cwd(), 'vendor', 'lexicon', 'definitions.tsv');

/** The vendored corpus as a word-keyed map, parsed the way the bake parses it. */
function corpus(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(CORPUS, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) out.set(line.slice(0, tab), line.slice(tab + 1));
  }
  return out;
}

interface Staleness {
  readonly bundles: number;
  readonly entries: number;
  /** "word in rack.json" for each gloss that disagrees with the corpus. */
  readonly stale: string[];
}

/**
 * Every gloss in every bundle under `root`, compared against the corpus row it
 * was derived from.
 *
 * A word present in a bundle but absent from the corpus is not staleness: the
 * corpus can lose a word without the bundles being wrong to have carried it,
 * and the denylist path already covers a gloss that should not ship at all.
 * Only a disagreement about a word both hold is a stale bundle.
 */
function staleness(root: string, defs: Map<string, string>): Staleness {
  const dir = join(root, 'defs');
  let bundles = 0;
  let entries = 0;
  const stale: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    bundles += 1;
    const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<
      string,
      string
    >;
    for (const [word, gloss] of Object.entries(bundle)) {
      entries += 1;
      const expected = defs.get(word);
      if (expected !== undefined && expected !== gloss)
        stale.push(`${word} in ${file}`);
    }
  }
  return { bundles, entries, stale };
}

let scratch: string | undefined;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe('the shipped bundles against the corpus they came from', () => {
  it('carries no gloss that disagrees with the vendored corpus', () => {
    const { bundles, entries, stale } = staleness(SHIPPED, corpus());

    // Guard the guard: an empty defs directory would pass vacuously.
    expect(bundles).toBeGreaterThan(500);
    expect(entries).toBeGreaterThan(100_000);

    expect(
      stale.slice(0, 10),
      `${stale.length} stale gloss instance(s). Run pnpm data:rebundle.`,
    ).toEqual([]);
  });

  it('fails, naming the word and the rack, when a bundle falls behind', () => {
    scratch = mkdtempSync(join(tmpdir(), 'stale-bundles-'));
    cpSync(SHIPPED, scratch, { recursive: true });

    // Stale exactly one gloss, the way an un-rebuilt bundle is stale: the
    // bundle keeps a value the corpus has since moved past.
    const defs = corpus();
    const file = readdirSync(join(scratch, 'defs')).find((f) =>
      f.endsWith('.json'),
    );
    expect(file).toBeDefined();
    const path = join(scratch, 'defs', file as string);
    const bundle = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      string
    >;
    const word = Object.keys(bundle).find((w) => defs.has(w));
    expect(word).toBeDefined();
    bundle[word as string] = 'noun. A gloss this corpus has moved past.';
    writeFileSync(path, JSON.stringify(bundle), 'utf8');

    const { stale } = staleness(scratch, defs);
    expect(stale).toEqual([`${word as string} in ${file as string}`]);
  });
});
