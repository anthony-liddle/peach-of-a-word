import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RACK_ROW,
  dailyRackOrder,
  guardedRackOrder,
  rackGivesAway,
} from './rack.ts';

const CALENDAR: string[] = JSON.parse(
  readFileSync('public/data/daily-calendar.json', 'utf8'),
).words;

const sortLetters = (word: string) => [...word].sort().join('');
const render = (order: readonly number[], letters: string) =>
  order.map((i) => letters[i]).join('');

/** The permutation that undoes the sort, i.e. the rack that spells the word. */
function revealingOrder(word: string): number[] {
  const pool = [...sortLetters(word)].map((letter, i) => ({ letter, i }));
  return [...word].map((letter) => {
    const at = pool.findIndex((t) => t.letter === letter);
    return pool.splice(at, 1)[0]!.i;
  });
}

describe('rackGivesAway', () => {
  it('rejects the order that spells the whole word', () => {
    const word = 'pavement';
    expect(rackGivesAway(revealingOrder(word), sortLetters(word), word)).toBe(
      true,
    );
  });

  it('rejects a top row of PAVE over a scrambled second row', () => {
    const word = 'pavement';
    const letters = sortLetters(word);
    const order = revealingOrder(word);
    // Scramble only the bottom row; the visible top row still reads PAVE.
    const hinted = [
      ...order.slice(0, RACK_ROW),
      ...order.slice(RACK_ROW).reverse(),
    ];
    expect(render(hinted, letters).slice(0, RACK_ROW)).toBe('pave');
    expect(rackGivesAway(hinted, letters, word)).toBe(true);
  });

  it('accepts the identity permutation, which spells the sorted letters', () => {
    // The rack is sorted, so identity is AEEMNPTV and gives nothing away. No
    // calendar word is already alphabetical, so this holds for all 626.
    const word = 'pavement';
    const letters = sortLetters(word);
    const identity = [...letters].map((_, i) => i);
    expect(render(identity, letters)).toBe('aeemnptv');
    expect(rackGivesAway(identity, letters, word)).toBe(false);
  });
});

describe('guardedRackOrder', () => {
  it('redraws past a revealing draw', () => {
    const word = 'pavement';
    const letters = sortLetters(word);
    const draws = [revealingOrder(word), [...letters].map((_, i) => i)];
    const order = guardedRackOrder(letters, word, (attempt) => draws[attempt]!);
    expect(render(order, letters)).toBe('aeemnptv');
  });

  it('escapes even when every draw reveals, rather than spinning', () => {
    const word = 'pavement';
    const letters = sortLetters(word);
    const order = guardedRackOrder(letters, word, () => revealingOrder(word));
    expect(rackGivesAway(order, letters, word)).toBe(false);
  });
});

describe('dailyRackOrder', () => {
  it('deals these exact racks, pinning the seed derivation', () => {
    // The Swift engine ships generated fixtures of THIS function's output
    // (Tests/PeachEngineTests/RackParityVectors.swift). Those alone only catch
    // Swift drifting from TypeScript: regenerating them after a change here
    // would move both sides in step and let the two engines diverge in
    // production unnoticed. These hardcoded rows are the other half of the
    // clamp, so changing the seeding fails here first and the regeneration has
    // to be deliberate. If you are here because this failed: re-run
    // `node scripts/rack-parity.mjs` into the Swift repo in the SAME change.
    const pinned: Record<string, string> = {
      pavement: 'teeapvnm',
      mnemonic: 'omemicnn',
      validity: 'talydvii',
      conflict: 'ccfliotn',
    };
    for (const [word, rack] of Object.entries(pinned)) {
      const letters = sortLetters(word);
      expect(render(dailyRackOrder(letters, word), letters)).toBe(rack);
    }
  });

  it('gives an empty rack away to nobody', () => {
    // Degenerate input no eight-letter word reaches, pinned because the Swift
    // port must return the same thing and silently disagreed here once.
    expect(rackGivesAway([], '', '')).toBe(false);
  });

  it('is a pure function of the word, so every player opens the same rack', () => {
    for (const word of CALENDAR.slice(0, 20)) {
      const letters = sortLetters(word);
      expect(dailyRackOrder(letters, word)).toEqual(
        dailyRackOrder(letters, word),
      );
    }
  });

  it('is a genuine permutation of the rack for all 626 calendar words', () => {
    for (const word of CALENDAR) {
      const letters = sortLetters(word);
      const order = dailyRackOrder(letters, word);
      expect([...order].sort((a, b) => a - b)).toEqual(
        letters.split('').map((_, i) => i),
      );
      expect(sortLetters(render(order, letters))).toBe(letters);
    }
  });

  it('never leads with the crown, across the whole calendar', () => {
    // The regression this file exists for. Unguarded, the expected count here
    // is 0.04 full spells and 0.80 top rows per pass; a real player hit the
    // first of those (PAVE / MENT) on a live morning.
    const leaks = CALENDAR.filter((word) => {
      const letters = sortLetters(word);
      return rackGivesAway(dailyRackOrder(letters, word), letters, word);
    });
    expect(leaks).toEqual([]);
  });
});
