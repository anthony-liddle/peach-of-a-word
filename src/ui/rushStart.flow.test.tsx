import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Game } from './Game.tsx';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { dayIndex, STORAGE_EPOCH } from '@/engine/index.ts';
import { useDefinitions } from './useDefinitions.ts';
import { createFlags, type Flags } from '@/flags/flags.ts';
import { RUSH_OFFER_KEY } from './useRushOffer.ts';

/*
 * The start in the board (Antoine, 25 November): Play and Peach rush where the
 * meter goes, the tiles blank, while the run is offered or a run waits. With
 * the switch on. A made-up board, SERENADE.
 */

let device: Flags;
vi.mock('@/flags/device.ts', () => ({ deviceFlags: () => device }));
vi.mock('./useDefinitions.ts', () => ({ useDefinitions: vi.fn() }));

const WORDS = ['serenade', 'sea', 'near', 'dean', 'ease'];
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
const today = () => dayIndex(new Date(), STORAGE_EPOCH);

function store(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/** A browser that opened the game yesterday and found nothing. */
function secondDay(): KeyValueStore {
  const s = store();
  new GameStorage(s).saveDayProgress(today() - 1, 'serenade', []);
  return s;
}

function renderGame(save: KeyValueStore = secondDay(), persistent = true) {
  return render(
    <Game
      rush
      data={data}
      audio={new NullAudioEngine()}
      storage={new GameStorage(save, persistent)}
    />,
  );
}

function type(word: string) {
  for (const key of word) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: 'Enter' });
}

const start = () => screen.queryByRole('region', { name: 'Today' });
const play = () => screen.getByRole('button', { name: 'Play' });
const chip = () => document.querySelector<HTMLElement>('.runchip');
const tileLetters = () =>
  [...document.querySelectorAll<HTMLElement>('.case button')]
    .map((b) => b.textContent)
    .join('');
const well = () => document.querySelector<HTMLElement>('.stick')!;
const basketWords = () =>
  [...document.querySelectorAll('.found__wordtext')].map((e) => e.textContent);

/** A run started and paused yesterday's evening... today: one waiting. */
function runWaiting(save: KeyValueStore, phase: 'paused' | 'running') {
  new GameStorage(save).saveRunInFlight({
    dayIndex: today(),
    sourceWord: 'serenade',
    words: ['sea', 'near'],
    leftMs: 48_000,
    clockMs: 90_000,
    phase,
    tab: 'another',
  });
}

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

afterEach(() => localStorage.removeItem(RUSH_OFFER_KEY));

describe('the start', () => {
  it('offers Play and Peach rush, with no letter in the page', () => {
    renderGame();
    expect(start()).not.toBeNull();
    expect(play()).toBeInTheDocument();
    expect(
      within(start()!).getByRole('button', {
        name: 'Peach rush, 1 minute 30 seconds on the clock',
      }),
    ).toBeInTheDocument();
    expect(tileLetters()).toBe('');
    expect(well()).toHaveTextContent('Letters show when you choose.');
    expect(chip()).toBeNull();
  });

  it('says what the run is, in its line', () => {
    renderGame();
    expect(start()).toHaveTextContent(
      'One run a day against the clock, before your first word in the basket. Every word you find goes into your basket.',
    );
  });

  it('takes no key: typing finds nothing and sets no letter', () => {
    renderGame();
    type('sea');
    expect(tileLetters()).toBe('');
    expect(basketWords()).toEqual([]);
    expect(well()).toHaveTextContent('Letters show when you choose.');
  });

  it('shows the letters on Play, with the focus on them, and the run in the toolbar', async () => {
    renderGame();
    fireEvent.click(play());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(start()).toBeNull();
    expect(tileLetters()).toHaveLength(8);
    expect(screen.getByRole('group', { name: 'Letter tiles' })).toHaveFocus();
    expect(chip()).toHaveAccessibleName(
      'Peach rush, 1 minute 30 seconds on the clock',
    );
    type('sea');
    expect(basketWords()).toContain('sea');
  });

  it('opens the run from its Peach rush', () => {
    renderGame();
    fireEvent.click(
      within(start()!).getByRole('button', { name: /^Peach rush/ }),
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('is there again after the run screen is left before Start', () => {
    renderGame();
    fireEvent.click(
      within(start()!).getByRole('button', { name: /^Peach rush/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }));
    expect(start()).not.toBeNull();
  });
});

describe('no start', () => {
  it("on a browser's first day: no start, no button, the letters on load", () => {
    renderGame(store());
    expect(start()).toBeNull();
    expect(chip()).toBeNull();
    expect(tileLetters()).toHaveLength(8);
  });

  it("where the browser can't save", () => {
    renderGame(secondDay(), false);
    expect(start()).toBeNull();
    expect(chip()).toBeNull();
  });

  it('on Endless, and on a reload onto Endless', () => {
    const save = secondDay();
    const first = renderGame(save);
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
    expect(start()).toBeNull();
    expect(chip()).toBeNull();
    first.unmount();
    renderGame(save);
    expect(screen.getByRole('button', { name: 'Endless' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(start()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    expect(start()).not.toBeNull();
  });

  it('once the basket has a word', () => {
    const save = secondDay();
    new GameStorage(save).saveDayProgress(today(), 'serenade', ['sea']);
    renderGame(save);
    expect(start()).toBeNull();
    expect(chip()).toBeNull();
  });
});

describe('Offer Peach rush, in Settings', () => {
  it('turned off: no start and no button, the letters on load', () => {
    localStorage.setItem(RUSH_OFFER_KEY, 'off');
    renderGame();
    expect(start()).toBeNull();
    expect(chip()).toBeNull();
    expect(tileLetters()).toHaveLength(8);
  });

  it('turned off, a run already started stays reachable from the toolbar', () => {
    localStorage.setItem(RUSH_OFFER_KEY, 'off');
    const save = secondDay();
    runWaiting(save, 'paused');
    renderGame(save);
    expect(start()).toBeNull();
    expect(chip()).toHaveAccessibleName('Peach rush, paused, 48 seconds left');
  });

  it('is a row in Settings, on by default, described by its line', () => {
    renderGame();
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    const offer = screen.getByRole('checkbox', { name: 'Offer Peach rush' });
    expect(offer).toBeChecked();
    expect(offer).toHaveAccessibleDescription(
      'Turn off to go straight to the board each day.',
    );
    fireEvent.click(offer);
    expect(localStorage.getItem(RUSH_OFFER_KEY)).toBe('off');
    expect(start()).toBeNull();
  });
});

describe('a run waiting', () => {
  it('lands on the start after a reload, with the time left', () => {
    const save = secondDay();
    runWaiting(save, 'paused');
    renderGame(save);
    expect(
      within(start()!).getByRole('button', {
        name: 'Peach rush, paused, 48 seconds left',
      }),
    ).toHaveTextContent('0:48 left');
  });

  it('asks before Play ends it; Keep playing opens it paused', () => {
    const save = secondDay();
    runWaiting(save, 'paused');
    renderGame(save);
    fireEvent.click(play());
    const ask = screen.getByRole('alertdialog', { name: 'End the run?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep playing' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('ended from Play, its words go to the board, which opens', () => {
    const save = secondDay();
    runWaiting(save, 'paused');
    renderGame(save);
    fireEvent.click(play());
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'End',
      }),
    );
    expect(start()).toBeNull();
    expect(tileLetters()).toHaveLength(8);
    expect(basketWords()).toEqual(expect.arrayContaining(['sea', 'near']));
    expect(chip()).toHaveAccessibleName(/^Peach rush, 2 words, \d+ points$/);
  });

  it('says another tab has it, and Play goes straight to the board', () => {
    const save = secondDay();
    runWaiting(save, 'running');
    renderGame(save);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'eight-letters/v1' }),
      );
    });
    expect(
      within(start()!).getByRole('button', {
        name: 'Peach rush, going in another tab',
      }),
    ).toHaveTextContent('In another tab');
    fireEvent.click(play());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(tileLetters()).toHaveLength(8);
  });
});
