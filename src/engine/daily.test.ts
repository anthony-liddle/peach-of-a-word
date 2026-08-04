import { describe, expect, it } from 'vitest';
import { createEndlessSource, dailySourceWord, dayIndex } from './daily.ts';

const EPOCH = { year: 2026, month: 1, day: 1 };

describe('dayIndex', () => {
  it('is zero on the epoch date', () => {
    expect(dayIndex(new Date(2026, 0, 1, 9, 30), EPOCH)).toBe(0);
  });

  it('counts whole calendar days forward', () => {
    expect(dayIndex(new Date(2026, 0, 2), EPOCH)).toBe(1);
    expect(dayIndex(new Date(2026, 1, 1), EPOCH)).toBe(31);
  });

  it('ignores the time of day (local-midnight rollover)', () => {
    const early = dayIndex(new Date(2026, 0, 10, 0, 1), EPOCH);
    const late = dayIndex(new Date(2026, 0, 10, 23, 59), EPOCH);
    expect(early).toBe(late);
  });

  it('does not drift across a daylight-saving boundary', () => {
    // US DST begins 2026-03-08. The gap from the day before to the day after
    // must be exactly two calendar days despite the 23-hour day.
    const before = dayIndex(new Date(2026, 2, 7), EPOCH);
    const after = dayIndex(new Date(2026, 2, 9), EPOCH);
    expect(after - before).toBe(2);
  });
});

describe('dailySourceWord', () => {
  const calendar = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

  it('is deterministic for a given date', () => {
    const a = dailySourceWord(calendar, new Date(2026, 5, 16), EPOCH);
    const b = dailySourceWord(calendar, new Date(2026, 5, 16), EPOCH);
    expect(a).toBe(b);
  });

  it('maps the first cycle to the frozen calendar order', () => {
    const seen = calendar.map((_, i) =>
      dailySourceWord(calendar, new Date(2026, 0, 1 + i), EPOCH),
    );
    expect(seen).toEqual(calendar);
  });

  it('yields a fixed first-cycle word, unaffected by appending words after it', () => {
    const date = new Date(2026, 0, 3); // day index 2, first cycle
    expect(dailySourceWord(calendar, date, EPOCH)).toBe('charlie');
    const appended = [...calendar, 'foxtrot', 'golf'];
    expect(dailySourceWord(appended, date, EPOCH)).toBe('charlie');
  });

  it('reshuffles into a new pass after exhaustion', () => {
    const firstPass = calendar.map((_, i) =>
      dailySourceWord(calendar, new Date(2026, 0, 1 + i), EPOCH),
    );
    const secondPass = calendar.map((_, i) =>
      dailySourceWord(
        calendar,
        new Date(2026, 0, 1 + calendar.length + i),
        EPOCH,
      ),
    );
    // Each later cycle is a fresh permutation: every word once, new order.
    expect([...secondPass].sort()).toEqual([...calendar].sort());
    expect(secondPass).not.toEqual(firstPass);
  });

  it('does not repeat a word across a cycle boundary', () => {
    const n = calendar.length;
    const wordOnDay = (day: number) =>
      dailySourceWord(calendar, new Date(2026, 0, 1 + day), EPOCH);
    // cycle 0 -> cycle 1, and cycle 1 -> cycle 2.
    expect(wordOnDay(n)).not.toBe(wordOnDay(n - 1));
    expect(wordOnDay(2 * n)).not.toBe(wordOnDay(2 * n - 1));
  });
});

describe('createEndlessSource', () => {
  // The calendar holds only eligible words; a sub-floor word is never in it.
  const calendar = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

  /** A deterministic stand-in for Math.random, so every draw is reproducible. */
  function testRng(seed = 1): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a * 1_664_525 + 1_013_904_223) >>> 0;
      return a / 4_294_967_296;
    };
  }

  const draw = (next: () => string, count: number): string[] =>
    Array.from({ length: count }, () => next());

  it('only ever draws a word from the calendar (never a sub-floor word)', () => {
    const next = createEndlessSource(calendar, { rng: testRng() });
    const set = new Set(calendar);
    for (const word of draw(next, 200)) expect(set.has(word)).toBe(true);
  });

  it('yields every word exactly once across a full pass', () => {
    const next = createEndlessSource(calendar, { rng: testRng() });
    const pass = draw(next, calendar.length);
    expect([...pass].sort()).toEqual([...calendar].sort());
  });

  it('never repeats a word before the pool is exhausted', () => {
    const next = createEndlessSource(calendar, { rng: testRng(7) });
    // Four full passes: within each pass every word appears exactly once.
    for (let pass = 0; pass < 4; pass++) {
      const words = draw(next, calendar.length);
      expect(new Set(words).size).toBe(calendar.length);
    }
  });

  it('does not repeat the previous word across a pass boundary', () => {
    // Every seed, so the boundary holds for whichever permutation comes up.
    for (let seed = 1; seed <= 25; seed++) {
      const next = createEndlessSource(calendar, { rng: testRng(seed) });
      const drawn = draw(next, calendar.length + 1);
      expect(drawn[calendar.length]).not.toBe(drawn[calendar.length - 1]);
    }
  });

  it('never draws the excluded daily word', () => {
    const next = createEndlessSource(calendar, {
      exclude: 'charlie',
      rng: testRng(3),
    });
    for (const word of draw(next, 200)) expect(word).not.toBe('charlie');
  });

  it('yields every remaining word exactly once per pass when one is excluded', () => {
    const next = createEndlessSource(calendar, {
      exclude: 'charlie',
      rng: testRng(3),
    });
    const remaining = calendar.filter((w) => w !== 'charlie');
    const pass = draw(next, remaining.length);
    expect([...pass].sort()).toEqual([...remaining].sort());
  });

  it('does not open with the word already on screen', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const next = createEndlessSource(calendar, {
        previous: 'delta',
        rng: testRng(seed),
      });
      expect(next()).not.toBe('delta');
    }
  });

  it('is deterministic and reproducible for a given rng', () => {
    const a = draw(createEndlessSource(calendar, { rng: testRng(9) }), 17);
    const b = draw(createEndlessSource(calendar, { rng: testRng(9) }), 17);
    expect(a).toEqual(b);
  });

  it('reshuffles rather than replaying the same order every pass', () => {
    const next = createEndlessSource(calendar, { rng: testRng(4) });
    const first = draw(next, calendar.length);
    const second = draw(next, calendar.length);
    expect(second).not.toEqual(first);
  });

  it('falls back to the whole calendar when the exclusion would empty it', () => {
    const next = createEndlessSource(['alpha'], {
      exclude: 'alpha',
      rng: testRng(),
    });
    expect(next()).toBe('alpha');
  });

  it('throws on an empty calendar', () => {
    expect(() => createEndlessSource([])).toThrow();
  });
});
