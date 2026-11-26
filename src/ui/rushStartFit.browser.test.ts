import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
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
import { dayIndex, STORAGE_EPOCH } from '@/engine/index.ts';
import { RUSH_OFFER_KEY } from './useRushOffer.ts';
import { Game } from './Game.tsx';
import type { Theme } from './useTheme.ts';

/**
 * The start and the toolbar, in a real browser with the game's stylesheet
 * and each engine's fallback fonts.
 *
 * - The start's Play and Peach rush are on screen as the page loads, on the
 *   SE's Safari (375 by 548) and at 390 by 664, at the largest text.
 * - The toolbar is `main`'s height in every state the run puts it in, so its
 *   button never pushes Settings onto a row of its own. A browser's first day
 *   stands in for `main`: no start and no button.
 */
const WORDS = ['serenade', 'sea', 'near', 'dean', 'ease'];

function fakeData(): GameData {
  return {
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
}

const today = () => dayIndex(new Date(), STORAGE_EPOCH);

function fresh(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

type State =
  | 'first day'
  | 'the start'
  | 'after Play'
  | 'a run waiting'
  | 'a run played, with the peach';

/** The save for a state: from the second day on, yesterday opened, no find. */
function saveFor(state: State): KeyValueStore {
  const s = fresh();
  if (state === 'first day') return s;
  const storage = new GameStorage(s);
  storage.saveDayProgress(today() - 1, 'serenade', []);
  if (state === 'a run waiting')
    storage.saveRunInFlight({
      dayIndex: today(),
      sourceWord: 'serenade',
      words: ['sea'],
      leftMs: 48_000,
      clockMs: 90_000,
      phase: 'paused',
      tab: 'another',
    });
  if (state === 'a run played, with the peach') {
    storage.saveRun(today(), {
      sourceWord: 'serenade',
      words: ['sea', 'near', 'serenade'],
      points: 57,
      peach: true,
      best: { word: 'serenade', points: 50 },
      endedEarly: false,
      leftMs: 0,
      clockMs: 90_000,
      peachCardOwed: false,
    });
    storage.saveDayProgress(today(), 'serenade', ['sea', 'near', 'serenade']);
  }
  return s;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.getElementById('game-css')?.remove();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
  localStorage.removeItem(RUSH_OFFER_KEY);
});

async function mount(
  theme: Theme,
  size: 'largest' | null,
  state: State,
): Promise<void> {
  // A run waiting shows in the toolbar only with the start turned off.
  if (state === 'a run waiting') localStorage.setItem(RUSH_OFFER_KEY, 'off');
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  if (size) document.documentElement.dataset.textSize = size;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      createElement(Game, {
        rush: true,
        data: fakeData(),
        audio: new NullAudioEngine(),
        storage: new GameStorage(saveFor(state)),
      }),
    ),
  );
  if (state === 'after Play')
    document.querySelector<HTMLButtonElement>('.start__play')!.click();
  for (let i = 0; i < 100; i++) {
    if (document.querySelector('.toolbar')) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  await document.fonts.ready;
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  window.scrollTo(0, 0);
}

const toolbarHeight = () =>
  Math.round(
    document.querySelector('.toolbar')!.getBoundingClientRect().height,
  );
const bottom = (sel: string) =>
  document.querySelector(sel)!.getBoundingClientRect().bottom;

describe('the start at load, at the largest text', () => {
  for (const [w, h, label] of [
    [375, 548, "the SE's Safari"],
    [390, 664, 'Safari at 390 wide'],
  ] as const)
    for (const theme of ['cute', 'letterpress'] as const)
      test(`${theme}: Play and Peach rush on screen in ${label}`, async () => {
        await page.viewport(w, h);
        await mount(theme, 'largest', 'the start');
        const play = bottom('.start__play');
        const rush = bottom('.start__rush');
        console.log(
          `start fit ${w}x${h} ${theme}: Play ends ${Math.round(play)}, Peach rush ${Math.round(rush)}, of ${innerHeight}`,
        );
        expect(play).toBeLessThanOrEqual(innerHeight);
        expect(rush).toBeLessThanOrEqual(innerHeight);
      });
});

describe("the toolbar, main's height in every state", () => {
  const states: State[] = [
    'the start',
    'after Play',
    'a run waiting',
    'a run played, with the peach',
  ];
  for (const [w, h] of [
    [375, 548],
    [390, 664],
  ] as const)
    for (const theme of ['cute', 'letterpress'] as const)
      for (const size of [null, 'largest'] as const)
        test(`${w} wide, ${theme}, ${size ?? 'default'}`, async () => {
          await page.viewport(w, h);
          await mount(theme, size, 'first day');
          const main = toolbarHeight();
          root!.unmount();
          host!.remove();
          document.getElementById('game-css')?.remove();
          const heights: Record<string, number> = {};
          for (const state of states) {
            await mount(theme, size, state);
            heights[state] = toolbarHeight();
            root!.unmount();
            host!.remove();
            document.getElementById('game-css')?.remove();
            localStorage.removeItem(RUSH_OFFER_KEY);
          }
          root = null;
          host = null;
          for (const state of states)
            expect({ state, height: heights[state] }).toEqual({
              state,
              height: main,
            });
        });
});
