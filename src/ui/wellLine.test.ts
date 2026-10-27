import { describe, expect, it } from 'vitest';
import type { Rung } from '@/engine/index.ts';
import { findLine, type WellLine } from './wellLine.ts';

/**
 * The shared parity fixture: finds on 24 October 2026's board, `literary`.
 *
 * **These exact inputs and lines are also `fixture` in the Swift repo's
 * `Tests/PeachEngineTests/WellLineTests.swift`.** Change one and change the
 * other, or the two platforms' lines can drift apart with both suites still
 * green. The spoken form here is the find alone: the announcement adds
 * " New rank." or the completion line after it, which the app says elsewhere.
 * The name is what the line is called as a button.
 */
const FIXTURE: readonly (readonly [string, number, Rung, WellLine])[] = [
  [
    'tel',
    5,
    'mythic',
    {
      mark: 'mythic',
      shown: 'tel, 5 points',
      spoken: 'Mythic find: tel, 5 points.',
      name: 'Mythic find: tel, 5 points',
    },
  ],
  [
    'relit',
    9,
    'mythic',
    {
      mark: 'mythic',
      shown: 'relit, 9 points',
      spoken: 'Mythic find: relit, 9 points.',
      name: 'Mythic find: relit, 9 points',
    },
  ],
  [
    'aret',
    5,
    'rare',
    {
      mark: 'rare',
      shown: 'aret, 5 points',
      spoken: 'Rare find: aret, 5 points.',
      name: 'Rare find: aret, 5 points',
    },
  ],
  [
    'airt',
    4,
    'uncommon',
    {
      mark: 'uncommon',
      shown: 'airt, 4 points',
      spoken: 'Uncommon find: airt, 4 points.',
      name: 'Uncommon find: airt, 4 points',
    },
  ],
  [
    'early',
    5,
    'set',
    {
      mark: null,
      shown: 'early, 5 points',
      spoken: 'early, 5 points.',
      name: 'early, 5 points',
    },
  ],
  [
    'lay',
    1,
    'set',
    {
      mark: null,
      shown: 'lay, 1 point',
      spoken: 'lay, 1 point.',
      name: 'lay, 1 point',
    },
  ],
];

describe("the well's line", () => {
  it("matches the app's lines, character for character, on the same finds", () => {
    for (const [word, points, rung, line] of FIXTURE) {
      expect(findLine(word, points, rung), word).toEqual(line);
    }
  });

  it.each(['uncommon', 'rare', 'mythic'] as const)(
    'leads a %s find with its own mark',
    (rung) => {
      const line = findLine('tel', 5, rung);
      expect(line.mark).toBe(rung);
      expect(line.shown).toBe('tel, 5 points');
    },
  );

  it('gives a word in the basket no mark', () => {
    expect(findLine('lay', 1, 'set').mark).toBeNull();
  });

  // A mark read aloud says nothing useful, so the rarity is said in words.
  it.each([
    ['uncommon', 'Uncommon'],
    ['rare', 'Rare'],
    ['mythic', 'Mythic'],
  ] as const)('names a %s find in words when spoken', (rung, name) => {
    expect(findLine('tel', 5, rung).spoken).toBe(
      `${name} find: tel, 5 points.`,
    );
  });

  // A button's name is not a sentence, so it is the spoken form without its
  // closing period.
  it('names the line as a button by its spoken form, without the period', () => {
    for (const [word, points, rung] of FIXTURE) {
      const line = findLine(word, points, rung);
      expect(line.name, word).toBe(line.spoken.slice(0, -1));
    }
  });
});
