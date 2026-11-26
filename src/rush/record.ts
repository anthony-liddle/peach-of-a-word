/**
 * What a run keeps once it ends, and how it's said: its words, its points,
 * whether it found the peach of a word, and its best word.
 */
import {
  classifyWord,
  computeTier,
  findScore,
  type Puzzle,
} from '@/engine/index.ts';
import type { RunRecord } from '@/persistence/storage.ts';

/** The run's best word: the most points, then the longer, then the first found. */
export function bestWord(
  found: readonly string[],
  puzzle: Puzzle,
): { word: string; points: number } | null {
  let best: { word: string; points: number } | null = null;
  for (const word of found) {
    const points = findScore(word, classifyWord(word, puzzle));
    if (
      !best ||
      points > best.points ||
      (points === best.points && word.length > best.word.length)
    ) {
      best = { word, points };
    }
  }
  return best;
}

/**
 * The record a run keeps. Its points are the basket's own sum for the same
 * words, so the run and the basket never disagree about a word's worth. The
 * card is owed when the run found the peach of a word.
 */
export function recordOf({
  puzzle,
  found,
  endedEarly,
  leftMs,
  clockMs,
}: {
  puzzle: Puzzle;
  found: readonly string[];
  endedEarly: boolean;
  leftMs: number;
  clockMs: number;
}): RunRecord {
  const words = found.filter((w) => puzzle.validationWords.has(w));
  const peach = words.includes(puzzle.sourceWord);
  return {
    sourceWord: puzzle.sourceWord,
    words,
    points: computeTier(new Set(words), puzzle).score,
    peach,
    best: bestWord(words, puzzle),
    endedEarly,
    leftMs: Math.round(leftMs),
    clockMs,
    peachCardOwed: peach,
  };
}

function counted(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

/** "14 words · 57 points", as the result and the share say it. */
export function runTally(run: Pick<RunRecord, 'words' | 'points'>): string {
  return `${counted(run.words.length, 'word')} · ${counted(run.points, 'point')}`;
}

export const TIMES_UP = "Time's up";

/** Said as the clock runs out: "Time's up. 14 words, 57 points." */
export function timesUpLine(run: Pick<RunRecord, 'words' | 'points'>): string {
  return `${TIMES_UP}. ${counted(run.words.length, 'word')}, ${counted(run.points, 'point')}.`;
}
