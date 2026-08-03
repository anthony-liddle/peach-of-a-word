import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createListDictionary } from '@/data/listSource.ts';
import {
  createPuzzle,
  eligibleSourceWords,
  generateCalendar,
  sourceSetSize,
  MIN_SET_SIZE,
} from '@/engine/index.ts';
import type { SourceEntry } from '@/data/types.ts';
import type { Dictionary, WordSource } from '@/engine/types.ts';
import { parseExclusions } from './lib/exclusions.ts';
import { loadPatchedPools } from './lib/pools.ts';

const EXCLUSIONS = parseExclusions(
  readFileSync(
    join(import.meta.dirname, 'data-raw', 'source-exclusions.tsv'),
    'utf8',
  ),
);

/**
 * Real-data checks against the baked assets. These prove eligibility is wired up
 * (the 582 anchor) and that the committed calendar is in sync with the data.
 */
const DATA = join(import.meta.dirname, '..', 'public', 'data');
const read = (f: string) =>
  readFileSync(join(DATA, f), 'utf8')
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);

let dictionary: Dictionary;
let commonPool: WordSource;
let beyond70Pool: WordSource;
let beyond95Pool: WordSource;
let sourceWords: string[];
let eligible: string[];

beforeAll(async () => {
  // The same patched pools the build derives from, so eligibility here is the
  // eligibility that shipped. Loading the raw lists instead would leave denied
  // words inside every set size this file asserts on.
  ({ dictionary, commonPool, beyond70Pool, beyond95Pool } =
    await loadPatchedPools());
  sourceWords = (
    JSON.parse(
      readFileSync(join(DATA, 'source-pool.json'), 'utf8'),
    ) as SourceEntry[]
  ).map((e) => e.word);
  eligible = eligibleSourceWords(
    sourceWords,
    dictionary,
    commonPool,
    beyond70Pool,
    beyond95Pool,
  );
}, 120_000);

const setSize = (w: string) =>
  sourceSetSize(w, dictionary, commonPool, beyond70Pool, beyond95Pool);

describe('the calendar build derives from patched pools', () => {
  // The generator IS pool derivation: it computes each candidate's set size and
  // keeps the ones that clear the floor, so a word present in these pools is
  // inside a par value and a completion count. Reading the raw lists left every
  // denied word in those denominators even though the runtime had removed it.
  const deniedSlurs = readFileSync('public/data/dictionary-patch.tsv', 'utf8')
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((c) => c[1]?.trim() === 'deny' && c[3]?.trim() === 'nwl2020')
    .map((c) => (c[0] ?? '').trim());

  it('has no denied word left in the pools eligibility is computed from', () => {
    expect(deniedSlurs.length).toBeGreaterThan(0);
    for (const word of deniedSlurs) expect(dictionary.has(word)).toBe(false);
  });

  it('leaves no denied word in any set the floor is measured against', () => {
    // AGREEING is the rack that surfaced this: it spells two of them.
    const denied = new Set(deniedSlurs);
    const puzzle = createPuzzle(
      'agreeing',
      dictionary,
      commonPool,
      beyond70Pool,
      beyond95Pool,
    );
    for (const band of [
      puzzle.validationWords,
      puzzle.commonWords,
      puzzle.uncommonWords,
      puzzle.rareWords,
      puzzle.mythicWords,
    ]) {
      for (const word of band) expect(denied.has(word)).toBe(false);
    }
  });

  it('unpatched pools would still hold them, which is what was wrong', () => {
    // The discriminator. Same assertion, raw lists: it must fail, or the two
    // tests above prove nothing about the fix.
    const raw = createListDictionary(read('enable.txt'));
    expect(deniedSlurs.some((w) => raw.has(w))).toBe(true);
  });
});

describe('eligibility against the real baked data', () => {
  it('keeps 582 of the 707 shipped source words (the rest are sub-floor)', () => {
    expect(sourceWords.length).toBe(707);
    expect(eligible.length).toBe(582);
  });

  it('treats known thin words as sub-floor (crown-inclusive)', () => {
    // aardvark: 3, remember: 5. Both under the floor.
    expect(setSize('aardvark')).toBeLessThan(MIN_SET_SIZE);
    expect(setSize('remember')).toBeLessThan(MIN_SET_SIZE);
    expect(eligible).not.toContain('aardvark');
    expect(eligible).not.toContain('remember');
  });

  it('treats a rich word as eligible', () => {
    expect(setSize('basement')).toBeGreaterThanOrEqual(MIN_SET_SIZE);
    expect(eligible).toContain('basement');
  });
});

describe('the culled, regenerated calendar', () => {
  // The crown pool is the eligible words minus the source-word exclusion list.
  // Computed inside each test, since `eligible` is filled in beforeAll.
  const culledWords = () => eligible.filter((w) => !EXCLUSIONS.has(w));

  it('drops exactly the excluded words from the eligible pool', () => {
    // 582 eligible minus 38 exclusions = 544 clean crowns.
    expect(eligible.length).toBe(582);
    expect(culledWords().length).toBe(544);
  });

  it('first run contains exactly the culled words, no excluded word', () => {
    const culled = culledWords();
    const calendar = generateCalendar(culled, []);
    expect([...calendar].sort()).toEqual([...culled].sort());
    for (const w of calendar) expect(EXCLUSIONS.has(w)).toBe(false);
  });

  it('matches the committed daily-calendar.json, re-anchored', () => {
    const committed = JSON.parse(
      readFileSync(join(DATA, 'daily-calendar.json'), 'utf8'),
    ) as {
      epoch: { year: number; month: number; day: number };
      words: string[];
    };
    expect(committed.words.length).toBe(544);
    expect([...committed.words].sort()).toEqual([...culledWords()].sort());
    expect(committed.epoch).toEqual({ year: 2026, month: 6, day: 23 });
  });

  it('every committed crown is clean, and the floor holds on a sample', () => {
    const committed = JSON.parse(
      readFileSync(join(DATA, 'daily-calendar.json'), 'utf8'),
    ) as { words: string[] };
    // No excluded word slipped through (cheap set lookup over all 544).
    for (const w of committed.words) expect(EXCLUSIONS.has(w)).toBe(false);
    // The floor is guaranteed by eligibleSourceWords, which the build uses; a
    // spaced sample re-checks it through createPuzzle without the full sweep.
    const step = Math.floor(committed.words.length / 15);
    for (let i = 0; i < committed.words.length; i += step) {
      expect(setSize(committed.words[i]!)).toBeGreaterThanOrEqual(MIN_SET_SIZE);
    }
  });
});
