/**
 * Local persistence for streak and per-day progress. No backend in v1.
 * Behind a minimal storage interface so it is testable and swappable.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface DayProgress {
  sourceWord: string;
  found: string[];
}

interface StreakState {
  count: number;
  lastClearedDayIndex: number | null;
}

/** The in-progress Endless game: enough to rehydrate the exact puzzle. */
interface EndlessState {
  sourceWord: string;
  found: string[];
}

interface PersistedState {
  version: 1;
  days: Record<number, DayProgress>;
  streak: StreakState;
  endless: EndlessState | null;
}

const STORAGE_KEY = 'eight-letters/v1';

function emptyState(): PersistedState {
  return {
    version: 1,
    days: {},
    streak: { count: 0, lastClearedDayIndex: null },
    endless: null,
  };
}

/** A no-op store for environments where localStorage is unavailable or denied. */
function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/**
 * The real localStorage if it is usable, or an in-memory fallback if access is
 * denied or disabled. `persistent` is false for the fallback so callers can warn
 * that progress will not survive a reload.
 */
function createDefaultStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const ls = globalThis.localStorage;
    const probe = '__el_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { store: ls, persistent: true };
  } catch {
    return { store: memoryStore(), persistent: false };
  }
}

export class GameStorage {
  private readonly store: KeyValueStore;
  /**
   * False when progress is held in memory only (localStorage denied or
   * disabled) and will not survive a reload or crash.
   */
  readonly persistent: boolean;

  constructor(store?: KeyValueStore, persistent = true) {
    if (store) {
      this.store = store;
      this.persistent = persistent;
    } else {
      const fallback = createDefaultStore();
      this.store = fallback.store;
      this.persistent = fallback.persistent;
    }
  }

  private read(): PersistedState {
    const raw = this.store.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed?.version === 1) return parsed;
    } catch {
      // Corrupt or stale; start clean rather than crash play.
    }
    return emptyState();
  }

  /**
   * Every day is kept, so a player moving to the iOS app can bring all of
   * them. This used to keep only the fourteen newest days, and each write
   * after the fourteenth dropped the oldest for good. The save grows by one
   * entry for each day the board is opened.
   */
  private write(state: PersistedState): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // A mid-session quota or permission failure must not crash play. Progress
      // for this session is lost, but the game keeps running.
    }
  }

  /** Found words saved for a given day, if the source word still matches. */
  loadDayProgress(dayIndex: number, sourceWord: string): string[] {
    const day = this.read().days[dayIndex];
    if (day && day.sourceWord === sourceWord) return day.found;
    return [];
  }

  saveDayProgress(
    dayIndex: number,
    sourceWord: string,
    found: readonly string[],
  ): void {
    const state = this.read();
    state.days[dayIndex] = { sourceWord, found: [...found] };
    this.write(state);
  }

  /**
   * Record that a daily was cleared to the streak tier. Consecutive days extend
   * the streak; a gap restarts it. Recording the same day twice is a no-op.
   */
  recordDailyCleared(dayIndex: number): void {
    const state = this.read();
    const { lastClearedDayIndex } = state.streak;
    if (lastClearedDayIndex === dayIndex) return;
    if (lastClearedDayIndex === dayIndex - 1) state.streak.count += 1;
    else state.streak.count = 1;
    state.streak.lastClearedDayIndex = dayIndex;
    this.write(state);
  }

  /** Current streak as of today. A missed day shows the streak as broken (0). */
  currentStreak(todayIndex: number): number {
    const { count, lastClearedDayIndex } = this.read().streak;
    if (lastClearedDayIndex === null) return 0;
    return lastClearedDayIndex >= todayIndex - 1 ? count : 0;
  }

  /** The in-progress Endless game, or null if none has been started. */
  loadEndless(): EndlessState | null {
    return this.read().endless;
  }

  /**
   * Persist the Endless game by its source word and found list. Enough to
   * rehydrate the exact puzzle and progress on reload. Pressing New Puzzle
   * overwrites this with a fresh source word and an empty list.
   */
  saveEndless(sourceWord: string, found: readonly string[]): void {
    const state = this.read();
    state.endless = { sourceWord, found: [...found] };
    this.write(state);
  }
}
