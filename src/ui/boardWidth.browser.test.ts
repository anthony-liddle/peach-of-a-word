import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import css from '@/index.css?raw';
import type { TierStanding } from '@/engine/index.ts';
import { TierMeter } from './components/TierMeter.tsx';
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
