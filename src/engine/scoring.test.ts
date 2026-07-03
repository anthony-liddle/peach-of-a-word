import { describe, expect, it } from 'vitest';
import { findScore, scoreWord } from './scoring.ts';

describe('scoreWord', () => {
  it('follows the GDD curve: 3=1, 4=3, 5=5, 6=7, 7=11, 8=15', () => {
    expect(scoreWord('cat')).toBe(1);
    expect(scoreWord('cats')).toBe(3);
    expect(scoreWord('scale')).toBe(5);
    expect(scoreWord('scaled')).toBe(7);
    expect(scoreWord('scalene')).toBe(11);
    expect(scoreWord('serenade')).toBe(15);
  });

  it('scores below the minimum length as zero', () => {
    expect(scoreWord('at')).toBe(0);
    expect(scoreWord('')).toBe(0);
  });
});

describe('findScore', () => {
  it('adds the rarity bonus on top of the length curve, none for a set word', () => {
    // A set word is the on-page baseline: length only, no bonus.
    expect(findScore('cat', 'set')).toBe(1);
    expect(findScore('serenade', 'set')).toBe(15);
    // Off-page finds pay more: length plus the draft rung bonus (1 / 2 / 4).
    expect(findScore('cat', 'uncommon')).toBe(1 + 1);
    expect(findScore('scale', 'rare')).toBe(5 + 2);
    expect(findScore('scaled', 'mythic')).toBe(7 + 4);
  });
});
