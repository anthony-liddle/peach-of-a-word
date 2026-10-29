import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  computeTier,
  dayIndex,
  findScore,
  type Puzzle,
} from '@/engine/index.ts';
import { STORAGE_EPOCH } from '@/engine/config.ts';
import {
  boardCostume,
  COSTUME_DAYS,
  COSTUMES,
  type CostumeId,
} from './costumes.ts';
import { applyFavicon } from './favicon.ts';
import { FoundList } from './components/FoundList.tsx';
import { EditionCard } from './components/EditionCard.tsx';
import { paintsPeach, type Motif } from './components/confetti.ts';

/** A daily board's day index, as useGame keys it: days since STORAGE_EPOCH. */
const board = (y: number, m: number, d: number) =>
  dayIndex(new Date(y, m - 1, d), STORAGE_EPOCH);

afterEach(() => {
  vi.useRealTimers();
  document.head
    .querySelectorAll('link[rel="icon"]')
    .forEach((el) => el.remove());
});

describe('the dates the peach dresses up', () => {
  it('has a row for each day, Halloween and the winter', () => {
    expect(COSTUME_DAYS).toEqual([
      { month: 10, day: 31, costume: 'ghost', occasion: 'Halloween' },
      {
        month: 11,
        weekday: 4,
        nth: 4,
        costume: 'pie-crust',
        occasion: 'Thanksgiving',
      },
      { month: 12, day: 21, costume: 'beanie', occasion: 'Winter solstice' },
      { month: 12, day: 24, costume: 'antlers', occasion: 'Christmas Eve' },
      { month: 12, day: 25, costume: 'santa-hat', occasion: 'Christmas Day' },
      { month: 12, day: 31, costume: 'top-hat', occasion: "New Year's Eve" },
      { month: 1, day: 1, costume: 'top-hat', occasion: "New Year's Day" },
    ]);
  });
});

describe("the costume goes by the board's date", () => {
  it("dresses 31 October's board, in any year", () => {
    expect(boardCostume(board(2026, 10, 31), 'cute', null)).toBe('ghost');
    expect(boardCostume(board(2027, 10, 31), 'cute', null)).toBe('ghost');
  });

  it("dresses 31 October's board when it is played later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 9));
    expect(boardCostume(board(2026, 10, 31), 'cute', null)).toBe('ghost');
  });

  it("does not dress another day's board played on the 31st", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 31, 9));
    expect(boardCostume(board(2026, 10, 30), 'cute', null)).toBeNull();
    expect(boardCostume(board(2026, 11, 1), 'cute', null)).toBeNull();
  });

  it('never dresses Endless, which has no date', () => {
    expect(boardCostume(null, 'cute', null)).toBeNull();
  });

  it('never dresses letterpress', () => {
    expect(boardCostume(board(2026, 10, 31), 'letterpress', null)).toBeNull();
    expect(
      boardCostume(
        board(2026, 10, 30),
        'letterpress',
        '?costumeDate=2026-10-31',
      ),
    ).toBeNull();
  });

  it('can be previewed for any date from the address', () => {
    expect(
      boardCostume(board(2026, 10, 20), 'cute', '?costumeDate=2026-10-31'),
    ).toBe('ghost');
    expect(
      boardCostume(board(2026, 10, 31), 'cute', '?costumeDate=2026-10-30'),
    ).toBeNull();
    // A malformed preview is ignored, so the board's own date rules.
    expect(
      boardCostume(board(2026, 10, 31), 'cute', '?costumeDate=halloween'),
    ).toBe('ghost');
  });
});

/** A board's date: year, month and day. */
type Ymd = readonly [year: number, month: number, day: number];

const YEARS = [2026, 2027, 2028] as const;

/** A fixed date in each of the years the suite tries. */
const every = (m: number, d: number): Ymd[] => YEARS.map((y) => [y, m, d]);

/**
 * Thanksgiving, the fourth Thursday of November, in years that reach both
 * ends of its week: the 22nd in 2029 and the 28th in 2030.
 */
const THANKSGIVINGS: readonly Ymd[] = [
  [2026, 11, 26],
  [2027, 11, 25],
  [2028, 11, 23],
  [2029, 11, 22],
  [2030, 11, 28],
];

/** The days either side of each date. */
const either = (days: readonly Ymd[]): Ymd[] =>
  days.flatMap(([y, m, d]) => [
    [y, m, d - 1],
    [y, m, d + 1],
  ]);

/**
 * The winter's costume days, held to the same rules as Halloween's.
 *
 * - **New Year's Eve and Day share the top hat,** so they are one span here:
 *   the day before is 30 December and the day after 2 January.
 * - **Christmas Eve and Christmas Day are neighbours,** each in its own
 *   costume, so each day's neighbours are held to not wearing that day's
 *   costume rather than to wearing nothing.
 */
const WINTER: readonly {
  name: string;
  costume: CostumeId;
  spoken: string;
  days: readonly Ymd[];
  neighbours: readonly Ymd[];
}[] = [
  {
    name: 'Thanksgiving',
    costume: 'pie-crust',
    spoken: 'wearing a pie crust hat',
    days: THANKSGIVINGS,
    neighbours: either(THANKSGIVINGS),
  },
  {
    name: 'The winter solstice',
    costume: 'beanie',
    spoken: 'wearing a knit beanie and scarf',
    days: every(12, 21),
    neighbours: either(every(12, 21)),
  },
  {
    name: 'Christmas Eve',
    costume: 'antlers',
    spoken: 'wearing antlers and a red nose',
    days: every(12, 24),
    neighbours: either(every(12, 24)),
  },
  {
    name: 'Christmas Day',
    costume: 'santa-hat',
    spoken: 'wearing a Santa hat',
    days: every(12, 25),
    neighbours: either(every(12, 25)),
  },
  {
    name: "New Year's Eve and Day",
    costume: 'top-hat',
    spoken: 'wearing a top hat',
    days: YEARS.flatMap((y): Ymd[] => [
      [y, 12, 31],
      [y + 1, 1, 1],
    ]),
    neighbours: YEARS.flatMap((y): Ymd[] => [
      [y, 12, 30],
      [y + 1, 1, 2],
    ]),
  },
];

const boardOn = ([y, m, d]: Ymd) => board(y, m, d);

const preview = ([y, m, d]: Ymd) =>
  `?costumeDate=${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe.each(WINTER)('$name', ({ costume, spoken, days, neighbours }) => {
  it("dresses the day's board, in any year", () => {
    for (const day of days)
      expect(boardCostume(boardOn(day), 'cute', null)).toBe(costume);
  });

  it("dresses the day's board when it is played later", () => {
    for (const day of days) {
      const [y, m, d] = day;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(y, m - 1, d + 5, 9));
      expect(boardCostume(boardOn(day), 'cute', null)).toBe(costume);
      vi.useRealTimers();
    }
  });

  it('does not dress the day before or the day after', () => {
    for (const day of neighbours)
      expect(boardCostume(boardOn(day), 'cute', null)).not.toBe(costume);
  });

  it("does not dress another day's board played on the day", () => {
    for (const [y, m, d] of days) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(y, m - 1, d, 9));
      // 20 November dresses for nothing.
      expect(boardCostume(board(2026, 11, 20), 'cute', null)).toBeNull();
      vi.useRealTimers();
    }
  });

  it('never dresses Endless or letterpress', () => {
    expect(boardCostume(null, 'cute', null)).toBeNull();
    for (const day of days)
      expect(boardCostume(boardOn(day), 'letterpress', null)).toBeNull();
  });

  it('can be previewed from the address', () => {
    expect(boardCostume(board(2026, 11, 20), 'cute', preview(days[0]!))).toBe(
      costume,
    );
  });

  it('tells a screen reader what the peach is wearing', () => {
    expect(COSTUMES[costume]?.spoken).toBe(spoken);
    render(<EditionCard theme="cute" costume={costume} onClose={() => {}} />);
    expect(screen.getByText(`The peach is ${spoken}.`)).toBeInTheDocument();
  });
});

describe('Thanksgiving goes by the fourth Thursday of November', () => {
  it('dresses 26 Nov 2026, 25 Nov 2027 and 23 Nov 2028', () => {
    expect(boardCostume(board(2026, 11, 26), 'cute', null)).toBe('pie-crust');
    expect(boardCostume(board(2027, 11, 25), 'cute', null)).toBe('pie-crust');
    expect(boardCostume(board(2028, 11, 23), 'cute', null)).toBe('pie-crust');
  });

  it('does not dress 26 Nov 2027, the Friday after', () => {
    expect(boardCostume(board(2027, 11, 26), 'cute', null)).toBeNull();
  });

  it('does not dress the day before or the day after, in any year', () => {
    for (const day of either(THANKSGIVINGS))
      expect(boardCostume(boardOn(day), 'cute', null)).toBeNull();
  });

  it("previews by the year's own Thursday", () => {
    const plain = board(2026, 11, 20);
    expect(boardCostume(plain, 'cute', '?costumeDate=2027-11-25')).toBe(
      'pie-crust',
    );
    expect(boardCostume(plain, 'cute', '?costumeDate=2027-11-26')).toBeNull();
  });
});

function makePuzzle(): Puzzle {
  const common = ['serenade', 'sea', 'near'];
  return {
    sourceWord: 'serenade',
    letters: 'adeenrs',
    validationWords: new Set(common),
    commonWords: new Set(common),
    uncommonWords: new Set(),
    rareWords: new Set(),
    mythicWords: new Set(),
    reachableScore: common.reduce((s, w) => s + findScore(w, 'set'), 0),
  };
}

function renderList(costume: 'ghost' | null) {
  const puzzle = makePuzzle();
  const found = ['serenade', 'sea'];
  return render(
    <FoundList
      puzzle={puzzle}
      found={found}
      tier={computeTier(new Set(found), puzzle)}
      theme="cute"
      costume={costume}
      onWordTap={() => {}}
    />,
  );
}

describe('the source word in costume', () => {
  it('wears the costume on its chip, and says so', () => {
    const { container } = renderList('ghost');
    const chip = container.querySelector('.found__word--source')!;
    expect(chip.querySelector('svg.mark--source-worn')).toBeTruthy();
    expect(chip.getAttribute('aria-label')).toMatch(
      /the peach in a ghost sheet/,
    );
  });

  it('keeps the stylesheet mark, and says nothing, on any other day', () => {
    const { container } = renderList(null);
    const chip = container.querySelector('.found__word--source')!;
    expect(chip.querySelector('span.mark--source')).toBeTruthy();
    expect(chip.querySelector('svg')).toBeNull();
    expect(chip.getAttribute('aria-label')).not.toMatch(/ghost/);
  });

  it('wears it in the key too', () => {
    const { container } = renderList('ghost');
    const key = container.querySelector('.found__legend, .legend') ?? container;
    expect(
      key.querySelectorAll('svg.mark--source-worn').length,
    ).toBeGreaterThan(0);
  });
});

describe('the completion card in costume', () => {
  it('dresses the ornament and tells a screen reader', () => {
    const { container } = render(
      <EditionCard theme="cute" costume="ghost" onClose={() => {}} />,
    );
    const ornament = container.querySelector('.edition__ornament--peach')!;
    // The plain peach draws 8 shapes; the ghost hides the face and adds 7.
    expect(ornament.querySelectorAll('path, circle').length).toBe(3 + 7);
    expect(
      screen.getByText('The peach is in a ghost sheet.'),
    ).toBeInTheDocument();
  });

  it('is the plain peach, with nothing extra said, on any other day', () => {
    render(<EditionCard theme="cute" costume={null} onClose={() => {}} />);
    expect(screen.queryByText(/The peach is/)).toBeNull();
  });
});

describe('the tab icon in costume', () => {
  const href = () =>
    document.head.querySelector('link[rel="icon"]')?.getAttribute('href') ?? '';

  it("is the costumed peach on cute, drawn from the peach's own parts", () => {
    applyFavicon('cute', 'ghost');
    expect(href().startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(href())).toContain('#D6C9EE');
  });

  it('is the plain mark with no costume, and letterpress never dresses', () => {
    applyFavicon('cute', null);
    expect(href()).toBe('/favicon-cute.svg');
    applyFavicon('letterpress', 'ghost');
    expect(href()).toBe('/favicon-classic.svg');
  });
});

describe('the confetti in costume', () => {
  const peach: Motif = { glyph: '\u{1F351}', color: null, weight: 4 };
  const heart: Motif = { glyph: '♥', color: '#e8568a', weight: 5 };

  it('draws the costumed peach in place of the peach emoji', () => {
    expect(paintsPeach(peach, 'ghost')).toBe(true);
    expect(paintsPeach(heart, 'ghost')).toBe(false);
  });

  it('throws the emoji on any other day', () => {
    expect(paintsPeach(peach, null)).toBe(false);
  });
});
