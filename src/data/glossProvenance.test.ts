import { describe, expect, it } from 'vitest';
import { creditFor, isProjectGloss, PROJECT_WORDS } from './glossProvenance.ts';

describe("which glosses are this project's own words", () => {
  it('reads the vendored file rather than a list copied into the code', () => {
    // One source of truth. orchard writes gloss-provenance.tsv, the release
    // carries it, lexicon:update vendors it, and this reads that file at build
    // time. A hand-kept copy here would be a second place to forget.
    expect(PROJECT_WORDS.size).toBeGreaterThan(30);
    expect(isProjectGloss('tulpa')).toBe(true);
    expect(isProjectGloss('spork')).toBe(true);
  });

  it('says no for an ordinary Wiktionary word', () => {
    expect(isProjectGloss('house')).toBe(false);
    expect(isProjectGloss('denote')).toBe(false);
  });
});

describe('what each card credits', () => {
  // The exact strings, because these are the licence notice on the screen and
  // the one place a reader meets it. A test that only checked "contains
  // Wiktionary" would pass on a sentence that credited the wrong thing.

  it('CREDITS WIKTIONARY FOR A WIKTIONARY DEFINITION', () => {
    expect(creditFor({ word: 'denote', register: 'quiet' })).toBe(
      'Definition from Wiktionary, CC BY-SA 4.0.',
    );
  });

  it('DOES NOT SAY WIKTIONARY FOR A PROJECT DEFINITION', () => {
    // 38 words. They are the odd ones a player stops on, so they are the most
    // likely of all to be read.
    const credit = creditFor({ word: 'tulpa', register: 'quiet' });
    expect(credit).not.toContain('Wiktionary');
    expect(credit).toBe('Written for this game.');
  });

  it('credits both on a crown whose definition is Wiktionary', () => {
    expect(creditFor({ word: 'withdraw', register: 'crown' })).toBe(
      'Definition and etymology from Wiktionary, CC BY-SA 4.0.',
    );
  });

  it('SPLITS THE CLAIM ON A CROWN WHOSE DEFINITION IS OURS', () => {
    // eighteen and fourteen are both project glosses AND live calendar crowns,
    // so this is a card a player actually opens, not a hypothetical. The
    // etymology is still Wiktionary's; the definition is not.
    const credit = creditFor({ word: 'eighteen', register: 'crown' });
    expect(credit).toBe(
      'Definition written for this game. Etymology from Wiktionary, CC BY-SA 4.0.',
    );
  });

  it('credits nothing it is not showing when a crown has no etymology', () => {
    // Eleven crowns have no usable English etymology and their card is quiet.
    // Crediting a source that is not on screen is the thing this app already
    // refuses to do elsewhere.
    expect(
      creditFor({ word: 'dripping', register: 'crown', hasEtymology: false }),
    ).toBe('Definition from Wiktionary, CC BY-SA 4.0.');
    expect(
      creditFor({ word: 'eighteen', register: 'crown', hasEtymology: false }),
    ).toBe('Written for this game.');
  });
});
