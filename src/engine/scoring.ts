import { RARITY_BONUS, scoreForLength } from './config.ts';
import type { Rung } from './types.ts';

/** Points for a single word, by its length alone (no rarity bonus). */
export function scoreWord(word: string): number {
  return scoreForLength(word.length);
}

/**
 * Points for a found word: its length score plus the rarity bonus for its rung.
 * This is the single scoring path for everything the player earns, so the score,
 * the bar, the glossary, the share, and the reachable total all agree. A set
 * word gets no bonus (the on-page baseline); off-page rungs pay more.
 */
export function findScore(word: string, rung: Rung): number {
  return scoreForLength(word.length) + RARITY_BONUS[rung];
}
