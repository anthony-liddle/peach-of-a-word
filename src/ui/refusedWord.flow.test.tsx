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
import { createFlags, MAX_WAITING, type Flags } from '@/flags/flags.ts';

/*
 * The refused word's flag, through the whole game (step 3): a flag at the
 * well's edge beside "Not in the word list." only, a popup that asks first,
 * and nothing sent without its Suggest. Then the line says sent, or saved.
 *
 * A made-up board, SERENADE, whose list doesn't hold RAND or DARN; Endless
 * deals it or DINOSAUR, and DARN spells from both. Every request goes to a
 * fetch held here, and none of them leaves the test.
 */

let device: Flags;
vi.mock('@/flags/device.ts', () => ({ deviceFlags: () => device }));
vi.mock('./useDefinitions.ts', () => ({ useDefinitions: vi.fn() }));

/** The bodies of the POSTs the device made. */
const posted: { flags: Record<string, unknown>[] }[] = [];
/** Answers a held request; null when requests answer at once. */
let release: (() => void) | null = null;

function makeDevice({
  online = true,
  hold = false,
  status = 202,
}: { online?: boolean; hold?: boolean; status?: number } = {}) {
  posted.length = 0;
  release = null;
  const store = new Map<string, string>();
  let n = 0;
  device = createFlags({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    fetch: (async (_u: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
      }
      if (hold) await new Promise<void>((r) => (release = r));
      return new Response(null, {
        status: init?.method === 'DELETE' ? 204 : status,
      });
    }) as unknown as typeof fetch,
    now: () => Date.now(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    version: 'test',
    online: () => online,
  });
}

beforeEach(() => {
  makeDevice();
  (useDefinitions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    getDefinition: async () => null,
  });
});

function renderGame() {
  const map = new Map<string, string>();
  const data: GameData = {
    dictionary: createListDictionary([
      'serenade',
      'sea',
      'near',
      'dinosaur',
      'sod',
    ]),
    commonPool: createListWordSource([
      'serenade',
      'sea',
      'near',
      'dinosaur',
      'sod',
    ]),
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

const stick = () => document.querySelector<HTMLElement>('.stick')!;
const stickSlots = () => stick().querySelectorAll('.stick__slot').length;
const flag = () => screen.queryByRole('button', { name: 'Suggest this word' });
const ask = () => screen.queryByRole('alertdialog');
const spoken = () =>
  document.querySelector<HTMLElement>('[role="status"][aria-live="polite"]')!
    .textContent;

/** Lets the flag's send, and what follows it, finish. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function suggest(word: string) {
  type(word);
  fireEvent.click(flag()!);
  await act(async () => {
    fireEvent.click(within(ask()!).getByRole('button', { name: 'Suggest' }));
  });
  await settle();
}

describe('the flag beside a refused word', () => {
  it('shows beside "Not in the word list." and no other line', () => {
    renderGame();
    type('rand');
    expect(stick()).toHaveTextContent('Not in the word list.');
    expect(flag()).toBeInTheDocument();

    type('se');
    expect(stick()).toHaveTextContent('Three letters or more.');
    expect(flag()).toBeNull();

    type('sea');
    expect(flag()).toBeNull();
    type('sea');
    expect(stick()).toHaveTextContent('Already found.');
    expect(flag()).toBeNull();
  });

  it('asks first, naming the word, with Cancel focused, and sends nothing yet', () => {
    renderGame();
    type('rand');
    fireEvent.click(flag()!);
    expect(ask()).toHaveAccessibleName('Suggest “rand” for the dictionary?');
    expect(
      within(ask()!).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
    expect(posted).toEqual([]);
    expect(device.list()).toEqual([]);
  });

  it("doesn't let a typed letter land in the well while it asks", () => {
    renderGame();
    type('rand');
    fireEvent.click(flag()!);
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(stickSlots()).toBe(0);
    expect(ask()).toBeInTheDocument();
    expect(stick()).toHaveTextContent('Not in the word list.');
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(ask()!, { key: 'Escape' })],
    [
      'Cancel',
      () =>
        fireEvent.click(within(ask()!).getByRole('button', { name: 'Cancel' })),
    ],
    ['a tap outside', () => fireEvent.click(ask()!.parentElement!)],
  ])(
    'sends nothing on %s, and gives focus back to the flag',
    async (_how, close) => {
      renderGame();
      type('rand');
      fireEvent.click(flag()!);
      close();
      await settle();
      expect(ask()).toBeNull();
      expect(posted).toEqual([]);
      expect(device.list()).toEqual([]);
      expect(stick()).toHaveTextContent('Not in the word list.');
      expect(flag()).toHaveFocus();
    },
  );

  it('after the popup, the next letter types and Enter answers as with no flag', async () => {
    renderGame();
    type('rand');
    fireEvent.click(flag()!);
    fireEvent.keyDown(ask()!, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 's' });
    expect(stickSlots()).toBe(1);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(stick()).toHaveTextContent('Three letters or more.');
  });

  it('a letter typed on the flag lands in the well, and the focus goes to the letters', () => {
    renderGame();
    type('rand');
    fireEvent.click(flag()!);
    fireEvent.keyDown(ask()!, { key: 'Escape' });
    expect(flag()).toHaveFocus();
    fireEvent.keyDown(flag()!, { key: 's' });
    expect(stickSlots()).toBe(1);
    expect(screen.getByRole('group', { name: 'Letter tiles' })).toHaveFocus();
  });

  it("leaves Enter on the focused flag to the flag, so the page doesn't set the stick", () => {
    // The browser turns that Enter into a press, which opens the popup as
    // Space does (Antoine, 23 November); see the browser test.
    renderGame();
    type('rand');
    fireEvent.click(flag()!);
    fireEvent.keyDown(ask()!, { key: 'Escape' });
    expect(flag()).toHaveFocus();
    fireEvent.keyDown(flag()!, { key: 'Enter' });
    expect(stick()).toHaveTextContent('Not in the word list.');
    expect(stick()).not.toHaveTextContent('Three letters or more.');
  });

  it('never moves the focus to the flag while words are typed and set', async () => {
    renderGame();
    const tiles = screen.getByRole('group', { name: 'Letter tiles' });
    tiles.focus();
    for (const word of ['rand', 'se', 'rand', 'sea', 'dens', 'sea', 'rand']) {
      type(word);
      expect(document.activeElement).not.toBe(flag());
      expect(document.activeElement).toBe(tiles);
    }
    await suggest('dens');
    type('rand');
    expect(flag()).toBeInTheDocument();
    expect(document.activeElement).not.toBe(flag());
  });

  it("on Suggest, sends should-count with the board's day, and the line says sent", async () => {
    renderGame();
    await suggest('rand');
    expect(posted).toHaveLength(1);
    const [sent] = posted[0]!.flags;
    expect(sent).toMatchObject({
      word: 'rand',
      reason: 'should-count',
      platform: 'web',
    });
    expect(sent!.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent).not.toHaveProperty('rack');
    expect(ask()).toBeNull();
    expect(stick()).toHaveTextContent('✓ Suggestion sent.');
    expect(stick()).not.toHaveTextContent('Not in the word list.');
    expect(stick().dataset.tone).toBe('success');
    expect(flag()).toBeNull();
    expect(spoken()).toBe('Suggested. Sent.');
    expect(screen.getByRole('group', { name: 'Letter tiles' })).toHaveFocus();
  });

  it("doesn't say saved while the suggestion is still on its way", async () => {
    makeDevice({ hold: true });
    renderGame();
    await suggest('rand');
    expect(posted).toHaveLength(1);
    expect(stick()).not.toHaveTextContent(/saved/);
    expect(stick()).not.toHaveTextContent(/sent/);
    await act(async () => release!());
    await settle();
    expect(stick()).toHaveTextContent('✓ Suggestion sent.');
  });

  it('offline, says saved, not sent, and Your flags holds it waiting', async () => {
    makeDevice({ online: false });
    renderGame();
    await suggest('rand');
    expect(posted).toEqual([]);
    expect(stick()).toHaveTextContent("✓ Suggestion saved. It'll send later.");
    expect(spoken()).toBe('Suggested. Waiting to send.');
    expect(device.list()).toMatchObject([
      { word: 'rand', reason: 'should-count', state: 'waiting' },
    ]);
  });

  it.each([
    ['busy', 429],
    ['switched off', 403],
    ['down', 503],
  ])(
    "online, with the server %s, says saved and sends later, never 'when you're online'",
    async (_why, status) => {
      makeDevice({ status });
      renderGame();
      await suggest('rand');
      expect(posted).toHaveLength(1);
      expect(stick()).toHaveTextContent(
        "✓ Suggestion saved. It'll send later.",
      );
      expect(stick()).not.toHaveTextContent(/online/);
      expect(spoken()).toBe('Suggested. Waiting to send.');
    },
  );

  it('goes when the next letter lands, as the refusal would', async () => {
    renderGame();
    await suggest('rand');
    fireEvent.keyDown(window, { key: 's' });
    expect(stick()).not.toHaveTextContent(/Suggestion/);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(stick()).not.toHaveTextContent(/Suggestion/);
  });

  it('leaves nothing behind when the player types on before the send answers', async () => {
    makeDevice({ hold: true });
    renderGame();
    await suggest('rand');
    fireEvent.keyDown(window, { key: 's' });
    await act(async () => release!());
    await settle();
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(stick()).not.toHaveTextContent(/Suggestion|Not in the word list/);
  });

  it('is gone from a word this device already suggested, which is refused as before', async () => {
    renderGame();
    await suggest('rand');
    type('rand');
    expect(stick()).toHaveTextContent('Not in the word list.');
    expect(flag()).toBeNull();
  });

  it('gives way while the waiting list is full', async () => {
    makeDevice({ online: false });
    for (let i = 0; i < MAX_WAITING; i++) {
      await device.flag({
        word: `zz${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
        reason: 'definition',
        board: { day: '2026-07-01' },
      });
    }
    expect(device.full()).toBe(true);
    renderGame();
    type('rand');
    expect(stick()).toHaveTextContent('Not in the word list.');
    expect(flag()).toBeNull();
  });

  it("in Endless, sends the board's long word in place of a day", async () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
    await suggest('darn');
    expect(posted).toHaveLength(1);
    const [sent] = posted[0]!.flags;
    expect(sent).toMatchObject({ word: 'darn', reason: 'should-count' });
    // Endless deals either long word here, and DARN spells from both.
    expect(['serenade', 'dinosaur']).toContain(sent!.rack);
    expect(sent).not.toHaveProperty('day');
  });
});
