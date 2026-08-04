/**
 * The source-pool gate: what pnpm data:build is allowed to write.
 *
 * Every source word is a crown. The daily calendar appends newly eligible
 * words, so a source pool that grows during a routine rebuild ships crowns
 * nobody curated, including inflections and words that would land badly. The
 * cache fix in lib/wiktionary.ts makes that a live risk rather than a
 * theoretical one: it unblocks hundreds of candidates whose etymology had been
 * cached as a throttled null, and none of them have been through the Phase 2
 * inflection cull, the denylist, or the register sweep.
 *
 * So the pipeline reports what it found and writes only what was already
 * committed. Admission is a separate, deliberate act: pnpm data:admit, which
 * re-applies every gate by name and refuses to write when one fails.
 */
import type { WordEntry } from './wiktionary.ts';

export interface GateResult {
  /** The entries the build may write. Sorted by word, as the pipeline emits. */
  readonly kept: WordEntry[];
  /** Newly eligible words held back, for the report. Sorted. */
  readonly withheld: string[];
  /** Committed words this run could not reproduce, kept at their committed value. */
  readonly stale: string[];
}

/**
 * Reduce this run's enriched, definition-and-etymology-carrying entries to the
 * words already in the committed source pool.
 *
 * Membership is exactly the committed membership: nothing is added, and nothing
 * is dropped either. A committed word the run failed to reproduce keeps its
 * committed entry rather than falling out of the pool, because a calendar day
 * whose crown has no pool entry has no reveal to show.
 *
 * @param enriched  this run's entries that carry both a definition and an
 *                  etymology, in any order
 * @param committedWords  the words in the committed source-pool.json
 * @param committedEntries  those entries, used only to hold a word steady when
 *                  this run could not reproduce it
 */
export function gateSourcePool(
  enriched: readonly WordEntry[],
  committedWords: ReadonlySet<string>,
  committedEntries: readonly WordEntry[] = [],
): GateResult {
  if (committedWords.size === 0) {
    throw new Error(
      'The committed source pool is empty or missing. Refusing to write a ' +
        'pool from scratch: that would admit every eligible candidate at once. ' +
        'Restore public/data/source-pool.json first.',
    );
  }

  const fresh = new Map(enriched.map((e) => [e.word, e]));
  const committed = new Map(committedEntries.map((e) => [e.word, e]));

  const kept: WordEntry[] = [];
  const stale: string[] = [];
  for (const word of committedWords) {
    const entry = fresh.get(word);
    if (entry) {
      kept.push(entry);
      continue;
    }
    const fallback = committed.get(word);
    if (fallback) {
      kept.push(fallback);
      stale.push(word);
    }
  }
  kept.sort((a, b) => a.word.localeCompare(b.word));
  stale.sort();

  const withheld = enriched
    .map((e) => e.word)
    .filter((w) => !committedWords.has(w))
    .sort();

  return { kept, withheld, stale };
}
