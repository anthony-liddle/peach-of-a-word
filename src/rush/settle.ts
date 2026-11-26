/**
 * A run left waiting on an earlier day, settled before the game reads the
 * save: it ends with what it had, is kept as that day's run, and carries its
 * words into that day's basket. Its day counts for the streak by the same rule
 * a find on that day would, so a day older than the last one cleared moves
 * nothing and a later streak stands (`recordDailyCleared`). A peach of a word
 * it found is owed its card, which opens once on the first screen after.
 *
 * A page left open past midnight keeps the day it opened on, as the board
 * does, so this only ever settles a run at the next load.
 */
import {
  computeTier,
  createPuzzle,
  dayIndex,
  STORAGE_EPOCH,
  STREAK_TIER_INDEX,
} from '@/engine/index.ts';
import type { GameData } from '@/data/gameData.ts';
import type { GameStorage, RunRecord } from '@/persistence/storage.ts';
import { recordOf } from './record.ts';

export function settleOldRun(
  data: GameData,
  storage: GameStorage,
  today = new Date(),
): void {
  const f = storage.loadRunInFlight();
  if (!f || f.dayIndex >= dayIndex(today, STORAGE_EPOCH)) return;
  const puzzle = createPuzzle(
    f.sourceWord,
    data.dictionary,
    data.commonPool,
    data.beyond70Pool,
    data.beyond95Pool,
  );
  const record = recordOf({
    puzzle,
    found: f.words,
    endedEarly: true,
    leftMs: f.leftMs,
    clockMs: f.clockMs,
  });
  // Kept first, which also clears the flight; a run already kept for that
  // day, by a tab that ended it, stands, and this one only clears.
  if (!storage.saveRun(f.dayIndex, record)) {
    storage.saveRunInFlight(null);
    return;
  }
  const basket = storage.saveDayProgress(
    f.dayIndex,
    f.sourceWord,
    record.words,
    (w) => puzzle.validationWords.has(w),
  );
  if (computeTier(new Set(basket), puzzle).index >= STREAK_TIER_INDEX)
    storage.recordDailyCleared(f.dayIndex);
}

/** An earlier day's run whose peach of a word's card hasn't opened yet. */
export function owedOldPeach(
  storage: GameStorage,
  todayIndex: number,
): { dayIndex: number; record: RunRecord } | null {
  for (const [key, record] of Object.entries(storage.allRuns())) {
    const day = Number(key);
    if (day < todayIndex && record.peachCardOwed)
      return { dayIndex: day, record };
  }
  return null;
}
