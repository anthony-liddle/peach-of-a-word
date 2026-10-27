import { afterEach, describe, expect, test } from 'vitest';
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
import { Game } from './Game.tsx';

/**
 * Enter goes to whatever has focus, as on any native button, when that is a
 * chip or the well's line: it opens the word's card. The page's own Enter,
 * which sets a word, keeps everything else. Typing a letter on a chip or the
 * line hands focus back to the letter tiles, so the next Enter sets the word.
 *
 * jsdom presses no keys, and whether Enter clicks a button is the browser's to
 * decide, so this runs in Chromium, Firefox and WebKit.
 *
 * On a board of `reassure`: RES is a Mythic find, SURE a word in the set, and
 * the rack's A is a letter neither uses.
 */
const COMMON = ['reassure', 'sure', 'ease'];
const MYTHIC = ['reseaus', 'res'];

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

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.getElementById('game-css')?.remove();
});

function mountGame() {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
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

async function until<T>(
  read: () => T | null | undefined,
  why = 'timed out',
): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const found = read();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(why);
}

const card = () => host!.querySelector('[role="dialog"]');
const closed = () => until(() => (card() ? null : true));
const tiles = () => host!.querySelector<HTMLElement>('.case')!;
const message = () => host!.querySelector('.stick .message')?.textContent;
const chip = (word: string) =>
  [...host!.querySelectorAll<HTMLButtonElement>('.found__word')].find(
    (b) => b.querySelector('.found__wordtext')!.textContent === word,
  );

/** RES found, so its chip is in the list and its line is in the well. */
async function findRes() {
  await page.viewport(1024, 900);
  mountGame();
  await userEvent.keyboard('res{Enter}');
  return until(() => chip('res'));
}

describe('Enter on a focused chip or line', () => {
  test("a chip's Enter opens its card and sets no word", async () => {
    const res = await findRes();
    const shown = message();
    res.focus();
    await userEvent.keyboard('{Enter}');
    const opened = await until(card, "Enter did not open the chip's card");
    expect(opened.textContent).toContain('res');
    expect(message(), 'Enter set a word').toBe(shown);
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(document.activeElement, 'focus after Escape').toBe(res);
  });

  test('a letter typed on a chip hands focus to the tiles, and Enter sets the word', async () => {
    const res = await findRes();
    res.focus();
    await userEvent.keyboard('s');
    expect(document.activeElement, 'focus after a letter').toBe(tiles());
    await userEvent.keyboard('ure{Enter}');
    expect(card(), 'Enter opened a card').toBeNull();
    await until(() => chip('sure'), 'Enter did not set SURE');
  });

  test('a letter typed on a chip leaves the page where it is', async () => {
    const res = await findRes();
    // At a phone's width the list is below the well and the tiles
    await page.viewport(375, 700);
    res.scrollIntoView({ block: 'center' });
    res.focus({ preventScroll: true });
    const before = window.scrollY;
    await userEvent.keyboard('s');
    expect(document.activeElement, 'focus after a letter').toBe(tiles());
    expect(window.scrollY, 'the page scrolled').toBe(before);
  });

  test("a letter typed on the well's line hands focus to the tiles", async () => {
    await findRes();
    const line = host!.querySelector<HTMLButtonElement>('.stick__open')!;
    line.focus();
    await userEvent.keyboard('s');
    expect(document.activeElement, 'focus after a letter').toBe(tiles());
    await userEvent.keyboard('ure{Enter}');
    expect(card(), 'Enter opened a card').toBeNull();
    await until(() => chip('sure'), 'Enter did not set SURE');
  });

  test('a focused tile leaves Enter to the page, which sets the word', async () => {
    await findRes();
    const a = [...tiles().querySelectorAll<HTMLButtonElement>('.sort')].find(
      (b) => b.textContent === 'a',
    )!;
    await userEvent.keyboard('sure');
    a.focus();
    await userEvent.keyboard('{Enter}');
    await until(
      () => chip('sure'),
      'Enter pressed the tile rather than setting SURE',
    );
  });
});

/**
 * A word's card owns the keyboard while it is open, as the crown's card does:
 * Enter on its way out closes it, and no key reaches the board behind it.
 */
describe("a word's card, by keyboard", () => {
  test('Enter on its way out closes it, and no key reaches the board', async () => {
    const res = await findRes();
    const slots = () =>
      [...host!.querySelectorAll('.stick__slot')].map((s) => s.textContent);
    await userEvent.keyboard('su');
    res.focus();
    await userEvent.keyboard('{Enter}');
    await until(card, "Enter did not open the chip's card");
    await userEvent.keyboard('r');
    expect(slots(), 'a letter landed behind the card').toEqual(['s', 'u']);
    await userEvent.keyboard('{Enter}');
    await until(
      () => (card() ? null : true),
      'Enter on its way out did not close the card',
    );
    expect(slots(), 'Enter set or cleared the word behind').toEqual(['s', 'u']);
    expect(document.activeElement, 'focus after its way out').toBe(res);

    await userEvent.keyboard('{Enter}');
    await until(card, "Enter did not open the chip's card again");
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(slots(), 'Escape cleared the word behind').toEqual(['s', 'u']);
  });
});
