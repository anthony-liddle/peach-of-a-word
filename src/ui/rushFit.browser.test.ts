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
import { browserLock } from '@/rush/lock.ts';
import { Game } from './Game.tsx';
import type { Theme } from './useTheme.ts';

/**
 * The run fits a phone at the largest text: every state's last control ends
 * on screen, in a real browser with the game's own stylesheet, as the app's
 * `PeachRushAtEverySize` holds its own.
 *
 * The heights are Safari's visible ones with its toolbars: 548 on the SE, 664
 * at 390 wide. The fonts here are the browser's fallbacks, not the web fonts
 * the page loads, so a number here is near the page's, not the same; the
 * report's numbers are from headless Chrome with the real fonts.
 *
 * 320 by 460, the narrowest phone at Largest, is measured: there the clock
 * and Start or Resume must be on screen, and the rest may scroll.
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

/** A browser on its second day, so the run is offered. */
function secondDay(): KeyValueStore {
  const map = new Map<string, string>();
  const s: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  new GameStorage(s).saveDayProgress(
    dayIndex(new Date(), STORAGE_EPOCH) - 1,
    'serenade',
    [],
  );
  return s;
}

let root: Root | null = null;
let host: HTMLElement | null = null;
let otherTab: (() => Promise<void>) | null = null;

afterEach(async () => {
  root?.unmount();
  host?.remove();
  document.getElementById('game-css')?.remove();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
  await otherTab?.();
  otherTab = null;
});

function mount(theme: Theme, save: KeyValueStore) {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.textSize = 'largest';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      createElement(Game, {
        rush: true,
        data: fakeData(),
        audio: new NullAudioEngine(),
        storage: new GameStorage(save),
      }),
    ),
  );
}

async function until<T>(read: () => T | null | undefined | false): Promise<T> {
  for (let i = 0; i < 300; i++) {
    const found = read();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
}

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent)?.trim() === name,
  );

type State = 'ready' | 'running' | 'paused' | 'elsewhere';

/** The run on screen in `state`, at the top of the page. */
async function into(state: State, theme: Theme) {
  const save = secondDay();
  if (state === 'elsewhere') {
    // Another tab has the run going: it holds the lock, and saved it running.
    otherTab = await browserLock()!.take();
    new GameStorage(save).saveRunInFlight({
      dayIndex: dayIndex(new Date(), STORAGE_EPOCH),
      sourceWord: 'serenade',
      words: ['sea'],
      leftMs: 48_000,
      clockMs: 90_000,
      phase: 'running',
      tab: 'other',
    });
  }
  mount(theme, save);
  // On a second day the start offers the run, a run waiting too.
  (
    await until(() => document.querySelector<HTMLElement>('.start__rush'))
  ).click();
  await until(() => document.querySelector('.board--run'));
  if (state === 'running' || state === 'paused') {
    (await until(() => button('Start'))).click();
    await until(() => document.querySelector('.case button')?.textContent);
  }
  if (state === 'paused') {
    window.dispatchEvent(new Event('pagehide'));
    await until(() => button('Resume'));
  }
  if (state === 'elsewhere')
    await until(() =>
      document.querySelector('.stick')?.textContent?.includes('another tab'),
    );
  window.scrollTo(0, 0);
  await document.fonts.ready;
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
}

const bottom = (selector: string) =>
  document.querySelector(selector)!.getBoundingClientRect().bottom;

describe('the run at the largest text', () => {
  for (const [width, height, label] of [
    [375, 548, "the SE's Safari"],
    [390, 664, 'Safari at 390 wide'],
  ] as const) {
    for (const theme of ['cute', 'letterpress'] as const) {
      for (const state of [
        'ready',
        'running',
        'paused',
        'elsewhere',
      ] as const) {
        test(`${state}, ${theme}, ends on screen in ${label}`, async () => {
          await page.viewport(width, height);
          await into(state, theme);
          const last = bottom('.board--run .controls');
          console.log(
            `rush fit ${width}x${height} ${theme} ${state}: controls end at ${Math.round(last)} of ${innerHeight}`,
          );
          expect(last).toBeLessThanOrEqual(innerHeight);
          expect(bottom('.runhead [role="timer"]')).toBeLessThanOrEqual(
            innerHeight,
          );
        });
      }
    }
  }
});

describe('the run on the narrowest phone, at the largest text', () => {
  for (const theme of ['cute', 'letterpress'] as const) {
    test(`running, ${theme}: the clock stays pinned on screen while the controls scroll into view at 320 by 460`, async () => {
      await page.viewport(320, 460);
      await into('running', theme);
      document
        .querySelector('.board--run .controls')!
        .scrollIntoView({ block: 'end' });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(scrollY).toBeGreaterThan(0);
      // Scrolled into view to the pixel, give or take a browser's rounding.
      expect(bottom('.board--run .controls')).toBeLessThanOrEqual(
        innerHeight + 1,
      );
      const clock = document
        .querySelector('.runhead [role="timer"]')!
        .getBoundingClientRect();
      expect(clock.top).toBeGreaterThanOrEqual(0);
      expect(clock.bottom).toBeLessThanOrEqual(innerHeight);
    });
  }
  for (const theme of ['cute', 'letterpress'] as const) {
    for (const state of ['ready', 'paused'] as const) {
      test(`${state}, ${theme}: the clock and ${state === 'ready' ? 'Start' : 'Resume'} on screen at 320 by 460`, async () => {
        await page.viewport(320, 460);
        await into(state, theme);
        console.log(
          `rush fit 320x460 ${theme} ${state}: controls end at ${Math.round(bottom('.board--run .controls'))} of ${innerHeight}`,
        );
        expect(bottom('.runhead [role="timer"]')).toBeLessThanOrEqual(
          innerHeight,
        );
        expect(bottom('.runrack__start')).toBeLessThanOrEqual(innerHeight);
      });
    }
  }
});
