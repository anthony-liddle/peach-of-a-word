import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import css from '@/index.css?raw';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { deviceFlags } from '@/flags/device.ts';
import { FLAGS_KEY } from '@/flags/flags.ts';
import { Game } from './Game.tsx';
import type { TextSize } from './useTextSize.ts';
import type { Theme } from './useTheme.ts';

/**
 * The refused word's flag, in a real browser (step 3). jsdom has no layout
 * and presses no keys, so the two things Antoine holds the flag to are
 * checked here, in Chromium, Firefox and WebKit:
 *
 * - "Not in the word list." stays exactly where it is with no flag, centred,
 *   at the default and the largest text size. Measured from the words
 *   themselves, a range over the text, since the line's box spans the well.
 *   "No flag" is the same word refused again once this device has suggested
 *   it, so the two are the same mount, the same text and the same well.
 * - Nothing is sent without the popup's Suggest, by any key, and after the
 *   popup the next letter types and Enter answers as with no flag at all.
 *
 * On a made-up board of REASSURE, whose list doesn't hold USER. The device's
 * flags are this browser's own, emptied before each test, and every request
 * goes to a fetch held here.
 */
const COMMON = ['reassure', 'sure', 'ease'];
const MYTHIC = ['reseaus', 'res'];
const REFUSED = 'user';

function fakeData(): GameData {
  return {
    dictionary: createListDictionary([...COMMON, ...MYTHIC]),
    commonPool: createListWordSource(COMMON),
    beyond70Pool: createListWordSource(MYTHIC),
    beyond95Pool: createListWordSource(MYTHIC),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['reassure'],
    },
    sourceEntry: () => undefined,
  };
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

let root: Root | null = null;
let host: HTMLElement | null = null;
const realFetch = window.fetch;
/** The methods of the requests made to the flag server. */
let requests: string[] = [];

beforeEach(() => {
  requests = [];
  // Only the flag server's requests are held here; the game's others, its
  // definitions among them, go on as usual.
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.includes('/api/flag')) return realFetch(input, init);
    requests.push(init?.method ?? 'GET');
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  // The device's flags outlive a test, as they outlive a page: empty them,
  // and have the device read the empty list.
  window.localStorage.removeItem(FLAGS_KEY);
  deviceFlags().refresh();
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.getElementById('game-css')?.remove();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
  window.fetch = realFetch;
  window.localStorage.removeItem(FLAGS_KEY);
  deviceFlags().refresh();
});

function mountGame(theme: Theme, textSize: TextSize) {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  if (textSize !== 'regular')
    document.documentElement.dataset.textSize = textSize;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      createElement(Game, {
        data: fakeData(),
        audio: new NullAudioEngine(),
        storage: new GameStorage(fakeStore()),
      }),
    ),
  );
}

async function until<T>(read: () => T | null | undefined): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const found = read();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
}

/**
 * Lets the refusal's nudge and any dialog's entrance finish. Only the ones
 * that end: the cute theme's decorations float forever.
 */
async function settled() {
  await Promise.all(
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined)),
  );
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
}

const stick = () => host!.querySelector<HTMLElement>('.stick')!;
const flagButton = () => host!.querySelector<HTMLButtonElement>('.stick__flag');
const ask = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

/** The refusal's words, measured from the text itself. */
function words(): DOMRect {
  const message = stick().querySelector('.message')!;
  expect(message.textContent).toBe('Not in the word list.');
  const range = document.createRange();
  range.selectNodeContents(message);
  return range.getBoundingClientRect();
}

async function refuse() {
  await userEvent.keyboard(`${REFUSED}{Enter}`);
  await until(() => stick().querySelector('.message'));
  await settled();
}

describe('"Not in the word list." stays where it is, with the flag beside it', () => {
  for (const width of [320, 390]) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const textSize of ['regular', 'largest'] as const) {
        test(`${width}px, ${theme}, ${textSize} text: the words don't move, and the flag is a 44px target clear of them, inside the well`, async () => {
          await page.viewport(width, 800);
          mountGame(theme, textSize);
          const empty = (await until(() => stick())).getBoundingClientRect();

          await refuse();
          const flag = await until(flagButton);
          const withFlag = words();
          const s = stick().getBoundingClientRect();
          const f = flag.getBoundingClientRect();
          const glyph = flag.querySelector('svg')!.getBoundingClientRect();

          // Centred in the well, as with no flag.
          expect(
            Math.abs(
              (withFlag.left + withFlag.right) / 2 - (s.left + s.right) / 2,
            ),
            'the words are centred in the well',
          ).toBeLessThanOrEqual(0.5);

          // A 44px target, inside the well, on top, and clear of the words.
          expect(f.width, 'the target').toBeGreaterThanOrEqual(44);
          expect(f.height, 'the target').toBeGreaterThanOrEqual(44);
          expect(f.left).toBeGreaterThanOrEqual(s.left - 0.5);
          expect(f.right).toBeLessThanOrEqual(s.right + 0.5);
          expect(f.top).toBeGreaterThanOrEqual(s.top - 0.5);
          expect(f.bottom).toBeLessThanOrEqual(s.bottom + 0.5);
          expect(f.left, 'the target clears the words').toBeGreaterThanOrEqual(
            withFlag.right,
          );
          expect(glyph.left).toBeGreaterThanOrEqual(withFlag.right);
          const hit = document.elementFromPoint(
            (f.left + f.right) / 2,
            (f.top + f.bottom) / 2,
          );
          expect(hit?.closest('.stick__flag'), 'a tap lands on it').toBe(flag);
          expect(s.height, "the well's height").toBe(empty.height);

          // The same refusal with no flag: this device has suggested it.
          await deviceFlags().flag({
            word: REFUSED,
            reason: 'should-count',
            board: { day: '2026-07-01' },
          });
          await userEvent.keyboard('s{Backspace}');
          await refuse();
          expect(
            flagButton(),
            'no flag on a word already suggested',
          ).toBeNull();
          const without = words();
          for (const side of ['left', 'right', 'top', 'bottom'] as const) {
            expect(
              Math.abs(withFlag[side] - without[side]),
              `the words' ${side}, with and without the flag`,
            ).toBeLessThanOrEqual(0.5);
          }
          expect(
            document.documentElement.scrollWidth,
            'no sideways scroll',
          ).toBeLessThanOrEqual(document.documentElement.clientWidth);

          console.log(
            `REFUSED ${width} ${theme} ${textSize} words=${withFlag.left.toFixed(1)}..${withFlag.right.toFixed(1)} flag=${f.left.toFixed(1)}..${f.right.toFixed(1)} gap=${(f.left - withFlag.right).toFixed(1)}`,
          );
        });
      }
    }
  }
});

describe('the popup, by key and by pointer', () => {
  async function open() {
    await page.viewport(390, 800);
    mountGame('cute', 'regular');
    await refuse();
    (await until(flagButton)).click();
    const dialog = await until(ask);
    await settled();
    return dialog;
  }

  const cancel = () =>
    [...ask()!.querySelectorAll('button')].find(
      (b) => b.textContent === 'Cancel',
    )!;

  /** After the popup, the page's keys answer as with no flag at all. */
  async function answersAsWithNoFlag() {
    // A frame, in case a key that closed it landed a second press anywhere.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    expect(ask(), 'nothing opened again').toBeNull();
    expect(requests, 'nothing sent').toEqual([]);
    expect(window.localStorage.getItem(FLAGS_KEY) ?? '').not.toContain(REFUSED);
    await userEvent.keyboard('s');
    expect(stick().querySelectorAll('.stick__slot')).toHaveLength(1);
    await userEvent.keyboard('{Backspace}{Enter}');
    await until(() =>
      stick().textContent === 'Three letters or more.' ? true : null,
    );
  }

  test('Enter on the focused Cancel sends nothing', async () => {
    await open();
    expect(document.activeElement).toBe(cancel());
    await userEvent.keyboard('{Enter}');
    await until(() => (ask() ? null : true));
    await answersAsWithNoFlag();
  });

  test('Escape sends nothing', async () => {
    await open();
    await userEvent.keyboard('{Escape}');
    await until(() => (ask() ? null : true));
    expect(stick().textContent).toContain('Not in the word list.');
    await answersAsWithNoFlag();
  });

  test('Cancel, clicked, sends nothing', async () => {
    await open();
    await userEvent.click(cancel());
    await until(() => (ask() ? null : true));
    await answersAsWithNoFlag();
  });

  test('a tap outside it sends nothing', async () => {
    const dialog = await open();
    const backdrop = dialog.parentElement!;
    await userEvent.click(backdrop, { position: { x: 5, y: 5 } });
    await until(() => (ask() ? null : true));
    await answersAsWithNoFlag();
  });

  test("a letter typed while it asks doesn't reach the well", async () => {
    await open();
    await userEvent.keyboard('s');
    expect(stick().querySelectorAll('.stick__slot')).toHaveLength(0);
    expect(ask()).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await until(() => (ask() ? null : true));
    await answersAsWithNoFlag();
  });

  test('Space on the focused flag opens it; Enter there sets the stick, as with no flag', async () => {
    await page.viewport(390, 800);
    mountGame('cute', 'regular');
    await refuse();
    const flag = await until(flagButton);
    flag.focus();
    await userEvent.keyboard('{Enter}');
    await until(() =>
      stick().textContent === 'Three letters or more.' ? true : null,
    );
    expect(ask()).toBeNull();

    await refuse();
    (await until(flagButton)).focus();
    await userEvent.keyboard(' ');
    await until(ask);
    expect(document.activeElement).toBe(cancel());
    expect(requests).toEqual([]);
  });

  test('Suggest sends it, once, and the line says so', async () => {
    await open();
    const send = [...ask()!.querySelectorAll('button')].find(
      (b) => b.textContent === 'Suggest',
    )!;
    await userEvent.click(send);
    await until(() =>
      stick().textContent === '✓ Suggestion sent.' ? true : null,
    );
    expect(requests).toEqual(['POST']);
    expect(flagButton()).toBeNull();
  });
});
