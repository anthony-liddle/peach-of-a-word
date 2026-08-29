import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { STORAGE_EPOCH } from '@/engine/config.ts';
import { dayIndex } from '@/engine/daily.ts';

/**
 * The transfer page's script, actually run.
 *
 * The other assertions on this page read it as text, which cannot tell whether
 * it works. This runs it: every path in it is new, and the two most likely to
 * be wrong (a streak that already counts today, and the app not being there to
 * take the link) had never executed anywhere.
 *
 * The page is a standalone document rather than a module, so there is nothing
 * to import. The body and the script are lifted out of the file and run in the
 * suite's own jsdom, which is also why this needs no jsdom import and no new
 * dependency for a throwaway page.
 *
 * This file is disposable and goes when the page does.
 */
const html = readFileSync(
  resolve(process.cwd(), 'public/transfer-temporary.html'),
  'utf8',
);

const STORAGE_KEY = 'eight-letters/v1';

const bodyHtml = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
// The last script in the document is the page logic; the first is the
// pre-paint theme script, which has its own assertions elsewhere.
const pageScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(
  -1,
)?.[1];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** Seed the store, lay out the page, and run its script against it. */
function load(seed?: unknown): void {
  if (seed !== undefined) {
    localStorage.setItem(
      STORAGE_KEY,
      typeof seed === 'string' ? seed : JSON.stringify(seed),
    );
  }
  document.body.innerHTML = bodyHtml;
  new Function(pageScript ?? '')();
}

const visible = (id: string) =>
  !document.getElementById(id)?.classList.contains('hidden');

const text = (id: string) => document.getElementById(id)?.textContent;

const today = () => dayIndex(new Date(), STORAGE_EPOCH);

describe('reading the streak out of this browser', () => {
  test('shows the count and the day it was last extended', () => {
    load({
      version: 1,
      days: {},
      streak: { count: 53, lastClearedDayIndex: today() },
      endless: null,
    });

    expect(visible('found')).toBe(true);
    expect(text('count-display')).toBe('53');
    expect(text('last-display')).toBe('today');
    expect(text('index-display')).toBe(String(today()));
  });

  test('a streak last extended yesterday says so', () => {
    load({ streak: { count: 7, lastClearedDayIndex: today() - 1 } });
    expect(text('last-display')).toBe('yesterday');
  });

  /**
   * A lapsed streak is shown rather than hidden. The page reports what is in
   * the browser; whether it is still alive is the app's decision, and a second
   * copy of that rule here would be a second place to get it wrong.
   */
  test('a lapsed streak is reported honestly, not hidden', () => {
    load({ streak: { count: 53, lastClearedDayIndex: today() - 9 } });
    expect(visible('found')).toBe(true);
    expect(text('last-display')).toBe('9 days ago');
  });

  test.each([
    ['no saved state at all', undefined],
    ['state with no streak', { version: 1, days: {} }],
    [
      'a streak that has never been extended',
      { streak: { count: 0, lastClearedDayIndex: null } },
    ],
    ['a count with no last-cleared day', { streak: { count: 12 } }],
    ['a corrupt blob', '{not json at all'],
  ])('%s offers nothing to send', (_label, seed) => {
    load(seed);
    expect(visible('empty')).toBe(true);
    expect(visible('action')).toBe(false);
    expect(visible('found')).toBe(false);
  });
});

describe('the link it builds', () => {
  test('carries both fields and the version', () => {
    load({ streak: { count: 53, lastClearedDayIndex: 239 } });
    // The exact string the app parses. Both fields, because a count on its own
    // leaves the app unable to tell whether the streak is still alive, and it
    // resets to 1 the next morning.
    expect(document.getElementById('send')?.getAttribute('href')).toBe(
      'peachofaword://streak?count=53&lastCleared=239&v=1',
    );
  });
});

describe('what it says about opening the app', () => {
  /**
   * The page used to start a timer on the tap and announce "nothing opened" if
   * it survived. Measured on a simulator, that is unsound: iOS raises a system
   * confirmation for a custom scheme and leaves this page visible with its
   * timers running while the dialog waits for a human, so the timeout races a
   * person reading an alert rather than detecting a missing app.
   *
   * What replaced it is unconditional: both possibilities, stated once, with no
   * detection to be wrong about.
   */
  test('states both outcomes as soon as there is a streak to send', () => {
    load({ streak: { count: 53, lastClearedDayIndex: today() } });
    expect(visible('fallback')).toBe(true);
  });

  test('says nothing about opening when there is nothing to send', () => {
    load();
    expect(visible('fallback')).toBe(false);
    expect(visible('empty')).toBe(true);
  });
});
