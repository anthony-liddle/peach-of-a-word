import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_THEME } from '@/ui/useTheme.ts';
import { faviconHref } from '@/ui/favicon.ts';

/**
 * The sounds page's document, and the promise that it stays unlisted: nothing
 * in the game links to it, and it asks not to be indexed.
 */
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const html = read('sounds.html');

// Written as a code point, so this file holds none itself.
const EM_DASH = String.fromCodePoint(0x2014);

describe('sounds.html', () => {
  test('asks not to be indexed or followed', () => {
    expect(html).toContain(
      '<meta name="robots" content="noindex, nofollow" />',
    );
  });

  test('is pinned to the cute theme before the first paint', () => {
    expect(DEFAULT_THEME).toBe('cute');
    expect(html).toMatch(/<html[^>]*\bdata-theme="cute"/);
    expect(html).toContain("document.documentElement.dataset.theme = 'cute'");
    // No saved-preference lookup: the page has one theme.
    expect(html).not.toContain('e8-theme');
  });

  test('declares the cute peach as its tab icon', () => {
    const href = faviconHref('cute').replace(/\./g, '\\.');
    expect(html).toMatch(new RegExp(`<link[^>]*rel="icon"[^>]*href="${href}"`));
  });

  test('honours the saved text size, which is accessibility, not a look', () => {
    expect(html).toContain("localStorage.getItem('e8-text-size')");
  });

  test('mounts the page that imports the real engine', () => {
    expect(html).toContain('src="/src/sounds/main.tsx"');
  });

  test('uses no em dash', () => {
    expect(html).not.toContain(EM_DASH);
  });
});

/**
 * Every file the game ships or builds from, outside the page itself. A link to
 * /sounds in any of them would list the page. Tests ship nothing, and the
 * rewrite's own test names the path, so they are left out.
 */
function gameFiles(): string[] {
  const src = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
    .map(String)
    .filter(
      (p) =>
        /\.(tsx?|css)$/.test(p) &&
        !/\.test\.tsx?$/.test(p) &&
        !p.startsWith('sounds'),
    )
    .map((p) => join('src', p));
  const pub = readdirSync(resolve(process.cwd(), 'public'))
    .filter((p) => p.endsWith('.html'))
    .map((p) => join('public', p));
  return ['index.html', ...src, ...pub];
}

describe('the sounds page is unlisted', () => {
  test('nothing in the game links to it', () => {
    const linking = gameFiles().filter((path) =>
      /["'`]\/sounds(\.html)?["'`]/.test(read(path)),
    );
    expect(linking).toEqual([]);
  });
});
