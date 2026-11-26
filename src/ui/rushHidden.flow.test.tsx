import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Game } from './Game.tsx';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { dayIndex, STORAGE_EPOCH } from '@/engine/index.ts';
import { RUSH_SHOWN, rushByDefault } from '@/rush/shown.ts';
import { useDefinitions } from './useDefinitions.ts';
import { createFlags, type Flags } from '@/flags/flags.ts';

/*
 * Peach rush, hidden (Antoine, 25 November): until PR 4 turns it on after the
 * phone checks, the game as it ships shows no way into the run, no Longer
 * clock, and writes nothing under the run's keys, with the switch at its
 * default. A made-up board, SERENADE, on a browser's second day, where the
 * run would be offered.
 */

let device: Flags;
vi.mock('@/flags/device.ts', () => ({ deviceFlags: () => device }));
vi.mock('./useDefinitions.ts', () => ({ useDefinitions: vi.fn() }));

const WORDS = ['serenade', 'sea', 'near', 'dean'];
const data: GameData = {
  dictionary: createListDictionary(WORDS),
  commonPool: createListWordSource(WORDS),
  beyond70Pool: createListWordSource([]),
  beyond95Pool: createListWordSource([]),
  dailyCalendar: {
    epoch: { year: 2026, month: 1, day: 1 },
    words: ['serenade'],
  },
  sourceEntry: () => undefined,
};

let map: Map<string, string>;

/** The game as it ships: no `rush`, so the switch decides. */
function renderGame() {
  map = new Map<string, string>();
  const save: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  new GameStorage(save).saveDayProgress(
    dayIndex(new Date(), STORAGE_EPOCH) - 1,
    'serenade',
    [],
  );
  return render(
    <Game
      data={data}
      audio={new NullAudioEngine()}
      storage={new GameStorage(save)}
    />,
  );
}

const rushButton = () => screen.queryByRole('button', { name: /^Peach rush/ });

beforeEach(() => {
  const held = new Map<string, string>();
  device = createFlags({
    storage: {
      getItem: (k) => held.get(k) ?? null,
      setItem: (k, v) => void held.set(k, v),
    },
    fetch: (async () => new Response(null, { status: 202 })) as typeof fetch,
    now: () => Date.now(),
    newId: () => '00000000-0000-4000-8000-000000000001',
    version: 'test',
  });
  (useDefinitions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    getDefinition: async () => null,
  });
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('Peach rush, hidden', () => {
  it('is off as the game ships', () => {
    expect(RUSH_SHOWN).toBe(false);
    expect(rushByDefault()).toBe(false);
  });

  it('offers no run in the toolbar, where it would be offered', () => {
    renderGame();
    expect(rushButton()).toBeNull();
    expect(document.querySelector('.runchip')).toBeNull();
  });

  it('shows no Longer clock in Settings', () => {
    renderGame();
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    expect(screen.queryByRole('checkbox', { name: 'Longer clock' })).toBeNull();
  });

  it('opens on the board even from a debug address, and writes no run', () => {
    window.history.replaceState(null, '', '/?run=end');
    renderGame();
    expect(document.querySelector('.board--run')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(map.get('eight-letters/v1')!).runs).toBeUndefined();
  });

  it("writes nothing under the run's keys through a day of play", () => {
    renderGame();
    for (const key of 'sea') fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'Enter' });
    act(() => void window.dispatchEvent(new Event('pagehide')));
    const saved = JSON.parse(map.get('eight-letters/v1')!);
    expect(saved.runs).toBeUndefined();
    expect(saved.runInFlight).toBeUndefined();
    expect(localStorage.getItem('e8-longer-clock')).toBeNull();
  });

  it('is on in a development build with ?rush, for its pictures', () => {
    window.history.replaceState(null, '', '/?rush');
    expect(rushByDefault()).toBe(true);
  });
});
