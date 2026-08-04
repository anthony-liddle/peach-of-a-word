import { describe, expect, it } from 'vitest';
import { gateSourcePool } from './source-gate.ts';
import type { WordEntry } from './wiktionary.ts';

/**
 * The gate that stops pnpm data:build from growing the source pool.
 *
 * Every source word is a crown: the calendar appends newly eligible words, so
 * a pool that grows during a routine rebuild ships crowns nobody curated. The
 * pool grows only through pnpm data:admit, which re-applies every gate by name
 * and refuses to write on failure. This is what holds that line.
 */

const entry = (
  word: string,
  definition = 'a thing',
  etymology = 'from Latin',
) => ({ word, definition, etymology }) as WordEntry;

describe('gateSourcePool', () => {
  it('withholds a newly eligible word and reports it', () => {
    const result = gateSourcePool(
      [entry('distance'), entry('festival')],
      new Set(['distance']),
    );

    expect(result.kept.map((e) => e.word)).toEqual(['distance']);
    expect(result.withheld).toEqual(['festival']);
  });

  it('keeps every committed word, refreshed from this run', () => {
    const result = gateSourcePool(
      [entry('distance', 'a fresher gloss', 'a fresher etymology')],
      new Set(['distance']),
    );

    expect(result.kept).toEqual([
      entry('distance', 'a fresher gloss', 'a fresher etymology'),
    ]);
    expect(result.withheld).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('preserves a committed word this run could not reproduce', () => {
    // A word already on the calendar must not vanish from the pool because one
    // fetch came back thin. Losing it would leave a scheduled day with no
    // reveal to show.
    // The pipeline filters out entries missing a definition or etymology
    // before the gate sees them, so a thin fetch reaches here as an absence.
    const committed = [entry('distance', 'the committed gloss')];
    const result = gateSourcePool([], new Set(['distance']), committed);

    expect(result.kept).toEqual(committed);
    expect(result.stale).toEqual(['distance']);
  });

  it('sorts the kept pool by word, as the pipeline always has', () => {
    const result = gateSourcePool(
      [entry('sunlight'), entry('distance'), entry('patience')],
      new Set(['sunlight', 'distance', 'patience']),
    );

    expect(result.kept.map((e) => e.word)).toEqual([
      'distance',
      'patience',
      'sunlight',
    ]);
  });

  it('refuses to run against an empty committed pool', () => {
    // Bootstrapping is not a thing this gate does quietly. An empty committed
    // pool means the asset is missing, and writing the whole widened candidate
    // set is exactly the accident the gate exists to prevent.
    expect(() => gateSourcePool([entry('distance')], new Set())).toThrow(
      /committed source pool/i,
    );
  });
});
