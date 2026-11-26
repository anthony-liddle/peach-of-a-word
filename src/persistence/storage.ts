/**
 * Local persistence for streak and per-day progress. No backend in v1.
 * Behind a minimal storage interface so it is testable and swappable.
 */

import { SOURCE_WORD_LENGTH } from '@/engine/config.ts';

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
  /**
   * The day Endless was the board in play, or null when the daily was. Absent
   * from saves made before it was kept, which read as the daily, so it needs
   * no new version.
   */
  endlessOpenOn?: number | null;
}

/** The save's one key, for telling another tab's save from other keys. */
export const STORAGE_KEY = 'eight-letters/v1';

/** A source word as the calendar holds one: eight lowercase letters. */
const SOURCE_WORD = new RegExp(`^[a-z]{${SOURCE_WORD_LENGTH}}$`);

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

  /**
   * Save a day's found words, merged with what the save already holds for
   * that day and word: the saved ones first, then the new ones. Two tabs open
   * on the same board each save their own list, and a tab that hasn't heard
   * about the other's find must not write over it, so a basket only grows.
   *
   * `keep` drops a saved word the board no longer takes, such as a denied
   * word, so the save forgets it as the board does and the transfer page
   * never hands it to the app. A new word for the day starts the list over.
   *
   * Returns the list as saved, so the tab can show finds it hadn't heard of.
   */
  saveDayProgress(
    dayIndex: number,
    sourceWord: string,
    found: readonly string[],
    keep: (word: string) => boolean = () => true,
  ): string[] {
    const state = this.read();
    const day = state.days[dayIndex];
    const saved =
      day?.sourceWord === sourceWord && Array.isArray(day.found)
        ? day.found.filter((w) => typeof w === 'string' && keep(w))
        : [];
    const merged = [...new Set([...saved, ...found])];
    state.days[dayIndex] = { sourceWord, found: merged };
    this.write(state);
    return merged;
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

  /**
   * The streak as it was saved, whether or not it's still going: its count and
   * the day it was last extended. For the transfer page, which hands both to
   * the app. Null when the save holds no pair of whole numbers, since a save
   * is only ever as trustworthy as the browser it sits in.
   */
  savedStreak(): { count: number; lastClearedDayIndex: number } | null {
    const streak: unknown = this.read().streak;
    if (!streak || typeof streak !== 'object') return null;
    const { count, lastClearedDayIndex } = streak as Record<string, unknown>;
    if (
      typeof count !== 'number' ||
      typeof lastClearedDayIndex !== 'number' ||
      !Number.isSafeInteger(count) ||
      !Number.isSafeInteger(lastClearedDayIndex)
    )
      return null;
    return { count, lastClearedDayIndex };
  }

  /**
   * Every day the save holds words for, for the transfer page to hand to the
   * app. A day whose entry isn't a day number, an eight-letter word in
   * lowercase and a list is left out, and so is anything in a list that isn't
   * text. Nothing here judges the words themselves: the app checks each one
   * against that day's board.
   */
  savedDays(): Record<number, DayProgress> {
    const days: unknown = this.read().days;
    if (!days || typeof days !== 'object') return {};
    const out: Record<number, DayProgress> = {};
    for (const [key, entry] of Object.entries(days)) {
      if (!/^\d+$/.test(key) || !entry || typeof entry !== 'object') continue;
      const { sourceWord, found } = entry as Record<string, unknown>;
      if (typeof sourceWord !== 'string' || !SOURCE_WORD.test(sourceWord))
        continue;
      if (!Array.isArray(found)) continue;
      const words = found.filter((w): w is string => typeof w === 'string');
      if (words.length === 0) continue;
      out[Number(key)] = { sourceWord, found: words };
    }
    return out;
  }

  /** Current streak as of today. A missed day shows the streak as broken (0). */
  currentStreak(todayIndex: number): number {
    const { count, lastClearedDayIndex } = this.read().streak;
    if (lastClearedDayIndex === null) return 0;
    return lastClearedDayIndex >= todayIndex - 1 ? count : 0;
  }

  /**
   * The in-progress Endless game, null if none has been started, or `'lost'`
   * when one was saved but can't be rebuilt.
   *
   * **Its word is all it needs.** The puzzle is rebuilt from the word and the
   * dictionary, so a word that has since left the calendar, or lost its card's
   * entry, still rebuilds its own puzzle, the way a played day keeps its word
   * (Antoine, 5 November 2026). Only a saved entry with no word of eight
   * lowercase letters can't, and `'lost'` lets the game say so rather than
   * deal a new puzzle as if none had been saved. A found list that isn't a
   * list is read as none found, and a stray value in one drops alone.
   */
  loadEndless(): EndlessState | 'lost' | null {
    const saved: unknown = this.read().endless;
    if (saved === null || saved === undefined) return null;
    if (typeof saved !== 'object') return 'lost';
    const { sourceWord, found } = saved as {
      sourceWord?: unknown;
      found?: unknown;
    };
    if (typeof sourceWord !== 'string' || !SOURCE_WORD.test(sourceWord)) {
      return 'lost';
    }
    return {
      sourceWord,
      found: Array.isArray(found)
        ? found.filter((w): w is string => typeof w === 'string')
        : [],
    };
  }

  /**
   * The day Endless was last the board in play, or null when the daily was.
   * A save from before this was kept has none, and reads as the daily.
   */
  endlessOpenOn(): number | null {
    const day = this.read().endlessOpenOn;
    return typeof day === 'number' ? day : null;
  }

  /**
   * Remember the board in play: Endless on `dayIndex`, or the daily (null).
   * A reload on the same day reopens Endless; a new day opens on the daily.
   * Writes only a change.
   */
  saveEndlessOpen(dayIndex: number | null): void {
    const state = this.read();
    if ((state.endlessOpenOn ?? null) === dayIndex) return;
    state.endlessOpenOn = dayIndex;
    this.write(state);
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
