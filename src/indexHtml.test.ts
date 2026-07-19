import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_THEME } from './ui/useTheme.ts';
import { faviconHref } from './ui/favicon.ts';

/**
 * The static document head holds its own copies of the name, separate from the
 * display-name constant, so a rename has to touch them by hand. These assertions
 * pin the new name across every name-bearing tag and prove the retired name is
 * gone from the file entirely. Read from the repo root, where vitest runs.
 */
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

const NEW_NAME = 'Peach of a Word';
const OLD_NAME = '8 Letters in Search of a Word';

// The decided tagline: the concrete mechanic plus the daily hook, no vague
// "quiet" filler. The brand still lives in the title tags, so the description
// carries the pitch, not the name. This copy is duplicated across the three
// description tags and the generated manifest, so pin it in one place here.
const DESCRIPTION =
  'Make words from eight scrambled letters, then find the source word they all came from. A new puzzle daily.';

describe('index.html', () => {
  test('the retired name appears nowhere', () => {
    expect(html).not.toContain(OLD_NAME);
    expect(html).not.toContain('8 Letters');
  });

  test('the document title is the new name', () => {
    expect(html).toContain(`<title>${NEW_NAME}</title>`);
  });

  test('the Open Graph and Twitter titles carry the name', () => {
    expect(html).toContain(
      `<meta property="og:title" content="${NEW_NAME}" />`,
    );
    expect(html).toContain(
      `<meta property="og:site_name" content="${NEW_NAME}" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:title" content="${NEW_NAME}" />`,
    );
  });

  test('the meta, Open Graph, and Twitter descriptions carry the decided tagline', () => {
    for (const attr of [
      'name="description"',
      'property="og:description"',
      'name="twitter:description"',
    ]) {
      expect(html).toMatch(
        new RegExp(`${attr}[\\s\\S]*?content="${DESCRIPTION}"`),
      );
    }
  });

  test('the vague "quiet" tagline is gone from the head', () => {
    expect(html.toLowerCase()).not.toContain('quiet');
  });

  test('the OG image alt text describes the new wordmark', () => {
    expect(html).toMatch(/property="og:image:alt"[\s\S]*?Peach of a Word/);
  });
});

describe('index.html theme default', () => {
  test('the pre-paint <html> default agrees with the app default theme', () => {
    // The no-preference visitor never has the inline script touch the attribute,
    // so this baked-in value is what paints first. It must equal the runtime
    // default, or a fresh load flashes one theme then corrects to the other.
    expect(html).toMatch(
      new RegExp(`<html[^>]*\\bdata-theme="${DEFAULT_THEME}"`),
    );
  });

  test('is cute, the theme Bea plays', () => {
    expect(html).toContain('data-theme="cute"');
    expect(html).not.toContain('data-theme="letterpress"');
  });

  test('the pre-paint script applies a saved text size before first paint', () => {
    // Same no-flash contract as the theme: the size lands on the root before
    // any module runs. Only the larger steps set the attribute; regular means
    // no override, which is also what an unknown saved value must mean.
    expect(html).toContain("localStorage.getItem('e8-text-size')");
    expect(html).toMatch(/dataset\.textSize/);
  });

  test('the pre-paint script still lets a saved preference win', () => {
    // Saved preferences must keep overriding the default, so a letterpress
    // player still lands on letterpress. The script reads the stored key and
    // applies a valid saved value over the baked-in attribute.
    expect(html).toContain("localStorage.getItem('e8-theme')");
    expect(html).toMatch(/dataset\.theme = t/);
  });
});

describe('static chrome and splash color', () => {
  // theme-color (the address-bar tint) and the manifest colors (the PWA splash)
  // are read before any JS runs, so they cannot follow a runtime theme toggle.
  // They always show one theme; cute is the right static choice now that cute is
  // the default and the launch origin starts empty for everyone.
  const CUTE_BG = '#fff4ee';
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/site.webmanifest'), 'utf8'),
  ) as { theme_color: string; background_color: string };

  test('the theme-color meta is the cute background', () => {
    expect(html.toLowerCase()).toContain(
      `<meta name="theme-color" content="${CUTE_BG}" />`,
    );
  });

  test('the manifest theme and background colors are the cute background', () => {
    expect(manifest.theme_color.toLowerCase()).toBe(CUTE_BG);
    expect(manifest.background_color.toLowerCase()).toBe(CUTE_BG);
  });
});

describe('index.html favicon', () => {
  test('the retired 8-tile favicon is gone from production', () => {
    expect(html).not.toContain('/favicon.ico');
    expect(html).not.toContain('/favicon.svg');
    const publicDir = resolve(process.cwd(), 'public');
    expect(existsSync(resolve(publicDir, 'favicon.ico'))).toBe(false);
    expect(existsSync(resolve(publicDir, 'favicon.svg'))).toBe(false);
  });

  test('the declared favicon default matches the default theme mark', () => {
    // The no-preference visitor never has the inline script swap the icon, so
    // this baked-in href is what the tab shows first. It must be the default
    // theme's mark, or a fresh load flashes the wrong icon before JS runs.
    // [^>]* spans the multiline link element (any char but the closing '>').
    const href = faviconHref(DEFAULT_THEME).replace(/\./g, '\\.');
    expect(html).toMatch(new RegExp(`<link[^>]*rel="icon"[^>]*href="${href}"`));
  });

  test('both theme marks resolve on disk', () => {
    const publicDir = resolve(process.cwd(), 'public');
    for (const theme of ['cute', 'letterpress'] as const) {
      const file = faviconHref(theme).replace(/^\//, '');
      expect(existsSync(resolve(publicDir, file))).toBe(true);
    }
  });

  test('the pre-paint script points the icon at the resolved theme', () => {
    // The same early script that sets data-theme also sets the favicon, so the
    // tab is correct before any module loads. It reads the icon element and
    // knows both theme marks.
    expect(html).toContain("getElementById('favicon')");
    expect(html).toContain('/favicon-cute.svg');
    expect(html).toContain('/favicon-classic.svg');
  });
});

describe('PWA home-screen icons', () => {
  const publicDir = resolve(process.cwd(), 'public');
  const manifest = JSON.parse(
    readFileSync(resolve(publicDir, 'site.webmanifest'), 'utf8'),
  ) as { icons: { src: string; sizes: string; purpose?: string }[] };

  test('index.html references an apple-touch-icon that resolves on disk', () => {
    expect(html).toContain(
      'rel="apple-touch-icon" href="/apple-touch-icon.png"',
    );
    const file = resolve(publicDir, 'apple-touch-icon.png');
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(1000);
  });

  test('the manifest icons all resolve on disk and are non-trivial', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const file = resolve(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1000);
    }
  });

  test('a maskable icon is declared, so Android installs are composed for it', () => {
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
});

describe('index.html share image', () => {
  test('references the OG and Twitter image at the same path', () => {
    expect(html).toMatch(/property="og:image" content="[^"]*\/og\.png"/);
    expect(html).toMatch(/name="twitter:image" content="[^"]*\/og\.png"/);
  });

  test('the referenced image resolves on disk and is non-trivial', () => {
    const og = resolve(process.cwd(), 'public/og.png');
    expect(existsSync(og)).toBe(true);
    // A real 1200x630 PNG is many kilobytes; a stub or empty file would not be.
    expect(statSync(og).size).toBeGreaterThan(1000);
  });
});
