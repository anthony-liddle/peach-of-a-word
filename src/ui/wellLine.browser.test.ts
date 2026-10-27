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
 * A find's line in the well, led by its mark, at a phone's width and every
 * text size, in both themes: the well keeps its height, the words are not
 * clamped, and the mark stays on the line it leads.
 *
 * jsdom has no layout, so this is measured in a real browser with the game's
 * own stylesheet. Its fonts are the browser's fallbacks rather than the web
 * fonts the page loads, so the pictures in the pull request are the check on
 * the faces themselves.
 *
 * On 21 October's board: `erasures, 16 points`, Uncommon, is its longest find
 * line, and as long as any can be, since an eight-letter Mythic is 19
 * characters too. RESEAUS, fifteen points, is its longest Mythic line, and
 * RES its shortest.
 */
const COMMON = ['reassure', 'sure', 'ease'];
const MYTHIC = ['reseaus', 'res'];
const UNCOMMON = ['erasures'];
const FINDS = [
  ...MYTHIC.map((word) => ({ word, rung: 'mythic' })),
  ...UNCOMMON.map((word) => ({ word, rung: 'uncommon' })),
];

function fakeData(): GameData {
  return {
    dictionary: createListDictionary([...COMMON, ...MYTHIC, ...UNCOMMON]),
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
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
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

describe("a find's line in the well, at a phone's width", () => {
  for (const width of [320, 375]) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const textSize of ['regular', 'large', 'largest'] as const) {
        for (const { word, rung } of FINDS) {
          test(`${width}px, ${theme}, ${textSize} text, ${word}: the well keeps its height and the line its words`, async () => {
            await page.viewport(width, 800);
            mountGame(theme, textSize);
            const stick = await until(() =>
              host!.querySelector<HTMLElement>('.stick'),
            );
            const before = stick.getBoundingClientRect().height;

            await userEvent.keyboard(`${word}{Enter}`);
            const mark = await until(() =>
              stick.querySelector<HTMLElement>(`.mark--${rung}`),
            );
            const message = stick.querySelector<HTMLElement>('.message')!;
            const after = stick.getBoundingClientRect().height;
            expect(after, "the well's height").toBe(before);

            // The words are all there: the clamp hides nothing.
            expect(
              message.scrollHeight,
              'the line is clamped',
            ).toBeLessThanOrEqual(message.clientHeight + 0.5);

            // The mark leads its first line: before the words, and within
            // the first line's box, however many lines the words take.
            const m = mark.getBoundingClientRect();
            const t = message.getBoundingClientRect();
            const lineHeight = parseFloat(getComputedStyle(message).lineHeight);
            expect(m.right, 'the mark is before the words').toBeLessThanOrEqual(
              t.left + 0.5,
            );
            expect(
              m.top,
              'the mark sits on the first line',
            ).toBeGreaterThanOrEqual(t.top - 0.5);
            expect(
              m.bottom,
              'the mark sits on the first line',
            ).toBeLessThanOrEqual(t.top + lineHeight + 0.5);

            // Nothing runs past the well, or the page.
            const s = stick.getBoundingClientRect();
            expect(t.right).toBeLessThanOrEqual(s.right + 0.5);
            expect(m.left).toBeGreaterThanOrEqual(s.left - 0.5);
            const doc = document.documentElement;
            expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);

            console.log(
              `WELL ${width} ${theme} ${textSize} ${word} well=${before}->${after} lines=${Math.round(t.height / lineHeight)}`,
            );
          });
        }
      }
    }
  }
});

/**
 * A find's line can be tapped to open its card, and says so the way the found
 * list's chips do, so the two read as one idea: the pointer, and the words
 * underlined on hover. No instruction text, and nothing the chips lack.
 */
describe("a find's line shows it can be tapped, as a chip does", () => {
  for (const theme of ['cute', 'letterpress'] as const) {
    test(`${theme}: the pointer, and its words underlined on hover`, async () => {
      await page.viewport(375, 800);
      mountGame(theme, 'regular');
      await userEvent.keyboard('res{Enter}');
      const line = await until(() =>
        host!.querySelector<HTMLElement>('.stick__open'),
      );
      const chip = await until(() =>
        host!.querySelector<HTMLElement>('.found__group .found__word'),
      );
      const words = (el: Element, selector: string) =>
        getComputedStyle(el.querySelector(selector)!).textDecorationLine;

      // The chip's cue, which the line is held to.
      expect(getComputedStyle(chip).cursor).toBe('pointer');
      await userEvent.hover(chip);
      expect(words(chip, '.found__wordtext')).toBe('underline');

      expect(getComputedStyle(line).cursor, 'the pointer').toBe('pointer');
      expect(words(line, '.message'), 'at rest').toBe('none');
      await userEvent.hover(line);
      expect(words(line, '.message'), 'on hover').toBe('underline');
    });
  }
});
