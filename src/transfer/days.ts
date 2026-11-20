import type { GameStorage } from '@/persistence/storage.ts';

/**
 * The opening of every days payload, in words a player can read, so text that
 * turns up in a message or on a clipboard says what it is. The app looks for
 * it with all whitespace removed, so a payload a mail program wraps across
 * lines still reads.
 */
export const DAYS_PREFIX = 'Peach of a Word days: ';

/**
 * Everything this browser's save can bring to the app, as one piece of text to
 * copy: the opening, then base64url of the JSON
 * `{"v":1,"streak":{...},"days":{...}}`, in the save's own shape.
 *
 * - **Every day with words,** and none without. A day opened and left empty
 *   tells the app nothing.
 * - **The streak whenever a day was cleared,** going or not. A run that has
 *   ended still says which days reached the streak's rank, and the app fills
 *   those in. Only a streak still going is taken as the streak.
 * - **No compression.** The text travels by copy and paste, which has no limit
 *   worth the cost of a second codec on each side. A year of days at the most
 *   words the lists allow is about 750,000 characters.
 */
export function daysPayload(storage: GameStorage): string {
  const streak = storage.savedStreak();
  const going =
    streak && streak.count > 0 && streak.lastClearedDayIndex >= 0
      ? {
          streak: {
            count: streak.count,
            lastClearedDayIndex: streak.lastClearedDayIndex,
          },
        }
      : {};
  // Built in this order so the JSON reads v, streak, days, as the fixture pins
  // it. Integer keys come out in ascending order on their own.
  const body = { v: 1, ...going, days: storage.savedDays() };
  return DAYS_PREFIX + base64url(JSON.stringify(body));
}

/** UTF-8, then base64 with `-` and `_` for `+` and `/`, and no padding. */
function base64url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text))
    binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
