import { describe, expect, test } from 'vitest';
import { computeTier, type Puzzle } from '@/engine/index.ts';
import { dailyShareResult, endlessShareResult } from './shareResult.ts';

/**
 * A small hand-built puzzle. Set words score by length (3=1, 4=3, 8=15); the
 * three off-page bands hold one word each so the rung counts are unambiguous.
 */
function testPuzzle(): Puzzle {
  const commonWords = new Set(['NOTECASE', 'NOTE', 'TONE', 'CAT']);
  const uncommonWords = new Set(['OCAS']);
  const rareWords = new Set(['NAE']);
  const mythicWords = new Set(['ETA']);
  const validationWords = new Set([
    ...commonWords,
    ...uncommonWords,
    ...rareWords,
    ...mythicWords,
  ]);
  return {
    sourceWord: 'NOTECASE',
    letters: 'ACENOST',
    validationWords,
    commonWords,
    uncommonWords,
    rareWords,
    mythicWords,
    reachableScore: 0,
  };
}

describe('dailyShareResult', () => {
  test('derives the counts and the point split from puzzle and finds', () => {
    const found = ['NOTECASE', 'NOTE', 'OCAS', 'NAE'];
    const result = dailyShareResult(
      testPuzzle(),
      found,
      new Date(2026, 5, 18),
      'Peach of a Word',
      'cute',
    );

    expect(result.title).toBe('Peach of a Word');
    expect(result.setFound).toBe(2);
    expect(result.setTotal).toBe(4);
    expect(result.uncommon).toBe(1);
    expect(result.rare).toBe(1);
    expect(result.mythic).toBe(0);
    // NOTECASE 15 + NOTE 3 = 18 set points (no bonus on the set). Off-page carries
    // the rarity bonus, matching the display: OCAS 3+1 uncommon, NAE 1+2 rare = 7.
    expect(result.setPoints).toBe(18);
    expect(result.offPagePoints).toBe(7);
    expect(result.totalPoints).toBe(25);
  });

  describe('reads its points from the tier standing the display renders', () => {
    // reachableScore is irrelevant to the point totals (they are the summed
    // findScore, not a fraction), but set it to a real value so the tier we
    // compare against is built exactly as useGame builds state.tier.
    const puzzle: Puzzle = { ...testPuzzle(), reachableScore: 40 };

    test('total equals the tier score for a rack with off-page finds', () => {
      const found = ['NOTECASE', 'NOTE', 'OCAS', 'NAE', 'ETA'];
      const tier = computeTier(new Set(found), puzzle);
      const result = dailyShareResult(
        puzzle,
        found,
        new Date(2026, 5, 18),
        'Peach of a Word',
        'cute',
      );
      expect(result.totalPoints).toBe(tier.score);
    });

    test('set and off-page split match the tier split', () => {
      const found = ['NOTECASE', 'NOTE', 'OCAS', 'NAE', 'ETA'];
      const tier = computeTier(new Set(found), puzzle);
      const result = dailyShareResult(
        puzzle,
        found,
        new Date(2026, 5, 18),
        'Peach of a Word',
        'cute',
      );
      expect(result.setPoints).toBe(tier.setPoints);
      expect(result.offPagePoints).toBe(tier.offPagePoints);
    });

    test('total still matches the tier when there are no off-page finds', () => {
      const found = ['NOTECASE', 'NOTE', 'CAT'];
      const tier = computeTier(new Set(found), puzzle);
      const result = dailyShareResult(
        puzzle,
        found,
        new Date(2026, 5, 18),
        'Peach of a Word',
        'cute',
      );
      expect(result.totalPoints).toBe(tier.score);
      expect(result.offPagePoints).toBe(0);
    });

    test('total is not the length-only sum when off-page finds exist', () => {
      const found = ['NOTECASE', 'NOTE', 'OCAS', 'NAE', 'ETA'];
      // The exact bug that shipped: the length-only sum omits the rarity bonus.
      const lengthOnly = found.reduce((sum, w) => {
        const byLength: Record<number, number> = { 3: 1, 4: 3, 8: 15 };
        return sum + (byLength[w.length] ?? 0);
      }, 0);
      const result = dailyShareResult(
        puzzle,
        found,
        new Date(2026, 5, 18),
        'Peach of a Word',
        'cute',
      );
      expect(result.totalPoints).not.toBe(lengthOnly);
    });
  });

  test('counts the source word toward the set, never off-page', () => {
    const result = dailyShareResult(
      testPuzzle(),
      ['NOTECASE'],
      new Date(2026, 5, 18),
      'Peach of a Word',
      'cute',
    );
    expect(result.setFound).toBe(1);
    expect(result.uncommon + result.rare + result.mythic).toBe(0);
    expect(result.setPoints).toBe(15);
    expect(result.offPagePoints).toBe(0);
  });

  test('carries the source word and found words for spoiler checks', () => {
    const found = ['NOTE', 'OCAS'];
    const result = dailyShareResult(
      testPuzzle(),
      found,
      new Date(2026, 5, 18),
      'Peach of a Word',
      'cute',
    );
    expect(result.sourceWord).toBe('NOTECASE');
    expect(result.foundWords).toEqual(found);
  });

  describe('the earned tier headline', () => {
    test('is the completion crown once every common word is found', () => {
      const found = ['NOTECASE', 'NOTE', 'TONE', 'CAT'];
      const cute = dailyShareResult(
        testPuzzle(),
        found,
        new Date(2026, 5, 18),
        'Peach of a Word',
        'cute',
      );
      const classic = dailyShareResult(
        testPuzzle(),
        found,
        new Date(2026, 5, 18),
        'Peach of a Word',
        'letterpress',
      );
      // All four common words found: the crown, theme-skinned.
      expect(cute.setFound).toBe(cute.setTotal);
      expect(cute.tierLabel).toBe('Peachy Keen Supreme');
      expect(classic.tierLabel).toBe('The Complete Works');
    });

    test('is the current named rank on an incomplete board, theme-skinned', () => {
      // reachableScore 30, one 8-letter set word (15 points) is fraction 0.50,
      // which lands on rank index 3 of the six-rung ladder. Not completed, since
      // only one of several common words is found: a rank headline, not a crown.
      const puzzle: Puzzle = { ...testPuzzle(), reachableScore: 30 };
      const cute = dailyShareResult(
        puzzle,
        ['NOTECASE'],
        new Date(2026, 5, 18),
        'Peach of a Word',
        'cute',
      );
      const classic = dailyShareResult(
        puzzle,
        ['NOTECASE'],
        new Date(2026, 5, 18),
        'Peach of a Word',
        'letterpress',
      );
      expect(cute.setFound).toBeLessThan(cute.setTotal);
      expect(cute.tierLabel).toBe('Ripening');
      expect(classic.tierLabel).toBe('Press Run');
    });
  });
});

describe('endlessShareResult', () => {
  const puzzle: Puzzle = { ...testPuzzle(), reachableScore: 40 };

  test('is an endless result, not a daily one', () => {
    const result = endlessShareResult(
      puzzle,
      ['NOTECASE', 'OCAS'],
      'Peach of a Word',
      'cute',
    );
    expect(result.mode).toBe('endless');
  });

  test('shows the source word once the player has found it', () => {
    const result = endlessShareResult(
      puzzle,
      ['NOTECASE', 'OCAS'],
      'Peach of a Word',
      'cute',
    );
    expect(result.showSourceWord).toBe(true);
    expect(result.sourceWord).toBe('NOTECASE');
  });

  test('withholds the source word until the player has found it', () => {
    const result = endlessShareResult(
      puzzle,
      ['NOTE', 'OCAS'],
      'Peach of a Word',
      'cute',
    );
    expect(result.showSourceWord).toBe(false);
  });

  test('reads its points from the tier standing, like the daily', () => {
    const found = ['NOTECASE', 'NOTE', 'OCAS', 'NAE', 'ETA'];
    const tier = computeTier(new Set(found), puzzle);
    const result = endlessShareResult(puzzle, found, 'Peach of a Word', 'cute');
    expect(result.totalPoints).toBe(tier.score);
    expect(result.setPoints).toBe(tier.setPoints);
    expect(result.offPagePoints).toBe(tier.offPagePoints);
  });
});
