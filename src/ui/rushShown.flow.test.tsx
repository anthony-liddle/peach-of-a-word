import { beforeEach, describe, expect, it, vi } from 'vitest';
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
 * Peach rush, shown (Antoine's go, after the phone checks on PR 4's preview):
 * the game as it ships, with the switch at its default and no `rush` given.
 * A made-up board, SERENADE. A browser's second day is offered the run; its
 * first day opens on the board, as before Peach rush.
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
function renderGame({ firstDay = false } = {}) {
  map = new Map<string, string>();
  const save: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  if (!firstDay)
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

const start = () => screen.queryByRole('region', { name: 'Today' });
const tileLetters = () =>
  [...document.querySelectorAll<HTMLElement>('.case button')]
    .map((b) => b.textContent)
    .join('');

describe('Peach rush, shown', () => {
  it('is on as the game ships', () => {
    expect(RUSH_SHOWN).toBe(true);
    expect(rushByDefault()).toBe(true);
  });

  it("offers the run on the start, on a browser's second day", () => {
    renderGame();
    expect(start()).not.toBeNull();
    expect(rushButton()).toHaveAccessibleName(
      'Peach rush, 1 minute 30 seconds on the clock',
    );
    expect(tileLetters()).toBe('');
  });

  it("opens on the board on a browser's first day, the letters on load", () => {
    renderGame({ firstDay: true });
    expect(start()).toBeNull();
    expect(rushButton()).toBeNull();
    expect(tileLetters()).toHaveLength(8);
  });

  it('has Offer Peach rush and Longer clock in Settings', () => {
    renderGame();
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    expect(
      screen.getByRole('checkbox', { name: 'Offer Peach rush' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Longer clock' }),
    ).not.toBeChecked();
  });

  it("writes nothing under the run's keys until a run is started", () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    for (const key of 'sea') fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'Enter' });
    act(() => void window.dispatchEvent(new Event('pagehide')));
    const saved = JSON.parse(map.get('eight-letters/v1')!);
    expect(saved.runs).toBeUndefined();
    expect(saved.runInFlight).toBeUndefined();
    expect(localStorage.getItem('e8-longer-clock')).toBeNull();
  });
});
