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
import type { TextSize } from './useTextSize.ts';
import type { Theme } from './useTheme.ts';

/**
 * Every entry in the found list's key fits inside it, at every text size.
 *
 * The key's last entry became "the peach of a word" in November 2026, the
 * word's one name in the game, and it's wider than "source word" was. Antoine's
 * call (5 November 2026): if it doesn't fit at some size, the size and the
 * options go to him, and the words aren't shortened. The iPhone holds its key
 * to the same in `KeyAtEverySize`.
 *
 * Every text size the game offers, at the narrowest phone, the commonest, and
 * the two-column board, whose glossary column is narrower than a phone.
 *
 * **Not the browser's own text at 200%,** measured on 5 November 2026 and
 * reported rather than held here. There, main's page already scrolls sideways
 * on a phone, 430 to 455px of it on a 320 or 375px screen, and at 820px "in
 * the basket" runs past the key and "in the set" wraps, with "source word" as
 * the last entry. "The peach of a word" adds one thing: at 320px it wraps onto
 * a second line inside the key, in all three engines.
 */
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
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
});

function mountGame(theme: Theme, text: TextSize) {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  if (text !== 'regular') document.documentElement.dataset.textSize = text;
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

/** The source word and one more, so the list and its key are drawn. */
async function findTwoWords() {
  await userEvent.keyboard('immortal{Enter}');
  (
    await until(() => document.querySelector<HTMLElement>('.reveal__close'))
  ).click();
  await until(() => !document.querySelector('.reveal'));
  await userEvent.keyboard('moral{Enter}');
}

describe("the found list's key, at every text size", () => {
  for (const width of [320, 375, 820]) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const text of ['regular', 'large', 'largest'] as const) {
        test(`${width}px, ${theme}, ${text} text: every entry fits the key`, async () => {
          await page.viewport(width, 800);
          mountGame(theme, text);
          await findTwoWords();
          const legend = await until(() =>
            host!.querySelector<HTMLElement>('.legend'),
          );
          const edge = legend.getBoundingClientRect().right;
          const doc = document.documentElement;
          const entries = [
            ...legend.querySelectorAll<HTMLElement>(':scope > span'),
          ].filter((el) => !el.classList.contains('legend__caption'));
          expect(entries.length).toBe(5);
          for (const entry of entries) {
            const box = entry.getBoundingClientRect();
            expect(
              box.right,
              `"${entry.textContent}" runs past the key`,
            ).toBeLessThanOrEqual(edge + 0.5);
            // One line: an entry that wraps its words inside the key is a
            // fit too, but not the one the key was drawn for.
            const style = getComputedStyle(entry);
            const set = parseFloat(style.lineHeight);
            const line = Number.isNaN(set)
              ? parseFloat(style.fontSize) * 1.4
              : set;
            expect(
              box.height,
              `"${entry.textContent}" wraps onto a second line`,
            ).toBeLessThan(line * 1.5);
          }
          expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
        });
      }
    }
  }
});
