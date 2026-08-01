import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FoundList } from './FoundList.tsx';
import { computeTier, findScore, type Puzzle } from '@/engine/index.ts';
import type { Theme } from '../useTheme.ts';

// A small hand-built puzzle: six set words across four lengths, plus one find on
// each off-page rung. reachableScore is the set points (the ladder denominator).
function makePuzzle(): Puzzle {
  const common = ['serenade', 'sea', 'near', 'dean', 'eased', 'erase'];
  const uncommon = ['sane'];
  const rare = ['sneer'];
  const mythic = ['denar'];
  const setPoints = common.reduce((s, w) => s + findScore(w, 'set'), 0); // 32
  return {
    sourceWord: 'serenade',
    letters: 'adeenrs',
    validationWords: new Set([...common, ...uncommon, ...rare, ...mythic]),
    commonWords: new Set(common),
    uncommonWords: new Set(uncommon),
    rareWords: new Set(rare),
    mythicWords: new Set(mythic),
    reachableScore: setPoints,
  };
}

function renderList(found: string[], theme: Theme = 'letterpress') {
  const puzzle = makePuzzle();
  const tier = computeTier(new Set(found), puzzle);
  return render(
    <FoundList
      puzzle={puzzle}
      found={found}
      tier={tier}
      theme={theme}
      onWordTap={() => {}}
    />,
  );
}

describe('FoundList totals summary', () => {
  it('shows one honest completion count, no legacy "in the set" counter', () => {
    renderList(['sea', 'near', 'sane', 'sneer', 'denar']);

    // The single completion count: set words found over findable.
    expect(screen.getByText(/2 of 6 words/i)).toBeInTheDocument();
    // The retired goal counter ("N of M in the set") is gone as a number.
    expect(screen.queryByText(/of \d+ in the set/i)).not.toBeInTheDocument();
  });

  it('counts each rarity rung with no denominator, ever', () => {
    renderList(['sea', 'near', 'sane', 'sneer', 'denar']);
    expect(screen.getByText(/1 uncommon/i)).toBeInTheDocument();
    expect(screen.getByText(/1 rare/i)).toBeInTheDocument();
    expect(screen.getByText(/1 mythic/i)).toBeInTheDocument();
    expect(screen.queryByText(/uncommon.*of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rare.*of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mythic.*of/i)).not.toBeInTheDocument();
  });

  it('shows the total words found, the points total, and the named tier', () => {
    // serenade (15) puts the score at 15 of 32 set points (~0.47), Press Run.
    renderList(['serenade', 'sane']);
    expect(screen.getByText(/2 words found/i)).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: /words found/i });
    expect(within(totals).getByText('Press Run')).toBeInTheDocument();
    // serenade 15 (set) + sane 4 (uncommon: 4-letter is 3, plus the +1 bonus).
    expect(within(totals).getByText(/19 points/i)).toBeInTheDocument();
  });

  it('shows the completion crown in the totals once every word is found', () => {
    renderList(['serenade', 'sea', 'near', 'dean', 'eased', 'erase'], 'cute');
    expect(screen.getByText(/6 of 6 words/i)).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: /words found/i });
    expect(within(totals).getByText('Peachy Keen Supreme')).toBeInTheDocument();
  });
});

describe('FoundList score composition', () => {
  it('names the set-versus-off-page points split from the single tier source', () => {
    // serenade is a set word (set points); sane is off-page (uncommon).
    const found = ['serenade', 'sane'];
    const tier = computeTier(new Set(found), makePuzzle());
    renderList(found);

    // The totals read the same setPoints/offPagePoints the bar reads, so they
    // cannot disagree: 15 set, 4 off-page (sane: 4-letter is 3, plus +1 uncommon).
    expect(tier.setPoints).toBe(15);
    expect(tier.offPagePoints).toBe(4);

    // The one surviving bar carries the explicit split beneath it.
    expect(screen.getByText(/set\s+15/i)).toBeInTheDocument();
    expect(screen.getByText(/off-page\s+4/i)).toBeInTheDocument();
  });

  it('hosts the single progress bar in the glossary, not a subordinate breakdown', () => {
    renderList(['serenade', 'sane']);
    const glossary = screen.getByRole('region', { name: /words found/i });
    // One bar, and it is the real progressbar (the merged tier meter), living in
    // the glossary. The old role="img" composition bar is gone.
    const bars = within(glossary).getAllByRole('progressbar');
    expect(bars).toHaveLength(1);
    expect(
      within(glossary).queryByRole('img', { name: /score breakdown/i }),
    ).toBeNull();
  });
});

describe('FoundList per-length set counts', () => {
  it('shows each length an "X of Y" denominated by the set words of that length', () => {
    // 4-letter set words: near, dean (2 in the set). near is found.
    renderList(['near', 'sane']);
    const head = screen.getByRole('heading', { name: '4 letters' });
    const group = head.closest('section') as HTMLElement;
    expect(within(group).getByText('1 of 2')).toBeInTheDocument();
  });

  it('counts only the set words of a length, never the off-page finds (come and cone)', () => {
    // near (set) and sane (off-page uncommon) are both four letters.
    renderList(['near', 'sane']);
    const head = screen.getByRole('heading', { name: '4 letters' });
    const group = head.closest('section') as HTMLElement;

    // The count is one of the two four-letter set words: sane is not counted.
    expect(within(group).getByText('1 of 2')).toBeInTheDocument();

    // The counted set row lists near, never the off-page sane.
    const setRow = group.querySelector('.found__words--set') as HTMLElement;
    expect(within(setRow).getByText('near')).toBeInTheDocument();
    expect(within(setRow).queryByText('sane')).toBeNull();

    // sane still shows in the length group, in the off-page row, outside the count.
    const offRow = group.querySelector('.found__words--offpage') as HTMLElement;
    expect(within(offRow).getByText('sane')).toBeInTheDocument();
  });

  it('makes the per-length set counts reconcile to the top-level completion count', () => {
    const found = ['near', 'sane', 'sea'];
    const { container } = renderList(found);
    const tier = computeTier(new Set(found), makePuzzle());

    const counts = [...container.querySelectorAll('.found__groupcount')].map(
      (el) => {
        const m = (el.textContent ?? '').match(/(\d+)\s+of\s+(\d+)/);
        return { x: Number(m![1]), y: Number(m![2]) };
      },
    );
    const sumX = counts.reduce((s, c) => s + c.x, 0);
    const sumY = counts.reduce((s, c) => s + c.y, 0);

    // Numerators sum to set words found; denominators sum to total set words.
    expect(sumX).toBe(tier.setFound); // near + sea = 2 (sane is off-page)
    expect(sumY).toBe(tier.setTotal); // 6
  });

  it('shows a row for a set length she has not cracked yet, reading 0 of Y', () => {
    // sea is three letters; the five-letter set words (eased, erase) are unfound.
    renderList(['sea']);
    const head = screen.getByRole('heading', { name: '5 letters' });
    const group = head.closest('section') as HTMLElement;
    expect(within(group).getByText('0 of 2')).toBeInTheDocument();
  });

  it('reads every row Y of Y once every common word is found', () => {
    const { container } = renderList([
      'serenade',
      'sea',
      'near',
      'dean',
      'eased',
      'erase',
    ]);
    expect(screen.getByText(/6 of 6 words/i)).toBeInTheDocument();
    for (const el of container.querySelectorAll('.found__groupcount')) {
      const m = (el.textContent ?? '').match(/(\d+)\s+of\s+(\d+)/);
      expect(m![1]).toBe(m![2]); // X equals Y on every length row
    }
  });

  it('labels off-page finds "also found" when a row has both a set and an off-page find', () => {
    // near (set) and sane (off-page) are both four letters.
    renderList(['near', 'sane']);
    const head = screen.getByRole('heading', { name: '4 letters' });
    const group = head.closest('section') as HTMLElement;

    // The quiet label frames the off-page list as outside the count.
    const label = within(group).getByText(/also found/i);
    expect(label).toBeInTheDocument();
    // It is not inside the counted set row.
    const setRow = group.querySelector('.found__words--set') as HTMLElement;
    expect(within(setRow).queryByText(/also found/i)).toBeNull();
  });

  it('shows no "also found" label on a clean set-only row', () => {
    // near is a 4-letter set word with no off-page find of that length.
    renderList(['near']);
    expect(screen.queryByText(/also found/i)).toBeNull();
  });

  it('shows no "also found" label on an off-page-only row', () => {
    // sane is a 4-letter off-page find with no set word found of that length.
    renderList(['sane']);
    expect(screen.queryByText(/also found/i)).toBeNull();
  });
});

describe('FoundList structure', () => {
  it('renders each word-length group as a section with a level-3 heading', () => {
    renderList(['serenade', 'sea', 'near', 'sneer']);
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(names).toContain('8 letters');
    expect(names).toContain('4 letters');
    expect(names).toContain('3 letters');
  });

  it('keeps every glossary mark filled and positive, the source crown intact', () => {
    const { container } = renderList(['serenade', 'sea', 'sane']);
    // set word: unbadged set mark; off-page: rung mark with inline points; the
    // source word keeps its crown mark. None reads as an empty slot.
    expect(
      container.querySelector('.found__word--source .mark--source'),
    ).toBeTruthy();
    expect(
      container.querySelector('.found__word--set .mark--set'),
    ).toBeTruthy();
    const off = container.querySelector('.found__word--uncommon');
    expect(off?.querySelector('.mark--uncommon')).toBeTruthy();
    expect(off?.textContent).toMatch(/\+\d/);
  });

  it('renders the legend as a distinct key, separated from the word list', () => {
    renderList(['sea']);
    const glossary = screen.getByRole('region', { name: /words found/i });
    const legend = glossary.querySelector('.legend');
    expect(legend).toBeTruthy();
    expect(
      within(legend as HTMLElement).getByText(/^key$/i),
    ).toBeInTheDocument();
    expect(
      within(legend as HTMLElement).getByText('source word'),
    ).toBeInTheDocument();
  });
});

describe('FoundList word tap', () => {
  it('renders each found word as a button that reports taps with its element', () => {
    const puzzle = makePuzzle();
    const onWordTap = vi.fn();
    render(
      <FoundList
        puzzle={puzzle}
        found={['sea']}
        tier={computeTier(new Set(['sea']), puzzle)}
        theme="letterpress"
        onWordTap={onWordTap}
      />,
    );
    // Scoped to the grid: the summary's best-word line renders the same chip,
    // so a lone find appears twice by design.
    const btn = screen
      .getByText('sea', { selector: '.found__group .found__wordtext' })
      .closest('button') as HTMLElement;
    fireEvent.click(btn);
    expect(onWordTap).toHaveBeenCalledWith('sea', btn);
    expect(document.activeElement).toBe(btn);
  });
});

/**
 * A rack with two finds on each of the low rungs, so "exactly the words at this
 * rung" is a real claim rather than one word standing in for a list. The mythic
 * band is a parameter: passing an empty list gives the zero-find rung the inert
 * case needs, without a second puzzle factory to keep in step.
 */
function makeRungPuzzle(mythic: readonly string[] = ['denar']): Puzzle {
  const common = ['serenade', 'sea', 'near', 'dean', 'eased', 'erase'];
  const uncommon = ['sane', 'anes'];
  const rare = ['sneer', 'ernes'];
  const setPoints = common.reduce((s, w) => s + findScore(w, 'set'), 0);
  return {
    sourceWord: 'serenade',
    letters: 'adeenrs',
    validationWords: new Set([...common, ...uncommon, ...rare, ...mythic]),
    commonWords: new Set(common),
    uncommonWords: new Set(uncommon),
    rareWords: new Set(rare),
    mythicWords: new Set(mythic),
    reachableScore: setPoints,
  };
}

function renderRungs(
  found: string[],
  puzzle: Puzzle = makeRungPuzzle(),
  onWordTap: (word: string, trigger: HTMLElement) => void = () => {},
  theme: Theme = 'letterpress',
) {
  return render(
    <FoundList
      puzzle={puzzle}
      found={found}
      tier={computeTier(new Set(found), puzzle)}
      theme={theme}
      onWordTap={onWordTap}
    />,
  );
}

/** Every off-page find on the rack, so each rung has something to show. */
const ALL_RUNG_FINDS = ['sea', 'sane', 'anes', 'sneer', 'ernes', 'denar'];

describe('FoundList rarity rung panels', () => {
  it('expands exactly the words found at that rung, and no others', () => {
    renderRungs(ALL_RUNG_FINDS);
    fireEvent.click(screen.getByRole('button', { name: /2 rare/i }));

    const panel = screen.getByRole('group', { name: /rare words you found/i });
    expect(within(panel).getByText('sneer')).toBeInTheDocument();
    expect(within(panel).getByText('ernes')).toBeInTheDocument();
    // Not the other rungs, and not the set.
    expect(within(panel).queryByText('sane')).toBeNull();
    expect(within(panel).queryByText('denar')).toBeNull();
    expect(within(panel).queryByText('sea')).toBeNull();
    expect(within(panel).getAllByRole('button')).toHaveLength(2);
  });

  it('collapses the list when the rung is tapped again', () => {
    renderRungs(ALL_RUNG_FINDS);
    const trigger = () => screen.getByRole('button', { name: /2 rare/i });

    fireEvent.click(trigger());
    expect(
      screen.getByRole('group', { name: /rare words you found/i }),
    ).toBeInTheDocument();

    fireEvent.click(trigger());
    expect(
      screen.queryByRole('group', { name: /rare words you found/i }),
    ).toBeNull();
  });

  it('opens each rung independently, so one list never closes another', () => {
    renderRungs(ALL_RUNG_FINDS);
    fireEvent.click(screen.getByRole('button', { name: /2 rare/i }));
    fireEvent.click(screen.getByRole('button', { name: /2 uncommon/i }));

    expect(
      screen.getByRole('group', { name: /rare words you found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /uncommon words you found/i }),
    ).toBeInTheDocument();
  });

  it('leaves a rung with no finds inert: not a button, and never expandable', () => {
    renderRungs(['sea', 'sane', 'sneer'], makeRungPuzzle([]));

    const zero = screen.getByText(/0 mythic/i);
    expect(zero.closest('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /mythic/i })).toBeNull();
    expect(
      screen.queryByRole('group', { name: /mythic words you found/i }),
    ).toBeNull();
  });

  it('states the rung, the count, and the expanded state in the accessible name', () => {
    renderRungs(ALL_RUNG_FINDS);
    const trigger = () => screen.getByRole('button', { name: /2 rare/i });

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAccessibleName(/2 rare.*show/i);

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAccessibleName(/2 rare.*hide/i);
  });

  it('points the trigger at the panel it controls', () => {
    renderRungs(ALL_RUNG_FINDS);
    const trigger = screen.getByRole('button', { name: /2 rare/i });
    fireEvent.click(trigger);

    const panel = screen.getByRole('group', { name: /rare words you found/i });
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
    expect(panel.id).not.toBe('');
  });

  it('never shows a denominator, on the trigger or in the expanded list', () => {
    renderRungs(ALL_RUNG_FINDS);
    const trigger = screen.getByRole('button', { name: /2 rare/i });
    fireEvent.click(trigger);
    const panel = screen.getByRole('group', { name: /rare words you found/i });

    for (const text of [
      trigger.textContent ?? '',
      trigger.getAttribute('aria-label') ?? '',
      panel.textContent ?? '',
    ]) {
      expect(text).not.toMatch(/\bof\b/i);
      expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(text).not.toMatch(/\bout of\b/i);
      expect(text).not.toMatch(/\bremaining\b|\bleft\b|\btotal\b/i);
    }
  });

  it('opens a definition from the expanded list, the same path as anywhere else', () => {
    const onWordTap = vi.fn();
    renderRungs(ALL_RUNG_FINDS, makeRungPuzzle(), onWordTap);
    fireEvent.click(screen.getByRole('button', { name: /2 rare/i }));

    const panel = screen.getByRole('group', { name: /rare words you found/i });
    const chip = within(panel).getByRole('button', {
      name: /^sneer,.*show definition/i,
    });
    fireEvent.click(chip);
    expect(onWordTap).toHaveBeenCalledWith('sneer', chip);
  });

  it('marks a word the same rung in the panel as in its per-length group', () => {
    renderRungs(ALL_RUNG_FINDS);
    fireEvent.click(screen.getByRole('button', { name: /2 rare/i }));

    // sneer is five letters, so it also sits in the 5-letter group's off-page
    // row. Both readouts derive from one classification pass, so the rarity
    // class on the chip must match.
    const panel = screen.getByRole('group', { name: /rare words you found/i });
    const inPanel = within(panel).getByText('sneer').closest('button')!;

    const head = screen.getByRole('heading', { name: '5 letters' });
    const group = head.closest('section') as HTMLElement;
    const offRow = group.querySelector('.found__words--offpage') as HTMLElement;
    const inGroup = within(offRow).getByText('sneer').closest('button')!;

    expect(inPanel.className).toBe(inGroup.className);
    expect(inPanel.className).toMatch(/found__word--rare/);
  });

  it('lists in the panel every off-page find the per-length groups show at that rung', () => {
    renderRungs(ALL_RUNG_FINDS);
    fireEvent.click(screen.getByRole('button', { name: /2 uncommon/i }));
    const panel = screen.getByRole('group', {
      name: /uncommon words you found/i,
    });

    const text = (root: ParentNode, selector: string) =>
      [...root.querySelectorAll(selector)]
        .map((el) => el.querySelector('.found__wordtext')?.textContent)
        .sort();

    // The panel is not inside a length group, so this scopes to the grid.
    const inGroups = text(document, '.found__group .found__word--uncommon');
    const inPanel = text(panel, '.found__word');

    expect(inPanel).toEqual(['anes', 'sane']);
    expect(inPanel).toEqual(inGroups);
  });

  it('never shows an empty panel when a rung open from a past rack has no finds', () => {
    // FoundList is not keyed by puzzle in Game, so the open-rung state outlives
    // a new puzzle. A rung left open on the last rack must not reopen as an
    // empty list on a rack with nothing at it.
    const { rerender } = renderRungs(ALL_RUNG_FINDS);
    fireEvent.click(screen.getByRole('button', { name: /1 mythic/i }));
    expect(
      screen.getByRole('group', { name: /mythic words you found/i }),
    ).toBeInTheDocument();

    const next = makeRungPuzzle([]);
    const found = ['sea', 'sane'];
    rerender(
      <FoundList
        puzzle={next}
        found={found}
        tier={computeTier(new Set(found), next)}
        theme="letterpress"
        onWordTap={() => {}}
      />,
    );

    expect(
      screen.queryByRole('group', { name: /mythic words you found/i }),
    ).toBeNull();
    expect(screen.getByText(/0 mythic/i).closest('button')).toBeNull();
  });

  it('exposes each open rung as a real button in the tab order', () => {
    renderRungs(ALL_RUNG_FINDS);
    const trigger = screen.getByRole('button', { name: /2 rare/i });
    // A native button, so Space and Enter activate it without a key handler,
    // and it is reachable by Tab without a tabindex of its own.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).not.toBeDisabled();
    expect(trigger).not.toHaveAttribute('tabindex');

    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });
});

/**
 * A rack carrying a seven-letter set word, so the two numbers Bea asked about
 * (11 for a seven-letter set word, 15 for the eight-letter source word) are both
 * real finds on one board rather than arithmetic asserted in the abstract.
 */
function makePointsPuzzle(): Puzzle {
  const common = ['serenade', 'endears', 'sea', 'near', 'eased'];
  const uncommon = ['sane'];
  const setPoints = common.reduce((s, w) => s + findScore(w, 'set'), 0);
  return {
    sourceWord: 'serenade',
    letters: 'adeenrs',
    validationWords: new Set([...common, ...uncommon]),
    commonWords: new Set(common),
    uncommonWords: new Set(uncommon),
    rareWords: new Set(),
    mythicWords: new Set(),
    reachableScore: setPoints,
  };
}

/**
 * The chip for a word as the per-length grid renders it. Scoped to the grid
 * because the summary's best-word line renders the same chip for the best find.
 */
function chipFor(word: string): HTMLElement {
  const text = screen.getByText(word, {
    selector: '.found__group .found__wordtext',
  });
  return text.closest('button') as HTMLElement;
}

describe('FoundList inline points', () => {
  it('shows the points on a set word, not only on the off-page finds', () => {
    renderRungs(['sea', 'near', 'sane'], makePointsPuzzle());

    // sea is three letters (1 point), near is four (3). Neither carries a rarity
    // bonus, and both are in the set, which is exactly why they showed nothing.
    expect(within(chipFor('sea')).getByText('+1')).toBeInTheDocument();
    expect(within(chipFor('near')).getByText('+3')).toBeInTheDocument();
  });

  it('shows 11 on a seven-letter set word and 15 on the source word', () => {
    renderRungs(['endears', 'serenade'], makePointsPuzzle());

    expect(within(chipFor('endears')).getByText('+11')).toBeInTheDocument();
    expect(within(chipFor('serenade')).getByText('+15')).toBeInTheDocument();
  });

  it('reads the number from the shared scoring path, rarity bonus included', () => {
    renderRungs(['sane'], makePointsPuzzle());

    // sane is a four-letter uncommon: 3 for the length plus the +1 rung bonus.
    // Unchanged from before, so the off-page chip format is untouched.
    expect(findScore('sane', 'uncommon')).toBe(4);
    expect(within(chipFor('sane')).getByText('+4')).toBeInTheDocument();
  });

  it('gives every found word a number, none left silent', () => {
    renderRungs(
      ['serenade', 'endears', 'sea', 'near', 'sane'],
      makePointsPuzzle(),
    );

    const chips = [...document.querySelectorAll('.found__group .found__word')];
    expect(chips).toHaveLength(5);
    for (const chip of chips) {
      expect(chip.querySelector('.found__points')?.textContent).toMatch(
        /^\+\d+$/,
      );
    }
  });
});

/**
 * A rack where a seven-letter mythic (11 for the length, plus the +4 rung bonus)
 * scores exactly 15, tying the eight-letter source word. The tie is the real
 * case, not a contrived one: it is how an off-page find draws level with the
 * crown, and it is where "first found wins" has to hold.
 */
function makeTiePuzzle(): Puzzle {
  const common = ['serenade', 'sea', 'near', 'eased'];
  const mythic = ['endears'];
  const setPoints = common.reduce((s, w) => s + findScore(w, 'set'), 0);
  return {
    sourceWord: 'serenade',
    letters: 'adeenrs',
    validationWords: new Set([...common, ...mythic]),
    commonWords: new Set(common),
    uncommonWords: new Set(),
    rareWords: new Set(),
    mythicWords: new Set(mythic),
    reachableScore: setPoints,
  };
}

/** The best-word line in the summary, or null when it is not rendered. */
function bestLine(): HTMLElement | null {
  return document.querySelector('.summary__best');
}

describe('FoundList best word', () => {
  it('shows the highest-scoring find, the source word included', () => {
    renderRungs(['sea', 'near', 'serenade', 'sane'], makePointsPuzzle());

    const line = bestLine()!;
    expect(within(line).getByText('serenade')).toBeInTheDocument();
    expect(within(line).getByText('+15')).toBeInTheDocument();
  });

  it('picks an off-page find when it outscores everything in the set', () => {
    // endears is mythic here: 11 for the length plus 4, against sea's 1.
    renderRungs(['sea', 'endears'], makeTiePuzzle());

    expect(within(bestLine()!).getByText('endears')).toBeInTheDocument();
  });

  it('resolves a tie to the first found', () => {
    // Both score 15. serenade was found first, so it holds the line.
    expect(findScore('endears', 'mythic')).toBe(15);
    expect(findScore('serenade', 'set')).toBe(15);

    renderRungs(['serenade', 'endears'], makeTiePuzzle());
    expect(within(bestLine()!).getByText('serenade')).toBeInTheDocument();
  });

  it('stays put when an equal-scoring word is found afterwards', () => {
    const puzzle = makeTiePuzzle();
    const { rerender } = renderRungs(['serenade'], puzzle);
    expect(within(bestLine()!).getByText('serenade')).toBeInTheDocument();

    const found = ['serenade', 'endears'];
    rerender(
      <FoundList
        puzzle={puzzle}
        found={found}
        tier={computeTier(new Set(found), puzzle)}
        theme="letterpress"
        onWordTap={() => {}}
      />,
    );

    // The newcomer ties but does not take the line: a stat that flickers on an
    // equal find is a stat she cannot read.
    expect(within(bestLine()!).getByText('serenade')).toBeInTheDocument();
    expect(within(bestLine()!).queryByText('endears')).toBeNull();
  });

  it('is absent with nothing found', () => {
    renderRungs([], makePointsPuzzle());
    expect(bestLine()).toBeNull();
  });

  it('carries the category colour and the category mark, never colour alone', () => {
    renderRungs(['sea', 'endears'], makeTiePuzzle());
    const chip = within(bestLine()!).getByText('endears').closest('button')!;

    // The colour, and the mark that survives colour-blind play beside it.
    expect(chip.className).toMatch(/found__word--mythic/);
    expect(chip.querySelector('.mark--mythic')).not.toBeNull();
  });

  it('names the category in words, since the mark is decorative', () => {
    renderRungs(['sea', 'endears'], makeTiePuzzle());
    const chip = within(bestLine()!).getByText('endears').closest('button')!;

    expect(chip.querySelector('.mark')).toHaveAttribute('aria-hidden', 'true');
    expect(chip).toHaveAccessibleName(
      'endears, Mythic, 15 points, show definition',
    );
  });

  it('speaks the set category in the theme own vocabulary', () => {
    renderRungs(['sea'], makePointsPuzzle(), () => {}, 'cute');
    const chip = within(bestLine()!).getByText('sea').closest('button')!;

    // The legend prints "in the basket" for a cute set word; the spoken name
    // says the same thing rather than inventing a second word for it.
    expect(chip).toHaveAccessibleName(
      'sea, in the basket, 1 point, show definition',
    );
  });

  it('renders the same chip the glossary renders, not a parallel one', () => {
    renderRungs(['sea', 'endears'], makeTiePuzzle());

    const inLine = within(bestLine()!).getByText('endears').closest('button')!;
    const group = screen
      .getByRole('heading', { name: '7 letters' })
      .closest('section') as HTMLElement;
    const inGroup = within(group).getByText('endears').closest('button')!;

    // Same construction, so the mark, the colour and the points cannot drift
    // apart between the two readouts.
    expect(inLine.className).toBe(inGroup.className);
    expect(inLine.getAttribute('aria-label')).toBe(
      inGroup.getAttribute('aria-label'),
    );
  });

  it('is a stat to read, not an event to hear: nothing announces it', () => {
    renderRungs(['sea', 'endears'], makeTiePuzzle());
    const line = bestLine()!;

    // No third announcement mechanism: the line updates often during normal
    // play, and a stream of announcements for it would be noise.
    expect(line.closest('[aria-live]')).toBeNull();
    expect(line.closest('[role="status"]')).toBeNull();
    expect(line.querySelector('[aria-live]')).toBeNull();
  });
});
