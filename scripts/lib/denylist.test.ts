import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveDenylist,
  extractNwl2020Purged,
  parseDenyExclusions,
  parsePurgedList,
  parseSupplementSlurs,
  NWL2020_EXPECTED,
} from './denylist.ts';
import { DATA_RAW_DIR } from './util.ts';

const raw = (f: string) => readFileSync(join(DATA_RAW_DIR, f), 'utf8');

describe('extractNwl2020Purged', () => {
  it('takes only the two 2020-purge classes, not the wider expurgation', () => {
    const html = `<pre>
<span class="nwl2020purge">SLURA SLURAS</span>
<span class="nwl2020newexpurge">SLURB</span>
VULGARA VULGARAS
<strong>VULGARB</strong>
<span class="owl3update">VULGARC</span>
</pre>`;
    expect(extractNwl2020Purged(html)).toEqual(['slura', 'sluras', 'slurb']);
  });

  it('drops [BRACKETED] acceptable relatives and keeps {BRACED} words', () => {
    // The brackets are the source page's own over-blocking guard: ARSES has a
    // non-offensive definition, so it must not be denied. The braces only say
    // which OSPD edition dropped the word, so BOHUNK is still purged.
    const html = `<pre>
<span class="nwl2020purge">ARSE [ARSES] [ARSED]</span>
<span class="nwl2020purge">{BOHUNK} {BOHUNKS}</span>
</pre>`;
    expect(extractNwl2020Purged(html)).toEqual(['arse', 'bohunk', 'bohunks']);
  });

  it('reproduces the 259 the 2020 revision published, on the vendored list', () => {
    // The published count is the check that the extraction did not silently
    // widen or narrow when the source page changed.
    expect(parsePurgedList(raw('nwl2020-purged.txt'))).toHaveLength(
      NWL2020_EXPECTED,
    );
  });
});

describe('parsePurgedList', () => {
  it('skips comments and blanks, lowercases, and dedupes', () => {
    expect(parsePurgedList('# note\n\nBETA\nalpha\nalpha\n')).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('throws on a non a-z entry rather than dropping it', () => {
    // A mangled vendor run must fail loudly, not quietly ship a shorter list.
    expect(() => parsePurgedList('alpha\nbad-word\n')).toThrow(/not a-z only/);
  });
});

describe('parseDenyExclusions', () => {
  it('reads word and reason, skipping the header and comments', () => {
    const tsv = '# note\nword\treason\njesuit\tneutral primary sense\n';
    expect(parseDenyExclusions(tsv)).toEqual([
      { word: 'jesuit', reason: 'neutral primary sense' },
    ]);
  });

  it('throws on an exclusion with no reason, so the audit cannot rot', () => {
    expect(() => parseDenyExclusions('jesuit\t\n')).toThrow(/needs a reason/);
  });
});

describe('deriveDenylist', () => {
  const boundary = new Set(['alpha', 'beta', 'gamma']);

  it('intersects with the boundary and subtracts the reviewed exclusions', () => {
    const result = deriveDenylist(
      ['alpha', 'beta', 'delta'],
      [{ word: 'beta', reason: 'neutral primary sense' }],
      boundary,
    );
    expect(result.denied).toEqual(['alpha']);
    expect(result.noOps).toEqual(['delta']);
    expect(result.excluded).toHaveLength(1);
  });

  it('throws when an exclusion names a word the source does not contain', () => {
    expect(() =>
      deriveDenylist(['alpha'], [{ word: 'zeta', reason: 'stale' }], boundary),
    ).toThrow(/excludes nothing/);
  });

  it('matches whole words only, never a prefix or a substring', () => {
    // niggard contains a slur as a substring and denigrate contains one too.
    // Neither is in the source list, and derivation is pure set membership, so
    // neither can be pulled in. This is the property, asserted directly.
    const result = deriveDenylist(
      ['nigger'],
      [],
      new Set(['nigger', 'niggard', 'niggardly', 'denigrate', 'nip', 'nips']),
    );
    expect(result.denied).toEqual(['nigger']);
    for (const safe of ['niggard', 'niggardly', 'denigrate', 'nip', 'nips']) {
      expect(result.denied).not.toContain(safe);
    }
  });
});

describe('the committed derivation', () => {
  const purged = parsePurgedList(raw('nwl2020-purged.txt'));
  const exclusions = parseDenyExclusions(raw('nwl2020-exclusions.tsv'));
  const boundaryOf = (f: string) =>
    readFileSync(join('public', 'data', f), 'utf8')
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean);
  const boundary = new Set([
    ...boundaryOf('enable.txt'),
    ...boundaryOf('scowl95-additions.txt'),
  ]);
  const derived = deriveDenylist(purged, exclusions, boundary);

  it('holds back only words with a neutral primary sense, each with a reason', () => {
    expect(exclusions).toHaveLength(18);
    for (const { reason } of exclusions)
      expect(reason.length).toBeGreaterThan(8);
  });

  it('denies 218 of the 259, with 23 no-ops the boundary never had', () => {
    expect(derived.denied).toHaveLength(218);
    expect(derived.noOps).toHaveLength(23);
    expect(derived.denied.length + derived.noOps.length + 18).toBe(
      NWL2020_EXPECTED,
    );
  });

  it('is exactly what shipped in the patch, so the audit trail holds', () => {
    // The provenance claim, enforced. The nwl2020 rows in the committed patch
    // must equal the derivation from the vendored source and the reviewed
    // exclusions: no row added by hand, none quietly dropped.
    const shipped = readFileSync('public/data/dictionary-patch.tsv', 'utf8')
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((c) => c[1]?.trim() === 'deny' && c[3]?.trim() === 'nwl2020')
      .map((c) => (c[0] ?? '').trim());
    expect(shipped).toEqual(derived.denied);
  });

  it('supplements the source where a tournament lexicon kept a slur', () => {
    // The 2020 revision kept faggot (a bundle of sticks), fag (a cigarette),
    // coon (a raccoon) and negro (a Spanish colour word), because a tournament
    // lexicon can justify each. It also predates transphobic slurs being a
    // category anyone audited. AGREEING is the reminder that the reading which
    // lands is the only one that matters here.
    const supplement = parseSupplementSlurs(raw('supplement-slurs.tsv'));
    const words = supplement.map((s) => s.word);
    expect(supplement).toHaveLength(25);
    for (const { reason } of supplement) {
      expect(reason.length).toBeGreaterThan(8);
    }
    // Each of these is absent from the source list, which is the whole reason
    // the supplement exists: it must add cover, not repeat it.
    for (const word of ['faggot', 'fag', 'coon', 'negro', 'tranny']) {
      expect(purged).not.toContain(word);
      expect(words).toContain(word);
    }
  });

  it('holds the supplement to the same neutral-primary-sense bar', () => {
    // Pointing the other way from the exclusions, but the same rule. These have
    // a neutral primary sense in ordinary modern English, so they stay valid
    // even though each sits near a denied word.
    const words = parseSupplementSlurs(raw('supplement-slurs.tsv')).map(
      (s) => s.word,
    );
    for (const keep of [
      'lame',
      'deaf',
      'queer',
      'creole',
      'dyke',
      'poof',
      'moron',
      'idiot',
      'dwarf',
    ]) {
      expect(words).not.toContain(keep);
    }
  });

  it('never denies the five ordinary words this game must keep', () => {
    // The over-blocking guard, at the derivation layer. nip alone is formable
    // from 28 of the shipped racks; a published list imported unfiltered would
    // take it. Asserted again end to end in src/data/slurDenylist.test.ts.
    for (const safe of ['nip', 'nips', 'niggard', 'spade', 'coot']) {
      expect(purged).not.toContain(safe);
      expect(derived.denied).not.toContain(safe);
    }
  });
});
