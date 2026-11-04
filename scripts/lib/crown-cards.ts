import type { SourceEntry } from '../../src/data/types.ts';

/** The calendar's epoch, in the shape `DAILY_EPOCH` has. */
export interface EpochDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * The day a calendar index falls on, as `2026-11-04`.
 *
 * Counted in UTC from the epoch, so the name a failure prints doesn't move
 * with the machine's time zone.
 */
export function crownDay(index: number, epoch: EpochDate): string {
  return new Date(Date.UTC(epoch.year, epoch.month - 1, epoch.day + index))
    .toISOString()
    .slice(0, 10);
}

/**
 * Every crown whose card would show no meaning or no origin, as a sentence
 * each, naming the crown and its day. Empty when every card is whole.
 *
 * **No exceptions, unlike the floor.** On 4 November 2026 the crown was
 * `favorite`, and its card carried no origin: orchard had dropped eleven
 * crowns' etymology rows in v1.3.0 for carrying something that wasn't one,
 * and nothing held a crown to having a card. orchard v1.11.0 wrote the
 * eleven. The calendar build refuses a crown without both, beside the floor,
 * so a future trade can't bring a bare card back, and the suite checks the
 * served files the same way.
 */
export function crownCardProblems(
  words: readonly string[],
  pool: readonly SourceEntry[],
  epoch: EpochDate,
): string[] {
  const entries = new Map(pool.map((e) => [e.word, e]));
  const problems: string[] = [];
  words.forEach((word, index) => {
    const entry = entries.get(word);
    const missing: string[] = [];
    if (!entry) {
      missing.push('no entry in source-pool.json');
    } else {
      if (!entry.definition?.trim()) missing.push('no meaning');
      if (!entry.etymology?.trim()) missing.push('no origin');
    }
    if (missing.length > 0) {
      problems.push(
        `${word}, ${crownDay(index, epoch)}: ${missing.join(' and ')}`,
      );
    }
  });
  return problems;
}
