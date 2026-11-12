import { afterEach, describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import html from '../index.html?raw';
import css from '@/index.css?raw';

/**
 * No light first frame when the computer or phone is dark, in Chromium,
 * Firefox and WebKit.
 *
 * A page's first frame is what the browser can paint before the app's script
 * has run: the head's metas, the inline script that runs before the first
 * paint, and the stylesheet, which blocks painting until it loads. So each
 * case builds a document from exactly those, read from the real `index.html`
 * and `index.css`, in a fresh frame, with the browser's colour scheme
 * emulated and the player's saved setting in storage, and reads what it
 * paints:
 * - **before any stylesheet,** the canvas, whose colour follows the root's
 *   `color-scheme`;
 * - **with the stylesheet,** the page's own background.
 */

/** The head as the browser parses it, without the app's module script. */
function head(): string {
  const h = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  if (!h) throw new Error('index.html has no head');
  return h
    .replace(/<script type="module"[\s\S]*?<\/script>/g, '')
    .replace(/<link rel="stylesheet"[^>]*>/g, '');
}

let frame: HTMLIFrameElement | null = null;

afterEach(async () => {
  frame?.remove();
  frame = null;
  for (const key of ['e8-appearance', 'e8-theme']) localStorage.removeItem(key);
  await commands.emulateColorScheme('light');
});

/** A fresh document from the head, with or without the stylesheet. */
async function firstFrame(withStyles: boolean): Promise<Document> {
  frame = document.createElement('iframe');
  frame.style.cssText = 'width:375px;height:200px;border:0';
  const styles = withStyles ? `<style>${css}</style>` : '';
  frame.srcdoc = `<!doctype html><html lang="en" data-theme="cute"><head>${head()}${styles}</head><body><p>Peach</p></body></html>`;
  const loaded = new Promise((r) =>
    frame!.addEventListener('load', r, { once: true }),
  );
  document.body.append(frame);
  await loaded;
  return frame.contentDocument!;
}

/** Relative luminance of a computed `rgb()` colour, 0 to 1. */
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function paints(setup: {
  scheme: 'light' | 'dark';
  appearance?: 'system' | 'light' | 'dark';
  theme?: 'cute' | 'letterpress';
}): Promise<{ canvas: string; page: number }> {
  await commands.emulateColorScheme(setup.scheme);
  if (setup.appearance) localStorage.setItem('e8-appearance', setup.appearance);
  if (setup.theme) localStorage.setItem('e8-theme', setup.theme);
  const bare = await firstFrame(false);
  const canvas = bare.defaultView!.getComputedStyle(
    bare.documentElement,
  ).colorScheme;
  frame!.remove();
  const styled = await firstFrame(true);
  const page = luminance(
    styled.defaultView!.getComputedStyle(styled.body).backgroundColor,
  );
  return { canvas, page };
}

describe('the first frame', () => {
  test('a dark computer or phone, and nothing chosen: dark from the first frame', async () => {
    const { canvas, page } = await paints({ scheme: 'dark' });
    expect(canvas).toBe('dark');
    expect(page).toBeLessThan(0.05);
  });

  test('a light one, and Dark chosen: dark from the first frame', async () => {
    const { canvas, page } = await paints({
      scheme: 'light',
      appearance: 'dark',
    });
    expect(canvas).toBe('dark');
    expect(page).toBeLessThan(0.05);
  });

  test('a dark one, and Light chosen: light from the first frame, as asked', async () => {
    const { canvas, page } = await paints({
      scheme: 'dark',
      appearance: 'light',
    });
    expect(canvas).toBe('light');
    expect(page).toBeGreaterThan(0.8);
  });

  test('a dark one in letterpress: light, which has no dark yet', async () => {
    const { canvas, page } = await paints({
      scheme: 'dark',
      theme: 'letterpress',
    });
    expect(canvas).toBe('light');
    expect(page).toBeGreaterThan(0.7);
  });
});
