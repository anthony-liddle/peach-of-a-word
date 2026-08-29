import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_THEME } from './ui/useTheme.ts';
import { faviconHref } from './ui/favicon.ts';

/**
 * The standalone documents under public/, copied verbatim by Vite rather than
 * processed as entries, so nothing keeps them in step with index.html
 * automatically.
 *
 * privacy.html shipped declaring the classic crown as its tab icon while the
 * rest of the site showed the peach, and defaulting to the letterpress palette
 * while the app defaults to cute. Both were the same mistake: the page treated
 * the non-default theme as its baseline.
 *
 * These mirror the index.html battery against the same single source of truth,
 * so the documents cannot drift apart again without a test saying so. The suite
 * runs over every standalone page rather than one, because the second such page
 * was written by copying the first and would have inherited the bug just as
 * easily.
 */
const PAGES = ['public/privacy.html', 'public/transfer-temporary.html'];

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe.each(PAGES)('%s', (path) => {
  const html = read(path);

  test('the pre-paint <html> default agrees with the app default theme', () => {
    // The no-preference visitor never has the inline script touch the
    // attribute, and most visitors are that: the app writes e8-theme only on an
    // explicit toggle, so anyone who has never switched has no stored key.
    expect(html).toMatch(
      new RegExp(`<html[^>]*\\bdata-theme="${DEFAULT_THEME}"`),
    );
  });

  test('the declared favicon default matches the default theme mark', () => {
    // The bug this file exists for: this href was the letterpress crown, so
    // every visitor who had not switched themes saw a crown on this one page.
    const href = faviconHref(DEFAULT_THEME).replace(/\./g, '\\.');
    expect(html).toMatch(new RegExp(`<link[^>]*rel="icon"[^>]*href="${href}"`));
  });

  test('declares the same default icon as index.html', () => {
    const index = read('index.html');
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

/**
 * The streak transfer page, which is a one-time migration rather than a
 * feature and is meant to be deleted once the handoff is done.
 *
 * These assertions are about the two things that make it work at all, both of
 * which are easy to "tidy" into a broken state by someone who does not know
 * why they are there.
 */
describe('transfer-temporary.html', () => {
  const html = read('public/transfer-temporary.html');

  test('sends both streak fields, not just the count', () => {
    // The failure this guards: a count with no record of when it was last
    // extended reads as broken the next morning, so the app resets a
    // transferred 53 to 1 overnight. The player gets the number, feels good,
    // and loses it while asleep.
    expect(html).toContain('peachofaword://streak?count=');
    expect(html).toContain('&lastCleared=');
    expect(html).toContain('&v=1');
  });

  test('makes no timed guess about whether the app opened', () => {
    // Measured on a simulator: tapping a custom scheme raises a system
    // confirmation and leaves this page visible with its timers running while
    // it waits for a human. A timeout would race a person reading an alert, so
    // "no app took the link" and "the alert is still up" are indistinguishable
    // from in here. The page says both possibilities instead of picking one.
    expect(html).not.toContain('setTimeout');
    expect(html).toMatch(/not installed/i);
    expect(html).toMatch(/Open in/i);
  });

  test('reads the same storage key and epoch the game writes', () => {
    expect(html).toContain('eight-letters/v1');
    expect(html).toContain('year: 2026, month: 1, day: 1');
  });

  test('says on the page that it is temporary', () => {
    // The page states its own disposability, because the filename is the only
    // other place that can: vercel.json is strict JSON and takes no comments.
    expect(html).toMatch(/temporary/i);
    expect(html).toMatch(/deleted/i);
  });

  test('is not indexed', () => {
    expect(html).toContain('name="robots" content="noindex"');
  });
});

/**
 * The rewrite that serves the page, checked here because the pairing is the
 * part that breaks silently: removing one of the two leaves either a dead
 * /transfer or an orphaned file nobody can reach.
 */
describe('vercel.json rewrites', () => {
  const config = JSON.parse(read('vercel.json')) as {
    rewrites: { source: string; destination: string }[];
  };

  test('/transfer serves the temporary page', () => {
    expect(config.rewrites).toContainEqual({
      source: '/transfer',
      destination: '/transfer-temporary.html',
    });
  });

  test('every rewrite destination exists', () => {
    for (const { destination } of config.rewrites) {
      expect(() => read(`public${destination}`)).not.toThrow();
    }
  });
});
