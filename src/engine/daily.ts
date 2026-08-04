import { DAILY_EPOCH } from './config.ts';
import { seededPermutation } from './shuffle.ts';

interface EpochDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
}

/**
 * Whole calendar days from the epoch to the given local date.
 *
 * Built from the calendar Y/M/D components via UTC timestamps, never from
 * (now - epoch) / dayMs. Dividing milliseconds drifts across daylight-saving
 * boundaries and would make the daily differ on reload. This is rollover at
 * local midnight: a one-person audience, so simpler than a fixed time zone.
 */
export function dayIndex(date: Date, epoch: EpochDate = DAILY_EPOCH): number {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const start = Date.UTC(epoch.year, epoch.month - 1, epoch.day);
  return Math.floor((today - start) / 86_400_000);
}

/** A well-distributed seed for a reshuffled cycle. Cycle 0 never reaches here. */
function seedForCycle(cycle: number): number {
  return (cycle * 0x9e3779b1) >>> 0;
}

/**
 * The index order for a cycle over a calendar of n words.
 *
 * Cycle 0 is the committed calendar order itself (identity), so the first pass
 * plays the frozen sequence exactly as generated. Every later cycle is a fresh
 * deterministic permutation, and its first word is forced to differ from the
 * previous cycle's last word so no word repeats across a cycle boundary.
 */
function cycleOrder(cycle: number, n: number): number[] {
  if (cycle === 0) return Array.from({ length: n }, (_, i) => i);
  const order = seededPermutation(n, seedForCycle(cycle));
  if (n < 2) return order;
  const prevLast = cycleOrder(cycle - 1, n)[n - 1]!;
  if (order[0] === prevLast) {
    [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

/**
 * The source word for a given day, read from the frozen daily calendar.
 *
 * The day index splits into a cycle and a position. The first cycle is the
 * calendar in its committed order; once exhausted, each later cycle is a fresh
 * deterministic shuffle, so the sequence never repeats a word within a pass and
 * never repeats across a pass boundary. Appending words to the calendar leaves
 * every first-cycle day fixed, which is the whole point of the freeze.
 */
export function dailySourceWord(
  calendar: readonly string[],
  date: Date,
  epoch: EpochDate = DAILY_EPOCH,
): string {
  if (calendar.length === 0) throw new Error('Daily calendar is empty.');
  const index = dayIndex(date, epoch);
  // Guard against pre-epoch dates by flooring at cycle/position 0.
  const safeIndex = Math.max(0, index);
  const n = calendar.length;
  const cycle = Math.floor(safeIndex / n);
  const position = safeIndex % n;
  return calendar[cycleOrder(cycle, n)[position]!]!;
}

export interface EndlessSourceOptions {
  /** A word this source must never draw, in practice today's daily word. */
  readonly exclude?: string | undefined;
  /** The word already on screen, so the very first draw differs from it. */
  readonly previous?: string | undefined;
  /** Injectable for testing. One call per pass, to seed that pass's shuffle. */
  readonly rng?: () => number;
}

/**
 * A source of endless words that draws without replacement.
 *
 * Each pass is a fresh shuffle of the pool, handed out one word at a time, so no
 * word repeats until the pool is exhausted. Reaching the end reshuffles, and the
 * first word of the new pass is forced to differ from the last of the old, which
 * is the same boundary rule the daily cycle uses. The pool is the eligible daily
 * calendar minus the excluded word, so a sub-floor word can never headline
 * endless and endless can never serve the day's daily rack.
 *
 * The daily's `cycleOrder` is deliberately not reused: its cycle 0 is the
 * identity permutation, so endless would replay the committed calendar order,
 * which is precisely the daily's own sequence. Both share `seededPermutation`
 * and the boundary rule; only the ordering of the first pass differs.
 *
 * The returned function owns the cursor, so a cycle lives as long as the source.
 */
export function createEndlessSource(
  calendar: readonly string[],
  { exclude, previous, rng = Math.random }: EndlessSourceOptions = {},
): () => string {
  if (calendar.length === 0) throw new Error('Daily calendar is empty.');
  const remaining = calendar.filter((word) => word !== exclude);
  // A calendar of only the excluded word still has to deal something.
  const pool = remaining.length > 0 ? remaining : calendar;
  const n = pool.length;

  let order: number[] = [];
  let position = n; // Out of range, so the first draw shuffles.
  let last = previous;

  return () => {
    if (position >= n) {
      order = seededPermutation(n, Math.floor(rng() * 0x1_0000_0000));
      if (n > 1 && pool[order[0]!] === last) {
        [order[0], order[1]] = [order[1]!, order[0]!];
      }
      position = 0;
    }
    const word = pool[order[position]!]!;
    position += 1;
    last = word;
    return word;
  };
}
