import { dailySourceWord } from '../../src/engine/daily.js';
import {
  checkFlag,
  epochDay,
  isFlagId,
  MAX_BODY_BYTES,
  MAX_PER_REQUEST,
  utcDay,
  type WireFlag,
} from '../../src/flags/wire.js';
import type { FlagData } from './data.ts';
import type { FlagStore } from './store.ts';

/**
 * `/api/flag`: a player's flag on a word, and taking it back.
 *
 * **Two kinds of no.** A request whose shape is wrong (not JSON, too big, a
 * field that isn't a checkable value) gets a plain 400 or 413. The shape
 * check is `src/flags/wire.ts`, and the web runs it too, on each flag before
 * it sends, so a request the web makes is refused only by a page left open
 * since an older build. A well-shaped flag that fails a check needing the data
 * or the clock (its day is one the server hasn't reached, its word isn't on
 * that board, its reason doesn't fit the word, it suggests a denied word, or
 * the day's cap is reached) is dropped alone and the answer is still
 * 202, the same as a stored flag. So nothing about the lists can be probed
 * through this endpoint, and a slur suggested as a word is never kept.
 *
 * **Nothing is logged.** Not the body, not the address, not an error.
 *
 * **Flags never change the game by themselves.** Each one is evidence for a
 * verdict Antoine makes by hand in orchard. Junk can't remove a word.
 */
export interface FlagDeps {
  readonly data: () => FlagData;
  /** Null when this deployment has no store, as on every preview. */
  readonly store: FlagStore | null;
  /** Null when no webhook is set. Never given the word. */
  readonly notify: ((text: string) => Promise<void>) | null;
  readonly now: () => Date;
  /** How many flags one UTC day may store. */
  readonly cap?: number;
}

export const KEEP_SECONDS = 60 * 24 * 60 * 60;
export const DAILY_CAP = 20_000;
const COUNT_SECONDS = 2 * 24 * 60 * 60;
const NOTIFY_SECONDS = 60 * 60;
export const OFFENSIVE_MESSAGE = 'A word was flagged as offensive.';
/** The day's count at which Antoine hears that flags are unusually many. */
export const UNUSUAL_AT = 200;
export const UNUSUAL_MESSAGE = 'Unusual number of flags today.';

/** A flag that passed the shape check in `src/flags/wire.ts`. */
type Flag = WireFlag;

const empty = (status: number, headers?: Record<string, string>) =>
  new Response(null, headers ? { status, headers } : { status });

export async function handleFlagRequest(
  request: Request,
  deps: FlagDeps,
): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return empty(405, { allow: 'POST, DELETE' });
  }
  const text = await readLimited(request);
  if (text === null) return empty(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return empty(400);
  }
  return request.method === 'POST'
    ? handlePost(body, deps)
    : handleDelete(body, deps);
}

async function handlePost(body: unknown, deps: FlagDeps): Promise<Response> {
  const now = deps.now();
  const today = utcDay(now);
  const data = deps.data();
  const tomorrow = utcDay(new Date(now.getTime() + 86_400_000));
  const flags = parseFlags(body, data);
  if (flags === null) return empty(400);

  // The checks above need no store, so a preview proves the bundle carries
  // the data before it says it has nowhere to put a flag.
  const store = deps.store;
  if (!store) return empty(503);

  // A flag that doesn't fit is dropped before the store hears of it, so it
  // costs nothing.
  const fitting = flags.filter((flag) => fits(flag, data, tomorrow));
  if (fitting.length === 0) return empty(202);

  // ONE COMMAND COUNTS THE WHOLE REQUEST. Upstash bills by command and the
  // budget is $2 a month, so past the day's cap a request costs that one
  // INCRBY and nothing else, however many flags it carries. Below the cap,
  // each flag that fits in the room left is one SET more.
  let offensive = false;
  let count: number;
  try {
    count = await store.increment(
      `count:${today}`,
      fitting.length,
      COUNT_SECONDS,
    );
    const room = Math.max(
      0,
      (deps.cap ?? DAILY_CAP) - (count - fitting.length),
    );
    for (const flag of fitting.slice(0, room)) {
      const stored = await store.setIfAbsent(
        `flag:${flag.id}`,
        JSON.stringify({ ...flag, arrived: today }),
        KEEP_SECONDS,
      );
      if (stored && flag.reason === 'offensive') offensive = true;
    }
  } catch {
    return empty(503);
  }

  // The count that carries the day past 200 is the one request to say so.
  // INCRBY is atomic, so exactly one request a day crosses, and this costs no
  // command of its own. It counts every flag that fit, retries and those past
  // the cap included. A failed message isn't sent again that day.
  if (
    deps.notify &&
    count - fitting.length < UNUSUAL_AT &&
    count >= UNUSUAL_AT
  ) {
    try {
      await deps.notify(UNUSUAL_MESSAGE);
    } catch {
      // The flags are kept; the message is a convenience.
    }
  }

  if (offensive && deps.notify) {
    // At most one an hour, whatever the word: the message names none, so a
    // second one would tell Antoine nothing more, and a flood can't fill the
    // channel. A failure here never fails the flags already kept.
    try {
      if (await store.setIfAbsent('notify:offensive', '1', NOTIFY_SECONDS)) {
        await deps.notify(OFFENSIVE_MESSAGE);
      }
    } catch {
      // The flag is kept; the message is a convenience.
    }
  }
  return empty(202);
}

async function handleDelete(body: unknown, deps: FlagDeps): Promise<Response> {
  const ids = (body as { ids?: unknown } | null)?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_PER_REQUEST ||
    !ids.every(isFlagId)
  ) {
    return empty(400);
  }
  if (!deps.store) return empty(503);
  try {
    // The same answer whether or not a flag was there, so an ID can't be
    // tested for. Only the device that made a flag holds its ID.
    await deps.store.remove(
      ids.map((id: string) => `flag:${id.toLowerCase()}`),
    );
  } catch {
    return empty(503);
  }
  return empty(204);
}

/** The flags, if every one is well shaped; null if any is not. */
function parseFlags(body: unknown, data: FlagData): Flag[] | null {
  const list = (body as { flags?: unknown } | null)?.flags;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.length > MAX_PER_REQUEST
  ) {
    return null;
  }
  const firstDay = epochDay(data.epoch);
  const flags: Flag[] = [];
  for (const raw of list) {
    const flag = checkFlag(raw, firstDay);
    if (!flag) return null;
    flags.push(flag);
  }
  return flags;
}

/**
 * Whether a well-shaped flag is one to keep. Its board's day must be one the
 * server has reached, tomorrow at the latest, for a player already past
 * midnight: a later day is a fast clock, and loses only its own flag, as a
 * word off its board does (Antoine, 23 November). Its word must be spelled
 * from its board's long word, and its reason must fit the word:
 * - a refused word can only be suggested, `should-count`, and not if it's on
 *   a deny row;
 * - the board's own long word can be `offensive` or `definition`, and has no
 *   grade to disagree with;
 * - any other accepted word can be `not-a-word`, `offensive`, `definition`, or
 *   `rarer` or `more-common` than its grade. The flag doesn't carry the grade:
 *   orchard works it out from the word and the lists, so nothing here needs
 *   the grade lists, and no grade is checked.
 */
function fits(flag: Flag, data: FlagData, tomorrow: string): boolean {
  if (flag.day !== undefined && flag.day > tomorrow) return false;
  const longWord =
    flag.rack !== undefined
      ? endlessRack(flag.rack, data)
      : dayRack(flag.day!, data);
  if (!longWord || !spells(longWord, flag.word)) return false;
  if (!data.accepted(flag.word)) {
    return flag.reason === 'should-count' && !data.denied(flag.word);
  }
  if (flag.reason === 'should-count') return false;
  if (flag.word === longWord) {
    return flag.reason === 'offensive' || flag.reason === 'definition';
  }
  return true;
}

function dayRack(day: string, data: FlagData): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  // Local components, as the game builds its day, so the time zone the
  // function runs in can't move the board.
  return dailySourceWord(data.calendar, new Date(y, m - 1, d), data.epoch);
}

/** Endless draws its racks from the calendar's long words. */
function endlessRack(rack: string, data: FlagData): string | null {
  return data.calendar.includes(rack) ? rack : null;
}

function spells(longWord: string, word: string): boolean {
  const left = [...longWord];
  for (const letter of word) {
    const at = left.indexOf(letter);
    if (at < 0) return false;
    left.splice(at, 1);
  }
  return true;
}

/** The body as text, or null past the limit, which is checked before reading. */
async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}
