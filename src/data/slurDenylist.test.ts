import { describe, expect, it } from 'vitest';
import {
  createPuzzle,
  dailySourceWord,
  endlessSourceWord,
  validateGuess,
  type Puzzle,
} from '@/engine/index.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import type { PatchableLists } from './patch.ts';
import {
  readCalendarWords,
  readCommittedPatch,
  readPatchText,
  readShippedLists,
  withPatchUndone,
} from './shippedLists.ts';

/**
 * The slur denylist, asserted end to end against the committed assets.
 *
 * Two properties, and they pull in opposite directions:
 *
 *   Denied words are gone before pool derivation, so no denied word sits inside
 *   par, a completion count, or a rarity band. Filtering at the guess check
 *   alone would leave one in a denominator.
 *
 *   Ordinary words that merely resemble a slur, or that carry a second reading,
 *   stay valid and scored. nip is formable from 28 of the shipped racks. Over-
 *   blocking is the failure mode a published list makes easy, so it is tested
 *   as hard as the blocking is.
 */
// The shipped lists carry the denylist already, so these assert on the bytes the
// player downloads rather than on a merge performed in the test.
const patch = readCommittedPatch();
const merged: PatchableLists = readShippedLists();
const calendar = readCalendarWords();

/**
 * The deny rows carrying the nwl2020 note. Read from the note column rather than
 * from the derivation, so this file asserts what actually shipped: if the block
 * were dropped from the patch, these tests fail rather than quietly testing an
 * empty set. scripts/lib/denylist.test.ts separately proves the block equals the
 * derivation from the vendored source.
 */
const denied = readPatchText()
  .split('\n')
  .map((line) => line.split('\t'))
  .filter(
    (cols) =>
      cols[1]?.trim() === 'deny' &&
      (cols[3]?.trim() === 'nwl2020' || cols[3]?.trim() === 'supplement'),
  )
  .map((cols) => (cols[0] ?? '').trim());
const deniedSet = new Set(denied);

/** The ordinary words this feature must never take. Not optional. */
const MUST_KEEP = ['nip', 'nips', 'niggard', 'spade', 'coot'] as const;

function puzzleFor(rack: string): Puzzle {
  return createPuzzle(
    rack,
    createListDictionary(merged.enable),
    createListWordSource(merged.common),
    createListWordSource(merged.beyond70),
    createListWordSource(merged.beyond95),
  );
}

const bands = (p: Puzzle) => [
  p.validationWords,
  p.commonWords,
  p.uncommonWords,
  p.rareWords,
  p.mythicWords,
];

describe('the denylist is wired to the shipped patch', () => {
  it('ships both derived blocks, 218 from the source and 25 supplemented', () => {
    expect(denied).toHaveLength(243);
    expect(deniedSet.size).toBe(243);
    // The supplement covers what a tournament lexicon could justify keeping.
    for (const word of ['faggot', 'fag', 'coon', 'negro', 'tranny', 'homo']) {
      expect(deniedSet.has(word)).toBe(true);
    }
  });
});

describe('denied words are gone before pool derivation', () => {
  // Asserted on the derived lists, not at the guess path. A word filtered only
  // at the guess check would still sit inside a denominator somewhere.
  it('leaves no denied word in validation, the common pool, or either band', () => {
    for (const list of [
      merged.enable,
      merged.common,
      merged.beyond70,
      merged.beyond95,
    ]) {
      expect(list.filter((w) => deniedSet.has(w))).toEqual([]);
    }
  });

  it('leaves no denied word in any band of any rack that could spell one', () => {
    // Every rack in the calendar that can form at least one denied word, which
    // is where a leak would actually show up. Checked across all five bands, so
    // par, the completion count, and the rarity ladder are all covered.
    const affected = calendar.filter((rack) =>
      denied.some((w) => canForm(w, rack)),
    );
    expect(affected.length).toBeGreaterThan(0);
    for (const rack of affected) {
      const puzzle = puzzleFor(rack);
      for (const band of bands(puzzle)) {
        for (const word of band) expect(deniedSet.has(word)).toBe(false);
      }
    }
  }, 240_000);
});

describe('a denied word is rejected outright', () => {
  it('answers with the standard not-in-the-word-list result, in daily and endless', () => {
    // Daily and endless both resolve a source word out of the same calendar and
    // hand it to createPuzzle, so the check is the same one in both; this pins
    // that neither mode has its own path around it.
    const daily = dailySourceWord(calendar, new Date(2026, 5, 23));
    const endless = endlessSourceWord(calendar, () => 0);
    for (const rack of [daily, endless]) {
      const puzzle = puzzleFor(rack);
      // A denied word this rack can actually spell, if it has one; otherwise
      // the assertion still holds for a denied word it cannot spell.
      const target = denied.find((w) => canForm(w, rack)) ?? denied[0]!;
      const result = validateGuess(target, puzzle, new Set());
      expect(result.kind).toBe('not-a-word');
      // Identical to a word that simply is not in the list: no distinct
      // response, so nothing tells the player the block was deliberate.
      expect(result).toEqual(validateGuess('zzzqqq', puzzle, new Set()));
      expect(result).not.toHaveProperty('score');
    }
  });

  it('rejects the slurs the AGREEING rack spells, which is the one Bea hit', () => {
    const puzzle = puzzleFor('agreeing');
    for (const word of ['nigger', 'gringa']) {
      expect(deniedSet.has(word)).toBe(true);
      expect(validateGuess(word, puzzle, new Set()).kind).toBe('not-a-word');
      for (const band of bands(puzzle)) expect(band.has(word)).toBe(false);
    }
  });

  it('detects a planted slur, so the band check is not passing vacuously', () => {
    // The positive control. The same assertion the suite runs over the real
    // racks, aimed at a rack built to spell a slur that has NOT been denied.
    // If this does not find it, the band check above proves nothing.
    // gringa is not denied, so restoring the denied words is not what puts it
    // there; it is in the shipped validation already. The restore keeps this
    // control honest against a future run where it does get denied.
    const planted = withPatchUndone(merged, patch);
    const puzzle = createPuzzle(
      'gringaxe',
      createListDictionary(planted.enable),
      createListWordSource(planted.common),
      createListWordSource(planted.beyond70),
      createListWordSource(planted.beyond95),
    );
    const leaked = bands(puzzle).some((band) => band.has('gringa'));
    expect(leaked).toBe(true);
    expect(validateGuess('gringa', puzzle, new Set()).kind).toBe('valid');
  });
});

describe('the over-blocking guard', () => {
  it('keeps nip, nips, niggard, spade and coot valid and scored', () => {
    for (const word of MUST_KEEP) {
      expect(deniedSet.has(word)).toBe(false);
      expect(merged.enable).toContain(word);
      const puzzle = puzzleFor(word.padEnd(8, 'x').slice(0, 8));
      const result = validateGuess(word, puzzle, new Set());
      expect(result.kind).toBe('valid');
      if (result.kind === 'valid') expect(result.score).toBeGreaterThan(0);
    }
  });

  it('still accepts nip on every one of the 29 racks that can spell it', () => {
    // 28 when the denylist landed; patience, admitted here as a replacement
    // crown, is the 29th rack that can spell it.
    const racks = calendar.filter((rack) => canForm('nip', rack));
    expect(racks).toHaveLength(29);
    for (const rack of racks) {
      const puzzle = puzzleFor(rack);
      const result = validateGuess('nip', puzzle, new Set());
      expect(result.kind).toBe('valid');
      if (result.kind === 'valid') expect(result.score).toBeGreaterThan(0);
    }
  }, 240_000);

  it('denies no word that is merely a substring host', () => {
    // Exact match only, never prefix, never substring, asserted on the shipped
    // list rather than on the derivation.
    for (const word of denied) {
      for (const host of MUST_KEEP) {
        expect(host).not.toBe(word);
      }
    }
    for (const host of MUST_KEEP) expect(deniedSet.has(host)).toBe(false);
  });
});

/** Whole-word formability from a rack, letter counts respected. */
function canForm(word: string, rack: string): boolean {
  if (word.length > rack.length) return false;
  const counts = new Map<string, number>();
  for (const ch of rack) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of word) {
    const left = counts.get(ch) ?? 0;
    if (left === 0) return false;
    counts.set(ch, left - 1);
  }
  return true;
}
