import type { GameStorage } from '@/persistence/storage.ts';

/**
 * A streak as the transfer page moves it: how many days, and the day it was
 * last extended, counted from STORAGE_EPOCH on both sides. The app needs both.
 * A count alone would read as broken the next morning, with no day to extend.
 */
export interface TransferStreak {
  readonly count: number;
  readonly lastClearedDayIndex: number;
}

/**
 * The link's version, which the app requires and checks
 * (`StreakTransfer.swift`). Its parser refuses a link without it, or with any
 * other value, rather than read fields from a format it doesn't know.
 */
const VERSION = '1';

/** The link's host, the one the live app reads. Any other it ignores. */
const HOST = 'streak';

const isDay = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** The streak this browser's save holds, whether or not it's still going. */
export function streakInSave(storage: GameStorage): TransferStreak | null {
  const saved = storage.savedStreak();
  if (!saved) return null;
  const { count, lastClearedDayIndex } = saved;
  if (count <= 0 || !isDay(lastClearedDayIndex)) return null;
  return { count, lastClearedDayIndex };
}

/** Digits only: no sign, no fraction, no trailing text, as the app's `Int(_:)`. */
const WHOLE = /^\d+$/;

/**
 * The streak an address carries after its `#`, as `addressCarrying` writes it.
 * As strict as the app's parse, so the page never offers a link the app would
 * refuse.
 */
export function streakInHash(hash: string): TransferStreak | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const query = body.indexOf('?');
  if (query < 0 || body.slice(0, query) !== HOST) return null;
  const params = new URLSearchParams(body.slice(query + 1));
  const count = params.get('count') ?? '';
  const last = params.get('lastCleared') ?? '';
  if (params.get('v') !== VERSION || !WHOLE.test(count) || !WHOLE.test(last))
    return null;
  const streak = { count: Number(count), lastClearedDayIndex: Number(last) };
  if (!isDay(streak.count) || !isDay(streak.lastClearedDayIndex)) return null;
  return streak;
}

/**
 * Whether the page offers it: as much of the app's accept rule as a browser can
 * know (`GameStorage.adoptStreak`). Above zero, and still going by this
 * browser's today: last extended today or yesterday. The app's other condition,
 * longer than its own streak, only the app can check.
 */
export function canMove(streak: TransferStreak, todayIndex: number): boolean {
  const { count, lastClearedDayIndex: last } = streak;
  return count > 0 && last <= todayIndex && last >= todayIndex - 1;
}

/**
 * Whether moving it could cost today. The app writes the web's pair over its
 * own, so after the app has counted today, a web streak last extended
 * yesterday takes today off the app's streak, and nothing puts it back. Ending
 * today, the pair already counts today.
 */
export function endedYesterday(
  streak: TransferStreak,
  todayIndex: number,
): boolean {
  return streak.lastClearedDayIndex === todayIndex - 1;
}

const query = (streak: TransferStreak) =>
  `${HOST}?v=${VERSION}&count=${streak.count}&lastCleared=${streak.lastClearedDayIndex}`;

/** The link the live app takes: `peachofaword://streak?v=1&count=N&lastCleared=L`. */
export function appLink(streak: TransferStreak): string {
  return `peachofaword://${query(streak)}`;
}

/**
 * This page's own address with the streak after the `#`, to copy on a computer
 * and open on the phone. A browser never sends the part after `#` to a server,
 * so the streak reaches no one on its way.
 */
export function addressCarrying(
  origin: string,
  streak: TransferStreak,
): string {
  return `${origin}/transfer#${query(streak)}`;
}
