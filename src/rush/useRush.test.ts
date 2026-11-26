import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createPuzzle } from '@/engine/index.ts';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import {
  GameStorage,
  type KeyValueStore,
  type RunRecord,
} from '@/persistence/storage.ts';
import { useRush, READY_LINE, ELSEWHERE_LINE } from './useRush.ts';
import type { RushLock } from './lock.ts';

/*
 * The run, as a hook, on a made-up board, SERENADE. The clock is faked, and
 * read a quarter-second at a time as the page reads it. Two hooks on one save
 * stand in for two tabs; a shared fake lock stands in for the browser's.
 */

const WORDS = ['serenade', 'sea', 'near', 'dean', 'ease'];
const puzzle = createPuzzle(
  'serenade',
  createListDictionary(WORDS),
  createListWordSource(WORDS),
  createListWordSource([]),
  createListWordSource([]),
);
const DAY = 300;

function sharedStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/** The browser's locks, for every tab of one test. `die` frees a crashed holder. */
function fakeLocks() {
  let holder: symbol | null = null;
  const waiters: (() => void)[] = [];
  const free = () => {
    holder = null;
    for (const w of waiters.splice(0)) w();
  };
  const lock = (): RushLock => ({
    take: async () => {
      if (holder) return null;
      const me = Symbol('tab');
      holder = me;
      return async () => {
        if (holder === me) free();
      };
    },
    held: async () => holder !== null,
    whenFree: (signal) =>
      new Promise((resolve) => {
        if (!holder) return resolve();
        waiters.push(() => {
          if (!signal.aborted) resolve();
        });
      }),
  });
  return { lock, die: free };
}

let audio: NullAudioEngine;
let carried: string[][];

function openTab(
  store: KeyValueStore,
  opts: { lock?: RushLock | null; longerClock?: boolean } = {},
) {
  const storage = new GameStorage(store);
  return renderHook(() =>
    useRush({
      puzzle,
      sourceEntry: undefined,
      dayIndex: DAY,
      storage,
      audio,
      longerClock: opts.longerClock ?? false,
      onCarry: (words) => carried.push(words),
      lock: opts.lock === undefined ? null : opts.lock,
    }),
  ).result;
}

type Tab = ReturnType<typeof openTab>;

/** The clock, read every quarter second for `ms`, as the page reads it. */
function tick(ms: number) {
  for (let t = 0; t < ms; t += 250) act(() => vi.advanceTimersByTime(250));
}

function find(tab: Tab, word: string) {
  for (const letter of word) act(() => tab.current.addLetter(letter));
  act(() => tab.current.submit());
}

const letters = (tab: Tab) =>
  tab.current.state.tiles.map((t) => t.letter).join('');

function hide() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
}

function anotherTabSaved() {
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'eight-letters/v1' }),
    );
  });
}

/** Lets the lock's promises settle. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
      'performance',
    ],
  });
  audio = new NullAudioEngine();
  carried = [];
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('before Start', () => {
  it('shows no letter, the clock at 1:30, and the ready line', () => {
    const tab = openTab(sharedStore());
    expect(tab.current.phase).toBe('ready');
    expect(letters(tab)).toBe('');
    expect(tab.current.leftMs).toBe(90_000);
    expect(tab.current.state.message?.body).toEqual({
      kind: 'plain',
      text: READY_LINE,
    });
  });

  it('takes no letter', () => {
    const tab = openTab(sharedStore());
    act(() => tab.current.addLetter('s'));
    expect(tab.current.state.composing).toEqual([]);
  });

  it('is 3:00 with Longer clock', () => {
    const tab = openTab(sharedStore(), { longerClock: true });
    expect(tab.current.leftMs).toBe(180_000);
  });
});

describe('the clock running', () => {
  it('starts, says so, shows the letters and saves the run', () => {
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    expect(tab.current.phase).toBe('running');
    expect(tab.current.timeSpoken).toBe(
      'Started. 1 minute 30 seconds on the clock.',
    );
    expect(letters(tab)).toHaveLength(8);
    const flight = new GameStorage(store).loadRunInFlight();
    expect(flight).toMatchObject({
      phase: 'running',
      leftMs: 90_000,
      words: [],
    });
  });

  it('saves each find, with the time left', () => {
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    tick(5_000);
    find(tab, 'sea');
    const flight = new GameStorage(store).loadRunInFlight();
    expect(flight?.words).toEqual(['sea']);
    expect(flight?.leftMs).toBe(85_000);
  });

  it('says each mark once, and plays the ten-second cue', () => {
    const ten = vi.spyOn(audio, 'playRushTen');
    const tab = openTab(sharedStore());
    act(() => tab.current.start());
    tick(30_000);
    expect(tab.current.timeSpoken).toBe('1 minute left.');
    tick(30_000);
    expect(tab.current.timeSpoken).toBe('30 seconds left.');
    tick(20_000);
    expect(tab.current.timeSpoken).toBe('10 seconds left.');
    expect(ten).toHaveBeenCalledTimes(1);
  });

  it('says no mark after a stall that jumped past it', () => {
    const tab = openTab(sharedStore());
    act(() => tab.current.start());
    tick(58_000);
    // A phone asleep: the next reading comes three seconds on.
    act(() => vi.advanceTimersByTime(3_000));
    expect(tab.current.timeSpoken).not.toBe('30 seconds left.');
  });

  it('opens no card and says no rank when the run finds the peach of a word', () => {
    const tab = openTab(sharedStore());
    act(() => tab.current.start());
    find(tab, 'serenade');
    expect(tab.current.slice.revealOpen).toBe(false);
    const body = tab.current.slice.announcement.body;
    expect(JSON.stringify(body)).not.toContain('New rank');
  });
});

describe('the end', () => {
  it("is time's up at 0:00: kept, carried, said with the tally", () => {
    const end = vi.spyOn(audio, 'playRushEnd');
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    find(tab, 'sea');
    find(tab, 'near');
    tick(90_000);
    expect(tab.current.phase).toBe('over');
    expect(end).toHaveBeenCalledTimes(1);
    expect(tab.current.timeSpoken).toMatch(
      /^Time's up\. 2 words, \d+ points\.$/,
    );
    expect(carried).toEqual([['sea', 'near']]);
    const storage = new GameStorage(store);
    expect(storage.loadRun(DAY, 'serenade')?.endedEarly).toBe(false);
    expect(storage.loadRunInFlight()).toBeNull();
  });

  it('is End, early: kept with the time left, carried, nothing said', () => {
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    tick(10_000);
    find(tab, 'dean');
    act(() => tab.current.end());
    expect(tab.current.phase).toBe('over');
    expect(tab.current.timeSpoken).toBe('');
    expect(carried).toEqual([['dean']]);
    expect(tab.current.record).toMatchObject({
      endedEarly: true,
      leftMs: 80_000,
    });
  });

  it('owes the card once when the run found the peach of a word', () => {
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    find(tab, 'serenade');
    act(() => tab.current.end());
    expect(tab.current.record?.peachCardOwed).toBe(true);
    act(() => tab.current.cardShown());
    expect(new GameStorage(store).loadRun(DAY, 'serenade')?.peachCardOwed).toBe(
      false,
    );
  });

  it('is one a day: a tab opened after the run shows it, and Start does nothing', () => {
    const store = sharedStore();
    const first = openTab(store);
    act(() => first.current.start());
    act(() => first.current.end());
    const later = openTab(store);
    expect(later.current.phase).toBe('over');
    act(() => later.current.start());
    expect(later.current.phase).toBe('over');
    expect(carried).toHaveLength(1);
  });
});

describe('leaving', () => {
  it('pauses on a hidden tab: letters gone, the time kept and saved', () => {
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    tick(12_000);
    find(tab, 'sea');
    hide();
    expect(tab.current.phase).toBe('paused');
    expect(tab.current.timeSpoken).toBe('Paused.');
    expect(letters(tab)).toBe('');
    expect(tab.current.leftMs).toBe(78_000);
    tick(5_000);
    expect(tab.current.leftMs).toBe(78_000);
    expect(new GameStorage(store).loadRunInFlight()).toMatchObject({
      phase: 'paused',
      leftMs: 78_000,
      words: ['sea'],
    });
  });

  it('pauses as the page goes, and comes back paused at that time', () => {
    const store = sharedStore();
    const tab = openTab(store);
    act(() => tab.current.start());
    tick(3_000);
    find(tab, 'sea');
    tick(4_000);
    act(() => void window.dispatchEvent(new Event('pagehide')));
    const reloaded = openTab(store);
    expect(reloaded.current.phase).toBe('paused');
    expect(reloaded.current.leftMs).toBe(83_000);
    expect(reloaded.current.slice.found).toEqual(['sea']);
    expect(letters(reloaded)).toBe('');
  });

  it("doesn't pause when the window only loses the focus", () => {
    const tab = openTab(sharedStore());
    act(() => tab.current.start());
    act(() => void window.dispatchEvent(new Event('blur')));
    expect(tab.current.phase).toBe('running');
  });

  it('resumes where it paused, and says so', () => {
    const tab = openTab(sharedStore());
    act(() => tab.current.start());
    tick(42_000);
    hide();
    Reflect.deleteProperty(document, 'visibilityState');
    act(() => tab.current.resume());
    expect(tab.current.phase).toBe('running');
    expect(tab.current.timeSpoken).toBe('Resumed. 48 seconds left.');
  });
});

describe('two tabs, without the browser lock', () => {
  it('says the run is going in the other tab, then offers it back paused', () => {
    const store = sharedStore();
    const a = openTab(store);
    const b = openTab(store);
    act(() => a.current.start());
    find(a, 'sea');
    anotherTabSaved();
    expect(b.current.phase).toBe('elsewhere');
    expect(b.current.state.message?.body).toEqual({
      kind: 'plain',
      text: ELSEWHERE_LINE,
    });
    expect(letters(b)).toBe('');
    hide();
    anotherTabSaved();
    expect(b.current.phase).toBe('paused');
    expect(b.current.slice.found).toEqual(['sea']);
  });

  it('shows the other tab its result when one ends it', () => {
    const store = sharedStore();
    const a = openTab(store);
    const b = openTab(store);
    act(() => a.current.start());
    act(() => a.current.end());
    anotherTabSaved();
    expect(b.current.phase).toBe('over');
    expect(b.current.record).not.toBeNull();
  });
});

describe('two tabs, with the browser lock', () => {
  it('never starts a second run while the first tab has it going', async () => {
    const store = sharedStore();
    const { lock } = fakeLocks();
    const a = openTab(store, { lock: lock() });
    const b = openTab(store, { lock: lock() });
    act(() => a.current.start());
    await settle();
    expect(a.current.phase).toBe('running');
    act(() => b.current.start());
    await settle();
    expect(b.current.phase).toBe('elsewhere');
  });

  it("gets back a crashed tab's run, paused at its last saved time", async () => {
    const store = sharedStore();
    const { lock, die } = fakeLocks();
    const a = openTab(store, { lock: lock() });
    act(() => a.current.start());
    await settle();
    tick(10_000);
    find(a, 'near');
    // A tab opened after: the save says running, and the lock is held.
    const b = openTab(store, { lock: lock() });
    await settle();
    expect(b.current.phase).toBe('elsewhere');
    // Tab A dies, writing nothing; the browser lets its lock go.
    act(() => die());
    await settle();
    expect(b.current.phase).toBe('paused');
    expect(b.current.leftMs).toBe(80_000);
    expect(b.current.slice.found).toEqual(['near']);
  });

  it('starts without the lock when the browser refuses the request', async () => {
    const refusing: RushLock = {
      take: () => Promise.reject(new Error('refused')),
      held: async () => false,
      whenFree: () => new Promise(() => {}),
    };
    const tab = openTab(sharedStore(), { lock: refusing });
    act(() => tab.current.start());
    await settle();
    expect(tab.current.phase).toBe('running');
  });

  it('reads a run the save calls running, with no lock held, as paused', async () => {
    const store = sharedStore();
    const { lock } = fakeLocks();
    new GameStorage(store).saveRunInFlight({
      dayIndex: DAY,
      sourceWord: 'serenade',
      words: ['sea'],
      leftMs: 31_000,
      clockMs: 90_000,
      phase: 'running',
      tab: 'gone',
    });
    const tab = openTab(store, { lock: lock() });
    await settle();
    expect(tab.current.phase).toBe('paused');
    expect(tab.current.leftMs).toBe(31_000);
  });
});

describe('a run kept that the save can read', () => {
  it("opens on today's run, as kept", () => {
    const store = sharedStore();
    const kept: RunRecord = {
      sourceWord: 'serenade',
      words: ['near'],
      points: 3,
      peach: false,
      best: { word: 'near', points: 3 },
      endedEarly: true,
      leftMs: 41_000,
      clockMs: 90_000,
      peachCardOwed: false,
    };
    new GameStorage(store).saveRun(DAY, kept);
    const tab = openTab(store);
    expect(tab.current.phase).toBe('over');
    expect(tab.current.state.message?.body).toEqual({
      kind: 'plain',
      text: 'Ended with 0:41 left.',
    });
  });
});
