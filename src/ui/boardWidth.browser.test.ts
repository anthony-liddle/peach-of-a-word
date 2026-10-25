import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import css from '@/index.css?raw';
import type { TierStanding } from '@/engine/index.ts';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { TierMeter } from './components/TierMeter.tsx';
import { Game } from './Game.tsx';
import type { TextSize } from './useTextSize.ts';
import type { Theme } from './useTheme.ts';

/**
 * The board never runs past a phone's width. jsdom has no layout, so this is
 * measured in a real browser, with the game's own stylesheet.
 *
 * The case that found it: a full basket at 320px in cute. The caption under
 * the bar then holds three things, the percent, "Top rank. The full basket is
 * the peak." and the streak. The note is the one meant to shrink, but its
 * whole unwrapped length still counted towards the row's narrowest width, and
 * the board's one column grew to fit it, past the board's own edge, so the
 * page scrolled sideways.
 *
 * The fonts here are the browser's fallbacks, not the web fonts the page
 * loads. With them, letterpress's shorter note ("the full set") overflows at
 * the largest text too; with its own face it fits, which is why the page
 * showed this only in cute. The bug is the column, not either note.
 */
const FULL_BASKET: TierStanding = {
  index: 5,
  id: 'tier-5',
  score: 93,
  reachable: 93,
  fraction: 1,
  setPoints: 93,
  offPagePoints: 0,
  setFound: 27,
  setTotal: 27,
  next: null,
  isTop: true,
};

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.getElementById('game-css')?.remove();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
});

/** The game's stylesheet, and the board as Game nests it: app, board, play. */
function mount(theme: Theme, textSize: 'large' | 'largest' | null) {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  if (textSize) document.documentElement.dataset.textSize = textSize;
  host = document.createElement('div');
  host.className = 'app';
  const board = document.createElement('div');
  board.className = 'board';
  const play = document.createElement('div');
  play.className = 'play';
  board.append(play);
  host.append(board);
  document.body.append(host);
  root = createRoot(play);
  flushSync(() =>
    root!.render(
      createElement(TierMeter, { tier: FULL_BASKET, theme, streak: 1 }),
    ),
  );
}

describe('the board at a phone width, with a full basket and a streak', () => {
  for (const width of [320, 375]) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const textSize of [null, 'largest'] as const) {
        test(`${width}px, ${theme}, ${textSize ?? 'regular'} text: nothing runs past the screen`, async () => {
          await page.viewport(width, 640);
          mount(theme, textSize);
          const doc = document.documentElement;
          expect(doc.clientWidth).toBe(width);
          // The column, not the board: the board keeps its width while its
          // column runs past it.
          const play = host!.querySelector('.play')!.getBoundingClientRect();
          expect(play.right).toBeLessThanOrEqual(doc.clientWidth);
          expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
          // The note gives way, rather than the board.
          const note = host!.querySelector('.tier__next')!;
          expect(note.getBoundingClientRect().right).toBeLessThanOrEqual(
            doc.clientWidth,
          );
        });
      }
    }
  }
});

/**
 * At two-column widths, the board never runs past its own edge either, and the
 * rack keeps its column. Played through the real game to a full basket, since
 * it takes both columns, the rack and the glossary, to push the board wide.
 *
 * The case that found it: the larger text sizes. A tile is 3:4 and holds its
 * letter, and each engine made a different minimum width of that. Chromium
 * grew the play column to fit the tiles, and the glossary, which would not go
 * below a full basket's caption, ran past the board: at 820px the page
 * scrolled sideways. WebKit kept the play column to its share and let the
 * tiles run out of it, into the glossary. Firefox let the glossary take room
 * from the rack and squeezed the tiles. So all three are held to one rule: the
 * glossary is the column that gives way. The play column keeps at least its
 * share (the board's 1.4fr of 2.4), every tile stays inside it, and nothing
 * runs past the board.
 */
// The real board's rack: m is the widest letter in both themes' faces.
const COMMON = ['immortal', 'mortal', 'moral', 'trim', 'mail', 'tail'];

function fakeData(): GameData {
  return {
    dictionary: createListDictionary(COMMON),
    commonPool: createListWordSource(COMMON),
    beyond70Pool: createListWordSource([]),
    beyond95Pool: createListWordSource([]),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['immortal'],
    },
    sourceEntry: (w) =>
      w === 'immortal'
        ? {
            word: 'immortal',
            definition: 'adjective. living forever.',
            etymology: 'From Latin immortalis.',
          }
        : undefined,
  };
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

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

/** Every common word, the source first and its reveal put away. */
async function fillTheBasket() {
  await userEvent.keyboard('immortal{Enter}');
  (
    await until(() => document.querySelector<HTMLElement>('.reveal__close'))
  ).click();
  await until(() => !document.querySelector('.reveal'));
  for (const word of COMMON.slice(1)) {
    await userEvent.keyboard(`${word}{Enter}`);
  }
  await until(() => document.querySelector('.edition'));
}

describe('the board at two-column widths, with a full basket', () => {
  for (const width of [820, 1024, 1280]) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const textSize of ['regular', 'large', 'largest'] as const) {
        test(`${width}px, ${theme}, ${textSize} text: the rack keeps its column, and the board its edge`, async () => {
          await page.viewport(width, 800);
          mountGame(theme, textSize);
          await fillTheBasket();
          const doc = document.documentElement;
          const board = host!.querySelector('.board')!;
          const edge = board.getBoundingClientRect().right;
          const gap = parseFloat(getComputedStyle(board).columnGap);
          const share =
            ((board.getBoundingClientRect().width - gap) * 1.4) / 2.4;
          const play = host!.querySelector('.play')!.getBoundingClientRect();
          const found = host!.querySelector('.found')!.getBoundingClientRect();
          expect(
            play.width,
            'the play column keeps its share',
          ).toBeGreaterThanOrEqual(share - 0.5);
          expect(play.right, 'the play column').toBeLessThanOrEqual(edge + 0.5);
          expect(found.right, 'the glossary').toBeLessThanOrEqual(edge + 0.5);
          // The completion card lies over the glossary, at its width.
          const card = host!.querySelector('.board > .edition')!;
          expect(
            card.getBoundingClientRect().right,
            'the completion card',
          ).toBeLessThanOrEqual(edge + 0.5);
          expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
          // The rack is not what gives way: every tile is inside its column.
          for (const tile of host!.querySelectorAll('.sort')) {
            expect(tile.getBoundingClientRect().right).toBeLessThanOrEqual(
              play.right + 0.5,
            );
          }
        });
      }
    }
  }
});
