import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Game } from './Game.tsx';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';
import { useDefinitions } from './useDefinitions.ts';
import { createFlags, FLAGS_KEY, type Flags } from '@/flags/flags.ts';
import { FLAGGING_SHOWN } from '@/flags/shown.ts';

/*
 * The flag, hidden (Antoine, 24 November): until it's hooked up the way he
 * wants, the game shows no way into flagging and sends nothing, through the
 * whole game as it ships, with the switch at its default. A flag already
 * waiting in a browser stays there, and goes once flagging is back.
 *
 * A made-up board; every request goes to a fetch held here.
 */

let device: Flags;
let storage: Map<string, string>;
vi.mock('@/flags/device.ts', () => ({ deviceFlags: () => device }));
vi.mock('./useDefinitions.ts', () => ({ useDefinitions: vi.fn() }));

const sent: { method: string; ids: string[] }[] = [];

function makeDevice() {
  device = createFlags({
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => void storage.set(k, v),
    },
    fetch: (async (_u: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        flags?: { id: string }[];
        ids?: string[];
      };
      sent.push({
        method: init?.method ?? 'GET',
        ids: body.flags?.map((f) => f.id) ?? body.ids ?? [],
      });
      return new Response(null, {
        status: init?.method === 'DELETE' ? 204 : 202,
      });
    }) as unknown as typeof fetch,
    now: () => Date.now(),
    newId: () => '00000000-0000-4000-8000-000000000099',
    version: 'test',
  });
}

const WAITING = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  sent.length = 0;
  storage = new Map();
  makeDevice();
  (useDefinitions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    getDefinition: async (w: string) =>
      w === 'sea' ? 'noun. a body of salt water.' : null,
  });
});

const ENABLE = ['serenade', 'sea', 'near', 'sane', 'dean', 'erase'];

/** The game as it ships: no `flagging`, so the switch decides. */
function renderGame(flagging?: boolean) {
  const map = new Map<string, string>();
  const data: GameData = {
    dictionary: createListDictionary(ENABLE),
    commonPool: createListWordSource(['serenade', 'sea', 'near', 'dean']),
    beyond70Pool: createListWordSource(['erase']),
    beyond95Pool: createListWordSource([]),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['serenade'],
    },
    sourceEntry: () => undefined,
  };
  return render(
    <Game
      {...(flagging === undefined ? {} : { flagging })}
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

function type(word: string) {
  for (const key of word) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: 'Enter' });
}

/** A flag made before the switch went off, saved in this browser, not sent. */
function aFlagWaiting() {
  storage.set(
    FLAGS_KEY,
    JSON.stringify({
      version: 1,
      flags: [
        {
          id: WAITING,
          word: 'near',
          reason: 'definition',
          board: { day: '2026-07-01' },
          madeAt: Date.now(),
          state: 'waiting',
          tried: false,
        },
      ],
      forget: [],
      lastTry: null,
    }),
  );
  makeDevice();
}

describe('the flag, hidden', () => {
  it('is off as the game ships', () => {
    expect(FLAGGING_SHOWN).toBe(false);
  });

  it("shows no flag on a found word's card", async () => {
    renderGame();
    type('sea');
    fireEvent.click(
      document.querySelector<HTMLButtonElement>('.stick button')!,
    );
    await screen.findByText('noun. a body of salt water.');
    expect(screen.queryByRole('button', { name: 'Flag this word' })).toBeNull();
    expect(document.querySelector('.flag')).toBeNull();
  });

  it('shows no flag beside a refused word', () => {
    renderGame();
    type('ras');
    expect(document.querySelector('.stick')?.textContent).toContain(
      'Not in the word list.',
    );
    expect(
      screen.queryByRole('button', { name: 'Suggest this word' }),
    ).toBeNull();
    expect(document.querySelector('.stick__flag')).toBeNull();
  });

  it('shows no Your flags row in Settings, even with a flag saved', async () => {
    aFlagWaiting();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('button', { name: /^Your flags/ })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Your flags' })).toBeNull();
  });

  it('sends nothing, on load, online or when the tab is seen again, and a flag already waiting stays', async () => {
    aFlagWaiting();
    await act(async () => {
      renderGame();
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(sent).toEqual([]);
    const saved = JSON.parse(storage.get(FLAGS_KEY)!) as {
      flags: { id: string; state: string }[];
    };
    expect(saved.flags.map((f) => [f.id, f.state])).toEqual([
      [WAITING, 'waiting'],
    ]);
  });

  it("writes nothing under e8-flags while off, so the privacy page needn't name it", async () => {
    await act(async () => {
      renderGame();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(storage.has(FLAGS_KEY)).toBe(false);
  });

  it('sends that flag once flagging is back', async () => {
    aFlagWaiting();
    await act(async () => {
      renderGame(true);
    });
    expect(sent).toEqual([{ method: 'POST', ids: [WAITING] }]);
  });
});
