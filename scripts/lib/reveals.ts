/**
 * Rebuilding source-pool.json's reveal content from orchard's corpus.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL.
 *
 * `source-pool.json` is a derived artifact that had no producer. `data:admit`
 * writes reveal entries only for racks it has just admitted, deliberately and
 * by its own comment, so nothing ever rewrote the entries already there. The
 * file had not been regenerated since 2026-08-04.
 *
 * What that cost: orchard dropped eleven calendar crowns from its etymology
 * corpus for carrying something that was not an etymology, and web went on
 * serving all eleven. `dripping` showed players `Lua error in
 * Module:etymology/templates at line 71`. `catering` and `projects` showed a
 * Wiktionary maintenance notice. `favorite` showed a foreign inflection table.
 * The iOS app has shown a quiet card for all eleven since v1.3.0.
 *
 * This is the same gap `data:rebundle` closed for the per-rack bundles, in a
 * second file, and it gets the same answer: a producer, so that a refresh is a
 * step someone runs rather than a hand edit someone remembers. A hand fix
 * would correct today and guarantee the same drift again.
 * ---------------------------------------------------------------------------
 */
import type { SourceEntry } from '../../src/data/types.ts';

/** One word's reveal content as orchard publishes it. */
export interface RevealRow {
  readonly etymology: string;
  readonly definition: string;
}

/**
 * Parse orchard's etymology.tsv: `word\tetymology\tdefinition` per line.
 *
 * A row that is not exactly three columns is skipped rather than half-read.
 * The alternative is a two-column row silently yielding an entry whose
 * definition is undefined, which would then be written into the shipped file
 * as reveal content nobody authored.
 */
export function parseRevealCorpus(tsv: string): Map<string, RevealRow> {
  const out = new Map<string, RevealRow>();
  for (const line of tsv.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length !== 3) continue;
    const [word, etymology, definition] = parts as [string, string, string];
    out.set(word, { etymology, definition });
  }
  return out;
}

/** What a refresh did, so the caller can report it rather than write silently. */
export interface RefreshReport {
  readonly pool: SourceEntry[];
  /** Words whose content came from the corpus. */
  readonly refreshed: string[];
  /** Words the corpus does not carry, whose etymology is now null. */
  readonly cleared: string[];
}

/**
 * Rewrite each entry's reveal content from the corpus, leaving membership alone.
 *
 * **Membership is never touched, and that is the load-bearing rule.** orchard
 * ships the words and no opinion about which are crowns; the README says so in
 * as many words. Dropping an entry here would silently retire a crown, and the
 * calendar would then name a word with no pool entry.
 *
 * A word the corpus does not carry loses its ETYMOLOGY and keeps its
 * DEFINITION. Those are two different absences. The eleven were dropped for
 * lacking a usable etymology, not a definition, and `Reveal.tsx` renders each
 * section only when its field is non-empty, so a null etymology is exactly the
 * quiet card iOS already shows. Clearing the definition too would be a second
 * bug wearing the first one's clothes.
 *
 * Six of the words the corpus does not carry are a different case again:
 * `abortion`, `atrocity`, `genocide`, `oriental`, `sexually` and `violence`
 * are absent because orchard intersects its candidates with the baked common
 * pool, and these were retired as crowns. They are in the 793-word pool and
 * not on the 626-day calendar, verified, so no player can be dealt one. They
 * are handled by the same rule as the other fifteen because the rule is about
 * what the corpus carries, and inventing an exception for them here would put
 * a register decision inside a data refresh.
 */
export function refreshReveals(
  pool: readonly SourceEntry[],
  corpus: ReadonlyMap<string, RevealRow>,
): RefreshReport {
  const refreshed: string[] = [];
  const cleared: string[] = [];
  const out = pool.map((entry): SourceEntry => {
    const row = corpus.get(entry.word);
    if (row) {
      const next = {
        word: entry.word,
        definition: row.definition,
        etymology: row.etymology,
      };
      if (
        next.definition !== entry.definition ||
        next.etymology !== entry.etymology
      ) {
        refreshed.push(entry.word);
      }
      return next;
    }
    if (entry.etymology !== null) cleared.push(entry.word);
    return { word: entry.word, definition: entry.definition, etymology: null };
  });
  return { pool: out, refreshed, cleared };
}
