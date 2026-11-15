import { describe, expect, test } from 'vitest';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { DAYS_PREFIX, daysPayload } from './days.ts';
import fixture from './daysPayloads.fixture.json';

/** A browser's store holding one raw save under the game's key. */
function saveHolding(save: unknown): GameStorage {
  const map = new Map<string, string>();
  map.set(
    'eight-letters/v1',
    typeof save === 'string' ? save : JSON.stringify(save),
  );
  const store: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  return new GameStorage(store);
}

/** The JSON a payload carries, read back the way the app reads it. */
function decode(text: string): unknown {
  const body = text
    .replace(/\s+/g, '')
    .slice(DAYS_PREFIX.replace(/\s+/g, '').length);
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

describe('the days payload the page copies', () => {
  test('opens with words a player can read, then the days', () => {
    expect(DAYS_PREFIX).toBe('Peach of a Word days: ');
    const text = daysPayload(saveHolding(fixture.payloads[0]!.save));
    expect(text.startsWith(DAYS_PREFIX)).toBe(true);
  });

  /** Base64url, so no character of it needs escaping in a link or a message. */
  test('after the opening, only the base64url alphabet', () => {
    const text = daysPayload(saveHolding(fixture.payloads[0]!.save));
    expect(text.slice(DAYS_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test.each(fixture.payloads)(
    'the shared fixture: $name',
    ({ save, json, text }) => {
      const written = daysPayload(saveHolding(save));
      expect(JSON.stringify(decode(written))).toBe(json);
      expect(written).toBe(text);
    },
  );

  test('carries every day with words, and none without', () => {
    const days = Object.fromEntries(
      Array.from({ length: 365 }, (_, i) => [
        173 + i,
        { sourceWord: 'industry', found: i % 3 ? ['dust'] : [] },
      ]),
    );
    const read = decode(
      daysPayload(
        saveHolding({
          version: 1,
          days,
          streak: { count: 0, lastClearedDayIndex: null },
        }),
      ),
    ) as { days: Record<string, unknown> };
    expect(Object.keys(read.days)).toHaveLength(243);
  });

  test('leaves out what no day could hold', () => {
    const read = decode(
      daysPayload(
        saveHolding({
          version: 1,
          streak: { count: 2, lastClearedDayIndex: 318 },
          days: {
            316: { sourceWord: 'INDUSTRY', found: ['dust'] },
            317: { sourceWord: 'forecast', found: 'cast' },
            318: { sourceWord: 'favorite', found: ['five', 7, 'rite'] },
            soon: { sourceWord: 'lanterns', found: ['lane'] },
          },
        }),
      ),
    ) as { days: Record<string, { found: unknown[] }> };
    expect(Object.keys(read.days)).toEqual(['318']);
    expect(read.days['318']!.found).toEqual(['five', 'rite']);
  });

  test('a save it cannot read is no days and no streak', () => {
    expect(decode(daysPayload(saveHolding('{not json')))).toEqual({
      v: 1,
      days: {},
    });
  });
});
