import { describe, expect, test } from 'vitest';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import {
  addressCarrying,
  appLink,
  canMove,
  endedYesterday,
  streakInHash,
  streakInSave,
} from './streak.ts';
import fixture from './streakLinks.fixture.json';

/** A store holding one raw value under the game's key, as a browser would. */
function saveHolding(raw: string | null): GameStorage {
  const map = new Map<string, string>();
  if (raw !== null) map.set('eight-letters/v1', raw);
  const store: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  return new GameStorage(store);
}

/** A save as the game writes one, with the streak given. */
const save = (streak: unknown) =>
  JSON.stringify({ version: 1, days: {}, streak, endless: null });

const TODAY = 318; // 15 November 2026, counted from 1 January 2026

describe('the streak in this browser', () => {
  test('reads the pair the game saved', () => {
    const storage = saveHolding(save({ count: 12, lastClearedDayIndex: 317 }));
    expect(streakInSave(storage)).toEqual({
      count: 12,
      lastClearedDayIndex: 317,
    });
  });

  test('a streak the game has saved by playing reads back the same', () => {
    const storage = saveHolding(null);
    storage.recordDailyCleared(316);
    storage.recordDailyCleared(317);
    storage.recordDailyCleared(318);
    expect(streakInSave(storage)).toEqual({
      count: 3,
      lastClearedDayIndex: 318,
    });
  });

  test.each([
    ['no save at all', null],
    [
      'a save that never cleared a day',
      save({ count: 0, lastClearedDayIndex: null }),
    ],
    ['a save that is not JSON', '{not json'],
    [
      'a save of another version',
      JSON.stringify({
        version: 2,
        streak: { count: 5, lastClearedDayIndex: 318 },
      }),
    ],
    ['a count that is text', save({ count: '5', lastClearedDayIndex: 318 })],
    ['a count with a fraction', save({ count: 5.5, lastClearedDayIndex: 318 })],
    ['a negative day', save({ count: 5, lastClearedDayIndex: -1 })],
    ['no streak field', JSON.stringify({ version: 1, days: {} })],
  ])('finds none in %s', (_, raw) => {
    expect(streakInSave(saveHolding(raw))).toBeNull();
  });
});

describe('what the page offers', () => {
  test.each([
    ['last cleared today', 318, true],
    ['last cleared yesterday', 317, true],
    ['last cleared two days ago, so ended', 316, false],
    ['last cleared tomorrow, which no real save holds', 319, false],
  ])('a streak %s: %s', (_, last, offered) => {
    expect(canMove({ count: 4, lastClearedDayIndex: last }, TODAY)).toBe(
      offered,
    );
  });

  test('never a count of zero or less, which the app refuses', () => {
    expect(canMove({ count: 0, lastClearedDayIndex: 318 }, TODAY)).toBe(false);
    expect(canMove({ count: -3, lastClearedDayIndex: 318 }, TODAY)).toBe(false);
  });

  /**
   * The trap the copy has to cover. The app takes the web's pair over its own,
   * so a web streak ending yesterday overwrites a clear the app made today.
   * Ending today, the pair the app keeps already counts today.
   */
  test('warns only when the streak ended yesterday', () => {
    expect(endedYesterday({ count: 4, lastClearedDayIndex: 317 }, TODAY)).toBe(
      true,
    );
    expect(endedYesterday({ count: 4, lastClearedDayIndex: 318 }, TODAY)).toBe(
      false,
    );
  });
});

describe('the links it writes', () => {
  test('the app link, in the shape the app reads', () => {
    expect(appLink({ count: 53, lastClearedDayIndex: 239 })).toBe(
      'peachofaword://streak?v=1&count=53&lastCleared=239',
    );
  });

  test('the address carries the streak after the #, which no server sees', () => {
    const address = addressCarrying('https://peachofaword.com', {
      count: 53,
      lastClearedDayIndex: 239,
    });
    expect(address).toBe(
      'https://peachofaword.com/transfer#streak?v=1&count=53&lastCleared=239',
    );
    const url = new URL(address);
    expect(url.pathname + url.search).toBe('/transfer');
  });

  test.each(fixture.links)(
    'the shared fixture: $link',
    ({ count, lastClearedDayIndex, link, address }) => {
      const streak = { count, lastClearedDayIndex };
      expect(appLink(streak)).toBe(link);
      expect(addressCarrying(fixture.origin, streak)).toBe(address);
      expect(streakInHash(new URL(address).hash)).toEqual(streak);
    },
  );

  test('the fixture holds the cases the iOS test parses', () => {
    expect(fixture.links.length).toBeGreaterThanOrEqual(5);
  });
});

describe('the streak in an address', () => {
  test('reads what the page wrote', () => {
    expect(streakInHash('#streak?v=1&count=7&lastCleared=318')).toEqual({
      count: 7,
      lastClearedDayIndex: 318,
    });
  });

  test('in any order', () => {
    expect(streakInHash('#streak?lastCleared=318&count=7&v=1')).toEqual({
      count: 7,
      lastClearedDayIndex: 318,
    });
  });

  /** As strict as the app's own parse, so the page never offers what it refuses. */
  test.each([
    [''],
    ['#'],
    ['#streak'],
    ['#streak?count=7&lastCleared=318'],
    ['#streak?v=2&count=7&lastCleared=318'],
    ['#days?v=1&count=7&lastCleared=318'],
    ['#streak?v=1&count=7.5&lastCleared=318'],
    ['#streak?v=1&count=seven&lastCleared=318'],
    ['#streak?v=1&count=7&lastCleared=318abc'],
    ['#streak?v=1&count=-7&lastCleared=318'],
    ['#streak?v=1&count=&lastCleared=318'],
    ['#streak?v=1&lastCleared=318'],
  ])('refuses %j', (hash) => {
    expect(streakInHash(hash)).toBeNull();
  });
});
