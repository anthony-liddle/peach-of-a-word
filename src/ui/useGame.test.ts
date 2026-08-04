import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGame } from './useGame.ts';
import { dayIndex, STORAGE_EPOCH } from '@/engine/index.ts';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import type { GameData } from '@/data/gameData.ts';

function capturingStore(): { store: KeyValueStore; read: () => unknown } {
  const map = new Map<string, string>();
  return {
    store: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
    },
    read: () => {
      const raw = map.get('eight-letters/v1');
      return raw ? JSON.parse(raw) : null;
    },
  };
}

// Calendar re-anchored to a recent date, the way Phase 2 leaves it.
function dataAnchoredAt(epoch: {
  year: number;
  month: number;
  day: number;
}): GameData {
  return {
    dictionary: createListDictionary(['serenade', 'sea', 'near']),
    commonPool: createListWordSource(['serenade', 'sea', 'near']),
    beyond70Pool: createListWordSource([]),
    beyond95Pool: createListWordSource([]),
    dailyCalendar: { epoch, words: ['serenade'] },
    sourceEntry: () => undefined,
  };
}

describe('useGame daily day-key', () => {
  it('persists day progress under the fixed STORAGE_EPOCH, not the calendar epoch', () => {
    // The calendar epoch is re-anchored to today, but the storage and streak
    // key must keep counting from the fixed origin so a streak survives the
    // re-anchor. The two indices differ, so this is discriminating.
    const calendarEpoch = { year: 2026, month: 6, day: 23 };
    const data = dataAnchoredAt(calendarEpoch);
    const cap = capturingStore();
    const { result } = renderHook(() =>
      useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
    );

    // Find the set word 'sea' from the rack serenade, which persists progress.
    act(() => {
      result.current.addLetter('s');
      result.current.addLetter('e');
      result.current.addLetter('a');
    });
    act(() => result.current.submit());

    const persisted = cap.read() as { days: Record<string, unknown> } | null;
    const keys = Object.keys(persisted?.days ?? {}).map(Number);
    const today = new Date();
    expect(keys).toContain(dayIndex(today, STORAGE_EPOCH));
    expect(keys).not.toContain(dayIndex(today, calendarEpoch));
  });
});

describe('endless New Puzzle', () => {
  const CALENDAR = [
    'serenade',
    'lemonade',
    'renegade',
    'colander',
    'grenades',
    'reloaded',
  ];

  function endlessData(epoch: {
    year: number;
    month: number;
    day: number;
  }): GameData {
    return {
      dictionary: createListDictionary(['sea', 'near', 'lane']),
      commonPool: createListWordSource(['sea', 'near', 'lane']),
      beyond70Pool: createListWordSource([]),
      beyond95Pool: createListWordSource([]),
      dailyCalendar: { epoch, words: CALENDAR },
      // Known to the data, so a stored endless word actually rehydrates.
      sourceEntry: (word) => ({ word, definition: null, etymology: null }),
    };
  }

  /** Today's calendar epoch, so the daily is the calendar's first word. */
  function todayEpoch(): { year: number; month: number; day: number } {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }

  function pressNewPuzzle(count: number): string[] {
    const data = endlessData(todayEpoch());
    const cap = capturingStore();
    const { result } = renderHook(() =>
      useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
    );
    act(() => result.current.setMode('endless'));
    const words = [result.current.state.puzzle.sourceWord];
    for (let i = 1; i < count; i++) {
      act(() => result.current.newEndless());
      words.push(result.current.state.puzzle.sourceWord);
    }
    return words;
  }

  it('never repeats a word before the pool is exhausted', () => {
    // The pool is the calendar minus the daily word, so a full pass is one
    // shorter than the calendar.
    const pool = CALENDAR.filter((w) => w !== CALENDAR[0]);
    const words = pressNewPuzzle(pool.length);
    expect([...words].sort()).toEqual([...pool].sort());
  });

  it('does not repeat across the pass boundary', () => {
    const pool = CALENDAR.filter((w) => w !== CALENDAR[0]);
    const words = pressNewPuzzle(pool.length + 1);
    expect(words[pool.length]).not.toBe(words[pool.length - 1]);
  });

  it('never serves the daily word', () => {
    const words = pressNewPuzzle(60);
    expect(words).not.toContain(CALENDAR[0]);
  });

  it('does not hand a rehydrated endless word straight back', () => {
    const data = endlessData(todayEpoch());
    const cap = capturingStore();
    cap.store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {},
        streak: { count: 0, lastClearedDayIndex: null },
        endless: { sourceWord: 'colander', found: [] },
      }),
    );
    const { result } = renderHook(() =>
      useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
    );
    act(() => result.current.setMode('endless'));
    expect(result.current.state.puzzle.sourceWord).toBe('colander');
    act(() => result.current.newEndless());
    expect(result.current.state.puzzle.sourceWord).not.toBe('colander');
  });
});

describe('a demoted word already saved in progress', () => {
  it('stays found and scored, but no longer counts toward completion', () => {
    // Demotion lowers the denominator, so a board that was one word short can
    // now read complete. Nothing migrates: progress is stored as found words
    // and completion is recomputed from the live puzzle. Verified, not assumed.
    const epoch = { year: 2026, month: 6, day: 23 };
    // 'near' stands in for a demoted word: still valid and still scoreable,
    // but out of the common pool, so out of the completion denominator.
    const data: GameData = {
      dictionary: createListDictionary(['serenade', 'sea', 'near']),
      commonPool: createListWordSource(['serenade', 'sea']),
      beyond70Pool: createListWordSource([]),
      beyond95Pool: createListWordSource([]),
      dailyCalendar: { epoch, words: ['serenade'] },
      sourceEntry: () => undefined,
    };
    const cap = capturingStore();
    const today = new Date();
    cap.store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {
          [dayIndex(today, STORAGE_EPOCH)]: {
            sourceWord: 'serenade',
            found: ['sea', 'near', 'serenade'],
          },
        },
        streak: { count: 0, lastClearedDayIndex: null },
        endless: null,
      }),
    );

    const { result } = renderHook(() =>
      useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
    );

    // Kept: demotion is not denial, so the find survives rehydration.
    expect(result.current.state.found).toContain('near');
    // But the set is now just sea and serenade, and both are found, so the
    // board reads complete even though a previously required word is gone.
    expect(result.current.state.puzzle.commonWords.has('near')).toBe(false);
    expect(result.current.state.puzzle.commonWords.size).toBe(2);
    const foundSetWords = result.current.state.found.filter((w) =>
      result.current.state.puzzle.commonWords.has(w),
    );
    expect(foundSetWords).toHaveLength(2);
  });
});

describe('a denied word already saved in progress', () => {
  it('is dropped on rehydration, so no migration is needed', () => {
    // Bea found one before it was denied, so it is sitting in her stored found
    // list. Denying a word removes it from validation, and a restored game
    // keeps only words validation still knows, so it disappears from the found
    // list, the glossary and the score with no migration step. Verified rather
    // than assumed: progress is stored as found words, and everything else is
    // recomputed from the live puzzle.
    const epoch = { year: 2026, month: 6, day: 23 };
    const data: GameData = {
      // 'near' stands in for a denied word: still spellable from the rack, but
      // no longer in the dictionary the puzzle is built from.
      dictionary: createListDictionary(['serenade', 'sea']),
      commonPool: createListWordSource(['serenade', 'sea']),
      beyond70Pool: createListWordSource([]),
      beyond95Pool: createListWordSource([]),
      dailyCalendar: { epoch, words: ['serenade'] },
      sourceEntry: () => undefined,
    };
    const cap = capturingStore();
    const today = new Date();
    cap.store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {
          [dayIndex(today, STORAGE_EPOCH)]: {
            sourceWord: 'serenade',
            found: ['sea', 'near'],
          },
        },
        streak: { count: 0, lastClearedDayIndex: null },
        endless: null,
      }),
    );

    const { result } = renderHook(() =>
      useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
    );

    expect(result.current.state.mode).toBe('daily');
    expect(result.current.state.found).toContain('sea');
    expect(result.current.state.found).not.toContain('near');
    // And it is not scored: the score is recomputed from the surviving finds.
    expect(result.current.state.foundSet.has('near')).toBe(false);
  });
});
