/**
 * Where today's Peach rush stands, for the way into it: one run a day, until
 * the basket's first find, as the app has it.
 *
 * - **Played:** today's run is kept, so the way in opens its result again,
 *   never a second run.
 * - **Waiting:** a run is started and not ended, so it's reachable whatever
 *   the basket holds.
 * - **Offered:** none played or waiting, the basket has no find yet, it isn't
 *   the browser's first day (Antoine, 25 November: a new player meets the game
 *   first), and the browser can save, since one run a day needs a save to
 *   hold the day's one.
 * - **None:** otherwise, and there's no way in.
 */
export type RushStanding = 'played' | 'waiting' | 'offered';

export function rushStanding({
  played,
  waiting,
  basketFound,
  openedBefore,
  canSave,
}: {
  played: boolean;
  waiting: boolean;
  basketFound: number;
  openedBefore: boolean;
  canSave: boolean;
}): RushStanding | null {
  if (played) return 'played';
  if (waiting) return 'waiting';
  if (basketFound > 0 || !openedBefore || !canSave) return null;
  return 'offered';
}
