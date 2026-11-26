import { describe, expect, it } from 'vitest';
import { createPuzzle } from '@/engine/index.ts';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import {
  clockSpoken,
  clockText,
  markPassed,
  resumedLine,
  runLength,
  startedLine,
  timeLeft,
} from './clock.ts';
import { bestWord, recordOf, runTally, timesUpLine } from './record.ts';
import { runShareText } from './share.ts';
import { rushStanding } from './offer.ts';

/*
 * Peach rush's rules, as plain functions. A made-up board, SERENADE, never a
 * calendar word.
 */

const WORDS = ['serenade', 'sea', 'near', 'dean', 'ease', 'erase'];
const puzzle = createPuzzle(
  'serenade',
  createListDictionary(WORDS),
  createListWordSource(['serenade', 'sea', 'near', 'dean']),
  createListWordSource(['erase']),
  createListWordSource([]),
);

describe('the clock', () => {
  it('is 1:30, or 3:00 with Longer clock', () => {
    expect(clockText(runLength(false))).toBe('1:30');
    expect(clockText(runLength(true))).toBe('3:00');
  });

  it('rounds up, so 0:00 means the time has run out', () => {
    expect(clockText(59_001)).toBe('1:00');
    expect(clockText(1)).toBe('0:01');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(-5)).toBe('0:00');
  });

  it('reads what is left from when it ends, never below 0', () => {
    expect(timeLeft(10_000, 4_000)).toBe(6_000);
    expect(timeLeft(10_000, 12_000)).toBe(0);
  });

  it('says the time in words', () => {
    expect(clockSpoken(90_000)).toBe('1 minute 30 seconds');
    expect(clockSpoken(60_000)).toBe('1 minute');
    expect(clockSpoken(180_000)).toBe('3 minutes');
    expect(clockSpoken(1_000)).toBe('1 second');
    expect(clockSpoken(0)).toBe('0 seconds');
    expect(startedLine(90_000)).toBe(
      'Started. 1 minute 30 seconds on the clock.',
    );
    expect(resumedLine(48_000)).toBe('Resumed. 48 seconds left.');
  });
});

describe('the marks', () => {
  it('says each as the clock passes it', () => {
    expect(markPassed(60_200, 59_950)?.said).toBe('1 minute left.');
    expect(markPassed(30_100, 29_900)?.said).toBe('30 seconds left.');
    expect(markPassed(10_250, 10_000)?.said).toBe('10 seconds left.');
  });

  it('says nothing between the marks', () => {
    expect(markPassed(45_250, 45_000)).toBeNull();
    expect(markPassed(10_000, 9_750)).toBeNull();
  });

  it('says nothing after a stall that jumped past one', () => {
    expect(markPassed(31_000, 28_500)).toBeNull();
    expect(markPassed(61_000, 40_000)).toBeNull();
  });
});

describe("the run's record", () => {
  it('keeps the words, the points the basket would give them, and the best', () => {
    const r = recordOf({
      puzzle,
      found: ['sea', 'near', 'erase'],
      endedEarly: false,
      leftMs: 0,
      clockMs: 90_000,
    });
    expect(r.words).toEqual(['sea', 'near', 'erase']);
    expect(r.points).toBeGreaterThan(0);
    expect(r.best?.word).toBe('erase');
    expect(r.peach).toBe(false);
    expect(r.peachCardOwed).toBe(false);
  });

  it('owes the card when the run found the peach of a word', () => {
    const r = recordOf({
      puzzle,
      found: ['sea', puzzle.sourceWord],
      endedEarly: true,
      leftMs: 41_400.6,
      clockMs: 90_000,
    });
    expect(r.peach).toBe(true);
    expect(r.peachCardOwed).toBe(true);
    expect(r.leftMs).toBe(41_401);
  });

  it('leaves out a word the board no longer takes', () => {
    const r = recordOf({
      puzzle,
      found: ['sea', 'zzz'],
      endedEarly: true,
      leftMs: 0,
      clockMs: 90_000,
    });
    expect(r.words).toEqual(['sea']);
  });

  it('breaks a tie on points by the longer word, then the first found', () => {
    expect(bestWord(['sea', 'near', 'dean'], puzzle)?.word).toBe('near');
    expect(bestWord([], puzzle)).toBeNull();
  });

  it('says the tally and the end', () => {
    expect(runTally({ words: ['sea'], points: 1 })).toBe('1 word · 1 point');
    expect(timesUpLine({ words: [], points: 0 })).toBe(
      "Time's up. 0 words, 0 points.",
    );
  });
});

describe("the run's share", () => {
  const date = new Date(2026, 10, 14);

  it('is the three lines, with the peach when the run found it', () => {
    expect(
      runShareText(
        { words: ['sea', 'near'], points: 4, peach: true },
        'Peach of a Word',
        'Peach rush',
        date,
        '1:30',
      ),
    ).toBe(
      '🍑 Peach of a Word · Nov 14\n⏱️ Peach rush · 1:30\n2 words · 4 points 🍑',
    );
  });

  it('never names a word, the peach of a word least of all', () => {
    const r = recordOf({
      puzzle,
      found: ['near', 'erase', puzzle.sourceWord],
      endedEarly: false,
      leftMs: 0,
      clockMs: 90_000,
    });
    const text = runShareText(r, 'Peach of a Word', 'Peach rush', date, '1:30');
    // Compared, never printed, so a failure can't spell a word out.
    for (const word of r.words) expect(text.includes(word)).toBe(false);
  });
});

describe("where today's run stands", () => {
  const base = {
    played: false,
    waiting: false,
    basketFound: 0,
    openedBefore: true,
    canSave: true,
    offerOn: true,
  };

  it('is offered until the basket has a find', () => {
    expect(rushStanding(base)).toBe('offered');
    expect(rushStanding({ ...base, basketFound: 1 })).toBeNull();
  });

  it("isn't offered on a browser's first day", () => {
    expect(rushStanding({ ...base, openedBefore: false })).toBeNull();
  });

  it("isn't offered with Offer Peach rush off, but a run waiting or played stays", () => {
    expect(rushStanding({ ...base, offerOn: false })).toBeNull();
    expect(rushStanding({ ...base, offerOn: false, waiting: true })).toBe(
      'waiting',
    );
    expect(rushStanding({ ...base, offerOn: false, played: true })).toBe(
      'played',
    );
  });

  it("isn't offered where the browser can't save", () => {
    expect(rushStanding({ ...base, canSave: false })).toBeNull();
  });

  it('stays reachable while a run waits, whatever the basket holds', () => {
    expect(rushStanding({ ...base, waiting: true, basketFound: 3 })).toBe(
      'waiting',
    );
  });

  it('opens the result once played, never a second run', () => {
    expect(
      rushStanding({ ...base, played: true, basketFound: 9, waiting: true }),
    ).toBe('played');
  });
});
