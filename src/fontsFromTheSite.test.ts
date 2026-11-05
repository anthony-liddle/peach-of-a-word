import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Every page takes its typefaces from this site, never from Google's.
 *
 * The privacy page says counting visits is "the one thing the site does that
 * the app does not", and that nothing here follows you to another website.
 * While the pages loaded Fraunces, Spectral, Fredoka and Nunito from Google
 * Fonts, every visit also reached Google, so neither was quite true. The
 * files now live in public/fonts, copied from what Google served, and
 * public/fonts/fonts.css declares them.
 *
 * The hosts are built from parts so this file doesn't match itself.
 */
const GOOGLE_HOSTS = ['fonts.' + 'googleapis.com', 'fonts.' + 'gstatic.com'];

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/** Every file under a directory with one of the given endings, repo-relative. */
function filesUnder(dir: string, endings: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(root, dir), {
    withFileTypes: true,
  })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path, endings));
    else if (endings.some((e) => entry.name.endsWith(e))) out.push(path);
  }
  return out;
}

/**
 * The pages: the build's entries at the repo root and the documents copied
 * verbatim from public/. Not archive/, which is history and never deployed.
 */
const PAGES = [
  ...readdirSync(root).filter((name) => name.endsWith('.html')),
  ...filesUnder('public', ['.html']),
];

const STYLESHEETS = [
  ...filesUnder('src', ['.css']),
  ...filesUnder('public', ['.css']),
];

describe('the typefaces come from this site', () => {
  test('found the pages and the stylesheets at all', () => {
    expect(PAGES).toContain('index.html');
    expect(PAGES).toContain('public/privacy.html');
    expect(STYLESHEETS.length).toBeGreaterThan(0);
  });

  test.each([...PAGES, ...STYLESHEETS])(
    '%s names no Google font host',
    (path) => {
      const text = read(path);
      for (const host of GOOGLE_HOSTS) expect(text).not.toContain(host);
    },
  );

  test.each(PAGES)('%s links the site’s own fonts', (path) => {
    expect(read(path)).toContain('href="/fonts/fonts.css"');
  });

  /**
   * A wrong path fails quietly: the browser falls back to a system face and
   * the page still reaches no one, so the guard above would pass on a page
   * with no fonts at all. This holds every file the stylesheet names.
   */
  test('every file fonts.css names is in public/fonts', () => {
    const css = read('public/fonts/fonts.css');
    const urls = [...css.matchAll(/url\((\/fonts\/[^)]+\.woff2)\)/g)].map(
      (m) => m[1]!,
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls)
      expect(existsSync(resolve(root, 'public' + url))).toBe(true);
  });

  test.each(['Fraunces', 'Spectral', 'Fredoka', 'Nunito'])(
    'fonts.css declares %s, and its licence ships beside it',
    (family) => {
      expect(read('public/fonts/fonts.css')).toContain(
        `font-family: '${family}'`,
      );
      expect(existsSync(resolve(root, `public/fonts/OFL-${family}.txt`))).toBe(
        true,
      );
    },
  );
});
