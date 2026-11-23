import type { FlagData } from './data.ts';
import type { FlagStore } from './store.ts';

/*
 * Test helpers only. Everything here is made up: the calendar's long words are
 * not words, the lists are a handful of entries, and the deny row is invented.
 * Both repos are public, so no real day's board or flag appears in a test.
 */

/** Three made-up long words from the real epoch, so day N is word N. */
export const CALENDAR = {
  epoch: { year: 2026, month: 6, day: 23 },
  words: ['abdeghil', 'mnoprstu', 'cefkqvwy'],
} as const;

/** Accepted: a few words spelled from the first two long words, and both. */
const ACCEPTED = new Set([
  'abdeghil',
  'bad',
  'bid',
  'hide',
  'glide',
  'mnoprstu',
  'sport',
  'stomp',
]);
/** A refused word the made-up patch denies. */
const DENIED = new Set(['hag']);

export function testData(): FlagData {
  return {
    epoch: CALENDAR.epoch,
    calendar: CALENDAR.words,
    accepted: (word) => ACCEPTED.has(word),
    denied: (word) => DENIED.has(word),
  };
}

export const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const ID2 = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/** One flag, valid against `testData` on 23 June 2026. */
export function aFlag(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ID,
    word: 'bad',
    day: '2026-06-23',
    reason: 'definition',
    platform: 'web',
    version: '1.0.0',
    ...over,
  };
}

/** A store that keeps everything in memory, with each key's expiry. */
export class MemoryStore implements FlagStore {
  readonly values = new Map<string, string>();
  readonly ttls = new Map<string, number>();
  failing = false;

  async setIfAbsent(key: string, value: string, ttl: number) {
    this.check();
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    this.ttls.set(key, ttl);
    return true;
  }

  async increment(key: string, by: number, ttl: number) {
    this.check();
    const next = Number(this.values.get(key) ?? '0') + by;
    this.values.set(key, String(next));
    if (next === by) this.ttls.set(key, ttl);
    return next;
  }

  async remove(keys: readonly string[]) {
    this.check();
    for (const key of keys) {
      this.values.delete(key);
      this.ttls.delete(key);
    }
  }

  flagKeys(): string[] {
    return [...this.values.keys()].filter((k) => k.startsWith('flag:'));
  }

  private check() {
    if (this.failing) throw new Error('store down');
  }
}

export function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/flag', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function del(body: unknown) {
  return new Request('https://example.test/api/flag', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
