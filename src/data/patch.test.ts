import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyWord, createPuzzle, validateGuess } from '@/engine/index.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import { applyPatch, parsePatch, type PatchableLists } from './patch.ts';

describe('parsePatch', () => {
  it('parses an allow entry with its band', () => {
    const patch = parsePatch('meme\tallow\tcommon\tmodern');
    expect(patch.allow).toEqual([{ word: 'meme', band: 'common' }]);
    expect(patch.deny).toEqual([]);
  });

  it('parses a deny entry with a blank band', () => {
    const patch = parsePatch('london\tdeny\t\tproper noun');
    expect(patch.deny).toEqual(['london']);
    expect(patch.allow).toEqual([]);
  });

  it('skips a header row, comments, and blank lines', () => {
    const tsv = [
      'word\taction\tband\tnote',
      '# seed: modern words ENABLE misses',
      '',
      'app\tallow\tcommon\tmodern',
    ].join('\n');
    const patch = parsePatch(tsv);
    expect(patch.allow).toEqual([{ word: 'app', band: 'common' }]);
  });

  it('throws on an unknown action so typos surface', () => {
    expect(() => parsePatch('app\tallright\tcommon')).toThrow(
      /unknown action/i,
    );
  });

  it('throws when an allow entry has no valid band', () => {
    expect(() => parsePatch('app\tallow\t\t')).toThrow(/band/i);
  });

  /**
   * The incident: a parse error interpolating a word reached the screen. Part 1
   * stops any internal string being rendered, so these are the second layer.
   * The message must locate the row without repeating anything from it.
   */
  describe('never echoes the row it rejects', () => {
    const WORD = 'zzsentinelzz';

    it.each([
      ['an unknown action', `${WORD}\tzzactionzz\t`],
      ['a bad band', `${WORD}\tallow\tzzbandzz`],
      ['a word that is not a-z', `zz-${WORD}\tdeny\t`],
    ])('keeps the cells out of the message for %s', (_case, row) => {
      // A comment header, so the physical line number and the count of parsed
      // rows disagree. The reported line must be the physical one.
      const tsv = `# header\n# more header\n\n${row}`;

      expect(() => parsePatch(tsv)).toThrow(/line 4/);
      try {
        parsePatch(tsv);
      } catch (err) {
        const message = (err as Error).message;
        expect(message).not.toContain(WORD);
        expect(message).not.toContain('zzactionzz');
        expect(message).not.toContain('zzbandzz');
      }
    });
  });

  it('parses a demote entry', () => {
    const patch = parsePatch('rape\tdemote\t\tsexual violence');
    expect(patch.demote).toEqual(['rape']);
    expect(patch.allow).toEqual([]);
    expect(patch.deny).toEqual([]);
  });
});

describe('demotion, the third action', () => {
  // The band column could not express this. PatchBand was 'common' only and an
  // allow entry only ever ADDS a word, so there was no way to move a word that
  // is already in the common pool out of it. Denial was the only subtraction
  // the layer had, and denial takes the word out of validation too. Demotion is
  // the smallest thing that does what is needed: out of the set, still a word.
  const lists: PatchableLists = {
    enable: ['paradise', 'rape', 'pear', 'reap'],
    common: ['paradise', 'rape', 'pear'],
    beyond70: [],
    beyond95: [],
  };
  const patch = parsePatch('rape\tdemote\t\tsexual violence');
  const merged = applyPatch(lists, patch);

  it('takes the word out of the common pool and nothing else', () => {
    expect(merged.common).not.toContain('rape');
    expect(merged.enable).toContain('rape');
  });

  it('leaves it valid, scoreable, and graded as an off-page find', () => {
    const puzzle = createPuzzle(
      'paradise',
      createListDictionary(merged.enable),
      createListWordSource(merged.common),
      createListWordSource(merged.beyond70),
      createListWordSource(merged.beyond95),
    );
    const result = validateGuess('rape', puzzle, new Set());
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') expect(result.score).toBeGreaterThan(0);
    // Off the page: not a set word, so not required, but still on the ladder.
    expect(puzzle.commonWords.has('rape')).toBe(false);
    expect(classifyWord('rape', puzzle)).toBe('uncommon');
  });

  it('drops it out of par and the completion count', () => {
    const before = createPuzzle(
      'paradise',
      createListDictionary(lists.enable),
      createListWordSource(lists.common),
      createListWordSource(lists.beyond70),
      createListWordSource(lists.beyond95),
    );
    const after = createPuzzle(
      'paradise',
      createListDictionary(merged.enable),
      createListWordSource(merged.common),
      createListWordSource(merged.beyond70),
      createListWordSource(merged.beyond95),
    );
    expect(before.commonWords.has('rape')).toBe(true);
    expect(after.commonWords.size).toBe(before.commonWords.size - 1);
    expect(after.reachableScore).toBeLessThan(before.reachableScore);
  });

  it('is not denial: a denied word loses validation, a demoted one does not', () => {
    const denied = applyPatch(lists, parsePatch('rape\tdeny\t\t'));
    expect(denied.enable).not.toContain('rape');
    expect(merged.enable).toContain('rape');
  });
});

describe('applyPatch', () => {
  const base: PatchableLists = {
    enable: ['cat', 'dog'],
    common: ['cat'],
    beyond70: ['dog'],
    beyond95: [],
  };

  it('adds an allowlisted word to both validation and its band', () => {
    const merged = applyPatch(base, {
      allow: [{ word: 'app', band: 'common' }],
      deny: [],
      demote: [],
    });
    expect(merged.enable).toContain('app');
    expect(merged.common).toContain('app');
  });

  it('removes a denylisted word from every list', () => {
    const merged = applyPatch(base, { allow: [], deny: ['cat'], demote: [] });
    expect(merged.enable).not.toContain('cat');
    expect(merged.common).not.toContain('cat');
  });

  it('does not duplicate a word already present', () => {
    const merged = applyPatch(base, {
      allow: [{ word: 'cat', band: 'common' }],
      deny: [],
      demote: [],
    });
    expect(merged.enable.filter((w) => w === 'cat')).toHaveLength(1);
    expect(merged.common.filter((w) => w === 'cat')).toHaveLength(1);
  });
});

// Integration: build a real puzzle from patched lists and exercise the engine.
function puzzleFrom(lists: PatchableLists, sourceWord: string) {
  return createPuzzle(
    sourceWord,
    createListDictionary(lists.enable),
    createListWordSource(lists.common),
    createListWordSource(lists.beyond70),
    createListWordSource(lists.beyond95),
  );
}

describe('patch layer through the engine', () => {
  // Rack that can spell app, wifi, meme, email, udon for the acceptance checks.
  const baseLists: PatchableLists = {
    enable: ['sap', 'asp'],
    common: ['sap'],
    beyond70: [],
    beyond95: [],
  };

  it('accepts a previously-rejected modern word once allowlisted', () => {
    const patch = parsePatch(
      ['app\tallow\tcommon', 'wifi\tallow\tcommon'].join('\n'),
    );
    const puzzle = puzzleFrom(applyPatch(baseLists, patch), 'apppwfii');

    expect(validateGuess('app', puzzle, new Set()).kind).toBe('valid');
    expect(validateGuess('wifi', puzzle, new Set()).kind).toBe('valid');
  });

  it('accepts udon once allowlisted', () => {
    const patch = parsePatch('udon\tallow\tcommon');
    const puzzle = puzzleFrom(applyPatch(baseLists, patch), 'udonxxxx');
    expect(validateGuess('udon', puzzle, new Set()).kind).toBe('valid');
  });

  it('surfaces an allowlisted word the rack can spell as findable, not only valid', () => {
    const patch = parsePatch('app\tallow\tcommon');
    const puzzle = puzzleFrom(applyPatch(baseLists, patch), 'apppwfii');
    // Findable means it is in the per-rack formable validation set and, being
    // common-banded, in the completion set the rack surfaces.
    expect(puzzle.validationWords.has('app')).toBe(true);
    expect(puzzle.commonWords.has('app')).toBe(true);
  });

  it('classifies an allowlisted modern word beyond SCOWL as common, never mythic', () => {
    const patch = parsePatch(
      ['app\tallow\tcommon', 'wifi\tallow\tcommon'].join('\n'),
    );
    const puzzle = puzzleFrom(applyPatch(baseLists, patch), 'apppwfii');

    expect(classifyWord('app', puzzle)).toBe('set');
    expect(classifyWord('wifi', puzzle)).toBe('set');
    expect(puzzle.mythicWords.has('app')).toBe(false);
    expect(puzzle.uncommonWords.has('app')).toBe(false);
  });

  it('leaves classification unchanged for words not in the patch', () => {
    // One word per band, all formable from the rack.
    // The baked lists nest: beyond-95 is a subset of beyond-70, so a mythic
    // word sits in both. The fixture honors that nesting.
    const lists: PatchableLists = {
      enable: ['pearl', 'snare', 'plays', 'apery'],
      common: ['pearl'], // set
      beyond70: ['plays', 'apery'], // beyond 70 (rare, plus the mythic word)
      beyond95: ['apery'], // mythic (beyond 95, hence also beyond 70)
      // snare: in validation, not in any beyond list, not common -> uncommon
    };
    const rack = 'arsenply';
    const before = puzzleFrom(lists, rack);
    const after = puzzleFrom(
      applyPatch(lists, {
        allow: [{ word: 'app', band: 'common' }],
        deny: [],
        demote: [],
      }),
      rack,
    );
    for (const word of ['pearl', 'snare', 'plays', 'apery']) {
      expect(classifyWord(word, after)).toBe(classifyWord(word, before));
    }
    // And the four still cover all four rungs, proving the fixture is real.
    expect(classifyWord('pearl', before)).toBe('set');
    expect(classifyWord('snare', before)).toBe('uncommon');
    expect(classifyWord('plays', before)).toBe('rare');
    expect(classifyWord('apery', before)).toBe('mythic');
  });

  it('rejects a denylisted word (mechanism, no shipped denials)', () => {
    const lists: PatchableLists = {
      enable: ['sap', 'asp', 'spa'],
      common: ['sap'],
      beyond70: [],
      beyond95: [],
    };
    const patch = parsePatch('spa\tdeny\t\tsynthetic test entry');
    const puzzle = puzzleFrom(applyPatch(lists, patch), 'spaxxxxx');
    expect(validateGuess('spa', puzzle, new Set()).kind).toBe('not-a-word');
  });
});

describe('committed seed file', () => {
  const tsv = readFileSync('public/data/dictionary-patch.tsv', 'utf8');
  const patch = parsePatch(tsv);

  it('allowlists the seeded modern words and udon at the common band', () => {
    const allowed = new Map(patch.allow.map((a) => [a.word, a.band]));
    for (const word of ['meme', 'email', 'app', 'wifi', 'udon']) {
      expect(allowed.get(word)).toBe('common');
    }
  });

  it('denylists the SCOWL proper-noun and foreign warts', () => {
    const deny = new Set(patch.deny);
    expect(deny.has('cairo')).toBe(true); // formable proper-noun wart
    expect(deny.has('bonjour')).toBe(true); // curated foreign word
    expect(deny.size).toBeGreaterThan(100);
  });
});
