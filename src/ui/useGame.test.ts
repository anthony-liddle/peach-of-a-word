import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { messageText, useGame } from './useGame.ts';
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

describe('the sound a press makes', () => {
  it('Shuffle plays its cue, once a press, and sets no tile', () => {
    const audio = new NullAudioEngine();
    const shuffle = vi.spyOn(audio, 'playShuffle');
    const tick = vi.spyOn(audio, 'tick');
    const { result } = renderHook(() =>
      useGame(
        dataAnchoredAt({ year: 2026, month: 6, day: 23 }),
        audio,
        new GameStorage(capturingStore().store),
      ),
    );
    act(() => result.current.shuffle());
    expect(shuffle).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.shuffle();
      result.current.shuffle();
    });
    expect(shuffle).toHaveBeenCalledTimes(3);
    expect(tick).not.toHaveBeenCalled();
  });

  it('a tile set plays the tick, and no Shuffle', () => {
    const audio = new NullAudioEngine();
    const shuffle = vi.spyOn(audio, 'playShuffle');
    const tick = vi.spyOn(audio, 'tick');
    const { result } = renderHook(() =>
      useGame(
        dataAnchoredAt({ year: 2026, month: 6, day: 23 }),
        audio,
        new GameStorage(capturingStore().store),
      ),
    );
    act(() => result.current.addTile(0));
    act(() => result.current.addLetter('e'));
    expect(tick).toHaveBeenCalledTimes(2);
    expect(shuffle).not.toHaveBeenCalled();
  });
});

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

/*
 * Two tabs on today's board, sharing one save, as two tabs share a browser's
 * local storage. Each is opened before either finds a word.
 */
describe('two tabs on the same day', () => {
  const data = () => dataAnchoredAt({ year: 2026, month: 6, day: 23 });

  function twoTabs() {
    const cap = capturingStore();
    const open = () =>
      renderHook(() =>
        useGame(data(), new NullAudioEngine(), new GameStorage(cap.store)),
      ).result;
    return { cap, a: open(), b: open() };
  }

  function find(tab: { current: ReturnType<typeof useGame> }, word: string) {
    for (const letter of word) act(() => tab.current.addLetter(letter));
    act(() => tab.current.submit());
  }

  /** The browser's word to every other tab that the save changed. */
  function anotherTabSaved() {
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'eight-letters/v1' }),
      );
    });
  }

  function savedToday(cap: ReturnType<typeof capturingStore>) {
    const saved = cap.read() as {
      days: Record<number, { found: string[] }>;
    };
    return saved.days[dayIndex(new Date(), STORAGE_EPOCH)]?.found;
  }

  it("keeps the first tab's find when the second tab finds one", () => {
    const { cap, a, b } = twoTabs();
    find(a, 'sea');
    find(b, 'near');
    expect(savedToday(cap)).toEqual(['sea', 'near']);
  });

  /** The points for these words, found in one tab on a save of its own. */
  function pointsFor(...words: string[]) {
    const tab = renderHook(() =>
      useGame(
        data(),
        new NullAudioEngine(),
        new GameStorage(capturingStore().store),
      ),
    ).result;
    for (const word of words) find(tab, word);
    return tab.current.state.totalScore;
  }

  it("shows the second tab the first tab's find once it saves its own", () => {
    const { a, b } = twoTabs();
    find(a, 'sea');
    find(b, 'near');
    expect(b.current.state.found).toEqual(['sea', 'near']);
    expect(b.current.state.totalScore).toBe(pointsFor('sea', 'near'));
  });

  it("shows the first tab the second tab's find as it's saved, with its points", () => {
    const { a, b } = twoTabs();
    find(a, 'sea');
    find(b, 'near');
    anotherTabSaved();
    expect(a.current.state.found).toEqual(['sea', 'near']);
    expect(a.current.state.totalScore).toBe(pointsFor('sea', 'near'));
  });

  it('calls a word the other tab found already found', () => {
    const { a, b } = twoTabs();
    find(b, 'near');
    anotherTabSaved();
    find(a, 'near');
    expect(messageText(a.current.state.message!, 'cute')).toBe(
      'Already found.',
    );
  });

  it('leaves the letters being typed, the rack and the line where they were', () => {
    const { a, b } = twoTabs();
    find(a, 'sea');
    act(() => a.current.shuffle());
    act(() => a.current.addLetter('n'));
    act(() => a.current.addLetter('e'));
    const before = a.current.state;
    find(b, 'near');
    anotherTabSaved();
    const after = a.current.state;
    expect(after.found).toEqual(['sea', 'near']);
    expect(after.composing).toEqual(before.composing);
    expect(after.rackOrder).toEqual(before.rackOrder);
    expect(after.message).toBe(before.message);
    expect(after.announcement).toBe(before.announcement);
  });

  it("doesn't open the card or announce when the other tab finds the peach of a word", () => {
    const { a, b } = twoTabs();
    find(b, 'serenade');
    const announcement = a.current.state.announcement;
    anotherTabSaved();
    expect(a.current.state.sourceRevealed).toBe(true);
    expect(a.current.state.revealOpen).toBe(false);
    expect(a.current.state.announcement).toBe(announcement);
  });

  it('never takes a word away, whatever the save says', () => {
    const { cap, a } = twoTabs();
    find(a, 'sea');
    cap.store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {},
        streak: { count: 0, lastClearedDayIndex: null },
        endless: null,
      }),
    );
    anotherTabSaved();
    expect(a.current.state.found).toEqual(['sea']);
  });

  it('reads the save again when the page comes back from the back-forward cache', () => {
    const { a, b } = twoTabs();
    find(b, 'near');
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      );
    });
    expect(a.current.state.found).toEqual(['near']);
  });
});

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

describe('endless New Puzzle', () => {
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

/**
 * A reload reopens the board the player was on, the same day (Antoine, 5
 * November 2026), as the iOS app does since #123. A reload is a second hook on
 * the same store.
 */
describe('a reload', () => {
  const LINE =
    "Your last Endless puzzle couldn't be brought back, so here's a new one.";

  function open(
    cap: ReturnType<typeof capturingStore>,
    data = endlessData(todayEpoch()),
  ) {
    return renderHook(() =>
      useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
    ).result;
  }

  /** A save holding `endless`, with Endless the board in play on `openOn`. */
  function saved(endless: unknown, openOn: number | null) {
    const cap = capturingStore();
    cap.store.setItem(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: {},
        streak: { count: 0, lastClearedDayIndex: null },
        endless,
        endlessOpenOn: openOn,
      }),
    );
    return cap;
  }

  const today = () => dayIndex(new Date(), STORAGE_EPOCH);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the same day reopens Endless, on the puzzle the player left', () => {
    const cap = capturingStore();
    const first = open(cap);
    act(() => first.current.setMode('endless'));
    const word = first.current.state.puzzle.sourceWord;

    const again = open(cap);
    expect(again.current.state.mode).toBe('endless');
    expect(again.current.state.puzzle.sourceWord).toBe(word);
    expect(again.current.state.message).toBeNull();
  });

  it('the same day, after going back to the daily, opens the daily', () => {
    const cap = capturingStore();
    const first = open(cap);
    act(() => first.current.setMode('endless'));
    act(() => first.current.setMode('daily'));
    expect(open(cap).current.state.mode).toBe('daily');
  });

  it('the next day opens the daily', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date();
    vi.setSystemTime(now);
    const cap = capturingStore();
    const data = endlessData(todayEpoch());
    const first = open(cap, data);
    act(() => first.current.setMode('endless'));

    vi.setSystemTime(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9),
    );
    expect(open(cap, data).current.state.mode).toBe('daily');
  });

  it('keeps an Endless puzzle whose word has left the lists', () => {
    // Off the calendar, and with no entry for its card: still its puzzle.
    const data = {
      ...endlessData(todayEpoch()),
      dailyCalendar: {
        epoch: todayEpoch(),
        words: ['serenade', 'lemonade', 'renegade'],
      },
      sourceEntry: () => undefined,
    };
    const reloaded = open(
      saved({ sourceWord: 'colander', found: [] }, today()),
      data,
    );
    expect(reloaded.current.state.mode).toBe('endless');
    expect(reloaded.current.state.puzzle.sourceWord).toBe('colander');

    // And entered later, not reloaded into: the same.
    const later = open(
      saved({ sourceWord: 'colander', found: [] }, null),
      data,
    );
    expect(later.current.state.mode).toBe('daily');
    act(() => later.current.setMode('endless'));
    expect(later.current.state.puzzle.sourceWord).toBe('colander');
  });

  it("deals a new puzzle for one that can't be rebuilt, says so once, and keeps it", () => {
    const cap = saved({ sourceWord: 7, found: [] }, today());
    const reloaded = open(cap);
    const state = reloaded.current.state;
    expect(state.mode).toBe('endless');
    expect(CALENDAR.slice(1)).toContain(state.puzzle.sourceWord);
    expect(state.message?.body).toEqual({ kind: 'plain', text: LINE });
    expect(state.announcement.body).toEqual({ kind: 'plain', text: LINE });

    const again = open(cap);
    expect(again.current.state.puzzle.sourceWord).toBe(state.puzzle.sourceWord);
    expect(again.current.state.message).toBeNull();
  });

  it('says so too when Endless is entered later, not reloaded into', () => {
    const entered = open(saved({ sourceWord: 'absolut', found: [] }, null));
    expect(entered.current.state.mode).toBe('daily');
    act(() => entered.current.setMode('endless'));
    expect(entered.current.state.message?.body).toEqual({
      kind: 'plain',
      text: LINE,
    });
  });
});

describe('a refused word', () => {
  // On a board of SERENADE whose list holds only SEA and NEAR: RAND spells
  // from the rack and isn't in the list, so the game refuses it.
  function play() {
    const { result } = renderHook(() =>
      useGame(
        dataAnchoredAt({ year: 2026, month: 6, day: 23 }),
        new NullAudioEngine(),
        new GameStorage(capturingStore().store),
      ),
    );
    const type = (word: string) => {
      for (const letter of word) act(() => result.current.addLetter(letter));
      act(() => result.current.submit());
    };
    return { result, type };
  }

  it('carries the word, and still reads and says "Not in the word list."', () => {
    const { result, type } = play();
    type('rand');
    const { message, announcement } = result.current.state;
    expect(message?.body).toEqual({ kind: 'refused', word: 'rand' });
    expect(message?.tone).toBe('error');
    expect(messageText(message!, 'cute')).toBe('Not in the word list.');
    expect(announcement.body).toEqual({
      kind: 'plain',
      text: 'Not in the word list.',
    });
  });

  it('leaves the other refusals plain, with no word to suggest', () => {
    const { result, type } = play();
    type('se');
    expect(result.current.state.message?.body).toEqual({
      kind: 'plain',
      text: 'Three letters or more.',
    });
    type('sea');
    type('sea');
    expect(result.current.state.message?.body).toEqual({
      kind: 'plain',
      text: 'Already found.',
    });
  });

  it('becomes the confirmation once suggested and sent, and says so', () => {
    const { result, type } = play();
    type('rand');
    act(() => result.current.suggested('rand', true));
    const { message, announcement } = result.current.state;
    expect(message).toEqual({
      body: { kind: 'plain', text: '✓ Suggestion sent.' },
      tone: 'success',
    });
    expect(announcement.body).toEqual({
      kind: 'plain',
      text: 'Suggested. Sent.',
    });
  });

  it("says saved, not sent, when the suggestion couldn't go yet", () => {
    const { result, type } = play();
    type('rand');
    act(() => result.current.suggested('rand', false));
    expect(result.current.state.message?.body).toEqual({
      kind: 'plain',
      text: "✓ Suggestion saved. It'll send later.",
    });
    expect(result.current.state.announcement.body).toEqual({
      kind: 'plain',
      text: 'Suggested. Waiting to send.',
    });
  });

  it('changes nothing once the player has started the next word, even after deleting back', () => {
    // The send answers after a letter has landed: a confirmation set then
    // would come back when the stick is emptied, answering nothing.
    const { result, type } = play();
    type('rand');
    const seq = result.current.state.announcement.seq;
    act(() => result.current.addLetter('s'));
    act(() => result.current.suggested('rand', true));
    act(() => result.current.removeLast());
    expect(result.current.state.message).toBeNull();
    expect(result.current.state.announcement.seq).toBe(seq);
  });

  it('changes nothing for a word that is no longer the refusal on show', () => {
    const { result, type } = play();
    type('rand');
    type('dens');
    act(() => result.current.suggested('rand', true));
    expect(result.current.state.message?.body).toEqual({
      kind: 'refused',
      word: 'dens',
    });
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
    // And the save forgets it too, so the transfer page never hands it to
    // the app: a save keeps another tab's finds, but only ones the board takes.
    const saved = cap.read() as { days: Record<number, { found: string[] }> };
    expect(saved.days[dayIndex(today, STORAGE_EPOCH)]?.found).toEqual(['sea']);
  });
});

/*
 * The streak, with a page left open past midnight. The page keeps the day it
 * opened on, so it can clear that day after another tab, opened the next
 * morning, has cleared the next. Both share one save, as tabs share a browser.
 */
describe('a page left open past midnight', () => {
  afterEach(() => vi.useRealTimers());

  it("clears its own day without breaking the next day's streak", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cap = capturingStore();
    const data = dataAnchoredAt({ year: 2026, month: 6, day: 23 });
    const open = () =>
      renderHook(() =>
        useGame(data, new NullAudioEngine(), new GameStorage(cap.store)),
      ).result;
    const clear = (tab: { current: ReturnType<typeof useGame> }) => {
      for (const word of ['sea', 'near', 'serenade']) {
        for (const letter of word) act(() => tab.current.addLetter(letter));
        act(() => tab.current.submit());
      }
    };

    vi.setSystemTime(new Date(2026, 10, 14, 23, 50));
    const lateNight = open();
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0));
    const morning = open();
    clear(morning);
    // Back to the page from last night, which still plays the 14th.
    clear(lateNight);

    const storage = new GameStorage(cap.store);
    const fifteenth = dayIndex(new Date(2026, 10, 15), STORAGE_EPOCH);
    expect(storage.savedStreak()?.lastClearedDayIndex).toBe(fifteenth);
    expect(storage.currentStreak(fifteenth + 1)).toBe(1);
  });
});
