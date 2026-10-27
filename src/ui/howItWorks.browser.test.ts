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
 * "How the words work" owns its Escape: it closes the explainer and goes no
 * further, so a word half typed in the well is still there afterwards.
 *
 * Closing can re-render the game before the page's own key handler runs on
 * the window, and that handler clears the well on Escape once nothing is open.
 * Chromium and WebKit re-render in between and Firefox doesn't, so the word is
 * checked in all three, and so is the deterministic half: whether the page
 * sees the explainer's Escape at all. jsdom dispatches with no pause between
 * listeners, so it can't show the race.
 */
const COMMON = ['serenade', 'sea', 'near'];

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
let heard: ((e: KeyboardEvent) => void) | null = null;

afterEach(() => {
  if (heard) window.removeEventListener('keydown', heard);
  heard = null;
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

describe('"How the words work", by keyboard', () => {
  test('Escape closes it and leaves the word in the well', async () => {
    await page.viewport(1024, 900);
    mountGame();
    const slots = () =>
      [...host!.querySelectorAll('.stick__slot')].map((s) => s.textContent);
    const explainer = () => host!.querySelector('[role="dialog"]');
    await userEvent.keyboard('se');
    await userEvent.click(host!.querySelector<HTMLElement>('.colophon__how')!);
    await until(explainer, 'the explainer did not open');

    // The page's key handler listens on the window, as this does
    const reached: string[] = [];
    heard = (e) => reached.push(e.key);
    window.addEventListener('keydown', heard);
    await userEvent.keyboard('{Escape}');
    await until(
      () => (explainer() ? null : true),
      'Escape did not close the explainer',
    );
    expect
      .soft(slots(), 'Escape cleared the word in the well')
      .toEqual(['s', 'e']);
    expect
      .soft(reached, "the page saw the explainer's Escape")
      .not.toContain('Escape');
  });
});
