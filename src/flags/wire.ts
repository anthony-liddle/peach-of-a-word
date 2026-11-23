/**
 * A flag as it travels to `/api/flag`, and the one check of its shape.
 *
 * ONE CHECK, TWO CALLERS. The server's handler runs it on every flag in a
 * request, and answers 400 to the whole request if any one fails. The web runs
 * the same function on each waiting flag before it makes a batch, and drops
 * only the ones that fail, so a corrupt flag in `e8-flags` can't take the good
 * flags in its batch down with it (Antoine, 23 November).
 *
 * The page loads this, and so does the function, which Vercel compiles file by
 * file: so it imports nothing at run time and uses nothing from Node or the
 * browser. See `server/flag/imports.test.ts`.
 */

/** The largest request body the server reads. */
export const MAX_BODY_BYTES = 4096;
/** The most flags, or IDs to forget, in one request. */
export const MAX_PER_REQUEST = 20;

export const REASONS = [
  'not-a-word',
  'offensive',
  'definition',
  'should-count',
  'rarer',
  'more-common',
] as const;
export type Reason = (typeof REASONS)[number];

/** A flag as the server takes it: these fields and no others. */
export interface WireFlag {
  readonly id: string;
  readonly word: string;
  readonly day?: string;
  readonly rack?: string;
  readonly reason: Reason;
  readonly platform: 'ios' | 'web';
  readonly version: string;
}

const FIELDS = new Set([
  'id',
  'word',
  'day',
  'rack',
  'reason',
  'platform',
  'version',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORD = /^[a-z]{3,8}$/;
const RACK = /^[a-z]{8}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^[0-9A-Za-z.() +-]{1,24}$/;

/** A flag's ID: a UUID, in either case, as the app makes them upper. */
export function isFlagId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

/**
 * The flag, with its ID in lower case, if it's well shaped; null if not.
 *
 * A day must be a real one, on or after `firstDay`, the game's first board.
 * A day after the server's tomorrow is well shaped: the server drops that
 * flag alone, as it does a word off its board, so a device whose clock runs
 * fast loses only its own flag (Antoine, 23 November).
 */
export function checkFlag(raw: unknown, firstDay: string): WireFlag | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const f = raw as Record<string, unknown>;
  if (!Object.keys(f).every((k) => FIELDS.has(k))) return null;
  const { id, word, day, rack, reason, platform, version } = f;
  if (!isFlagId(id)) return null;
  if (typeof word !== 'string' || !WORD.test(word)) return null;
  if (!REASONS.includes(reason as Reason)) return null;
  if (platform !== 'ios' && platform !== 'web') return null;
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  if ((day === undefined) === (rack === undefined)) return null;
  if (day !== undefined) {
    if (typeof day !== 'string' || !isRealDay(day)) return null;
    if (day < firstDay) return null;
  }
  if (rack !== undefined && (typeof rack !== 'string' || !RACK.test(rack))) {
    return null;
  }
  return {
    id: id.toLowerCase(),
    word,
    ...(day !== undefined ? { day: day as string } : {}),
    ...(rack !== undefined ? { rack: rack as string } : {}),
    reason: reason as Reason,
    platform,
    version,
  };
}

/** A date's UTC day, as YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The calendar's epoch as YYYY-MM-DD: the first day a board can name. */
export function epochDay(epoch: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}): string {
  return `${epoch.year}-${pad(epoch.month)}-${pad(epoch.day)}`;
}

function isRealDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && utcDay(date) === day;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
