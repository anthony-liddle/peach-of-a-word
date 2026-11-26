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
import { settleOldRun } from '@/rush/settle.ts';
import { useDefinitions } from './useDefinitions.ts';
import { createFlags, type Flags } from '@/flags/flags.ts';
import { RUN_PEACH_MS } from './Game.tsx';

/*
 * Peach rush through the whole game, with the switch on: its button in the
 * toolbar, the run, End's question, the result, the peach of a word's card,
 * and the board after. A made-up board, SERENADE.
 *
 * Every test but the first-day one opens on a browser's second day: the save
 * holds yesterday, opened with no word found.
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

function renderGame(save: KeyValueStore = secondDay()) {
  return render(
    <Game
      rush
      data={data}
      audio={new NullAudioEngine()}
      storage={new GameStorage(save)}
    />,
  );
}

function type(word: string) {
  for (const key of word) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: 'Enter' });
}

const rushButton = () =>
  screen.queryByRole('button', { name: /^Peach rush, / });
const tiles = () => screen.getByRole('group', { name: 'Letter tiles' });
const tileLetters = () =>
  [...document.querySelectorAll<HTMLElement>('.case button')]
    .map((b) => b.textContent)
    .join('');
const runHead = () => screen.getByRole('region', { name: 'Peach rush' });
const basket = () => screen.getByRole('region', { name: 'Words found' });
const result = () => screen.queryByRole('dialog', { name: /Time's up|Ended/ });

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
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('the way in', () => {
  it("isn't there on a browser's first day", () => {
    renderGame(store());
    expect(rushButton()).toBeNull();
  });

  it('is on the start from the second day, then in the toolbar after Play, until the first word', () => {
    renderGame();
    expect(rushButton()).toHaveAccessibleName(
      'Peach rush, 1 minute 30 seconds on the clock',
    );
    expect(document.querySelector('.runchip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(document.querySelector('.runchip')).toHaveAccessibleName(
      'Peach rush, 1 minute 30 seconds on the clock',
    );
    type('sea');
    expect(rushButton()).toBeNull();
  });

  it('says when the run is going in another tab, with no time', () => {
    const save = secondDay();
    renderGame(save);
    new GameStorage(save).saveRunInFlight({
      dayIndex: today(),
      sourceWord: 'serenade',
      words: ['sea'],
      leftMs: 48_000,
      clockMs: 90_000,
      phase: 'running',
      tab: 'another',
    });
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'eight-letters/v1' }),
      );
    });
    expect(rushButton()).toHaveAccessibleName(
      'Peach rush, going in another tab',
    );
    expect(rushButton()).toHaveTextContent('In another tab');
    expect(rushButton()).not.toHaveTextContent('0:48');
  });

  it("isn't there on Endless", () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
    expect(rushButton()).toBeNull();
  });

  it('says 3:00 with Longer clock, from Settings', () => {
    renderGame();
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Longer clock' }));
    expect(rushButton()).toHaveAccessibleName(
      'Peach rush, 3 minutes on the clock',
    );
    localStorage.removeItem('e8-longer-clock');
  });
});

describe('the run', () => {
  it('shows no letter before Start, and takes no key', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    expect(runHead()).toBeInTheDocument();
    expect(tileLetters()).toBe('');
    expect(screen.getByRole('button', { name: 'Start' })).toHaveFocus();
    type('sea');
    expect(within(runHead()).getByText(/0 words/)).toBeInTheDocument();
    expect(tileLetters()).toBe('');
  });

  it('takes the page: no masthead, no toolbar, no footer', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    expect(document.querySelector('.masthead')).toBeNull();
    expect(document.querySelector('.toolbar')).toBeNull();
    expect(document.querySelector('.colophon')).toBeNull();
  });

  it('goes back to the board before Start, still offered', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }));
    expect(document.querySelector('.masthead')).not.toBeNull();
    expect(rushButton()).not.toBeNull();
  });

  it('starts, finds, asks before End, and ends with the result', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(tileLetters()).toHaveLength(8);
    expect(tiles()).toHaveFocus();
    type('sea');
    type('near');
    expect(within(runHead()).getByText(/2 words/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    const ask = screen.getByRole('alertdialog', { name: 'End the run?' });
    expect(
      within(ask).getByRole('button', { name: 'Keep playing' }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('timer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'End',
      }),
    );
    expect(result()).toHaveAccessibleName(/^Ended with 1:(29|30) left$/);
    expect(result()).toHaveAccessibleDescription(/2 words\s*\d+ points/);
    expect(
      within(result()!).queryByRole('button', { name: 'Done' }),
    ).toBeNull();
  });

  it('carries the words to the board, which offers the result again, never a run', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    type('sea');
    type('dean');
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'End',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'On to the basket' }));
    expect(within(basket()).getByText('sea')).toBeInTheDocument();
    expect(within(basket()).getAllByText('dean').length).toBeGreaterThan(0);
    expect(rushButton()).toHaveAccessibleName(
      /^Peach rush, 2 words, \d+ points$/,
    );
    fireEvent.click(rushButton()!);
    expect(result()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('goes to the basket on Escape from the result', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'End',
      }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result()).toBeNull();
    expect(document.querySelector('.masthead')).not.toBeNull();
  });

  it('pauses on a hidden tab, hiding the letters, and resumes', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(tileLetters()).toBe('');
    // In the well, and said in the time's own region.
    expect(document.querySelector('.stick')).toHaveTextContent('Paused.');
    Reflect.deleteProperty(document, 'visibilityState');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(tileLetters()).toHaveLength(8);
  });

  it('comes back after a reload paused, reached from the toolbar', () => {
    const save = secondDay();
    const first = renderGame(save);
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    type('sea');
    act(() => void window.dispatchEvent(new Event('pagehide')));
    first.unmount();
    renderGame(save);
    expect(rushButton()).toHaveAccessibleName(/^Peach rush, paused, /);
    fireEvent.click(rushButton()!);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(within(runHead()).getByText(/1 word/)).toBeInTheDocument();
    expect(tileLetters()).toBe('');
  });
});

describe("time's up, and the peach of a word's card", () => {
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
  });

  function runOut() {
    for (let t = 0; t < 90_000; t += 250)
      act(() => vi.advanceTimersByTime(250));
  }

  it("keeps the clock running under End's question", () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => vi.advanceTimersByTime(250));
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    const before = screen.getByRole('timer').textContent;
    for (let t = 0; t < 2_000; t += 250) act(() => vi.advanceTimersByTime(250));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('timer').textContent).not.toBe(before);
  });

  it('opens the result as the clock runs out', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    type('sea');
    runOut();
    expect(result()).toHaveAccessibleName("Time's up");
  });

  it('opens the card once, a moment after, with Close and no Share', () => {
    renderGame();
    fireEvent.click(rushButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    type('serenade');
    runOut();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    act(() => vi.advanceTimersByTime(RUN_PEACH_MS));
    const close = screen.getByRole('button', { name: 'Close' });
    const card = close.closest<HTMLElement>('[role="dialog"]')!;
    expect(within(card).queryByRole('button', { name: 'Share' })).toBeNull();
    fireEvent.click(close);
    expect(result()).not.toBeNull();

    // Back to the basket and into the result again: no card this time.
    fireEvent.click(screen.getByRole('button', { name: 'On to the basket' }));
    fireEvent.click(rushButton()!);
    act(() => vi.advanceTimersByTime(RUN_PEACH_MS * 2));
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('a run left waiting overnight', () => {
  it("opens its peach of a word's card once, the next day", () => {
    const save = secondDay();
    new GameStorage(save).saveRunInFlight({
      dayIndex: today() - 1,
      sourceWord: 'serenade',
      words: ['sea', 'serenade'],
      leftMs: 20_000,
      clockMs: 90_000,
      phase: 'paused',
      tab: 'yesterday',
    });
    const storage = new GameStorage(save);
    settleOldRun(data, storage);
    const first = render(
      <Game rush data={data} audio={new NullAudioEngine()} storage={storage} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    first.unmount();
    renderGame(save);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(storage.loadDayProgress(today() - 1, 'serenade')).toEqual([
      'sea',
      'serenade',
    ]);
  });
});
