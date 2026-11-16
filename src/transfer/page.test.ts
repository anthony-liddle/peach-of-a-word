import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { renderTransfer } from './page.ts';

/**
 * The transfer page, run: its own markup from transfer.html, laid out in the
 * suite's jsdom, and the page module run over it with the browser's parts
 * handed in. What a player sees in each case is asserted on what's shown, not
 * on the source.
 */
const html = readFileSync(resolve(process.cwd(), 'transfer.html'), 'utf8');
const body = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;

const TODAY = 318; // 15 November 2026
const ORIGIN = 'https://peachofaword.com';

function storageWith(
  streak?: { count: number; lastClearedDayIndex: number | null } | undefined,
): GameStorage {
  const map = new Map<string, string>();
  if (streak)
    map.set(
      'eight-letters/v1',
      JSON.stringify({ version: 1, days: {}, streak, endless: null }),
    );
  const store: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  return new GameStorage(store);
}

function load({
  streak,
  hash = '',
  computer = false,
  copy = vi.fn(async (_text: string) => {}),
}: {
  streak?: { count: number; lastClearedDayIndex: number | null } | undefined;
  hash?: string;
  computer?: boolean;
  copy?: (text: string) => Promise<void>;
} = {}) {
  document.body.innerHTML = body;
  renderTransfer(document, {
    storage: storageWith(streak),
    todayIndex: TODAY,
    hash,
    origin: ORIGIN,
    computer,
    copy,
  });
  return { copy };
}

const el = (id: string) => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`no #${id} on the page`);
  return found;
};
const shown = (id: string) => {
  // Shown means neither it nor anything around it is hidden.
  for (let at: HTMLElement | null = el(id); at; at = at.parentElement)
    if (at.hidden) return false;
  return true;
};
const words = (id: string) => el(id).textContent!.replace(/\s+/g, ' ').trim();

afterEach(() => {
  document.body.innerHTML = '';
});

describe('on a phone, with a streak going', () => {
  test('shows the count and a link that opens the app with it', () => {
    load({ streak: { count: 12, lastClearedDayIndex: 318 } });
    expect(shown('found')).toBe(true);
    expect(words('count')).toBe('12');
    expect(words('count-label')).toBe('days in your streak');
    expect(shown('send')).toBe(true);
    expect(el('send').tagName).toBe('A');
    expect(el('send').getAttribute('href')).toBe(
      'peachofaword://streak?v=1&count=12&lastCleared=318',
    );
    expect(shown('on-computer')).toBe(false);
    expect(shown('none')).toBe(false);
  });

  test('one day reads as one day', () => {
    load({ streak: { count: 1, lastClearedDayIndex: 318 } });
    expect(words('count-label')).toBe('day in your streak');
  });

  test('says what the app does with it, and what nothing opening means', () => {
    load({ streak: { count: 12, lastClearedDayIndex: 318 } });
    expect(shown('after-send')).toBe(true);
  });

  test('ending today, it needs no warning', () => {
    load({ streak: { count: 12, lastClearedDayIndex: 318 } });
    expect(shown('ended-yesterday')).toBe(false);
  });

  test('ending yesterday, it warns about playing in the app first', () => {
    load({ streak: { count: 12, lastClearedDayIndex: 317 } });
    expect(shown('ended-yesterday')).toBe(true);
    expect(shown('send')).toBe(true);
  });
});

describe('with no streak going', () => {
  test.each([
    ['no save', undefined],
    ['a streak that never started', { count: 0, lastClearedDayIndex: null }],
    [
      'a streak that ended two days ago',
      { count: 9, lastClearedDayIndex: 316 },
    ],
  ])('%s: says so, and that the days are safe', (_, streak) => {
    load({ streak });
    expect(shown('none')).toBe(true);
    expect(shown('none-browser')).toBe(true);
    expect(shown('none-address')).toBe(false);
    expect(shown('days-safe')).toBe(true);
    expect(shown('found')).toBe(false);
    expect(shown('send')).toBe(false);
    expect(shown('on-computer')).toBe(false);
  });

  test('offers no link at all', () => {
    load({ streak: { count: 9, lastClearedDayIndex: 316 } });
    expect(document.querySelector('a[href^="peachofaword:"]')).toBeNull();
  });
});

describe('on a computer', () => {
  test('offers its own address, carrying the streak, to copy', async () => {
    const { copy } = load({
      streak: { count: 12, lastClearedDayIndex: 318 },
      computer: true,
    });
    const address = `${ORIGIN}/transfer#streak?v=1&count=12&lastCleared=318`;
    expect(shown('on-computer')).toBe(true);
    expect(words('address')).toBe(address);
    expect(shown('on-phone')).toBe(false);
    el('copy').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith(address));
    await vi.waitFor(() => expect(words('copy-status')).not.toBe(''));
  });

  test('when the copy fails, says to copy it by hand', async () => {
    load({
      streak: { count: 12, lastClearedDayIndex: 318 },
      computer: true,
      copy: () => Promise.reject(new Error('denied')),
    });
    el('copy').click();
    await vi.waitFor(() => expect(words('copy-status')).not.toBe(''));
    expect(words('copy-status')).not.toBe(words('copy-done'));
  });

  test('the warning shows there too', () => {
    load({
      streak: { count: 12, lastClearedDayIndex: 317 },
      computer: true,
    });
    expect(shown('ended-yesterday')).toBe(true);
  });
});

describe('opened from a copied address', () => {
  test('takes the streak from the address, not from this browser', () => {
    load({
      streak: { count: 2, lastClearedDayIndex: 318 },
      hash: '#streak?v=1&count=40&lastCleared=318',
    });
    expect(words('count')).toBe('40');
    expect(el('send').getAttribute('href')).toBe(
      'peachofaword://streak?v=1&count=40&lastCleared=318',
    );
  });

  test.each([
    ['ended since it was copied', '#streak?v=1&count=40&lastCleared=315'],
    ['not one the page wrote', '#streak?v=9&count=40&lastCleared=318'],
  ])('one %s: says the address has none', (_, hash) => {
    load({ streak: { count: 2, lastClearedDayIndex: 318 }, hash });
    expect(shown('none')).toBe(true);
    expect(shown('none-address')).toBe(true);
    expect(shown('none-browser')).toBe(false);
    expect(shown('send')).toBe(false);
  });
});

describe('every visit', () => {
  test('links the app on the App Store', () => {
    load();
    expect(
      document.querySelector(
        'a[href="https://apps.apple.com/us/app/peach-of-a-word/id6799815181"]',
      ),
    ).not.toBeNull();
  });

  test('leads back to the game', () => {
    load();
    const back = [...document.querySelectorAll('a')].find(
      (a) => a.textContent === 'Back to the game',
    );
    expect(back?.getAttribute('href')).toBe('/');
  });

  test('without its script, offers nothing it cannot do', () => {
    document.body.innerHTML = body;
    for (const id of ['found', 'on-phone', 'on-computer', 'none'])
      expect(shown(id), id).toBe(false);
  });
});
