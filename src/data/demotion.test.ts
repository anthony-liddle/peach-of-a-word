import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyWord,
  createPuzzle,
  validateGuess,
  MIN_SET_SIZE,
  type Puzzle,
} from '@/engine/index.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import { applyPatch, parsePatch, type PatchableLists } from './patch.ts';

/**
 * Demotion, asserted end to end against the committed assets.
 *
 * The property, and it is a narrow one: a demoted word is no longer REQUIRED,
 * and is otherwise untouched. Completion, par and the rarity bands must forget
 * it; validation and scoring must not. Denial would have been the easy answer
 * and the wrong one, because these are real words a player may reasonably find.
 */
function readList(name: string): string[] {
  return readFileSync(`public/data/${name}`, 'utf8')
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
}

const patchText = readFileSync('public/data/dictionary-patch.tsv', 'utf8');
const patch = parsePatch(patchText);
const base: PatchableLists = {
  enable: [...readList('enable.txt'), ...readList('scowl95-additions.txt')],
  common: readList('common-pool.txt'),
  beyond70: readList('beyond-size-70.txt'),
  beyond95: readList('beyond-size-95.txt'),
};
const merged = applyPatch(base, patch);
const calendar = (
  JSON.parse(readFileSync('public/data/daily-calendar.json', 'utf8')) as {
    words: string[];
  }
).words;

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
  it('demotes the fourteen decided words', () => {
    expect(demoted).toHaveLength(14);
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
    const originalCommon = new Set(base.common);
    for (const word of demoted) expect(originalCommon.has(word)).toBe(true);
  });

  it('takes every one out of the common pool', () => {
    const common = new Set(merged.common);
    for (const word of demoted) expect(common.has(word)).toBe(false);
  });

  it('is demotion and not denial: all fourteen stay in validation', () => {
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
    const planted = applyPatch(base, {
      allow: [],
      deny: patch.deny,
      demote: patch.demote.filter((w) => w !== 'rape'),
    });
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
