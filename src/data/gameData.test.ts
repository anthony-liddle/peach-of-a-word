import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyWord, createPuzzle, validateGuess } from '@/engine/index.ts';
import { loadGameData } from './gameData.ts';

function mockAssets(files: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const name = Object.keys(files).find((n) => url.endsWith(`data/${n}`));
    if (name === undefined) return { ok: false, status: 404 } as Response;
    return {
      ok: true,
      status: 200,
      text: async () => files[name],
    } as unknown as Response;
  });
}

// The lists arrive patched: app and wifi sit in the shipped files because the
// bake put them there, not because the runtime merges an allowlist.
const BASE_FILES: Record<string, string> = {
  'enable.txt': 'app\nasp\nsap\nwifi\n',
  'common-pool.txt': 'app\nsap\nwifi\n',
  'scowl95-additions.txt': '',
  'beyond-size-70.txt': '',
  'beyond-size-95.txt': '',
  'source-pool.json': '[]',
  'daily-calendar.json': JSON.stringify({
    epoch: { year: 2026, month: 1, day: 1 },
    words: ['apppwfii'],
  }),
};

afterEach(() => vi.unstubAllGlobals());

describe('loadGameData over pre-baked lists', () => {
  it('accepts a formerly allowlisted word straight from the shipped list', async () => {
    vi.stubGlobal('fetch', mockAssets(BASE_FILES));
    const data = await loadGameData();
    expect(data.dictionary.has('app')).toBe(true);
    expect(data.dictionary.has('wifi')).toBe(true);
  });

  it('never fetches the patch, so a data change cannot crash a cached bundle', async () => {
    // The incident in one assertion. The old runtime fetched and re-parsed the
    // patch on every load, so a bundle that predated a new action threw on it.
    // There is nothing left to fetch and nothing left to parse.
    const fetchMock = mockAssets(BASE_FILES);
    vi.stubGlobal('fetch', fetchMock);
    await loadGameData();

    const fetched = fetchMock.mock.calls.map(([url]) => String(url));
    expect(fetched.length).toBeGreaterThan(0);
    for (const url of fetched) expect(url).not.toContain('dictionary-patch');
  });

  it('bands the word so it classifies as common, not mythic', async () => {
    vi.stubGlobal('fetch', mockAssets(BASE_FILES));
    const data = await loadGameData();
    const puzzle = createPuzzle(
      'apppwfii',
      data.dictionary,
      data.commonPool,
      data.beyond70Pool,
      data.beyond95Pool,
    );
    expect(classifyWord('app', puzzle)).toBe('set');
    expect(puzzle.mythicWords.has('app')).toBe(false);
  });
});

describe('loadGameData with the ENABLE union SCOWL 95 boundary', () => {
  // blog is a SCOWL-95 word ENABLE lacks. Within size 95 but beyond 70 here,
  // so it must validate and grade as rare, never mythic.
  const FILES: Record<string, string> = {
    ...BASE_FILES,
    'enable.txt': 'cat\n',
    'common-pool.txt': 'cat\n',
    'scowl95-additions.txt': 'blog\n',
    'beyond-size-70.txt': 'blog\n', // boundary minus SCOWL 70 (blog is beyond 70)
    'beyond-size-95.txt': '', // boundary minus SCOWL 95 (blog is within 95)
    'daily-calendar.json': JSON.stringify({
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['blogxxxx'],
    }),
  };

  it('unions the SCOWL 95 additions into the validation set', async () => {
    vi.stubGlobal('fetch', mockAssets(FILES));
    const data = await loadGameData();
    expect(data.dictionary.has('blog')).toBe(true);
    expect(data.dictionary.has('cat')).toBe(true);
  });

  it('grades a newly admitted SCOWL word as rare, not mythic', async () => {
    vi.stubGlobal('fetch', mockAssets(FILES));
    const data = await loadGameData();
    const puzzle = createPuzzle(
      'blogxxxx',
      data.dictionary,
      data.commonPool,
      data.beyond70Pool,
      data.beyond95Pool,
    );
    expect(validateGuess('blog', puzzle, new Set()).kind).toBe('valid');
    expect(classifyWord('blog', puzzle)).toBe('rare');
    expect(puzzle.mythicWords.has('blog')).toBe(false);
  });
});
