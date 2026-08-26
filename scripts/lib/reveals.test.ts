import { describe, expect, it } from 'vitest';
import type { SourceEntry } from '../../src/data/types.ts';
import { parseRevealCorpus, refreshReveals } from './reveals.ts';

const pool: SourceEntry[] = [
  {
    word: 'aardvark',
    definition: 'noun. An old gloss.',
    etymology: 'An old etymology.',
  },
  {
    word: 'dripping',
    definition: 'noun. Fat that drips.',
    etymology: 'Lua error in Module:etymology/templates at line 71.',
  },
  {
    word: 'abortion',
    definition: 'noun. A retired crown.',
    etymology: 'A retired crown etymology.',
  },
];

const corpus = parseRevealCorpus(
  'aardvark\tThe corrected etymology.\tnoun. The corrected gloss.\n',
);

describe('refreshReveals', () => {
  it('takes both fields from the corpus when it has the word', () => {
    const [entry] = refreshReveals(pool, corpus).pool;
    expect(entry).toEqual({
      word: 'aardvark',
      definition: 'noun. The corrected gloss.',
      etymology: 'The corrected etymology.',
    });
  });

  it('nulls the etymology of a word the corpus refused', () => {
    // `dripping` is one of the eleven orchard dropped. What web ships for it
    // is raw Lua module error text, and a quiet card is the correct answer,
    // which is what the iOS app already does.
    const entry = refreshReveals(pool, corpus).pool[1]!;
    expect(entry.etymology).toBeNull();
  });

  it('keeps the definition of a word the corpus refused', () => {
    // The eleven were dropped for lacking a usable ETYMOLOGY. Their
    // definitions were never in question, and destroying them would be a
    // second bug wearing the first one's clothes.
    expect(refreshReveals(pool, corpus).pool[1]!.definition).toBe(
      'noun. Fat that drips.',
    );
  });

  it('never changes membership, because that is a crown decision', () => {
    // orchard leaves crown membership to the consumer and says so. A refresh
    // that dropped an entry would be silently retiring a crown, and the
    // calendar would then reference a word with no pool entry.
    const { pool: out } = refreshReveals(pool, corpus);
    expect(out.map((e) => e.word)).toEqual([
      'aardvark',
      'dripping',
      'abortion',
    ]);
  });

  it('reports what it changed, separating the two reasons', () => {
    const report = refreshReveals(pool, corpus);
    expect(report.refreshed).toEqual(['aardvark']);
    expect(report.cleared).toEqual(['dripping', 'abortion']);
  });

  it('is idempotent, so a second run is a no-op', () => {
    const once = refreshReveals(pool, corpus);
    const twice = refreshReveals(once.pool, corpus);
    expect(twice.pool).toEqual(once.pool);
    expect(twice.cleared).toEqual([]);
    expect(twice.refreshed).toEqual([]);
  });
});

describe('parseRevealCorpus', () => {
  it('reads orchard word/etymology/definition rows', () => {
    const c = parseRevealCorpus(
      'tui\tFrom Maori tui.\tnoun. A bird of New Zealand.\n',
    );
    expect(c.get('tui')).toEqual({
      etymology: 'From Maori tui.',
      definition: 'noun. A bird of New Zealand.',
    });
  });

  it('skips a row that is not three columns rather than half-reading it', () => {
    expect(parseRevealCorpus('broken\tonly two\n').size).toBe(0);
  });
});
