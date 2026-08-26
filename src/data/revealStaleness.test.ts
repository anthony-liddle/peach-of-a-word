/**
 * The gap this closes, which is the bundle gap in a second file.
 *
 * `public/data/source-pool.json` carries the reveal content for all 793 crowns
 * and had no producer. `pnpm data:admit` writes reveal entries only for racks
 * it has just admitted, by the same comment that made `data:rebundle`
 * necessary, so nothing ever rewrote the entries already there. The file was
 * last regenerated on 2026-08-04.
 *
 * What it cost, and it was live rather than theoretical: orchard dropped
 * eleven calendar crowns from its etymology corpus for carrying something that
 * was not an etymology, and this game went on serving all eleven. Anyone dealt
 * `dripping` read `Lua error in Module:etymology/templates at line 71`.
 * `catering` and `projects` showed a Wiktionary maintenance notice. `favorite`
 * showed a foreign inflection table. The iOS app has shown a quiet card for
 * all eleven since orchard v1.3.0, so on this the app was ahead.
 *
 * Every check that existed asked whether the field was POPULATED. None asked
 * what was in it, so a Lua error and a real etymology were the same answer.
 * This is the check that reads the content: every shipped entry against the
 * corpus row it came from. Run `pnpm data:refresh-reveals` after any
 * `pnpm lexicon:update` that moves etymology.tsv, and it stays green.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseRevealCorpus,
  refreshReveals,
} from '../../scripts/lib/reveals.ts';
import type { SourceEntry } from './types.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const pool = JSON.parse(
  readFileSync(join(ROOT, 'public', 'data', 'source-pool.json'), 'utf8'),
) as SourceEntry[];
const corpus = parseRevealCorpus(
  readFileSync(join(ROOT, 'vendor', 'lexicon', 'etymology.tsv'), 'utf8'),
);

describe('the shipped reveal content matches the corpus it derives from', () => {
  it('is what a refresh would produce, so nothing is stale', () => {
    expect(refreshReveals(pool, corpus).pool).toEqual(pool);
  });

  it('ships no reveal text the corpus has refused', () => {
    // The specific shapes orchard rejected, asserted by content rather than by
    // presence. Naming them keeps the failure legible: a new one appearing
    // means the acquisition let something through, not that this drifted.
    const REFUSED = [/^Lua error/i, /etymology is missing or incomplete/i];
    const offenders = pool
      .filter((e) => e.etymology && REFUSED.some((r) => r.test(e.etymology!)))
      .map((e) => e.word);
    expect(offenders).toEqual([]);
  });

  it('discriminates, so a passing run means it looked', () => {
    // A guard nobody has seen fail is not known to work. Stale one entry the
    // way the real drift staled it, and the check must refuse it.
    const staled = pool.map((e) =>
      e.word === 'dripping'
        ? {
            ...e,
            etymology: 'Lua error in Module:etymology/templates at line 71.',
          }
        : e,
    );
    expect(refreshReveals(staled, corpus).pool).not.toEqual(staled);
  });

  it('covers every crown, so an empty comparison cannot pass as a clean one', () => {
    expect(pool.length).toBe(793);
    expect(corpus.size).toBeGreaterThan(700);
  });
});
