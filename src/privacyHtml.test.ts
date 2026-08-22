import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_THEME } from './ui/useTheme.ts';
import { faviconHref } from './ui/favicon.ts';

/**
 * public/privacy.html is a standalone document, copied verbatim by Vite rather
 * than processed as an entry, so nothing keeps it in step with index.html
 * automatically. It shipped declaring the classic crown as its tab icon while
 * the rest of the site showed the peach, and defaulting to the letterpress
 * palette while the app defaults to cute. Both were the same mistake: the page
 * treated the non-default theme as its baseline.
 *
 * These mirror the index.html battery against the same single source of truth,
 * so the two documents cannot drift apart again without a test saying so.
 */
const html = readFileSync(
  resolve(process.cwd(), 'public/privacy.html'),
  'utf8',
);

describe('privacy.html theme default', () => {
  test('the pre-paint <html> default agrees with the app default theme', () => {
    // The no-preference visitor never has the inline script touch the
    // attribute, and most visitors are that: the app writes e8-theme only on an
    // explicit toggle, so anyone who has never switched has no stored key.
    expect(html).toMatch(
      new RegExp(`<html[^>]*\\bdata-theme="${DEFAULT_THEME}"`),
    );
  });
});

describe('privacy.html favicon', () => {
  test('the declared favicon default matches the default theme mark', () => {
    // The bug this file exists for: this href was the letterpress crown, so
    // every visitor who had not switched themes saw a crown on this one page.
    const href = faviconHref(DEFAULT_THEME).replace(/\./g, '\\.');
    expect(html).toMatch(new RegExp(`<link[^>]*rel="icon"[^>]*href="${href}"`));
  });

  test('declares the same default icon as index.html', () => {
    const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const declared = (doc: string) =>
      doc.match(/<link[^>]*rel="icon"[^>]*href="([^"]+)"/)?.[1];
    expect(declared(html)).toBe(declared(index));
  });

  test('the pre-paint script points the icon at the resolved theme', () => {
    // Applying the saved theme without also swapping the icon is exactly what
    // left a crown on a cute-styled page for anyone who had toggled to cute.
    expect(html).toContain("getElementById('favicon')");
    expect(html).toContain('/favicon-cute.svg');
    expect(html).toContain('/favicon-classic.svg');
  });

  test('the retired 8-tile favicon is gone from this page too', () => {
    expect(html).not.toContain('/favicon.ico');
    expect(html).not.toContain('/favicon.svg');
  });
});
