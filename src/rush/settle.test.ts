import { describe, expect, it } from 'vitest';
import { dayIndex, STORAGE_EPOCH } from '@/engine/index.ts';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import {
  GameStorage,
  type KeyValueStore,
  type RunInFlight,
} from '@/persistence/storage.ts';
import { owedOldPeach, settleOldRun } from './settle.ts';

/*
 * A run left waiting overnight, settled at the next load. A made-up board,
 * SERENADE.
 */

const WORDS = ['serenade', 'sea', 'near', 'dean'];
const data: GameData = {
  dictionary: createListDictionary(WORDS),
  commonPool: createListWordSource(WORDS),
  beyond70Pool: createListWordSource([]),
  beyond95Pool: createListWordSource([]),
  dailyCalendar: { epoch: { year: 2026, month: 1, day: 1 }, words: WORDS },
  sourceEntry: () => undefined,
};

const today = new Date(2026, 10, 16, 9);
const TODAY = dayIndex(today, STORAGE_EPOCH);
const EARLIER = TODAY - 2;

function store(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function left(storage: GameStorage, over: Partial<RunInFlight> = {}) {
  storage.saveRunInFlight({
    dayIndex: EARLIER,
    sourceWord: 'serenade',
    words: ['sea', 'near'],
    leftMs: 48_000,
    clockMs: 90_000,
    phase: 'paused',
    tab: 'a',
    ...over,
  });
}

describe('a run left waiting on an earlier day', () => {
  it("ends with what it had, kept as that day's run", () => {
    const storage = new GameStorage(store());
    left(storage);
    settleOldRun(data, storage, today);
    const run = storage.loadRun(EARLIER, 'serenade');
    expect(run?.words).toEqual(['sea', 'near']);
    expect(run?.endedEarly).toBe(true);
    expect(run?.leftMs).toBe(48_000);
    expect(storage.loadRunInFlight()).toBeNull();
  });

  it("carries its words into that day's basket, keeping what it had", () => {
    const storage = new GameStorage(store());
    storage.saveDayProgress(EARLIER, 'serenade', ['dean']);
    left(storage);
    settleOldRun(data, storage, today);
    expect(storage.loadDayProgress(EARLIER, 'serenade')).toEqual([
      'dean',
      'sea',
      'near',
    ]);
    expect(storage.loadDayProgress(TODAY, 'serenade')).toEqual([]);
  });

  it('settles a run a tab left running when it died', () => {
    const storage = new GameStorage(store());
    left(storage, { phase: 'running' });
    settleOldRun(data, storage, today);
    expect(storage.loadRun(EARLIER, 'serenade')?.words).toEqual([
      'sea',
      'near',
    ]);
  });

  it('counts its day for the streak when its words reach the rank', () => {
    const storage = new GameStorage(store());
    left(storage, { words: WORDS });
    settleOldRun(data, storage, today);
    expect(storage.savedStreak()?.lastClearedDayIndex).toBe(EARLIER);
  });

  it("doesn't count its day when they don't", () => {
    const storage = new GameStorage(store());
    left(storage, { words: ['sea'] });
    settleOldRun(data, storage, today);
    // Null: no day has ever been cleared.
    expect(storage.savedStreak()).toBeNull();
  });

  it('owes the peach of a word its card, once', () => {
    const storage = new GameStorage(store());
    left(storage, { words: ['sea', 'serenade'] });
    settleOldRun(data, storage, today);
    const owed = owedOldPeach(storage, TODAY);
    expect(owed?.dayIndex).toBe(EARLIER);
    storage.saveRun(EARLIER, { ...owed!.record, peachCardOwed: false }, true);
    expect(owedOldPeach(storage, TODAY)).toBeNull();
  });

  it("leaves today's run in flight alone", () => {
    const storage = new GameStorage(store());
    left(storage, { dayIndex: TODAY });
    settleOldRun(data, storage, today);
    expect(storage.loadRunInFlight()?.dayIndex).toBe(TODAY);
    expect(storage.loadRun(TODAY, 'serenade')).toBeNull();
  });

  it('keeps the run another tab already ended, and clears the flight', () => {
    const kept = {
      sourceWord: 'serenade',
      words: ['dean'],
      points: 3,
      peach: false,
      best: { word: 'dean', points: 3 },
      endedEarly: false,
      leftMs: 0,
      clockMs: 90_000,
      peachCardOwed: false,
    };
    // A save that kept the day's run but still holds a flight for it.
    const raw = store();
    raw.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {},
        streak: { count: 0, lastClearedDayIndex: null },
        endless: null,
        runs: { [EARLIER]: kept },
        runInFlight: {
          dayIndex: EARLIER,
          sourceWord: 'serenade',
          words: ['sea', 'near'],
          leftMs: 48_000,
          clockMs: 90_000,
          phase: 'paused',
          tab: 'a',
        },
      }),
    );
    const both = new GameStorage(raw);
    settleOldRun(data, both, today);
    expect(both.loadRun(EARLIER, 'serenade')?.words).toEqual(['dean']);
    expect(both.loadRunInFlight()).toBeNull();
    expect(both.loadDayProgress(EARLIER, 'serenade')).toEqual([]);
  });
});
