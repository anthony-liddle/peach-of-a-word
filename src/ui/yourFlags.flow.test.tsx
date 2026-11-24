import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Game } from './Game.tsx';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';
import { useDefinitions } from './useDefinitions.ts';
import { createFlags, type Flags } from '@/flags/flags.ts';

/*
 * Your flags, through the whole game (Antoine, 22 November): Settings shows a
 * row, never the words; the list opens on its own; closing it goes back where
 * it came from. A made-up board; every request goes to a fetch held here.
 */

let device: Flags;
vi.mock('@/flags/device.ts', () => ({ deviceFlags: () => device }));
vi.mock('./useDefinitions.ts', () => ({ useDefinitions: vi.fn() }));

const sent: { method: string }[] = [];

beforeEach(() => {
  sent.length = 0;
  const store = new Map<string, string>();
  let n = 0;
  device = createFlags({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    fetch: (async (_u: unknown, init?: RequestInit) => {
      sent.push({ method: init?.method ?? 'GET' });
      return new Response(null, {
        status: init?.method === 'DELETE' ? 204 : 202,
      });
    }) as unknown as typeof fetch,
    now: () => Date.now(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    version: 'test',
  });
  (useDefinitions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    getDefinition: async (w: string) =>
      w === 'sea' ? 'noun. a body of salt water.' : null,
  });
});

const ENABLE = [
  'serenade',
  'sea',
  'near',
  'sane',
  'sneer',
  'eased',
  'dean',
  'erase',
  'denar',
];

function renderGame() {
  const map = new Map<string, string>();
  const data: GameData = {
    dictionary: createListDictionary(ENABLE),
    commonPool: createListWordSource([
      'serenade',
      'sea',
      'near',
      'dean',
      'eased',
      'erase',
    ]),
    beyond70Pool: createListWordSource(['sneer', 'denar']),
    beyond95Pool: createListWordSource(['denar']),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['serenade'],
    },
    sourceEntry: () => undefined,
  };
  return render(
    <Game
      flagging
      data={data}
      audio={new NullAudioEngine()}
      storage={
        new GameStorage({
          getItem: (k) => map.get(k) ?? null,
          setItem: (k, v) => void map.set(k, v),
        })
      }
    />,
  );
}

async function seed(word = 'near') {
  await act(async () => {
    await device.flag({
      word,
      reason: 'definition',
      // On or after the game's first day, as the server takes a board.
      board: { day: '2026-07-01' },
    });
  });
}

const settingsButton = () => screen.getByRole('button', { name: 'Settings' });
const panel = () => document.querySelector<HTMLElement>('.settings__panel');
const row = () => screen.queryByRole('button', { name: /^Your flags/ });
const list = () => screen.queryByRole('dialog', { name: 'Your flags' });
const stickSlots = () =>
  document.querySelectorAll('.stick .stick__slot').length;

describe('Your flags, from Settings', () => {
  it('opens on its own from the row, and nothing about a flag is inside the settings panel', async () => {
    await seed('near');
    renderGame();
    fireEvent.click(settingsButton());
    expect(within(panel()!).queryByText(/near/)).toBeNull();
    fireEvent.click(row()!);
    expect(panel()).toBeNull();
    expect(list()).toBeInTheDocument();
    expect(within(list()!).getByText(/near/)).toBeInTheDocument();
  });

  it("doesn't let a typed letter land in the well while it's open", async () => {
    await seed();
    renderGame();
    fireEvent.click(settingsButton());
    fireEvent.click(row()!);
    fireEvent.keyDown(window, { key: 's' });
    expect(stickSlots()).toBe(0);
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(list()!, { key: 'Escape' })],
    [
      'Close',
      () =>
        fireEvent.click(within(list()!).getByRole('button', { name: 'Close' })),
    ],
    ['a tap outside', () => fireEvent.click(list()!.parentElement!)],
  ])(
    'goes back to Settings, open, with focus on the row, on %s',
    async (_how, close) => {
      await seed();
      renderGame();
      fireEvent.click(settingsButton());
      fireEvent.click(row()!);
      close();
      expect(list()).toBeNull();
      expect(panel()).toBeInTheDocument();
      expect(row()).toHaveFocus();
    },
  );

  it('closes when the last flag is taken back, and the row goes', async () => {
    await seed();
    renderGame();
    fireEvent.click(settingsButton());
    fireEvent.click(row()!);
    await act(async () => {
      fireEvent.click(
        within(list()!).getByRole('button', { name: 'Take back' }),
      );
    });
    expect(list()).toBeNull();
    expect(row()).toBeNull();
    expect(sent.at(-1)).toEqual({ method: 'DELETE' });
  });
});

describe('Your flags, from a card', () => {
  async function flagSeaFromItsCard() {
    renderGame();
    for (const ch of 'sea') fireEvent.keyDown(window, { key: ch });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(
      document.querySelector<HTMLButtonElement>('.stick button')!,
    );
    await screen.findByText('noun. a body of salt water.');
    fireEvent.click(screen.getByRole('button', { name: 'Flag this word' }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: "It's rarer than a basket word" }),
      );
    });
  }

  it("opens over the card from its line, and Escape leaves the card open, with focus on the line's link", async () => {
    await flagSeaFromItsCard();
    const link = screen.getByRole('button', { name: 'Your flags' });
    fireEvent.click(link);
    expect(list()).toBeInTheDocument();
    fireEvent.keyDown(list()!, { key: 'Escape' });
    expect(list()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'sea' })).toBeInTheDocument();
    expect(link).toHaveFocus();
  });
});
