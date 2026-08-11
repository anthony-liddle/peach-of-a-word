import { describe, expect, it } from 'vitest';
import {
  classifyWord,
  createPuzzle,
  validateGuess,
  MIN_SET_SIZE,
  type Puzzle,
} from '@/engine/index.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import type { PatchableLists } from '../../scripts/lib/patch.ts';
import {
  readCalendarWords,
  readCommittedPatch,
  readShippedLists,
  withPatchUndone,
} from './shippedLists.ts';

/**
 * Demotion, asserted end to end against the committed assets.
 *
 * The property, and it is a narrow one: a demoted word is no longer REQUIRED,
 * and is otherwise untouched. Completion, par and the rarity bands must forget
 * it; validation and scoring must not. Denial would have been the easy answer
 * and the wrong one, because these are real words a player may reasonably find.
 */
// The shipped lists carry the demotions already, so these assert on what the
// player receives rather than on a merge performed in the test.
const patch = readCommittedPatch();
const merged: PatchableLists = readShippedLists();
const calendar = readCalendarWords();

const demoted = [...patch.demote];
const demotedSet = new Set(demoted);

/** The 18 racks that required rape before the demotion. */
const RAPE_RACKS = [
  'particle',
  'persuade',
  'operator',
  'apparent',
  'practice',
  'portable',
  'pacifier',
  'metaphor',
  'rephrase',
  'pleasure',
  'manpower',
  'peculiar',
  'separate',
  'paradise',
  'probable',
  'taxpayer',
  'pregnant',
  'personal',
] as const;

function puzzleWith(lists: PatchableLists, rack: string): Puzzle {
  return createPuzzle(
    rack,
    createListDictionary(lists.enable),
    createListWordSource(lists.common),
    createListWordSource(lists.beyond70),
    createListWordSource(lists.beyond95),
  );
}
const puzzleFor = (rack: string) => puzzleWith(merged, rack);

describe('the committed demotions', () => {
  it('demotes the twenty-two decided words', () => {
    // 14 from the register sweep, plus the eight vulgar-not-slur words that
    // came off the denylist and were demoted so they can never be required.
    expect(demoted).toHaveLength(22);
    for (const word of [
      'rape',
      'genocide',
      'atrocity',
      'oriental',
      'sexually',
      'violence',
      'abortion',
      'abuse',
      'corpse',
      'sex',
      'abused',
      'racist',
      'sexual',
      'terror',
    ]) {
      expect(demotedSet.has(word)).toBe(true);
    }
  });

  it('names only words the common pool actually had, so none is a no-op', () => {
    // The shipped pool no longer holds them, which is the whole point, so the
    // check runs against the pool with the demotions put back. A demotion of a
    // word the pool never had would still be absent here and would fail.
    const restored = new Set(withPatchUndone(merged, patch).common);
    for (const word of demoted) expect(restored.has(word)).toBe(true);
  });

  it('takes every one out of the common pool', () => {
    const common = new Set(merged.common);
    for (const word of demoted) expect(common.has(word)).toBe(false);
  });

  it('is demotion and not denial: all twenty-two stay in validation', () => {
    const validation = new Set(merged.enable);
    const deny = new Set(patch.deny);
    for (const word of demoted) {
      expect(validation.has(word)).toBe(true);
      expect(deny.has(word)).toBe(false);
    }
  });
});

describe('a demoted word is permitted, never required', () => {
  it('is absent from par, the completion count, and every band but uncommon', () => {
    const affected = calendar.filter((rack) =>
      demoted.some((w) => canForm(w, rack)),
    );
    expect(affected.length).toBeGreaterThan(0);
    for (const rack of affected) {
      const puzzle = puzzleFor(rack);
      for (const word of demoted) {
        // Never in the set, so never in the denominator and never in par.
        expect(puzzle.commonWords.has(word)).toBe(false);
        // And never pushed into the rare or mythic tail either: a common word
        // sits inside SCOWL 70, so demotion lands it on the uncommon rung.
        expect(puzzle.rareWords.has(word)).toBe(false);
        expect(puzzle.mythicWords.has(word)).toBe(false);
      }
    }
  }, 240_000);

  it('is still accepted, still scores, and grades as an off-page find', () => {
    for (const word of demoted) {
      const rack = calendar.find((r) => canForm(word, r));
      if (!rack) continue; // not formable from any rack; nothing to grade
      const puzzle = puzzleFor(rack);
      const result = validateGuess(word, puzzle, new Set());
      expect(result.kind).toBe('valid');
      if (result.kind === 'valid') expect(result.score).toBeGreaterThan(0);
      expect(classifyWord(word, puzzle)).toBe('uncommon');
    }
  });

  it('does not require rape on any of the 18 racks that used to', () => {
    for (const rack of RAPE_RACKS) {
      expect(canForm('rape', rack)).toBe(true);
      const puzzle = puzzleFor(rack);
      // Off the denominator, but still there to be found and scored.
      expect(puzzle.commonWords.has('rape')).toBe(false);
      expect(validateGuess('rape', puzzle, new Set()).kind).toBe('valid');
    }
  }, 240_000);

  it('fails when a demoted word is planted back into the common pool', () => {
    // The discriminator. Same assertion as above, run against lists where rape
    // was never demoted: it must find rape sitting in the denominator, or the
    // checks above prove nothing.
    const planted: PatchableLists = {
      ...merged,
      common: [...merged.common, 'rape'],
    };
    const puzzle = puzzleWith(planted, 'paradise');
    expect(puzzle.commonWords.has('rape')).toBe(true);
    expect(classifyWord('rape', puzzle)).toBe('set');
  });
});

describe('the floor still holds', () => {
  it('leaves no rack below the set-size floor', () => {
    // rape alone came out of 18 racks, so a rack already near the floor could
    // have fallen under it and made a day thinner than the calendar promises.
    let lowest = Number.POSITIVE_INFINITY;
    for (const rack of calendar) {
      const size = puzzleFor(rack).commonWords.size;
      lowest = Math.min(lowest, size);
      expect(size).toBeGreaterThanOrEqual(MIN_SET_SIZE);
    }
    expect(lowest).toBeGreaterThanOrEqual(MIN_SET_SIZE);
  }, 300_000);
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

/**
 * Bea's eight: vulgar, not slurs.
 *
 * bitch, cunt, slut and whore and their plurals are coarse, several are
 * reclaimed, and each is an ordinary English word with a real meaning. None
 * targets a group the way the denylist exists to address, so none belongs on a
 * list whose purpose is removing slurs. They are accepted and scoreable.
 *
 * They are demoted rather than simply left alone. None is in the common pool
 * today, so the demotion is a no-op right now, and that is the point: it is
 * insurance. The common pool is SCOWL sizes 10 and 20, and widening it to
 * include size 35 would pull six of these eight straight into the completion
 * denominator, where a player would have to type them to finish a rack. The
 * demote rows mean that widening cannot do it quietly.
 */
describe('the vulgar-not-slur eight', () => {
  const VULGAR = [
    'bitch',
    'bitches',
    'cunt',
    'cunts',
    'slut',
    'sluts',
    'whore',
    'whores',
  ] as const;

  it('are all accepted, and none is denied', () => {
    const validation = new Set(merged.enable);
    const deny = new Set(patch.deny);
    for (const word of VULGAR) {
      expect(validation.has(word)).toBe(true);
      expect(deny.has(word)).toBe(false);
    }
  });

  it('are all demoted, so the intent survives a common-pool widening', () => {
    for (const word of VULGAR) expect(demotedSet.has(word)).toBe(true);
  });

  it('are absent from the shipped common pool', () => {
    const common = new Set(merged.common);
    for (const word of VULGAR) expect(common.has(word)).toBe(false);
  });

  it('are in no completion count on any rack that can spell them', () => {
    // Every rack where any of the eight is formable. A word that cannot be
    // formed from a rack cannot be in that rack's set either, so these racks
    // are the whole of where one could appear.
    const racks = calendar.filter((rack) =>
      VULGAR.some((w) => canForm(w, rack)),
    );
    expect(racks.length).toBeGreaterThan(0);

    for (const rack of racks) {
      const puzzle = puzzleFor(rack);
      for (const word of VULGAR) {
        expect(puzzle.commonWords.has(word)).toBe(false);
        // Nor pushed into the tail: each sits inside SCOWL 70, so an off-page
        // find grades uncommon rather than rare or mythic.
        expect(puzzle.rareWords.has(word)).toBe(false);
        expect(puzzle.mythicWords.has(word)).toBe(false);
      }
    }
  }, 240_000);

  it('score and grade off-page wherever a rack can spell them', () => {
    // Only cunt, cunts and slut are reachable from the current calendar. The
    // other five are valid but no daily rack spells them, so there is nothing
    // to grade and nothing to assert beyond acceptance.
    const reachable = VULGAR.filter((w) =>
      calendar.some((rack) => canForm(w, rack)),
    );
    expect([...reachable]).toEqual(['cunt', 'cunts', 'slut']);

    for (const word of reachable) {
      const rack = calendar.find((r) => canForm(word, r)) as string;
      const puzzle = puzzleFor(rack);
      const result = validateGuess(word, puzzle, new Set());
      expect(result.kind).toBe('valid');
      if (result.kind === 'valid') expect(result.score).toBeGreaterThan(0);
      expect(classifyWord(word, puzzle)).toBe('uncommon');
    }
  });

  it('would sit in the denominator if the demotion were not holding', () => {
    // The discriminator. Put cunt back in the common pool and a rack that can
    // spell it requires it, which is what the demote rows exist to prevent.
    const planted: PatchableLists = {
      ...merged,
      common: [...merged.common, 'cunt'],
    };
    const puzzle = puzzleWith(planted, 'chestnut');
    expect(puzzle.commonWords.has('cunt')).toBe(true);
    expect(classifyWord('cunt', puzzle)).toBe('set');
  });
});
