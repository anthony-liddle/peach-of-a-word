/**
 * The gap this closes.
 *
 * 557 tests passed and CI was green while the game was broken for anyone with a
 * cached bundle, because nothing loaded the actual shipped files through the
 * actual runtime path. Every data test either used fixtures or read the files
 * and re-implemented the merge itself, so a file the shipped code could not
 * parse was never something the suite could notice.
 *
 * This runs the real loadGameData against the real bytes in public/data. fetch
 * is stubbed to read from disk, and nothing else is faked: the same parsing, the
 * same merge, the same assembly the browser performs.
 *
 * It is written against a root directory rather than a fixed path so the same
 * checks can run against a deliberately corrupted copy. A guard nobody has seen
 * fail is not known to work, so that corrupted run is a test here rather than
 * something demonstrated once and forgotten.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPuzzle, validateGuess } from '@/engine/index.ts';
import { loadGameData } from './gameData.ts';

const SHIPPED = join(process.cwd(), 'public', 'data');

/**
 * Serve the data directory from disk, the way the host serves it.
 *
 * The path is recovered from the URL after the data directory segment, so this
 * keeps working when that segment carries a content-hash suffix in a real build.
 * A missing file answers 404 rather than throwing, matching what the host does
 * and what the app is written to expect.
 */
function serveFrom(root: string) {
  return vi.fn(async (input: string | URL) => {
    const path = String(input).split(/[?#]/)[0] ?? '';
    const relative = /\/data(?:-[0-9a-f]+)?\/(.+)$/.exec(path)?.[1];
    if (relative === undefined) return { ok: false, status: 404 } as Response;
    let body: string;
    try {
      body = readFileSync(join(root, relative), 'utf8');
    } catch {
      return { ok: false, status: 404 } as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => body,
      json: async () => JSON.parse(body) as unknown,
    } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('the real shipped data, through the real load path', () => {
  it('loads without throwing and assembles every pool', async () => {
    vi.stubGlobal('fetch', serveFrom(SHIPPED));
    const data = await loadGameData();

    // Ordinary words the boundary must hold, so an empty or truncated list
    // cannot pass by parsing cleanly into nothing.
    for (const word of ['peach', 'word', 'letter', 'garden']) {
      expect(data.dictionary.has(word)).toBe(true);
    }
    expect(data.dailyCalendar.words.length).toBeGreaterThan(100);
    expect(data.dailyCalendar.epoch.year).toBeGreaterThan(2000);
  });

  it('builds a real puzzle from the first calendar day and scores a find', async () => {
    vi.stubGlobal('fetch', serveFrom(SHIPPED));
    const data = await loadGameData();

    const sourceWord = data.dailyCalendar.words[0] ?? '';
    expect(sourceWord).not.toBe('');
    const puzzle = createPuzzle(
      sourceWord,
      data.dictionary,
      data.commonPool,
      data.beyond70Pool,
      data.beyond95Pool,
    );

    expect(puzzle.commonWords.size).toBeGreaterThan(0);
    expect(data.sourceEntry(sourceWord)?.definition).toBeTruthy();
    // The source word is always formable from its own letters, so it is the one
    // guess guaranteed to be valid on every rack.
    expect(validateGuess(sourceWord, puzzle, new Set()).kind).toBe('valid');
  });

  it('carries the patch already, so no demoted word sits in the common pool', async () => {
    vi.stubGlobal('fetch', serveFrom(SHIPPED));
    const data = await loadGameData();

    // Demoted words stay valid but must not be required. Read from the curation
    // record, which is no longer shipped, and checked against what is.
    const patch = readFileSync('scripts/data-raw/dictionary-patch.tsv', 'utf8');
    const demoted = patch
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((cols) => cols[1]?.trim() === 'demote')
      .map((cols) => (cols[0] ?? '').trim())
      .filter(Boolean);

    expect(demoted.length).toBeGreaterThan(0);
    const puzzle = createPuzzle(
      'paradise',
      data.dictionary,
      data.commonPool,
      data.beyond70Pool,
      data.beyond95Pool,
    );
    for (const word of demoted)
      expect(puzzle.commonWords.has(word)).toBe(false);
  });

  it('parses every shipped definition bundle as JSON', async () => {
    // 700-odd files that only ever load one at a time in a session, so a single
    // corrupt bundle would otherwise surface as one broken puzzle, on one day,
    // for whoever happened to get that rack.
    const defs = join(SHIPPED, 'defs');
    const files = readdirSync(defs).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(100);

    for (const file of files) {
      const raw = readFileSync(join(defs, file), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });
});

describe('the guard discriminates', () => {
  let corrupted: string | null = null;

  afterEach(() => {
    if (corrupted) rmSync(corrupted, { recursive: true, force: true });
    corrupted = null;
  });

  /** A copy of the shipped data, so the committed files are never touched. */
  function corruptedCopy(mutate: (root: string) => void): string {
    corrupted = mkdtempSync(join(tmpdir(), 'peach-data-'));
    cpSync(SHIPPED, corrupted, { recursive: true });
    mutate(corrupted);
    return corrupted;
  }

  it('fails when a shipped JSON file is malformed', async () => {
    const root = corruptedCopy((dir) => {
      writeFileSync(join(dir, 'daily-calendar.json'), '{ "words": [ truncated');
    });
    vi.stubGlobal('fetch', serveFrom(root));

    await expect(loadGameData()).rejects.toThrow();
  });

  it('fails when a shipped file is missing entirely', async () => {
    const root = corruptedCopy((dir) => {
      rmSync(join(dir, 'common-pool.txt'));
    });
    vi.stubGlobal('fetch', serveFrom(root));

    await expect(loadGameData()).rejects.toThrow(/common-pool/);
  });

  it('fails when a word list comes back as an HTML error page', async () => {
    // The silent-corruption case. A host that answers a missing asset with a
    // rewrite to index.html returns 200, so without the content-type check the
    // markup parses into thousands of junk words and the game loads wrong.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'text/html' }),
            text: async () =>
              '<!doctype html><html><body>Not found</body></html>',
          }) as unknown as Response,
      ),
    );

    await expect(loadGameData()).rejects.toThrow(/HTML/);
  });
});
