import { beforeEach, describe, expect, it, vi } from 'vitest';
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

/*
 * Two tabs on today's board share one save, as two tabs share a browser's
 * local storage. This is the board in one of them. The other tab is its own
 * `GameStorage` on the same save, opened before this tab's find, so the list
 * it saves is older than this tab's. The browser tells every other tab a save
 * changed with a `storage` event, sent here by hand.
 *
 * A made-up board, SERENADE.
 */

let device: Flags;
vi.mock('@/flags/device.ts', () => ({ deviceFlags: () => device }));
vi.mock('./useDefinitions.ts', () => ({ useDefinitions: vi.fn() }));

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

const WORDS = ['serenade', 'sea', 'near', 'dean'];

function renderTab(store: KeyValueStore) {
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
  return render(
    <Game
      data={data}
      audio={new NullAudioEngine()}
      storage={new GameStorage(store)}
    />,
  );
}

function sharedSave(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function type(word: string) {
  for (const key of word) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: 'Enter' });
}

const today = () => dayIndex(new Date(), STORAGE_EPOCH);
const basket = () => screen.getByRole('region', { name: 'Words found' });
const points = () =>
  document.querySelector<HTMLElement>('.tier__score')!.textContent;
const stick = () => document.querySelector<HTMLElement>('.stick')!;

describe('the board, when another tab saves a find', () => {
  it('shows the find in the basket and adds its points', () => {
    const save = sharedSave();
    renderTab(save);
    type('sea');
    const oneWord = points();

    // The other tab, opened before 'sea', finds 'near' and saves its list.
    new GameStorage(save).saveDayProgress(today(), 'serenade', ['near']);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'eight-letters/v1' }),
      );
    });

    // In its length's group, and as the best word, which it now is.
    expect(within(basket()).getAllByText('near')).toHaveLength(2);
    expect(within(basket()).getByText('sea')).toBeInTheDocument();
    expect(points()).not.toBe(oneWord);
    expect(new GameStorage(save).loadDayProgress(today(), 'serenade')).toEqual([
      'sea',
      'near',
    ]);
  });

  it('calls the other tab\'s find "Already found." here', () => {
    const save = sharedSave();
    renderTab(save);
    new GameStorage(save).saveDayProgress(today(), 'serenade', ['near']);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'eight-letters/v1' }),
      );
    });
    type('near');
    expect(stick()).toHaveTextContent('Already found.');
  });

  it('pays no attention to a save under another key', () => {
    const save = sharedSave();
    renderTab(save);
    type('sea');
    new GameStorage(save).saveDayProgress(today(), 'serenade', ['near']);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'e8-theme' }));
    });
    expect(within(basket()).queryByText('near')).toBeNull();
  });
});
