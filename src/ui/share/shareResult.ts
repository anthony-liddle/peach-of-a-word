import { classifyWord, computeTier, type Puzzle } from '@/engine/index.ts';
import type { Theme } from '../useTheme.ts';
import { crownName, tierName } from '../tierNames.ts';
import type { DailyShareResult } from './shareText.ts';

/**
 * Derive the day's share result from the puzzle and the found words. Pure: the
 * same counts and point split the glossary summary shows, in the shape the
 * builder consumes. The source word is a set word, so its points and its place
 * in the count fall under the set, never off-page.
 *
 * The earned tier headline is computed the same way the app's TierMeter shows
 * it: the completion crown once every common word is found, otherwise the
 * current named rank, both theme-skinned from the tier-name source. So the share
 * headline matches what the player saw, in whichever theme they played.
 */
export function dailyShareResult(
  puzzle: Puzzle,
  found: readonly string[],
  date: Date,
  title: string,
  theme: Theme,
): DailyShareResult {
  let setFound = 0;
  let uncommon = 0;
  let rare = 0;
  let mythic = 0;

  for (const word of found) {
    if (puzzle.commonWords.has(word)) {
      setFound += 1;
      continue;
    }
    switch (classifyWord(word, puzzle)) {
      case 'uncommon':
        uncommon += 1;
        break;
      case 'rare':
        rare += 1;
        break;
      case 'mythic':
        mythic += 1;
        break;
    }
  }

  // The single source for every points surface. The bar and the totals already
  // read this standing; the share reads it too, so the shared points and split
  // are rarity-aware and identical to the display by construction. computeTier
  // is pure in (found, puzzle), so this is value-identical to the state.tier the
  // page renders, built from the same found array.
  const tier = computeTier(new Set(found), puzzle);

  // The headline, exactly as TierMeter labels it: crown on completion (every
  // common word found), otherwise the current named rank.
  const completed = tier.setTotal > 0 && tier.setFound >= tier.setTotal;
  const tierLabel = completed ? crownName(theme) : tierName(theme, tier.index);

  return {
    title,
    date,
    tierLabel,
    setFound,
    setTotal: puzzle.commonWords.size,
    uncommon,
    rare,
    mythic,
    setPoints: tier.setPoints,
    offPagePoints: tier.offPagePoints,
    totalPoints: tier.score,
    sourceWord: puzzle.sourceWord,
    foundWords: found,
  };
}
