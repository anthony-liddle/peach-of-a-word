import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dayIndex } from '../../src/engine/daily.ts';
import { DATA_RAW_DIR } from './util.ts';

/** The calendar's day zero, as `daily-calendar.json` writes it. */
interface Epoch {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
}

/** One recorded trade: two days, the word each takes, and why. */
export interface CalendarTrade {
  /** The day the trade was made, YYYY-MM-DD. Both days come after it. */
  made: string;
  first: { day: string; word: string };
  second: { day: string; word: string };
  reason: string;
}

/**
 * Parse the committed trade record. Columns: made, first day, the word it
 * takes, second day, the word it takes, reason. Comment lines starting with #
 * and the header row are skipped. Order matters: each trade applies to the
 * calendar the trades above it left.
 */
export function parseTrades(tsv: string): CalendarTrade[] {
  const out: CalendarTrade[] = [];
  for (const line of tsv.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    const [made, firstDay, firstWord, secondDay, secondWord, reason] = line
      .split('\t')
      .map((c) => c.trim());
    if (made === 'made') continue; // header
    if (!made || !firstDay || !firstWord || !secondDay || !secondWord) {
      throw new Error(
        `calendar-trades.tsv: a row is missing a column: ${line}`,
      );
    }
    out.push({
      made,
      first: { day: firstDay, word: firstWord },
      second: { day: secondDay, word: secondWord },
      reason: reason ?? '',
    });
  }
  return out;
}

/** Load the committed trade record from the vendored data directory. */
export async function loadTrades(): Promise<CalendarTrade[]> {
  return parseTrades(
    await readFile(join(DATA_RAW_DIR, 'calendar-trades.tsv'), 'utf8'),
  );
}

/** The calendar index of a YYYY-MM-DD day. */
export function indexOfDay(day: string, epoch: Epoch): number {
  const [y, m, d] = day.split('-').map(Number);
  return dayIndex(new Date(y!, m! - 1, d!), epoch);
}

/**
 * The calendar before the trades: each one undone, last first. Throws, naming
 * the row, if a trade's days do not hold the words it records, which is a
 * calendar that drifted from its record.
 */
export function undoTrades(
  words: readonly string[],
  trades: readonly CalendarTrade[],
  epoch: Epoch,
): string[] {
  const out = [...words];
  for (const t of [...trades].reverse()) {
    const a = indexOfDay(t.first.day, epoch);
    const b = indexOfDay(t.second.day, epoch);
    if (out[a] !== t.first.word || out[b] !== t.second.word) {
      throw new Error(
        `calendar-trades.tsv: ${t.first.day} should hold ${t.first.word} and ` +
          `${t.second.day} ${t.second.word}, but they hold ${out[a]} and ${out[b]}`,
      );
    }
    [out[a], out[b]] = [out[b]!, out[a]!];
  }
  return out;
}

/**
 * Every way the record breaks the amendment: a day not after the day its
 * trade was made, a trade of a day with itself, a day outside the calendar,
 * or a calendar the record does not undo cleanly. Empty when it holds.
 */
export function tradeProblems(
  words: readonly string[],
  trades: readonly CalendarTrade[],
  epoch: Epoch,
): string[] {
  const problems: string[] = [];
  for (const t of trades) {
    const made = indexOfDay(t.made, epoch);
    for (const { day } of [t.first, t.second]) {
      const i = indexOfDay(day, epoch);
      if (!(i > made))
        problems.push(`${day} was not still to come on ${t.made}`);
      if (!(i >= 0 && i < words.length))
        problems.push(`${day} is outside the calendar`);
    }
    if (t.first.day === t.second.day)
      problems.push(`${t.first.day} trades with itself`);
  }
  try {
    undoTrades(words, trades, epoch);
  } catch (err) {
    problems.push((err as Error).message);
  }
  return problems;
}
