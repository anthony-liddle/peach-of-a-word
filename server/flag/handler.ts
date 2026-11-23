import { dailySourceWord } from '../../src/engine/daily.js';
import type { FlagData } from './data.ts';
import type { FlagStore } from './store.ts';

/**
 * `/api/flag`: a player's flag on a word, and taking it back.
 *
 * **Two kinds of no.** A request whose shape is wrong (not JSON, too big, a
 * field that isn't a checkable value) gets a plain 400 or 413, and the device
 * drops it. A well-shaped flag that fails a check needing the data (its word
 * isn't on that board, its reason doesn't fit the word, it suggests a denied
 * word, or the day's cap is reached) is dropped alone and the answer is still
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

export const MAX_BODY_BYTES = 4096;
export const MAX_PER_REQUEST = 20;
export const KEEP_SECONDS = 60 * 24 * 60 * 60;
export const DAILY_CAP = 20_000;
const COUNT_SECONDS = 2 * 24 * 60 * 60;
const NOTIFY_SECONDS = 60 * 60;
export const OFFENSIVE_MESSAGE = 'A word was flagged as offensive.';

const REASONS = [
  'not-a-word',
  'offensive',
  'definition',
  'should-count',
  'rarer',
  'more-common',
] as const;
type Reason = (typeof REASONS)[number];
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

interface Flag {
  readonly id: string;
  readonly word: string;
  readonly day?: string;
  readonly rack?: string;
  readonly reason: Reason;
  readonly platform: 'ios' | 'web';
  readonly version: string;
}

const empty = (status: number, headers?: Record<string, string>) =>
  new Response(null, { status, headers });

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
  const flags = parseFlags(
    body,
    data,
    utcDay(new Date(now.getTime() + 86_400_000)),
  );
  if (flags === null) return empty(400);

  // The checks above need no store, so a preview proves the bundle carries
  // the data before it says it has nowhere to put a flag.
  const store = deps.store;
  if (!store) return empty(503);

  let offensive = false;
  try {
    for (const flag of flags) {
      if (!fits(flag, data)) continue;
      const count = await store.increment(`count:${today}`, COUNT_SECONDS);
      if (count > (deps.cap ?? DAILY_CAP)) continue;
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
    !ids.every((id) => typeof id === 'string' && UUID.test(id))
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
function parseFlags(
  body: unknown,
  data: FlagData,
  tomorrow: string,
): Flag[] | null {
  const list = (body as { flags?: unknown } | null)?.flags;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.length > MAX_PER_REQUEST
  ) {
    return null;
  }
  const first = `${data.epoch.year}-${pad(data.epoch.month)}-${pad(data.epoch.day)}`;
  const flags: Flag[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      return null;
    const f = raw as Record<string, unknown>;
    if (!Object.keys(f).every((k) => FIELDS.has(k))) return null;
    const { id, word, day, rack, reason, platform, version } = f;
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    if (typeof word !== 'string' || !WORD.test(word)) return null;
    if (!REASONS.includes(reason as Reason)) return null;
    if (platform !== 'ios' && platform !== 'web') return null;
    if (typeof version !== 'string' || !VERSION.test(version)) return null;
    if ((day === undefined) === (rack === undefined)) return null;
    if (day !== undefined) {
      if (typeof day !== 'string' || !isRealDay(day)) return null;
      if (day < first || day > tomorrow) return null;
    }
    if (rack !== undefined && (typeof rack !== 'string' || !RACK.test(rack))) {
      return null;
    }
    flags.push({
      id: id.toLowerCase(),
      word,
      ...(day !== undefined ? { day: day as string } : {}),
      ...(rack !== undefined ? { rack: rack as string } : {}),
      reason: reason as Reason,
      platform,
      version,
    });
  }
  return flags;
}

/**
 * Whether a well-shaped flag is one to keep. Its word must be spelled from its
 * board's long word, and its reason must fit the word:
 * - a refused word can only be suggested, `should-count`, and not if it's on
 *   a deny row;
 * - the board's own long word can be `offensive` or `definition`, and has no
 *   grade to disagree with;
 * - any other accepted word can be `not-a-word`, `offensive`, `definition`, or
 *   `rarer` or `more-common` than its grade. The flag doesn't carry the grade:
 *   orchard works it out from the word and the lists, so nothing here needs
 *   the grade lists, and no grade is checked.
 */
function fits(flag: Flag, data: FlagData): boolean {
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

function isRealDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && utcDay(date) === day;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
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
