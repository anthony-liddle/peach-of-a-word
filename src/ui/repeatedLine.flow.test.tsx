import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
 * The same line twice is heard twice (W1, the accessibility report's 26
 * November update). A screen reader says a live region's line when the region
 * changes. Setting the same text again changes nothing, so a second "Not in
 * the word list." or "Already found." went unsaid. Each announcement is now a
 * node of its own, so a repeat is a change too.
 *
 * A made-up board, SERENADE, on which RAND spells and isn't a word.
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

function renderGame({ secondDay = false } = {}) {
  const map = new Map<string, string>();
  const save: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  if (secondDay)
    new GameStorage(save).saveDayProgress(
      dayIndex(new Date(), STORAGE_EPOCH) - 1,
      'serenade',
      [],
    );
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

/** The board's own region, the one its finds and refusals are said in. */
const boardRegion = () =>
  document.querySelector<HTMLElement>(
    '.app > [role="status"][aria-live="polite"]',
  )!;
/** The run's finds' region, right after its view. */
const runRegion = () =>
  document.querySelector('.board--run')!.nextElementSibling as HTMLElement;

/** What the region holds now: its node, and its words. */
const held = (region: HTMLElement) => ({
  node: region.firstChild,
  text: region.textContent,
});

beforeEach(() => {
  const kept = new Map<string, string>();
  device = createFlags({
    storage: {
      getItem: (k) => kept.get(k) ?? null,
      setItem: (k, v) => void kept.set(k, v),
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

describe('the same line twice, on the board', () => {
  it('"Not in the word list." twice is a new node each time', () => {
    renderGame();
    type('rand');
    const first = held(boardRegion());
    expect(first.text).toBe('Not in the word list.');
    type('rand');
    const second = held(boardRegion());
    expect(second.text).toBe('Not in the word list.');
    expect(second.node).not.toBe(first.node);
  });

  it('"Already found." twice is a new node each time', () => {
    renderGame();
    type('sea');
    type('sea');
    const first = held(boardRegion());
    expect(first.text).toBe('Already found.');
    type('sea');
    const second = held(boardRegion());
    expect(second.text).toBe('Already found.');
    expect(second.node).not.toBe(first.node);
  });

  it('leaves a line alone until the next one comes', () => {
    renderGame();
    type('rand');
    const first = held(boardRegion());
    // A letter set and taken back says nothing new.
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(held(boardRegion()).node).toBe(first.node);
  });
});

describe('the same line twice, in a run', () => {
  it('"Not in the word list." twice is a new node each time', () => {
    renderGame({ secondDay: true });
    fireEvent.click(
      screen.getByRole('button', { name: /^Peach rush, 1 minute/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    type('rand');
    const first = held(runRegion());
    expect(first.text).toBe('Not in the word list.');
    type('rand');
    const second = held(runRegion());
    expect(second.text).toBe('Not in the word list.');
    expect(second.node).not.toBe(first.node);
  });
});
