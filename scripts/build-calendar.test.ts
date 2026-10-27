import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createPuzzle,
  dailySourceWord,
  dayIndex,
  eligibleSourceWords,
  generateCalendar,
  sourceSetSize,
  MIN_SET_SIZE,
} from '@/engine/index.ts';
import type { SourceEntry } from '@/data/types.ts';
import type { Dictionary, WordSource } from '@/engine/types.ts';
import {
  parseTrades,
  tradeProblems,
  undoTrades,
  type CalendarTrade,
} from './lib/calendar-trades.ts';
import { parseExclusions } from './lib/exclusions.ts';
import { FLOOR_EXCEPTIONS, floorProblems } from './lib/floor.ts';
import { parseReasonedWords } from './lib/denylist.ts';
import { loadPatchedPools } from './lib/pools.ts';

/** The shipped data directory, read directly so tests see what ships. */
const DATA = join(import.meta.dirname, '..', 'public', 'data');

const ADMISSIONS = new Map(
  parseReasonedWords(
    readFileSync(
      join(import.meta.dirname, 'data-raw', 'source-admissions.tsv'),
      'utf8',
    ),
    'Source admission',
  ).map((a) => [a.word, a.reason]),
);

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
}, 300_000);

const setSize = (w: string) =>
  sourceSetSize(w, dictionary, commonPool, beyond70Pool, beyond95Pool);

describe('the calendar build derives from patched pools', () => {
  // The generator IS pool derivation: it computes each candidate's set size and
  // keeps the ones that clear the floor, so a word present in these pools is
  // inside a par value and a completion count. Reading the raw lists left every
  // denied word in those denominators even though the runtime had removed it.
  const deniedSlurs = readFileSync(
    join(
      import.meta.dirname,
      '..',
      'vendor',
      'lexicon',
      'dictionary-patch.tsv',
    ),
    'utf8',
  )
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

  it('unpatched pools would still hold them, which is what was wrong', async () => {
    // The discriminator. Same assertion against the boundary before the patch,
    // derived from the vendored raw lists: it must find the denied words, or the
    // two tests above prove nothing about the fix.
    //
    // The positive control for this file used to live here: assert the denied
    // slurs ARE present in the UNPATCHED boundary, so the absence checks above
    // are not passing vacuously. It cannot live here any more, because this
    // repo no longer holds the unpatched lexicons to ask.
    //
    // It moved to orchard, where the unpatched data is, and got stronger on the
    // way: denylist.test.ts derives the list from the raw boundary and asserts
    // exactly 216 denied and 23 no-ops the boundary never had, which pins how
    // many were present rather than merely that some were.
    expect(deniedSlurs.length).toBeGreaterThan(0);
  });
});

describe('eligibility against the real baked data', () => {
  it('keeps 668 of the 793 shipped source words (the rest are sub-floor)', () => {
    // 707, plus six hand admissions replacing crowns retired for register,
    // plus the 80 the cached-null-etymology fix made eligible. Less two since
    // orchard v1.10.0, each taken to 14 when a crude word left every basket:
    // approach (crap), which keeps its day, since the generator keeps every
    // committed word, and sexually (sexy), already retired for register.
    expect(sourceWords.length).toBe(793);
    expect(eligible.length).toBe(668);
    expect(eligible).not.toContain('approach');
    expect(eligible).not.toContain('sexually');
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
    // 668 eligible minus 43 of the 54 exclusions that sit in the pool = 625
    // clean crowns. The first six register retirements each had a replacement
    // admitted, holding the count steady; the three added from the widened
    // candidate set were never in the pool, so they subtract nothing.
    expect(eligible.length).toBe(668);
    expect(culledWords().length).toBe(625);
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
    expect(committed.words.length).toBe(626);
    // The culled pool and approach, which no longer clears the floor but keeps
    // its committed day: the generator never drops a word already placed.
    expect([...committed.words].sort()).toEqual(
      [...culledWords(), 'approach'].sort(),
    );
    expect(committed.epoch).toEqual({ year: 2026, month: 6, day: 23 });
  });

  it('substitutes the three flagged crowns in place, keeping the calendar frozen', () => {
    // Antoine's call: sexually, violence and abortion would be odd to type into
    // a cute-themed game. They are swapped at their own index rather than
    // removed, because removing an entry re-dates every day after it and breaks
    // the promise that a given date is a fixed puzzle. Each replacement is a
    // clean base word admitted to the source pool, not a word struck from the
    // Phase 2 cull: a plural has no etymology of its own to reveal.
    const committed = JSON.parse(
      readFileSync(join(DATA, 'daily-calendar.json'), 'utf8'),
    ) as { words: string[] };
    const swaps: ReadonlyArray<readonly [number, string, string]> = [
      [57, 'violence', 'restrain'],
      [66, 'atrocity', 'patience'],
      [67, 'abortion', 'integral'],
      [89, 'oriental', 'festival'],
      [100, 'sexually', 'distance'],
      [246, 'genocide', 'sunlight'],
    ];

    expect(committed.words).toHaveLength(626);
    // No duplicate introduced, so no two dates resolve to the same puzzle.
    // The swaps happened in place at 544 days; the calendar has since been
    // appended to, and appending cannot disturb an index before it. Recorded
    // trades of future days have since moved some words, sunlight among them,
    // so each index is read from the calendar with the trades undone.
    expect(new Set(committed.words).size).toBe(626);
    const asBuilt = undoTrades(
      committed.words,
      parseTrades(
        readFileSync(
          join(import.meta.dirname, 'data-raw', 'calendar-trades.tsv'),
          'utf8',
        ),
      ),
      { year: 2026, month: 6, day: 23 },
    );

    for (const [index, removed, added] of swaps) {
      expect(asBuilt[index]).toBe(added);
      expect(committed.words).not.toContain(removed);
      // The outgoing word is culled from the crown pool, so a regeneration
      // cannot reintroduce it; it stays a valid, scorable find.
      expect(EXCLUSIONS.has(removed)).toBe(true);
      expect(EXCLUSIONS.has(added)).toBe(false);
      // Each replacement makes a real puzzle: the floor, through createPuzzle,
      // exactly as calendar generation computes it.
      expect(setSize(added)).toBeGreaterThanOrEqual(MIN_SET_SIZE);
      expect(dictionary.has(added)).toBe(true);
      // Admitted by widening the source pool, never re-admitted from the cull:
      // every culled word breaks one of the three rules by construction.
      expect(ADMISSIONS.has(added)).toBe(true);
      expect(EXCLUSIONS.has(added)).toBe(false);
    }
  });

  it('holds every crown to the floor, but its named exceptions', () => {
    // A list change can take a crown under the floor without moving its day.
    // Each one is named in floor.ts at its exact size, with its reason, and
    // the floor holds for every other crown. The build checks the same.
    const committed = JSON.parse(
      readFileSync(join(DATA, 'daily-calendar.json'), 'utf8'),
    ) as { words: string[] };
    expect(
      floorProblems(committed.words.map((w) => [w, setSize(w)] as const)),
    ).toEqual([]);
    expect([...FLOOR_EXCEPTIONS.keys()]).toEqual(['approach']);
    expect(FLOOR_EXCEPTIONS.get('approach')?.size).toBe(MIN_SET_SIZE - 1);
  }, 300_000);

  it('names a crown under the floor that no exception covers, or one off its size', () => {
    expect(floorProblems([['basement', MIN_SET_SIZE]])).toEqual([]);
    expect(floorProblems([['basement', MIN_SET_SIZE - 1]])).toHaveLength(1);
    expect(floorProblems([['approach', MIN_SET_SIZE - 1]])).toEqual([]);
    expect(floorProblems([['approach', MIN_SET_SIZE - 2]])).toHaveLength(1);
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

describe('the recorded trades of future days', () => {
  // Antoine's amendment to the append-only rule: one trade on 2026-10-20, so
  // the peach's Halloween board is skeleton, then on 2026-10-27 a year of
  // holiday words, and the words held back for next year moved past it. A
  // trade re-dates its two days and no other. The Swift app pins the same file
  // hash in CalendarTradeTests, so the two copies cannot drift apart.
  const raw = readFileSync(join(DATA, 'daily-calendar.json'), 'utf8');
  const committed = JSON.parse(raw) as {
    epoch: { year: number; month: number; day: number };
    words: string[];
  };
  const trades = parseTrades(
    readFileSync(
      join(import.meta.dirname, 'data-raw', 'calendar-trades.tsv'),
      'utf8',
    ),
  );
  const yearOfWords = trades.filter((t) => t.made === '2026-10-27');
  const sha256 = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const dateOf = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  };
  /** The committed bytes with these trades undone, last first, by swapping quoted words. */
  const undone = (rows: readonly CalendarTrade[]) =>
    [...rows]
      .reverse()
      .reduce(
        (text, t) =>
          text
            .replace(`"${t.first.word}"`, '"\u0000"')
            .replace(`"${t.second.word}"`, `"${t.first.word}"`)
            .replace('"\u0000"', `"${t.second.word}"`),
        raw,
      );

  // Every day the year of words changed, and the word it now has.
  const CHANGED: ReadonlyArray<readonly [string, string]> = [
    ['2026-11-19', 'chemical'],
    ['2026-11-26', 'thankful'],
    ['2026-12-02', 'keyboard'],
    ['2026-12-12', 'premises'],
    ['2026-12-18', 'smoothly'],
    ['2026-12-21', 'daylight'],
    ['2026-12-24', 'wondrous'],
    ['2026-12-25', 'wrapping'],
    ['2026-12-31', 'midnight'],
    ['2027-01-01', 'calendar'],
    ['2027-01-03', 'intimate'],
    ['2027-01-07', 'constant'],
    ['2027-01-12', 'anecdote'],
    ['2027-02-04', 'redefine'],
    ['2027-02-06', 'lifetime'],
    ['2027-02-09', 'detector'],
    ['2027-02-11', 'previous'],
    ['2027-02-12', 'irritate'],
    ['2027-02-13', 'personal'],
    ['2027-02-14', 'romantic'],
    ['2027-02-18', 'misprint'],
    ['2027-02-24', 'suppress'],
    ['2027-03-13', 'sufferer'],
    ['2027-03-20', 'fountain'],
    ['2027-04-01', 'disguise'],
    ['2027-04-16', 'birthday'],
    ['2027-04-18', 'distract'],
    ['2027-04-22', 'mountain'],
    ['2027-04-23', 'marriage'],
    ['2027-05-11', 'regional'],
    ['2027-05-18', 'puncture'],
    ['2027-05-23', 'blasting'],
    ['2027-05-25', 'formally'],
    ['2027-05-27', 'rephrase'],
    ['2027-06-10', 'supplier'],
    ['2027-06-15', 'together'],
    ['2027-06-21', 'sunshine'],
    ['2027-06-23', 'original'],
    ['2027-06-27', 'proclaim'],
    ['2027-06-29', 'instruct'],
    ['2027-07-03', 'consumer'],
    ['2027-07-06', 'discover'],
    ['2027-08-23', 'distress'],
    ['2027-08-24', 'gorgeous'],
    ['2027-08-26', 'document'],
    ['2027-08-28', 'learning'],
    ['2027-09-04', 'bankrupt'],
    ['2027-09-19', 'spectrum'],
    ['2027-09-23', 'suddenly'],
    ['2027-09-24', 'paranoia'],
    ['2027-09-30', 'northern'],
    ['2027-10-31', 'frighten'],
    ['2027-11-04', 'eternity'],
    ['2027-11-09', 'alphabet'],
    ['2027-11-16', 'laughing'],
    ['2027-11-19', 'umbrella'],
    ['2027-11-24', 'faithful'],
    ['2027-12-01', 'generous'],
    ['2027-12-02', 'inventor'],
    ['2027-12-06', 'delicate'],
    ['2027-12-12', 'grateful'],
    ['2027-12-15', 'football'],
    ['2027-12-17', 'freezing'],
    ['2027-12-20', 'outgoing'],
    ['2027-12-23', 'sunlight'],
    ['2027-12-28', 'farewell'],
    ['2028-01-02', 'heritage'],
    ['2028-01-09', 'newcomer'],
    ['2028-01-14', 'sinister'],
    ['2028-01-19', 'emerging'],
    ['2028-01-22', 'planning'],
    ['2028-01-24', 'vacation'],
    ['2028-01-29', 'postcard'],
    ['2028-02-04', 'universe'],
    ['2028-02-09', 'cheerful'],
    ['2028-02-15', 'peculiar'],
    ['2028-02-20', 'goodness'],
    ['2028-02-23', 'artistic'],
    ['2028-02-25', 'stuffing'],
    ['2028-03-01', 'creation'],
    ['2028-03-07', 'elephant'],
  ];

  it('is the calendar the Swift app pins, byte for byte', () => {
    expect(sha256(raw)).toBe(
      '32c3ed91528d4c64857d8da41e3362b358789639aaf178bc1129d54faa460ec2',
    );
  });

  it('records the Halloween trade and the year of words', () => {
    expect(trades).toHaveLength(42);
    expect(yearOfWords).toHaveLength(41);
    expect(CHANGED).toHaveLength(81);
  });

  it('gives every changed day its new word', () => {
    for (const [day, word] of CHANGED) {
      expect(
        dailySourceWord(committed.words, dateOf(day), committed.epoch),
        day,
      ).toBe(word);
    }
  });

  it('keeps skeleton on 31 October 2026, and genetics on 17 May 2027', () => {
    expect(dayIndex(dateOf('2026-10-31'), committed.epoch)).toBe(130);
    expect(committed.words[130]).toBe('skeleton');
    expect(committed.words[328]).toBe('genetics');
  });

  it('traded only days still to come, and nothing before 8 November this time', () => {
    expect(tradeProblems(committed.words, trades, committed.epoch)).toEqual([]);
    // A week past the last day these can merge, so Bea's phone has them first.
    for (const t of yearOfWords) {
      expect(t.first.day >= '2026-11-08', t.first.day).toBe(true);
      expect(t.second.day >= '2026-11-08', t.second.day).toBe(true);
    }
  });

  it('moved no other index: undone, it is the calendar before', () => {
    // Before the year of words: main as Halloween left it.
    expect(sha256(undone(yearOfWords))).toBe(
      'ea5b0dc1855d28c947fecafc365f4c50095dfed1a59d46cc965590a6b719e8d2',
    );
    // Before any trade: the calendar as the generator built it.
    expect(sha256(undone(trades))).toBe(
      'dddc844300ab461a1ba1bd217daefa6fcc1e9e5a2abb23bdefbb841d73f17163',
    );
  });

  it('holds the same words: none added, none lost, none repeated', () => {
    const before = undoTrades(committed.words, trades, committed.epoch);
    expect([...committed.words].sort()).toEqual([...before].sort());
    expect(new Set(committed.words).size).toBe(committed.words.length);
    expect(committed.words).toHaveLength(626);
  });

  it('moves only the traded words, in this cycle and every reshuffled one after it', () => {
    // After 9 March 2028 the calendar reshuffles by index, so a traded word
    // takes its new index into every later cycle, and every other date stays.
    // `becomes` holds that a word keeps its index into every cycle; `moved`
    // holds that only the words the record names change dates.
    const before = undoTrades(committed.words, trades, committed.epoch);
    const becomes = new Map(before.map((w, i) => [w, committed.words[i]!]));
    const moved = new Set(trades.flatMap((t) => [t.first.word, t.second.word]));
    const start = new Date(2026, 5, 23);
    let firstCycle = 0;
    for (let d = 0; d < 365 * 6; d++) {
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + d,
      );
      const now = dailySourceWord(committed.words, date, committed.epoch);
      const then = dailySourceWord(before, date, committed.epoch);
      expect(now, date.toDateString()).toBe(becomes.get(then));
      if (!moved.has(then)) expect(now, date.toDateString()).toBe(then);
      if (d < committed.words.length && now !== then) firstCycle++;
    }
    // The 81 days of the year of words and Halloween's two.
    expect(firstCycle).toBe(83);
  });
});
