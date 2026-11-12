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
 * The settings popover, by keyboard, in a real browser: the theme, the
 * appearance, the text size and sound, out of the toolbar and into one
 * button's popover (Antoine, 11 November 2026).
 *
 * Full keyboard use: Tab reaches the button and Enter opens it; focus goes
 * into it; the arrow keys choose within a group, as radio buttons do; Escape
 * closes it and focus goes back to the button. Every control has a name a
 * screen reader says. And it fits a 320px screen at the largest text.
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
  for (const key of ['e8-theme', 'e8-appearance', 'e8-text-size'])
    localStorage.removeItem(key);
  const el = document.documentElement;
  delete el.dataset.theme;
  delete el.dataset.textSize;
  delete el.dataset.appearance;
});

function mount(textSize: 'largest' | null = null) {
  const style = document.createElement('style');
  style.id = 'game-css';
  style.textContent = css;
  document.head.append(style);
  document.documentElement.dataset.theme = 'cute';
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

const button = () =>
  document.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"][aria-label="Settings"]',
  );
const dialog = () =>
  document.querySelector<HTMLElement>('[role="dialog"][aria-label="Settings"]');
const radio = (name: string, value: string) =>
  document.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${name}"][value="${value}"]`,
  );

/**
 * Safari's engine leaves buttons out of Tab unless the player has turned on
 * "Press Tab to highlight each item", and Option-Tab reaches them instead. So
 * a keyboard player there presses Option-Tab, and so does the test.
 */
const tab =
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Firefox/.test(navigator.userAgent)
    ? '{Alt>}{Tab}{/Alt}'
    : '{Tab}';

/** Tab until the Settings button has focus, as a keyboard player would. */
async function tabToSettings() {
  for (let i = 0; i < 60 && document.activeElement !== button(); i++) {
    await userEvent.keyboard(tab);
  }
  expect(document.activeElement, 'Tab never reached Settings').toBe(button());
}

describe('the settings popover', () => {
  test('the toolbar holds one Settings button, and no theme, text size or sound of its own', async () => {
    await page.viewport(1280, 800);
    mount();
    expect(button()).not.toBeNull();
    expect(button()!.getAttribute('aria-expanded')).toBe('false');
    expect(
      document.querySelector('.theme-seg, .theme-swap, .textsize'),
    ).toBeNull();
    expect(
      document.querySelector(
        '.toolbar [aria-label="Mute sound"], .toolbar [aria-label="Unmute sound"]',
      ),
    ).toBeNull();
  });

  test('Enter opens it, focus goes in, and every control is named', async () => {
    await page.viewport(1280, 800);
    mount();
    await tabToSettings();
    await userEvent.keyboard('{Enter}');
    const d = dialog();
    expect(d).not.toBeNull();
    expect(button()!.getAttribute('aria-expanded')).toBe('true');
    expect(d!.contains(document.activeElement)).toBe(true);
    const legends = [...d!.querySelectorAll('legend')].map((l) =>
      l.textContent?.trim(),
    );
    expect(legends).toEqual(['Theme', 'Appearance', 'Text size']);
    const names = [...d!.querySelectorAll('input')].map(
      (i) => i.labels?.[0]?.textContent?.trim() ?? i.getAttribute('aria-label'),
    );
    expect(names).toEqual([
      'Cute',
      'Letterpress',
      'System',
      'Light',
      'Dark',
      'Regular',
      'Large',
      'Largest',
      'Sound',
    ]);
  });

  test('the arrow keys choose within a group, and the page follows at once', async () => {
    await page.viewport(1280, 800);
    mount();
    await tabToSettings();
    await userEvent.keyboard('{Enter}');
    radio('appearance', 'system')!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(radio('appearance', 'dark')!.checked).toBe(true);
    expect(document.documentElement.dataset.appearance).toBe('dark');
    expect(localStorage.getItem('e8-appearance')).toBe('dark');
  });

  test('Escape closes it, and focus goes back to the button', async () => {
    await page.viewport(1280, 800);
    mount();
    await tabToSettings();
    await userEvent.keyboard('{Enter}');
    expect(dialog()).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(button()!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button());
  });

  test('it is drawn over the board, not under it', async () => {
    await page.viewport(375, 812);
    mount();
    await tabToSettings();
    await userEvent.keyboard('{Enter}');
    // Each of its controls is the thing under its own centre: nothing of
    // the board, which comes later in the page, is painted over it.
    for (const input of dialog()!.querySelectorAll('input')) {
      const box = input.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      expect(
        dialog()!.contains(top),
        `${input.name} ${input.value} is under ${top?.className}`,
      ).toBe(true);
    }
  });

  test('it fits a 320px screen at the largest text, with nothing to scroll sideways', async () => {
    await page.viewport(320, 640);
    mount('largest');
    expect(document.documentElement.clientWidth).toBe(320);
    await tabToSettings();
    await userEvent.keyboard('{Enter}');
    const box = dialog()!.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});
