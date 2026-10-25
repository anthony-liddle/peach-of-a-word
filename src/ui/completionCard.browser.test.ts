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
import type { Theme } from './useTheme.ts';

/**
 * Where the completion card lands, played through the real game in a real
 * browser with the game's own stylesheet: jsdom has no layout.
 *
 * The card is non-blocking, so play goes on under it. At two-column widths it
 * sat at the top centre of the board, over the word well and the rack, the two
 * places play goes on. There it belongs beside them, over the glossary's
 * column. On a phone it stays where it was: fixed at the top, centred.
 */
const COMMON = ['serenade', 'sea', 'near', 'dean', 'eased', 'erase'];

function fakeData(): GameData {
  return {
    dictionary: createListDictionary(COMMON),
    commonPool: createListWordSource(COMMON),
    beyond70Pool: createListWordSource([]),
    beyond95Pool: createListWordSource([]),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['serenade'],
    },
    sourceEntry: (w) =>
      w === 'serenade'
        ? {
            word: 'serenade',
            definition: 'noun. a love song.',
            etymology: 'From Italian serenata.',
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

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.getElementById('game-css')?.remove();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
});

function mount(theme: Theme, textSize: 'largest' | null) {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  if (textSize) document.documentElement.dataset.textSize = textSize;
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
async function fillTheBasket(): Promise<HTMLElement> {
  await userEvent.keyboard('serenade{Enter}');
  (
    await until(() => document.querySelector<HTMLElement>('.reveal__close'))
  ).click();
  await until(() => !document.querySelector('.reveal'));
  for (const word of COMMON.slice(1)) {
    await userEvent.keyboard(`${word}{Enter}`);
  }
  const card = await until(() =>
    document.querySelector<HTMLElement>('.edition'),
  );
  // The card's entrance moves it, so measure where it comes to rest.
  await Promise.all(
    card
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .map((a) => a.finished),
  );
  return card;
}

const box = (selector: string) =>
  document.querySelector(selector)!.getBoundingClientRect();

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('the completion card at two-column widths', () => {
  for (const width of [820, 1024, 1280]) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const textSize of [null, 'largest'] as const) {
        test(`${width}px, ${theme}, ${textSize ?? 'regular'} text: clear of the well and the rack`, async () => {
          await page.viewport(width, 800);
          mount(theme, textSize);
          const card = (await fillTheBasket()).getBoundingClientRect();
          const well = box('.stick');
          const rack = box('.case');
          expect(overlaps(card, well), 'over the well').toBe(false);
          expect(overlaps(card, rack), 'over the rack').toBe(false);
          // Beside them, not merely above or below: in a column of its own, so
          // no height of card or text, and no scroll, brings it over them.
          expect(card.left).toBeGreaterThanOrEqual(
            Math.max(well.right, rack.right),
          );
        });
      }
    }
  }
});

describe('the completion card on a phone', () => {
  for (const theme of ['cute', 'letterpress'] as const) {
    test(`390px, ${theme}: fixed at the top, centred, as before`, async () => {
      await page.viewport(390, 664);
      mount(theme, null);
      const el = await fillTheBasket();
      const card = el.getBoundingClientRect();
      expect(getComputedStyle(el).position).toBe('fixed');
      expect(Math.abs(card.left - (390 - card.right))).toBeLessThan(1);
      expect(card.top).toBeCloseTo(19.2, 0); // 1.2rem
    });
  }
});
