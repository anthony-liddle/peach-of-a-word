import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GameStorage,
  type KeyValueStore,
  type RunInFlight,
  type RunRecord,
} from './storage.ts';

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('GameStorage day progress', () => {
  let storage: GameStorage;
  beforeEach(() => {
    storage = new GameStorage(fakeStore());
  });

  it('round-trips found words for a day', () => {
    storage.saveDayProgress(10, 'serenade', ['sea', 'near']);
    expect(storage.loadDayProgress(10, 'serenade')).toEqual(['sea', 'near']);
  });

  it('ignores saved progress if the source word has changed', () => {
    storage.saveDayProgress(10, 'serenade', ['sea']);
    expect(storage.loadDayProgress(10, 'absolute')).toEqual([]);
  });
});

// Two tabs open on the same board each save their own found list. A tab that
// hasn't heard about the other's find must not write over it.
describe('GameStorage day progress from two tabs', () => {
  let storage: GameStorage;
  beforeEach(() => {
    storage = new GameStorage(fakeStore());
  });

  it("keeps a find another tab saved, when this tab's list doesn't have it", () => {
    storage.saveDayProgress(10, 'serenade', ['sea']);
    storage.saveDayProgress(10, 'serenade', ['near']);
    expect(storage.loadDayProgress(10, 'serenade')).toEqual(['sea', 'near']);
  });

  it('returns the basket as saved, so the tab can catch up', () => {
    storage.saveDayProgress(10, 'serenade', ['sea']);
    expect(storage.saveDayProgress(10, 'serenade', ['near'])).toEqual([
      'sea',
      'near',
    ]);
  });

  it('saves each word once, in the order the save first had it', () => {
    storage.saveDayProgress(10, 'serenade', ['sea', 'near']);
    storage.saveDayProgress(10, 'serenade', ['near', 'sea', 'ease']);
    expect(storage.loadDayProgress(10, 'serenade')).toEqual([
      'sea',
      'near',
      'ease',
    ]);
  });

  it('drops a saved word the board no longer takes', () => {
    storage.saveDayProgress(10, 'serenade', ['sea', 'near']);
    storage.saveDayProgress(10, 'serenade', ['sea'], (w) => w !== 'near');
    expect(storage.loadDayProgress(10, 'serenade')).toEqual(['sea']);
  });

  it('starts over when the day has a new word', () => {
    storage.saveDayProgress(10, 'oldcrown', ['cat', 'cot']);
    storage.saveDayProgress(10, 'serenade', ['sea']);
    expect(storage.loadDayProgress(10, 'serenade')).toEqual(['sea']);
  });
});

// Every day's words stay, so a player moving to the app can bring them all.
// The save used to keep only the fourteen newest days, which dropped the
// fifteenth on every write after it.
describe('GameStorage keeps every day', () => {
  it('keeps the fifteenth newest day', () => {
    const storage = new GameStorage(fakeStore());
    for (let day = 300; day < 315; day++) {
      storage.saveDayProgress(day, 'serenade', [`w${day}`]);
    }
    expect(storage.loadDayProgress(300, 'serenade')).toEqual(['w300']);
  });

  it('keeps a year of days, read back after a reload', () => {
    const store = fakeStore();
    const playing = new GameStorage(store);
    // From launch day's storage index, one day at a time, as daily play does.
    const days = Array.from({ length: 365 }, (_, i) => 173 + i);
    for (const day of days) {
      playing.saveDayProgress(day, 'serenade', [`w${day}`]);
    }
    const reloaded = new GameStorage(store);
    for (const day of days) {
      expect(reloaded.loadDayProgress(day, 'serenade')).toEqual([`w${day}`]);
    }
  });
});

describe('GameStorage endless', () => {
  let storage: GameStorage;
  beforeEach(() => {
    storage = new GameStorage(fakeStore());
  });

  it('is null until an endless game is saved', () => {
    expect(storage.loadEndless()).toBeNull();
  });

  it('round-trips the endless puzzle identity and progress', () => {
    storage.saveEndless('absolute', ['lob', 'bolt']);
    expect(storage.loadEndless()).toEqual({
      sourceWord: 'absolute',
      found: ['lob', 'bolt'],
    });
  });

  it('overwrites on a new puzzle and is independent of daily progress', () => {
    storage.saveDayProgress(10, 'serenade', ['sea']);
    storage.saveEndless('absolute', ['lob']);
    storage.saveEndless('mountain', []); // New Puzzle: fresh word, empty list
    expect(storage.loadEndless()).toEqual({
      sourceWord: 'mountain',
      found: [],
    });
    expect(storage.loadDayProgress(10, 'serenade')).toEqual(['sea']);
  });

  it('remembers Endless as the board in play, with its day, until the daily is', () => {
    expect(storage.endlessOpenOn()).toBeNull();
    storage.saveEndlessOpen(300);
    expect(storage.endlessOpenOn()).toBe(300);
    storage.saveEndlessOpen(null);
    expect(storage.endlessOpenOn()).toBeNull();
  });

  it('reads a save from before the board in play was kept as the daily', () => {
    const store = fakeStore();
    store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {},
        streak: { count: 0, lastClearedDayIndex: null },
        endless: { sourceWord: 'absolute', found: ['lob'] },
      }),
    );
    const old = new GameStorage(store);
    expect(old.endlessOpenOn()).toBeNull();
    expect(old.loadEndless()).toEqual({
      sourceWord: 'absolute',
      found: ['lob'],
    });
  });

  it('calls a saved Endless that cannot be read back lost, not none', () => {
    const store = fakeStore();
    const save = (endless: unknown) =>
      store.setItem(
        'eight-letters/v1',
        JSON.stringify({
          version: 1,
          days: {},
          streak: { count: 0, lastClearedDayIndex: null },
          endless,
        }),
      );
    const storage = new GameStorage(store);
    for (const broken of [
      { sourceWord: 7, found: [] },
      { sourceWord: 'absolut', found: [] },
      { sourceWord: 'Absolute', found: [] },
      { found: ['lob'] },
      'absolute',
    ]) {
      save(broken);
      expect(storage.loadEndless(), JSON.stringify(broken)).toBe('lost');
    }
    // Its words are kept where they can be read: a stray value drops alone.
    save({ sourceWord: 'absolute', found: ['lob', 3, 'bolt'] });
    expect(storage.loadEndless()).toEqual({
      sourceWord: 'absolute',
      found: ['lob', 'bolt'],
    });
    save({ sourceWord: 'absolute' });
    expect(storage.loadEndless()).toEqual({
      sourceWord: 'absolute',
      found: [],
    });
  });
});

describe('GameStorage streak', () => {
  let storage: GameStorage;
  beforeEach(() => {
    storage = new GameStorage(fakeStore());
  });

  it('starts at zero', () => {
    expect(storage.currentStreak(5)).toBe(0);
  });

  it('extends across consecutive days', () => {
    storage.recordDailyCleared(5);
    storage.recordDailyCleared(6);
    storage.recordDailyCleared(7);
    expect(storage.currentStreak(7)).toBe(3);
  });

  it('is a no-op when the same day is recorded twice', () => {
    storage.recordDailyCleared(5);
    storage.recordDailyCleared(5);
    expect(storage.currentStreak(5)).toBe(1);
  });

  it('restarts after a gap', () => {
    storage.recordDailyCleared(5);
    storage.recordDailyCleared(8); // missed 6 and 7
    expect(storage.currentStreak(8)).toBe(1);
  });

  it('shows the streak as broken once a day is missed', () => {
    storage.recordDailyCleared(5);
    expect(storage.currentStreak(5)).toBe(1); // today, cleared
    expect(storage.currentStreak(6)).toBe(1); // tomorrow, still alive
    expect(storage.currentStreak(7)).toBe(0); // day after, missed -> broken
  });
});

// A page left open past midnight keeps the day it opened on, so it can clear
// that day after another tab has cleared the next.
describe('GameStorage streak, an earlier day cleared late', () => {
  it("leaves a later day's streak as it stands", () => {
    const storage = new GameStorage(fakeStore());
    storage.recordDailyCleared(11);
    storage.recordDailyCleared(10);
    expect(storage.currentStreak(12)).toBe(1);
    expect(storage.savedStreak()).toEqual({
      count: 1,
      lastClearedDayIndex: 11,
    });
  });

  it('keeps a longer streak going through the next day', () => {
    const storage = new GameStorage(fakeStore());
    storage.recordDailyCleared(10);
    storage.recordDailyCleared(11);
    storage.recordDailyCleared(9);
    expect(storage.currentStreak(12)).toBe(2);
  });
});

describe('GameStorage migration: calendar reshuffle preserves play history', () => {
  let storage: GameStorage;
  beforeEach(() => {
    storage = new GameStorage(fakeStore());
  });

  // The frozen-calendar migration may re-date a day to a different word. The
  // streak must be keyed to the date, not the word, so a finished day is never
  // read as unfinished. This guards that invariant.
  it('keeps a cleared day cleared and the streak intact when the word changes', () => {
    // Before the reshuffle: day 5 cleared, found words saved under the old word.
    storage.saveDayProgress(5, 'oldcrown', ['cat', 'cot']);
    storage.recordDailyCleared(5);
    expect(storage.currentStreak(5)).toBe(1);

    // The reshuffle changes day 5's word. The streak is keyed to the date, so it
    // is unaffected, and the next day continues it.
    storage.recordDailyCleared(6);
    expect(storage.currentStreak(6)).toBe(2);

    // The only visible effect: progress was word-keyed, so the new word starts
    // fresh. The day offers its new word once.
    expect(storage.loadDayProgress(5, 'newcrown')).toEqual([]);
  });
});

describe('GameStorage resilience', () => {
  it('does not throw when the underlying store rejects a write', () => {
    const throwingStore: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const storage = new GameStorage(throwingStore);
    expect(() => storage.saveDayProgress(1, 'serenade', ['sea'])).not.toThrow();
    expect(() => storage.saveEndless('absolute', ['lob'])).not.toThrow();
  });
});

describe('GameStorage persistence detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports persistent storage when localStorage is available', () => {
    expect(new GameStorage().persistent).toBe(true);
  });

  it('reports non-persistent storage when writes are denied', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage access denied');
    });
    expect(new GameStorage().persistent).toBe(false);
  });

  it('treats an explicitly injected store as persistent by default', () => {
    expect(new GameStorage(fakeStore()).persistent).toBe(true);
  });
});

describe('history survives the Phase 2 calendar regeneration', () => {
  // Streak and per-day progress are keyed by day index (the date), not by the
  // source word. The regeneration changes which word maps to a date but never
  // touches storage, so a completed date stays completed and the streak holds.
  it('keeps the streak count, which is date-keyed not word-keyed', () => {
    const storage = new GameStorage(fakeStore());
    storage.recordDailyCleared(38);
    storage.recordDailyCleared(39);
    storage.recordDailyCleared(40);
    expect(storage.currentStreak(40)).toBe(3);
    // The regeneration touches only the calendar JSON, not storage. Reading the
    // streak back gives the same count: no reset from the word reshuffle.
    expect(storage.currentStreak(40)).toBe(3);
  });

  it('keeps a completed day record, word-guarded so past days are not replayed', () => {
    const storage = new GameStorage(fakeStore());
    storage.saveDayProgress(40, 'oldcrown', ['sea', 'near']);
    // The same date now maps to a different crown after the reshuffle. The old
    // record persists by its day index, and simply does not reload for the new
    // word, since a past day is never replayed.
    expect(storage.loadDayProgress(40, 'oldcrown')).toEqual(['sea', 'near']);
    expect(storage.loadDayProgress(40, 'newcrown')).toEqual([]);
  });
});

// A browser's first day: no start and no run on it, from the save as the page
// opened, since the board saves today's day as it opens.
describe('GameStorage, the days before today', () => {
  function seeded(days: number[]): KeyValueStore {
    const store = fakeStore();
    const setup = new GameStorage(store);
    for (const day of days) setup.saveDayProgress(day, 'serenade', []);
    return store;
  }

  it('says a browser with nothing saved opened no day before', () => {
    expect(new GameStorage(fakeStore()).openedBefore(10)).toBe(false);
  });

  it('counts an earlier day opened with no word found', () => {
    expect(new GameStorage(seeded([9])).openedBefore(10)).toBe(true);
  });

  it("doesn't count today, or a day saved after the page opened", () => {
    const store = seeded([10]);
    const storage = new GameStorage(store);
    new GameStorage(store).saveDayProgress(8, 'serenade', ['sea']);
    expect(storage.openedBefore(10)).toBe(false);
  });
});

describe('GameStorage, Peach rush', () => {
  const run = (over: Partial<RunRecord> = {}): RunRecord => ({
    sourceWord: 'serenade',
    words: ['sea', 'near'],
    points: 4,
    peach: false,
    best: { word: 'near', points: 3 },
    endedEarly: false,
    leftMs: 0,
    clockMs: 90_000,
    peachCardOwed: false,
    ...over,
  });
  const flight = (over: Partial<RunInFlight> = {}): RunInFlight => ({
    dayIndex: 10,
    sourceWord: 'serenade',
    words: ['sea'],
    leftMs: 48_000,
    clockMs: 90_000,
    phase: 'paused',
    tab: 'a',
    ...over,
  });

  it("keeps the day's run, for that day's word only", () => {
    const storage = new GameStorage(fakeStore());
    expect(storage.saveRun(10, run())).toBe(true);
    expect(storage.loadRun(10, 'serenade')).toEqual(run());
    expect(storage.loadRun(10, 'absolute')).toBeNull();
    expect(storage.loadRun(11, 'serenade')).toBeNull();
  });

  it('refuses a second run for a day that has one', () => {
    const storage = new GameStorage(fakeStore());
    storage.saveRun(10, run());
    expect(storage.saveRun(10, run({ words: ['sea'], points: 1 }))).toBe(false);
    expect(storage.loadRun(10, 'serenade')?.words).toEqual(['sea', 'near']);
  });

  it('replaces the same run when asked, as its card is shown', () => {
    const storage = new GameStorage(fakeStore());
    storage.saveRun(10, run({ peach: true, peachCardOwed: true }));
    storage.saveRun(10, run({ peach: true, peachCardOwed: false }), true);
    expect(storage.loadRun(10, 'serenade')?.peachCardOwed).toBe(false);
  });

  it("clears the day's run in flight once the run is kept", () => {
    const storage = new GameStorage(fakeStore());
    storage.saveRunInFlight(flight());
    storage.saveRun(10, run());
    expect(storage.loadRunInFlight()).toBeNull();
  });

  it("leaves another day's run in flight alone", () => {
    const storage = new GameStorage(fakeStore());
    storage.saveRunInFlight(flight({ dayIndex: 11 }));
    storage.saveRun(10, run());
    expect(storage.loadRunInFlight()?.dayIndex).toBe(11);
  });

  it('round-trips the run in flight, and clears it', () => {
    const storage = new GameStorage(fakeStore());
    storage.saveRunInFlight(flight());
    expect(storage.loadRunInFlight()).toEqual(flight());
    storage.saveRunInFlight(null);
    expect(storage.loadRunInFlight()).toBeNull();
  });

  it("reads a run or a flight that isn't one as none", () => {
    const store = fakeStore();
    store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {},
        streak: { count: 0, lastClearedDayIndex: null },
        endless: null,
        runs: { 10: { sourceWord: 'serenade' }, 11: run(), x: run() },
        runInFlight: { dayIndex: 10, words: 'sea' },
      }),
    );
    const storage = new GameStorage(store);
    expect(storage.loadRun(10, 'serenade')).toBeNull();
    expect(Object.keys(storage.allRuns())).toEqual(['11']);
    expect(storage.loadRunInFlight()).toBeNull();
  });

  it('reads a save from before Peach rush as no runs', () => {
    const storage = new GameStorage(fakeStore());
    storage.saveDayProgress(10, 'serenade', ['sea']);
    expect(storage.allRuns()).toEqual({});
    expect(storage.loadRunInFlight()).toBeNull();
  });
});
