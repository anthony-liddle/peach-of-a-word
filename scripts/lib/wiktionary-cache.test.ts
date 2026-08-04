import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The caching half of enrichWord, exercised against a fake disk cache and a
 * fake network. The pure text-cleanup tests live in wiktionary.test.ts; these
 * are about which cached entries are trusted and which are re-fetched.
 *
 * Why this matters. A cached null has two meanings that the cache used to spell
 * the same way: "the fetch was throttled, we do not know" and "we asked, and
 * there is no Etymology section". Trusting the first kept 859 of the 1,575
 * eligible eight-letter common words out of the source pool. Re-fetching the
 * second on every run would mean a cache that never settles.
 */

const cache = new Map<string, unknown>();
const requested: string[] = [];

/** Per-test control over what the fake Wiktionary returns. */
let hasEtymology = new Set<string>();
let sectionsFail = new Set<string>();

const DEFINITION_JSON = JSON.stringify({
  en: [
    {
      partOfSpeech: 'Noun',
      definitions: [{ definition: 'The extent of space between two things.' }],
    },
  ],
});

const ETYMOLOGY_HTML =
  '<div><p>From Middle English <i>distaunce</i>, from Old French.</p></div>';

function wordOf(url: string): string {
  const rest = /\/definition\/([^?]+)/.exec(url);
  if (rest) return decodeURIComponent(rest[1] as string);
  const page = /[?&]page=([^&]+)/.exec(url);
  return decodeURIComponent((page?.[1] as string) ?? '');
}

function respond(url: string): string {
  const word = wordOf(url);
  if (url.includes('/api/rest_v1/page/definition/')) return DEFINITION_JSON;
  if (url.includes('prop=sections')) {
    if (sectionsFail.has(word)) throw new Error('HTTP 429');
    const sections = hasEtymology.has(word)
      ? [{ index: '2', line: 'Etymology' }]
      : [{ index: '2', line: 'Pronunciation' }];
    return JSON.stringify({ parse: { sections } });
  }
  if (url.includes('prop=text')) {
    return JSON.stringify({ parse: { text: ETYMOLOGY_HTML } });
  }
  throw new Error(`unexpected url ${url}`);
}

vi.mock('./util.ts', () => ({
  readCacheJson: async (key: string) =>
    cache.has(key) ? structuredClone(cache.get(key)) : null,
  writeCacheJson: async (key: string, value: unknown) => {
    cache.set(key, structuredClone(value));
  },
  fetchText: async (url: string) => {
    requested.push(url);
    return respond(url);
  },
  sleep: async () => {},
}));

const { enrichWord } = await import('./wiktionary.ts');

const rawKey = (word: string) => `wiktionary-raw/${word}.json`;

beforeEach(() => {
  cache.clear();
  requested.length = 0;
  hasEtymology = new Set(['distance']);
  sectionsFail = new Set();
});

describe('enrichWord cache handling', () => {
  it('re-fetches a cached null etymology and resolves it to a real one', async () => {
    // Exactly the shape the committed cache is full of: the definition landed,
    // the etymology fetch was throttled, and the entry records no more than
    // that. Trusting it is what kept distance out of the source pool.
    cache.set(rawKey('distance'), {
      word: 'distance',
      definitionJson: DEFINITION_JSON,
      etymologyHtml: null,
    });

    const entry = await enrichWord('distance');

    expect(entry.etymology).toContain('Middle English');
    expect(requested.length).toBeGreaterThan(0);
  });

  it('trusts a cached entry that already carries an etymology', async () => {
    cache.set(rawKey('distance'), {
      word: 'distance',
      definitionJson: DEFINITION_JSON,
      etymologyHtml: ETYMOLOGY_HTML,
    });

    const entry = await enrichWord('distance');

    expect(entry.etymology).toContain('Middle English');
    expect(requested).toEqual([]);
  });

  it('settles: a word with no Etymology section is fetched once, not every run', async () => {
    // The convergence test. A naive "re-fetch whenever the etymology is null"
    // guard never stops asking about a word that genuinely has none, which is
    // a large share of the pool. The cache has to be able to say "we asked,
    // and the answer was no".
    hasEtymology = new Set();

    const first = await enrichWord('quixotic');
    const afterFirst = requested.length;
    const second = await enrichWord('quixotic');

    expect(first.etymology).toBeNull();
    expect(second.etymology).toBeNull();
    expect(afterFirst).toBeGreaterThan(0);
    expect(requested.length).toBe(afterFirst);
  });

  it('does not settle on a throttled etymology fetch', async () => {
    // The distinction the settling test could otherwise be satisfied by
    // erasing: a failed lookup must stay unknown, so the next run asks again.
    sectionsFail = new Set(['distance']);

    const first = await enrichWord('distance');
    expect(first.etymology).toBeNull();

    sectionsFail = new Set();
    const second = await enrichWord('distance');

    expect(second.etymology).toContain('Middle English');
  });

  it('re-fetches a cached null definition, as it always has', async () => {
    cache.set(rawKey('distance'), {
      word: 'distance',
      definitionJson: null,
      etymologyHtml: null,
    });

    const entry = await enrichWord('distance');

    expect(entry.definition).toContain('extent of space');
  });
});
