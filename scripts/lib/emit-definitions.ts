// Pure bundle building and report math for the offline build. No I/O.
import { formableWords } from './formable.ts';

const byteLength = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), 'utf8');

/** For each rack, the defined words formable from it, as a compact map. */
export function buildBundles(
  sourceWords: string[],
  enableWords: string[],
  defs: Map<string, string>,
): Map<string, Record<string, string>> {
  const bundles = new Map<string, Record<string, string>>();
  for (const rack of sourceWords) {
    const record: Record<string, string> = {};
    for (const word of formableWords(rack, enableWords)) {
      const def = defs.get(word);
      if (def !== undefined) record[word] = def;
    }
    bundles.set(rack, record);
  }
  return bundles;
}

/**
 * Refuse to emit a bundle carrying a gloss for a denied word.
 *
 * The bundles are derived from the boundary, so a correct build cannot produce
 * one: buildBundles only ever writes words the boundary carries, and the baked
 * boundary has the denylist removed. This is the assertion that says so out
 * loud, on every bake, the way assertBakedEquivalent does for the lists. It
 * exists because the failure it catches is silent by nature. A denied gloss
 * breaks nothing, surfaces nowhere in play, and simply ships.
 *
 * Counts and racks appear in the message; the words never do. These are words a
 * player is protected from, and a build log is not the place to reprint them.
 */
export function assertNoDeniedGlosses(
  bundles: Map<string, Record<string, string>>,
  deny: Iterable<string>,
): void {
  const denied = new Set(deny);
  const racks: string[] = [];
  let total = 0;
  for (const [rack, bundle] of bundles) {
    const count = Object.keys(bundle).filter((w) => denied.has(w)).length;
    if (count > 0) {
      racks.push(rack);
      total += count;
    }
  }
  if (total > 0) {
    throw new Error(
      `Emit carried ${total} denied ${total === 1 ? 'gloss' : 'glosses'} ` +
        `across ${racks.length} ${racks.length === 1 ? 'bundle' : 'bundles'} ` +
        `(racks: ${racks.join(', ')}). Every artifact derived from the word ` +
        `lists must have the patch applied, not just the lists themselves.`,
    );
  }
}

/** How many union words carry a definition. */
export function coverage(
  union: string[],
  defs: Map<string, string>,
): { union: number; defined: number; percent: number } {
  const defined = union.filter((w) => defs.has(w)).length;
  const percent = union.length ? Math.round((defined / union.length) * 100) : 0;
  return { union: union.length, defined, percent };
}

/** Combined, average, and max single-bundle byte sizes. */
export function bundleStats(bundles: Map<string, Record<string, string>>): {
  count: number;
  combined: number;
  average: number;
  max: number;
} {
  const sizes = [...bundles.values()].map(byteLength);
  const combined = sizes.reduce((a, b) => a + b, 0);
  const max = sizes.reduce((a, b) => Math.max(a, b), 0);
  const average = sizes.length ? Math.round(combined / sizes.length) : 0;
  return { count: sizes.length, combined, average, max };
}

/** First-letter shard projection: one map per leading letter. */
export function shardProjection(definedWords: Iterable<[string, string]>): {
  combined: number;
  perShard: Record<string, number>;
} {
  const shards = new Map<string, Record<string, string>>();
  for (const [word, def] of definedWords) {
    const letter = word[0] ?? '_';
    const shard = shards.get(letter) ?? {};
    shard[word] = def;
    shards.set(letter, shard);
  }
  const perShard: Record<string, number> = {};
  let combined = 0;
  for (const [letter, shard] of shards) {
    const size = byteLength(shard);
    perShard[letter] = size;
    combined += size;
  }
  return { combined, perShard };
}
