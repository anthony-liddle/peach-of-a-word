import { classifyWord, computeTier, type Puzzle } from '@/engine/index.ts';
import type { Theme } from '../useTheme.ts';
import { crownName, tierName } from '../themeCopy.ts';
import type { DailyShareResult, EndlessShareResult } from './shareText.ts';

/**
 * The mode-agnostic core of a share result: the counts, the point split, the
 * tier headline, and the raw words. Both modes read from here, so neither can
 * drift from the display or from each other.
 *
 * Points come from the single scoring path: computeTier sums the rarity-aware
 * findScore into the TierStanding the bar and totals already render, so the
 * shared points and split match the display by construction and no length-only
 * path can creep back in. The source word is a set word, so its points and its
 * place in the count fall under the set, never off-page.
 *
 * The earned tier headline is computed the same way the app's TierMeter shows
 * it: the completion crown once every common word is found, otherwise the
 * current named rank, both theme-skinned from the tier-name source. So the share
 * headline matches what the player saw, in whichever theme they played.
 */
function baseResult(
  puzzle: Puzzle,
  found: readonly string[],
  title: string,
  theme: Theme,
) {
  let uncommon = 0;
  let rare = 0;
  let mythic = 0;

  for (const word of found) {
    // Set words are counted from the tier below, not here; they still short
    // circuit so a set word is never handed to the rung classifier.
    if (puzzle.commonWords.has(word)) continue;
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

  const tier = computeTier(new Set(found), puzzle);
  const completed = tier.setTotal > 0 && tier.setFound >= tier.setTotal;
  const tierLabel = completed ? crownName(theme) : tierName(theme, tier.index);

  return {
    title,
    tierLabel,
    // The completion count reaches the share's tier line, so it comes from the
    // standing the in-app counter and the bar already read, never a second
    // tally alongside it.
    setFound: tier.setFound,
    setTotal: tier.setTotal,
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

/**
 * The daily share result. Reproducible, so the answer stays hidden: it carries
 * the date for the identifier line and has no source-word affordance at all, so
 * the source word cannot reach a daily share.
 */
export function dailyShareResult(
  puzzle: Puzzle,
  found: readonly string[],
  date: Date,
  title: string,
  theme: Theme,
): DailyShareResult {
  return {
    mode: 'daily',
    date,
    ...baseResult(puzzle, found, title, theme),
  };
}

/**
 * The endless share result. Not reproducible, so nothing to spoil: it labels
 * itself Endless instead of a date and flags the source word for the headline
 * flex, but only once the player has actually found it, so an unearned word is
 * never shown and an in-progress board is never spoiled to its own player.
 */
export function endlessShareResult(
  puzzle: Puzzle,
  found: readonly string[],
  title: string,
  theme: Theme,
): EndlessShareResult {
  return {
    mode: 'endless',
    showSourceWord: found.includes(puzzle.sourceWord),
    ...baseResult(puzzle, found, title, theme),
  };
}
