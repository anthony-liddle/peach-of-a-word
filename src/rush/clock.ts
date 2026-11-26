/**
 * Peach rush's clock, as arithmetic. Nothing here reads a timer, so each rule
 * is tested with plain numbers. The run reads `performance.now()`, a clock
 * that only moves forward, so changing the computer's time moves nothing.
 */

/** Bea's 1:30, and Longer clock's 3:00, as the app has them. */
export const RUN_MS = 90_000;
export const LONGER_RUN_MS = 180_000;

export function runLength(longerClock: boolean): number {
  return longerClock ? LONGER_RUN_MS : RUN_MS;
}

/** What's left on a clock that reads 0:00 at `endsAt`, at `now`. */
export function timeLeft(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

/** "1:05", rounding up, so 0:00 means the clock has run out. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1 minute 5 seconds", for the clock's spoken name and the time's lines. */
export function clockSpoken(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (r > 0 || m === 0) parts.push(`${r} ${r === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}

export interface Mark {
  at: number;
  said: string;
}

/** The moments the time left is said, never every second. */
export const MARKS: readonly Mark[] = [
  { at: 60_000, said: '1 minute left.' },
  { at: 30_000, said: '30 seconds left.' },
  { at: 10_000, said: '10 seconds left.' },
];

/**
 * The mark the clock passed between two readings, or null. A mark is said
 * only within a second of it, so after a stall that jumps past one, as a
 * phone asleep might, the mark already gone by stays unsaid, as the app
 * decided.
 */
export function markPassed(before: number, now: number): Mark | null {
  return (
    MARKS.find((m) => before > m.at && now <= m.at && now > m.at - 1000) ?? null
  );
}

export const PAUSED_LINE = 'Paused.';

export function startedLine(ms: number): string {
  return `Started. ${clockSpoken(ms)} on the clock.`;
}

export function resumedLine(ms: number): string {
  return `Resumed. ${clockSpoken(ms)} left.`;
}
