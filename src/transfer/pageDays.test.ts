import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { daysPayload } from './days.ts';
import { renderTransfer } from './page.ts';

/**
 * The transfer page opened in the browser a player plays in, once the app
 * reads pasted days (1.2): it copies everything, days and streak, for the
 * app's Paste. One action, whatever the save's size (Antoine, 5 November).
 *
 * A link copied before then, with a streak after its #, still opens the
 * streak's own page; `page.test.ts` covers that.
 */
const html = readFileSync(resolve(process.cwd(), 'transfer.html'), 'utf8');
const body = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;

const TODAY = 318;

function storageWith(save?: {
  days?: Record<number, { sourceWord: string; found: string[] }>;
  streak?: { count: number; lastClearedDayIndex: number | null };
}): GameStorage {
  const map = new Map<string, string>();
  if (save)
    map.set(
      'eight-letters/v1',
      JSON.stringify({
        version: 1,
        days: save.days ?? {},
        streak: save.streak ?? { count: 0, lastClearedDayIndex: null },
        endless: null,
      }),
    );
  const store: KeyValueStore = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  return new GameStorage(store);
}

const THREE_DAYS = {
  316: { sourceWord: 'industry', found: ['dust', 'rust'] },
  317: { sourceWord: 'forecast', found: ['cast'] },
  318: { sourceWord: 'favorite', found: ['five'] },
};

function load(
  storage: GameStorage,
  {
    computer = false,
    copy = vi.fn(async (_text: string) => {}),
  }: { computer?: boolean; copy?: (text: string) => Promise<void> } = {},
) {
  document.body.innerHTML = body;
  renderTransfer(document, {
    storage,
    todayIndex: TODAY,
    hash: '',
    origin: 'https://peachofaword.com',
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
  for (let at: HTMLElement | null = el(id); at; at = at.parentElement)
    if (at.hidden) return false;
  return true;
};
const words = (id: string) => el(id).textContent!.replace(/\s+/g, ' ').trim();

afterEach(() => {
  document.body.innerHTML = '';
});

describe('days in this browser', () => {
  test.each([false, true])(
    'shows how many days, and copies them all for the app (computer: %s)',
    async (computer) => {
      const storage = storageWith({
        days: THREE_DAYS,
        streak: { count: 12, lastClearedDayIndex: 318 },
      });
      const { copy } = load(storage, { computer });
      expect(shown('days-found')).toBe(true);
      expect(words('days-count')).toBe('3');
      expect(words('days-label')).toBe('days to transfer');
      expect(words('days-streak')).toBe('With your streak of 12 days.');
      expect(shown('copy-days')).toBe(true);
      el('copy-days').click();
      await vi.waitFor(() =>
        expect(copy).toHaveBeenCalledWith(daysPayload(storage)),
      );
      await vi.waitFor(() =>
        expect(words('copy-days-status')).toBe(words('days-copied')),
      );
    },
  );

  test('one day reads as one day, and a streak of one as one', () => {
    load(
      storageWith({
        days: { 318: THREE_DAYS[318] },
        streak: { count: 1, lastClearedDayIndex: 318 },
      }),
    );
    expect(words('days-label')).toBe('day to transfer');
    expect(words('days-streak')).toBe('With your streak of 1 day.');
  });

  test("a streak that has ended isn't offered as the streak", () => {
    load(
      storageWith({
        days: THREE_DAYS,
        streak: { count: 9, lastClearedDayIndex: 300 },
      }),
    );
    expect(shown('days-streak')).toBe(false);
  });

  /** No words at all, but a streak: its days still come across as finished. */
  test('a streak with no days of words is still something to transfer', () => {
    load(storageWith({ streak: { count: 9, lastClearedDayIndex: 318 } }));
    expect(words('days-count')).toBe('9');
    expect(words('days-label')).toBe('days in your streak');
    expect(shown('copy-days')).toBe(true);
  });

  test('says how to paste them in the app', () => {
    load(storageWith({ days: THREE_DAYS }));
    expect(shown('paste-steps')).toBe(true);
  });

  test('when the copy fails, shows the text to copy by hand', async () => {
    const storage = storageWith({ days: THREE_DAYS });
    load(storage, { copy: () => Promise.reject(new Error('denied')) });
    el('copy-days').click();
    await vi.waitFor(() =>
      expect(words('copy-days-status')).toBe(words('days-not-copied')),
    );
    expect(shown('days-text')).toBe(true);
    expect((el('days-text') as HTMLTextAreaElement).value).toBe(
      daysPayload(storage),
    );
  });

  test('offers no streak link: the copy carries the streak', () => {
    load(
      storageWith({
        days: THREE_DAYS,
        streak: { count: 12, lastClearedDayIndex: 318 },
      }),
    );
    expect(shown('send')).toBe(false);
    expect(document.querySelector('a[href^="peachofaword:"]')).toBeNull();
  });
});

describe('nothing in this browser', () => {
  test.each([
    ['no save', undefined],
    ['a save with no words and no streak', { days: {} }],
  ])('%s: says so, and offers nothing to copy', (_, save) => {
    load(storageWith(save));
    expect(shown('none-saved')).toBe(true);
    expect(shown('days-found')).toBe(false);
    expect(shown('copy-days')).toBe(false);
  });
});
