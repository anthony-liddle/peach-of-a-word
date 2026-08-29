import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Game } from './Game.tsx';
import { CONFETTI_DURATION_MS } from './components/confetti.ts';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import type { SourceEntry } from '@/data/types.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { dayIndex } from '@/engine/index.ts';
import { STORAGE_EPOCH } from '@/engine/config.ts';
import { useDefinitions } from './useDefinitions.ts';
import { copy } from './themeCopy.ts';
import { DEFAULT_THEME, type Theme } from './useTheme.ts';
import {
  DESKTOP_WIDTH,
  PHONE_WIDTH,
  setViewportWidth,
} from '@/testing/viewport.ts';

vi.mock('./useDefinitions.ts', () => ({
  useDefinitions: vi.fn(),
}));

const getDefinition = vi.fn(async (w: string) =>
  w === 'sea' ? 'noun. a body of salt water.' : null,
);

beforeEach(() => {
  (useDefinitions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    getDefinition,
  });
  getDefinition.mockClear();
});

const ENABLE = [
  'serenade',
  'sea',
  'near',
  'sane',
  'sneer',
  'eased',
  'dean',
  'erase',
  'denar',
];
// The set (common) words carry no rarity label. The off-page finds exercise all
// three rungs: 'sane' is uncommon (in size 70), 'sneer' is rare (beyond 70, in
// 95), 'denar' is mythic (beyond 95).
const COMMON = ['serenade', 'sea', 'near', 'dean', 'eased', 'erase'];
const BEYOND_70 = ['sneer', 'denar']; // beyond size 70
const BEYOND_95 = ['denar']; // beyond size 95

const ENTRY: SourceEntry = {
  word: 'serenade',
  definition: 'noun. a love song sung to a sweetheart.',
  etymology: 'Borrowed from French serenade, from Italian serenata.',
};

function fakeData(): GameData {
  return {
    dictionary: createListDictionary(ENABLE),
    commonPool: createListWordSource(COMMON),
    beyond70Pool: createListWordSource(BEYOND_70),
    beyond95Pool: createListWordSource(BEYOND_95),
    // Single-word calendar: the daily is always serenade.
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['serenade'],
    },
    sourceEntry: (w) => (w === 'serenade' ? ENTRY : undefined),
  };
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function countingStore(): { store: KeyValueStore; writes: () => number } {
  const map = new Map<string, string>();
  let writes = 0;
  return {
    store: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        writes += 1;
        map.set(k, v);
      },
    },
    writes: () => writes,
  };
}

function type(word: string) {
  for (const ch of word) fireEvent.keyDown(window, { key: ch });
}

/**
 * Scopes a word lookup to the per-length grid. The summary's best-word line
 * renders the same chip the grid does, so a lone find legitimately appears twice
 * inside the glossary region; without this, "did the word reach the list" would
 * fail on the duplicate rather than on the behaviour it means to check.
 */
const GRID = { selector: '.found__group .found__wordtext' } as const;

/**
 * The theme the board is actually rendering in. Read from the document rather
 * than assumed, because tests in this file set it both ways and the app writes
 * it on mount: a helper that guessed the default would look for the wrong
 * wording after any test that switched.
 */
function activeTheme(): Theme {
  return document.documentElement.dataset.theme === 'letterpress'
    ? 'letterpress'
    : DEFAULT_THEME;
}

/**
 * The reveal's way back. Its wording is theme copy (the case in letterpress,
 * the basket in cute), so it is resolved rather than spelled out here.
 */
function closeReveal() {
  return screen.getByRole('button', { name: copy(activeTheme()).revealClose });
}

function renderGame(store = fakeStore()) {
  return render(
    <Game
      data={fakeData()}
      audio={new NullAudioEngine()}
      storage={new GameStorage(store)}
    />,
  );
}

describe('Game', () => {
  beforeEach(() => {
    // jsdom has no Web Audio; NullAudioEngine sidesteps it entirely.
  });

  it('renders the rack of eight type sorts', () => {
    renderGame();
    const tiles = screen.getAllByRole('button', { name: /^Letter / });
    expect(tiles).toHaveLength(8);
  });

  it('credits the real validation boundary in the footer', () => {
    renderGame();
    const footer = document.querySelector('.colophon') as HTMLElement;
    // Validation is ENABLE union SCOWL 95 plus the patch layer, not ENABLE alone.
    expect(footer.textContent).toMatch(/ENABLE and SCOWL/i);
    expect(footer.textContent).toMatch(/patch layer/i);
    // The existing attributions stay intact.
    expect(footer.textContent).toMatch(/SCOWL/);
    expect(footer.textContent).toMatch(/Wiktionary, CC BY-SA 4\.0/i);
  });

  it('names the game in the masthead, emphasizing Peach', () => {
    renderGame();
    const title = screen.getByRole('heading', { name: 'Peach of a Word' });
    expect(title).toBeInTheDocument();
    // The mark carries the emphasis, set in italic accent by the stylesheet.
    const emphasis = title.querySelector('em');
    expect(emphasis?.textContent).toBe('Peach');
  });

  it('frames the loop in the masthead kicker: finding words in words', () => {
    renderGame();
    const kicker = document.querySelector('.masthead__kicker') as HTMLElement;
    // The source word contains every found word, so each find is a word in a
    // word; the kicker names the whole loop, not just its peak.
    expect(kicker.textContent).toBe('A game about finding words in words');
    // The old line undersold the loop as the single long-word find.
    expect(kicker.textContent).not.toMatch(/finding the long word/i);
  });

  it('carries the quiet dedication in the footer', () => {
    renderGame();
    const footer = document.querySelector('.colophon') as HTMLElement;
    expect(footer.textContent).toMatch(/for Bea/);
  });

  it('offers the privacy policy from the footer', () => {
    renderGame();
    const footer = document.querySelector('.colophon') as HTMLElement;
    const link = footer.querySelector('a[href="/privacy"]');
    // Asserted on the href rather than on the text: the wording of a small
    // print link is allowed to change, and where it goes is not. The App Store
    // record names this exact path, so a rename here breaks a submitted URL.
    expect(link).not.toBeNull();
    expect(link?.textContent).toMatch(/privacy/i);
  });

  it('keeps the dedication present in the cute theme too', () => {
    document.documentElement.dataset.theme = 'cute';
    try {
      renderGame();
      const footer = document.querySelector('.colophon') as HTMLElement;
      expect(footer.textContent).toMatch(/for Bea/);
    } finally {
      document.documentElement.dataset.theme = 'letterpress';
    }
  });

  it('accepts a typed word and prints it to the glossary', () => {
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });

    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('sea', GRID)).toBeInTheDocument();
  });

  it('rejects a non-word with direction, not an apology', () => {
    renderGame();
    // 'rns' is formable but not in ENABLE.
    type('rns');
    fireEvent.keyDown(window, { key: 'Enter' });
    // The message shows in both the visible line and the live region.
    expect(screen.getAllByText(/not in the word list/i).length).toBeGreaterThan(
      0,
    );
  });

  function findWord(text: string): HTMLElement {
    const glossary = screen.getByRole('region', { name: /words found/i });
    return within(glossary)
      .getByText(text, GRID)
      .closest('button') as HTMLElement;
  }

  it('renders an uncommon find with its mark and inline points', () => {
    renderGame();
    type('sane'); // off-page, in size 70: uncommon
    fireEvent.keyDown(window, { key: 'Enter' });

    const li = findWord('sane');
    expect(li).toHaveClass('found__word--uncommon');
    expect(li.querySelector('.mark--uncommon')).toBeTruthy();
    expect(li.textContent).toMatch(/\+\d/); // points are the reward, shown inline
    expect(screen.getByText(/1 uncommon/i)).toBeInTheDocument();
  });

  it('renders a rare find with its mark and inline points', () => {
    renderGame();
    type('sneer'); // off-page, beyond 70 but in 95: rare
    fireEvent.keyDown(window, { key: 'Enter' });

    const li = findWord('sneer');
    expect(li).toHaveClass('found__word--rare');
    expect(li.querySelector('.mark--rare')).toBeTruthy();
    expect(li.textContent).toMatch(/\+\d/);
    expect(screen.getByText(/1 rare/i)).toBeInTheDocument();
  });

  it('renders a mythic find with its mark and inline points', () => {
    renderGame();
    type('denar'); // off-page, beyond 95: mythic
    fireEvent.keyDown(window, { key: 'Enter' });

    const li = findWord('denar');
    expect(li).toHaveClass('found__word--mythic');
    expect(li.querySelector('.mark--mythic')).toBeTruthy();
    expect(li.textContent).toMatch(/\+\d/);
    expect(screen.getByText(/1 mythic/i)).toBeInTheDocument();
  });

  it('tallies each rarity rung without ever showing a denominator', () => {
    renderGame();
    ['sane', 'sneer', 'denar'].forEach((w) => {
      type(w);
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    expect(screen.getByText(/1 uncommon/i)).toBeInTheDocument();
    expect(screen.getByText(/1 rare/i)).toBeInTheDocument();
    expect(screen.getByText(/1 mythic/i)).toBeInTheDocument();
    // The set keeps "X of Y"; the rarity ladder never does.
    expect(screen.queryByText(/uncommon.*of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rare.*of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mythic.*of/i)).not.toBeInTheDocument();
  });

  it('announces an off-page find with its rung for screen readers', () => {
    renderGame();
    type('sneer'); // rare
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toMatch(/rare find: sneer/i);
  });

  it('drives the bar by points, decoupled from the set counter', () => {
    renderGame();
    // Two set words: sea (3 letters, 1) and near (4 letters, 3) = 4 points.
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    type('near');
    fireEvent.keyDown(window, { key: 'Enter' });

    // The completion count is the single honest "X of Y" in the totals, but the
    // bar is points, no longer tied to it.
    expect(screen.getByText(/2 of 6 words/i)).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '4'); // points, not the 2 of 6
  });

  // The meter is REPARENTED across the two-column breakpoint, not merely moved:
  // no stylesheet can lift a node out of the glossary summary and into the play
  // column, so a JS media query picks the site and renders exactly one node.
  //
  // These two tests are why it cannot be the other pattern. A twin hidden with
  // `display: none` is fully present to getByRole — jsdom loads no stylesheet
  // and evaluates no media query — so "exactly one" would be unassertable and a
  // second bar could creep back unseen. Both widths are checked because with
  // matchMedia stubbed to a phone by default, desktop is otherwise never
  // rendered by the suite at all.
  it('at two-column widths keeps the one bar in the glossary', () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });

    // One bar on the screen, not two.
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(1);

    // The surviving bar sits in the glossary, where the totals live.
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByRole('progressbar')).toBe(bars[0]);

    // The play column has none: desktop is unchanged by the narrow-width move.
    const play = document.querySelector('.play') as HTMLElement;
    expect(play.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('at narrow widths moves the one bar above the compose well', () => {
    setViewportWidth(PHONE_WIDTH);
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });

    // Still exactly one, on the other side of the breakpoint.
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(1);

    // In the play column, and ABOVE the well rather than below the controls:
    // the app's placement, which is the whole point of the move.
    const play = document.querySelector('.play') as HTMLElement;
    const meter = play.querySelector('.tier') as HTMLElement;
    const stick = play.querySelector('.stick') as HTMLElement;
    expect(meter).not.toBeNull();
    expect(meter.contains(bars[0]!)).toBe(true);
    expect(
      meter.compareDocumentPosition(stick) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // And the glossary no longer carries one, so the move is a move.
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).queryByRole('progressbar')).toBeNull();
  });

  // The defect this forecloses: `.summary` appears with the first find, so a
  // meter gated on it would arrive mid-play and shove the well and the rack
  // down on the first word of the day. Above the well it is furniture, present
  // from the start, reading zeros.
  it('shows the narrow-width meter on an empty board rather than on first find', () => {
    setViewportWidth(PHONE_WIDTH);
    renderGame();

    const play = document.querySelector('.play') as HTMLElement;
    const bar = within(play).getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');

    // The glossary summary really is still absent: the meter is not riding in
    // on something that was there all along.
    expect(screen.queryByText(/words found$/i)).toBeNull();
  });

  it('lets an off-page find feed both the score and the bar', () => {
    renderGame();
    // denar is mythic (off-page): 5 letters (5) plus the mythic bonus (4) = 9.
    type('denar');
    fireEvent.keyDown(window, { key: 'Enter' });

    // The bar lives in the glossary now, appearing with the first find. The old
    // set-fraction bar ignored off-page finds; the points bar climbs.
    const bar = screen.getByRole('progressbar');
    const meter = screen.getByRole('region', { name: /progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '9');
    expect(within(meter).getByText('9 points')).toBeInTheDocument();
  });

  it('updates the tier as common words are found', () => {
    renderGame();
    // The bar appears with the first find, at the opening rank.
    type('sea'); // 1 point of the reachable 32: still Blank Page.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('Blank Page')).toBeInTheDocument();
    type('serenade'); // 15 of the common total in one word
    fireEvent.keyDown(window, { key: 'Enter' });
    // Tier should have climbed off Blank Page.
    expect(screen.queryByText('Blank Page')).not.toBeInTheDocument();
  });

  it('reveals the source word with definition and etymology', () => {
    renderGame();
    type('serenade');
    fireEvent.keyDown(window, { key: 'Enter' });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('serenade')).toBeInTheDocument();
    expect(within(dialog).getByText(/a love song/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Borrowed from French/i),
    ).toBeInTheDocument();
  });

  it('announces found words for screen readers', () => {
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/sea/i);
  });

  it('does not write to storage while composing, only on a valid submit', () => {
    const counting = countingStore();
    render(
      <Game
        data={fakeData()}
        audio={new NullAudioEngine()}
        storage={new GameStorage(counting.store)}
      />,
    );
    const afterMount = counting.writes();

    // Compose, delete, clear, and shuffle: none of these change found words.
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Escape' }); // clear
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(counting.writes()).toBe(afterMount);

    // A valid submitted word is durable progress and must be written.
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(counting.writes()).toBeGreaterThan(afterMount);
  });

  it('persists progress across a remount', () => {
    const store = fakeStore();
    const first = renderGame(store);
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    first.unmount();

    // A fresh mount with the same store restores the found word.
    renderGame(store);
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('sea', GRID)).toBeInTheDocument();
  });

  it('toggles mute', () => {
    renderGame();
    const mute = screen.getByRole('button', { name: /mute sound/i });
    fireEvent.click(mute);
    expect(
      screen.getByRole('button', { name: /unmute sound/i }),
    ).toBeInTheDocument();
  });

  it('switches and persists the theme, and names the right fonts', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Cute' }));
    expect(document.documentElement.dataset.theme).toBe('cute');
    expect(localStorage.getItem('e8-theme')).toBe('cute');
    // Cute credits the typefaces in its own verb: it writes, it does not set.
    const colophon = () =>
      (document.querySelector('.colophon') as HTMLElement).textContent ?? '';
    expect(colophon()).toContain(copy('cute').typeCredit);
    expect(colophon()).not.toMatch(/Set in Fredoka/i);

    fireEvent.click(screen.getByRole('button', { name: 'Letterpress' }));
    expect(document.documentElement.dataset.theme).toBe('letterpress');
    expect(colophon()).toContain(copy('letterpress').typeCredit);
  });

  it('labels the theme Letterpress, and stores it under the unchanged value', () => {
    // Display label only. "Classic" implied it was the original game's look;
    // the original was blue, glossy and plastic, and this one is invented here.
    // The stored value was already letterpress, so nothing migrates.
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Letterpress' }));

    expect(screen.queryByRole('button', { name: 'Classic' })).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('letterpress');
    expect(localStorage.getItem('e8-theme')).toBe('letterpress');
  });

  it('swaps the theme from the compact button and keeps name and label in sync', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();

    // In letterpress it shows the current theme and offers to switch to cute.
    const fromLetterpress = screen.getByRole('button', {
      name: /theme: letterpress\. activate to switch to cute/i,
    });
    expect(fromLetterpress).toHaveTextContent(/letterpress/i);

    fireEvent.click(fromLetterpress);
    expect(document.documentElement.dataset.theme).toBe('cute');

    // Now it shows Cute and offers the way back to Letterpress.
    const fromCute = screen.getByRole('button', {
      name: /theme: cute\. activate to switch to letterpress/i,
    });
    expect(fromCute).toHaveTextContent(/cute/i);

    fireEvent.click(fromCute);
    expect(document.documentElement.dataset.theme).toBe('letterpress');
  });

  it('lists the source word in the glossary legend', () => {
    renderGame();
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('source word')).toBeInTheDocument();
  });

  it('shows no storage warning when persistence works', () => {
    renderGame();
    expect(screen.queryByText(/not saving progress/i)).not.toBeInTheDocument();
  });

  it('warns quietly when this browser will not save progress', () => {
    render(
      <Game
        data={fakeData()}
        audio={new NullAudioEngine()}
        storage={new GameStorage(fakeStore(), false)}
      />,
    );
    expect(screen.getByText(/not saving progress/i)).toBeInTheDocument();
  });
});

describe('Game mode state retention', () => {
  const glossary = () => screen.getByRole('region', { name: /words found/i });
  const toDaily = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
  const toEndless = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
  const findWord = (w: string) => {
    type(w);
    fireEvent.keyDown(window, { key: 'Enter' });
  };

  it('retains the endless game and progress across a mode switch', () => {
    renderGame();
    toEndless();
    findWord('sea'); // found in endless

    toDaily();
    expect(within(glossary()).queryByText('sea')).not.toBeInTheDocument();

    toEndless();
    expect(within(glossary()).getByText('sea', GRID)).toBeInTheDocument();
  });

  it('keeps daily and endless progress separate', () => {
    renderGame();
    findWord('near'); // found in daily (default mode)
    toEndless();
    expect(within(glossary()).queryByText('near')).not.toBeInTheDocument();

    findWord('sea'); // found in endless
    toDaily();
    expect(within(glossary()).getByText('near', GRID)).toBeInTheDocument();
    expect(within(glossary()).queryByText('sea')).not.toBeInTheDocument();
  });

  it('only New Puzzle changes the endless game', () => {
    renderGame();
    toEndless();
    findWord('sea');
    expect(within(glossary()).getByText('sea', GRID)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new puzzle/i }));
    expect(within(glossary()).queryByText('sea')).not.toBeInTheDocument();
  });

  it('offers the Share affordance in endless mode, not only daily', () => {
    renderGame();
    toEndless();
    findWord('sea'); // a find in endless, so the summary and its Share appear
    expect(
      within(glossary()).getByRole('button', { name: /share/i }),
    ).toBeInTheDocument();
  });

  it('preserves the endless game across a reload (remount)', () => {
    const store = fakeStore();
    const first = renderGame(store);
    toEndless();
    findWord('sea');
    first.unmount();

    // Fresh mount, same store: endless rehydrates with its progress.
    renderGame(store);
    toEndless();
    expect(within(glossary()).getByText('sea', GRID)).toBeInTheDocument();
  });
});

describe('Game edition complete', () => {
  const enter = () => fireEvent.keyDown(window, { key: 'Enter' });
  const findWord = (w: string) => {
    type(w);
    enter();
  };
  const editionCard = () =>
    screen.queryByRole('region', { name: /the complete works/i });
  // Every common word on this rack: finding all of them is 100% of the set.
  const SET = ['sea', 'near', 'dean', 'eased', 'erase'];

  function completeTheSet() {
    findWord('serenade'); // the source word; dismiss its amber reveal first
    fireEvent.click(closeReveal());
    SET.slice(0, -1).forEach(findWord);
    findWord(SET[SET.length - 1]!); // the last set word completes the edition
  }

  it('does not celebrate before the set is finished', () => {
    renderGame();
    findWord('serenade');
    fireEvent.click(closeReveal());
    findWord('sea');
    expect(editionCard()).not.toBeInTheDocument();
  });

  it('fires the celebration once and does not end the game', () => {
    renderGame();
    completeTheSet();

    // The Edition celebration still fires on set completion (Stage 2 retargets
    // it). The progress bar is its own points climb and stays present.
    expect(editionCard()).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /progress/i }),
    ).toBeInTheDocument();

    // Play continues: a bonus word can still be set.
    findWord('sane');
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('sane', GRID)).toBeInTheDocument();

    // Dismiss, and it does not return (fires once).
    fireEvent.click(screen.getByRole('button', { name: /keep going/i }));
    expect(editionCard()).not.toBeInTheDocument();
    findWord('sneer'); // another non-set find
    expect(editionCard()).not.toBeInTheDocument();
    // The points bar persists and keeps climbing; the celebration fired once.
    expect(
      screen.getByRole('region', { name: /progress/i }),
    ).toBeInTheDocument();
  });

  it('announces the completion for screen readers', () => {
    renderGame();
    completeTheSet();
    expect(screen.getByRole('status').textContent).toMatch(
      /completed\. every common word found/i,
    );
  });

  it('completes by word count, not points: top rank but missing common words does not fire it', () => {
    renderGame();
    findWord('serenade'); // source, also a common word; dismiss its reveal
    fireEvent.click(closeReveal());
    // Heavy off-page points push well past par (the top named rank) ...
    ['denar', 'sneer', 'sane'].forEach(findWord);
    const bar = screen.getByRole('progressbar');
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(
      Number(bar.getAttribute('aria-valuemax')),
    );
    // ... but only one of the six common words is found, so no completion.
    expect(editionCard()).not.toBeInTheDocument();
    // The honest completion count lives in the totals now, distinct from the bar.
    const totals = screen.getByRole('region', { name: /words found/i });
    expect(within(totals).getByText(/1 of 6 words/i)).toBeInTheDocument();
  });

  it('keeps the source word and completion as independent crowns', () => {
    renderGame();
    // Finding the source word fires its reveal, never completion.
    findWord('serenade');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(editionCard()).not.toBeInTheDocument();
    fireEvent.click(closeReveal());
    // Completing fires the crown but does not re-open the source reveal.
    SET.slice(0, -1).forEach(findWord);
    findWord(SET[SET.length - 1]!);
    expect(editionCard()).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The quiet completed state holds the themed crown on the meter.
    const meter = screen.getByRole('region', { name: /progress/i });
    expect(within(meter).getByText('The Complete Works')).toBeInTheDocument();
  });

  it('keeps Share available and working after the celebration is dismissed', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    renderGame();
    completeTheSet();

    // Dismiss the in-the-moment celebration card.
    fireEvent.click(screen.getByRole('button', { name: /keep going/i }));
    expect(editionCard()).not.toBeInTheDocument();

    // The persistent Share is still in the glossary, the durable path home.
    const glossary = screen.getByRole('region', { name: /words found/i });
    const share = within(glossary).getByRole('button', { name: /share/i });
    expect(share).toBeInTheDocument();

    // It still works: it copies the same spoiler-free daily block that ships,
    // carrying counts and points, never the source word or any found word.
    fireEvent.click(share);
    await screen.findByText(/copied\./i);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0] as string;
    // Leads with the name and the earned completion crown, theme-skinned; the
    // retired "Set X/Y" gate is gone, and points support rather than lead.
    expect(text).toMatch(/^🍑 Peach of a Word · /);
    expect(text).toMatch(/The Complete Works|Peachy Keen Supreme/);
    expect(text).not.toMatch(/Set \d+\/\d+/);
    expect(text).toMatch(/pts/);
    expect(text).not.toMatch(/serenade/i);
    expect(text).not.toMatch(/eased/i);
  });

  it('lands on the persistent Share when the celebration is dismissed', () => {
    // scrollIntoView is stubbed globally for jsdom; spy to assert it is called.
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');

    renderGame();
    completeTheSet();

    // Dismissing the in-the-moment card hands her to the durable Share: it is
    // scrolled into view and focused, so it never feels gone with the popup.
    fireEvent.click(screen.getByRole('button', { name: /keep going/i }));

    const glossary = screen.getByRole('region', { name: /words found/i });
    const share = within(glossary).getByRole('button', { name: /share/i });
    expect(document.activeElement).toBe(share);
    expect(scrollIntoView).toHaveBeenCalled();

    scrollIntoView.mockRestore();
  });
});

// Finding the source word is the game's biggest beat, so its celebration is
// theme-skinned like the rank and crown names: classic keeps the plain line,
// cute makes the game's own joke on its own name. State holds the fact of the
// find; the skin is applied in the view, so a theme switch re-skins it live.
describe('Game source-word celebration', () => {
  const message = () => document.querySelector('.message') as HTMLElement;
  const findSource = () => {
    type('serenade');
    fireEvent.keyDown(window, { key: 'Enter' });
  };
  const dismissReveal = () => fireEvent.click(closeReveal());

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('celebrates the peach in cute', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    expect(message().textContent).toBe('You found the Peach of a Word!');
  });

  it('keeps the classic wording exactly as it is', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    findSource();
    expect(message().textContent).toBe('You found the source word.');
  });

  it('re-skins on a live theme switch, like the rank label', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    findSource();
    dismissReveal();
    expect(message().textContent).toBe('You found the source word.');

    fireEvent.click(screen.getByRole('button', { name: 'Cute' }));
    expect(message().textContent).toBe('You found the Peach of a Word!');

    fireEvent.click(screen.getByRole('button', { name: 'Letterpress' }));
    expect(message().textContent).toBe('You found the source word.');
  });

  it('re-skins an ordinary set find live, the same as the source word does', () => {
    // This one passes through the reducer, so it is the case that breaks if a
    // string is resolved at find time instead of in the view.
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(message().textContent).toBe('sea, in the set.');

    fireEvent.click(screen.getByRole('button', { name: 'Cute' }));
    expect(message().textContent).toBe('sea, in the basket.');

    fireEvent.click(screen.getByRole('button', { name: 'Letterpress' }));
    expect(message().textContent).toBe('sea, in the set.');
  });

  it('re-skins the whole board live, with nothing frozen from before the switch', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    const board = () => document.body.textContent ?? '';

    for (const s of [
      copy('letterpress').mastheadSubline,
      copy('letterpress').submitWord,
      copy('letterpress').glossaryTitle,
      copy('letterpress').emptyGlossary,
      copy('letterpress').typeCredit,
    ]) {
      expect(board()).toContain(s);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Cute' }));
    for (const s of [
      copy('cute').mastheadSubline,
      copy('cute').submitWord,
      copy('cute').glossaryTitle,
      copy('cute').emptyGlossary,
      copy('cute').typeCredit,
    ]) {
      expect(board()).toContain(s);
    }
    // And none of the letterpress wording survives the switch.
    expect(board()).not.toContain(copy('letterpress').mastheadSubline);
    expect(board()).not.toContain(copy('letterpress').emptyGlossary);
    expect(board()).not.toContain(copy('letterpress').typeCredit);
  });

  it('announces the find in the framing that was on screen when it landed', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    expect(screen.getByRole('status').textContent).toMatch(
      /you found the peach of a word: serenade\./i,
    );
  });

  it('announces the classic framing when the find lands in classic', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    findSource();
    expect(screen.getByRole('status').textContent).toMatch(
      /source word found: serenade\./i,
    );
  });

  it('does not speak the find a second time when only the theme changes', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    const spoken = screen.getByRole('status').textContent;
    dismissReveal();

    fireEvent.click(screen.getByRole('button', { name: 'Letterpress' }));
    // A live region speaks whenever its text changes, so holding the text still
    // is what "no second announcement" looks like from the outside. The find is
    // a point in time; re-skinning the page is not a new one.
    expect(screen.getByRole('status').textContent).toBe(spoken);
    // The visible line is a label, not an event, so it re-skins in that same
    // beat. The two live regions of this change move independently on purpose.
    expect(message().textContent).toBe('You found the source word.');
  });

  it('speaks the next real find, so the region is held still and not stuck', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    dismissReveal();
    fireEvent.click(screen.getByRole('button', { name: 'Letterpress' }));

    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toMatch(/sea/i);
    expect(screen.getByRole('status').textContent).not.toMatch(/serenade/i);
  });

  it('heads the reveal card with the kicker of the theme on screen', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    const card = screen.getByRole('dialog');
    expect(
      within(card).getByText('The peach every word grew from'),
    ).toBeInTheDocument();
    expect(
      within(card).queryByText('The word the type was cut for'),
    ).toBeNull();
  });

  it('does not carry the daily announcement over into Endless', () => {
    // Each mode counts its own announcements from zero, so the event key has to
    // name the mode as well. Keyed on the count alone, the fresh Endless slice
    // would look like the same event and keep speaking the daily's last find.
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    dismissReveal();

    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('keeps the rank cue after the themed celebration, in both themes', () => {
    // The source word is a set word worth the most points on the rack, so the
    // find usually lifts a rank. Only the framing is skinned; the cue that
    // follows it is not, and classic's announcement is unchanged by any of this.
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    findSource();
    expect(screen.getByRole('status').textContent).toMatch(/ new rank\.$/i);
  });
});

describe('Game edition confetti', () => {
  const SET = ['sea', 'near', 'dean', 'eased', 'erase'];
  const enter = () => fireEvent.keyDown(window, { key: 'Enter' });
  const findWord = (w: string) => {
    type(w);
    enter();
  };
  const confetti = () => document.querySelector('canvas.confetti');
  function completeTheSet() {
    findWord('serenade');
    fireEvent.click(closeReveal());
    SET.forEach(findWord);
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-theme');
    delete (window as { matchMedia?: unknown }).matchMedia;
    localStorage.clear();
  });

  it('bursts confetti once when the set is completed in cute', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    completeTheSet();
    expect(document.querySelectorAll('canvas.confetti')).toHaveLength(1);
  });

  it('bursts no confetti in classic, but still shows the card', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    completeTheSet();
    expect(confetti()).toBeNull();
    expect(
      screen.getByRole('region', { name: /the complete works/i }),
    ).toBeInTheDocument();
  });

  it('bursts no confetti under reduced motion, but still shows the card', () => {
    // Answers only the query it means. It used to return true to everything,
    // which was harmless when nothing else asked; the board's two-column
    // branch asks now, so a blanket true would quietly change the layout under
    // a test about confetti.
    (window as { matchMedia?: unknown }).matchMedia = vi.fn(
      (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    completeTheSet();
    expect(confetti()).toBeNull();
    expect(
      screen.getByRole('region', { name: /peachy keen supreme/i }),
    ).toBeInTheDocument();
  });

  it('the overlay never intercepts taps and is gone after the burst', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    completeTheSet();

    const canvas = confetti() as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    expect(canvas.style.pointerEvents).toBe('none');

    act(() => {
      vi.advanceTimersByTime(CONFETTI_DURATION_MS);
    });
    expect(confetti()).toBeNull(); // fully torn down, no leftover node
  });

  it('does not re-fire on a mode switch', () => {
    document.documentElement.dataset.theme = 'cute';
    renderGame();
    completeTheSet();
    act(() => {
      vi.advanceTimersByTime(CONFETTI_DURATION_MS);
    });
    expect(confetti()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    expect(confetti()).toBeNull();
  });

  it('does not re-fire when an already-complete puzzle is reloaded', () => {
    const store = fakeStore();
    document.documentElement.dataset.theme = 'cute';
    const first = renderGame(store);
    completeTheSet();
    act(() => {
      vi.advanceTimersByTime(CONFETTI_DURATION_MS);
    });
    first.unmount();

    // A fresh mount with the completed set restored fires no burst.
    renderGame(store);
    expect(confetti()).toBeNull();
  });
});

// The controls row, redesigned into two clusters: a quiet utility pair (Shuffle,
// Clear) set apart from the prominent primary pair (Delete, then Submit). These
// tests pin the structure, the accessible names, the wiring, and the rule that
// the two themes share one layout (skin differs, structure does not).
describe('Controls layout', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  const controls = () => document.querySelector('.controls') as HTMLElement;
  const stickText = () =>
    document.querySelector('.stick')?.textContent?.trim() ?? '';
  // The submit label is theme copy, so these layout tests resolve it rather
  // than hardcoding it. The literal per-theme wording is pinned in
  // themeCopy.test.ts, which is where a copy change should show up.
  const submitLabel = () => copy(activeTheme()).submitWord;
  const controlNames = () =>
    within(controls())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');

  /**
   * These two used to assert the opposite grouping, and the change is Bea's.
   * The controls were clustered by how often each action is used, utility pair
   * then primary pair with Delete before Submit; they are now clustered by what
   * each action does, so the two undo actions sit together. See the `Controls`
   * component for the reasoning and for the fact that both arrangements came
   * from her.
   */
  it('orders the controls Shuffle, Submit, Clear, Delete', () => {
    renderGame();
    const names = controlNames();
    expect(names).toEqual([
      'Shuffle',
      submitLabel(),
      'Clear',
      'Delete last letter',
    ]);
    // Delete sits to the right of Clear, being the more used of the two.
    expect(names.indexOf('Clear')).toBeLessThan(
      names.indexOf('Delete last letter'),
    );
  });

  /**
   * The DOM order is also the visual order now, which it was not before: the
   * old arrangement lifted the primary pair above the utility one with
   * `order: -1`, so a keyboard tabbed Shuffle, Clear, Delete, Submit through a
   * screen reading Delete, Submit, Shuffle, Clear. Asserting the DOM order
   * above is therefore asserting what someone sees, which it previously was
   * not.
   */
  it('groups the controls into an action cluster and an undo cluster', () => {
    renderGame();
    const groups = controls().querySelectorAll<HTMLElement>('.controls__group');
    expect(groups).toHaveLength(2);

    const action = groups[0]!;
    const undo = groups[1]!;
    expect(
      within(action).getByRole('button', { name: 'Shuffle' }),
    ).toBeInTheDocument();
    expect(
      within(action).getByRole('button', { name: submitLabel() }),
    ).toBeInTheDocument();
    expect(
      within(undo).getByRole('button', { name: 'Clear' }),
    ).toBeInTheDocument();
    expect(
      within(undo).getByRole('button', { name: 'Delete last letter' }),
    ).toBeInTheDocument();
  });

  it('no longer needs a CSS order hack to place the rows', () => {
    // The regrouping removed the reason for `order: -1`. If it comes back, the
    // DOM order above stops describing what anyone sees, and the assertion
    // stops being about the screen.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).not.toMatch(/controls__group--primary\s*\{[^}]*order:/);
  });

  it('gives every control its accessible name', () => {
    renderGame();
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete last letter' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: submitLabel() }),
    ).toBeInTheDocument();
  });

  it('Delete removes the last composed letter', () => {
    renderGame();
    type('sea');
    expect(stickText()).toBe('sea');
    fireEvent.click(screen.getByRole('button', { name: 'Delete last letter' }));
    expect(stickText()).toBe('se');
  });

  it('Clear empties the composing word', () => {
    renderGame();
    type('sea');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(stickText()).toBe(copy(activeTheme()).inputPlaceholder);
  });

  it('Submit sets the composed word into the glossary', () => {
    renderGame();
    type('sea');
    fireEvent.click(screen.getByRole('button', { name: submitLabel() }));
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('sea', GRID)).toBeInTheDocument();
  });

  it('Shuffle rearranges the rack', () => {
    renderGame();
    const before = screen
      .getAllByRole('button', { name: /^Letter / })
      .map((b) => b.textContent);
    // Shuffle is randomised; retry a few times so the rare no-op shuffle does
    // not flake the test.
    let after = before;
    for (let i = 0; i < 20 && after.join('') === before.join(''); i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
      after = screen
        .getAllByRole('button', { name: /^Letter / })
        .map((b) => b.textContent);
    }
    expect(after.join('')).not.toBe(before.join(''));
    expect([...after].sort()).toEqual([...before].sort());
  });

  it('keeps keyboard parity: Backspace deletes and Enter submits', () => {
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(stickText()).toBe('se');

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Enter' });
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('sea', GRID)).toBeInTheDocument();
  });

  it('renders one shared structure for both themes (skin differs, not layout)', () => {
    // The submit label is vocabulary and differs by design, so it is normalised
    // out. Everything else, every tag, class and attribute, must still match
    // exactly: the themes are one layout wearing two skins, not two layouts.
    const skeleton = (html: string, theme: Theme) =>
      html.replaceAll(copy(theme).submitWord, '{submit}');

    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    const letterpress = skeleton(controls().innerHTML, 'letterpress');

    fireEvent.click(screen.getByRole('button', { name: 'Cute' }));
    const cute = skeleton(controls().innerHTML, 'cute');

    expect(cute).toBe(letterpress);
    // Guard against the normalisation hiding a real difference by matching
    // nothing: both sides must actually carry the placeholder.
    expect(cute).toContain('{submit}');
  });
});

describe('Game word tap routing', () => {
  function submitWord(word: string) {
    for (const ch of word) fireEvent.keyDown(window, { key: ch });
    fireEvent.keyDown(window, { key: 'Enter' });
  }

  function findWordButton(word: string) {
    return screen.getByText(word, GRID).closest('button') as HTMLElement;
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('LINCHPIN: tapping the source word fires no sound, no confetti, and never calls the bundle lookup', () => {
    const audio = new NullAudioEngine();
    const sourceSpy = vi.spyOn(audio, 'playSource');
    const foundSpy = vi.spyOn(audio, 'playFound');
    render(
      <Game
        data={fakeData()}
        audio={audio}
        storage={new GameStorage(fakeStore())}
      />,
    );
    submitWord('serenade');
    sourceSpy.mockClear();
    foundSpy.mockClear();
    fireEvent.click(findWordButton('serenade'));
    expect(
      screen.getByText('Borrowed from French serenade, from Italian serenata.'),
    ).toBeInTheDocument();
    expect(sourceSpy).not.toHaveBeenCalled();
    expect(foundSpy).not.toHaveBeenCalled();
    expect(getDefinition).not.toHaveBeenCalled();
    expect(document.querySelector('.confetti')).toBeNull();
  });

  it('tapping an ordinary found word opens the quiet modal with its gloss', async () => {
    render(
      <Game
        data={fakeData()}
        audio={new NullAudioEngine()}
        storage={new GameStorage(fakeStore())}
      />,
    );
    submitWord('sea');
    fireEvent.click(findWordButton('sea'));
    expect(
      await screen.findByText('noun. a body of salt water.'),
    ).toBeInTheDocument();
    expect(document.querySelector('.reveal--quiet')).not.toBeNull();
  });

  it('tapping a word inside an opened rarity rung list opens the same modal', async () => {
    render(
      <Game
        data={fakeData()}
        audio={new NullAudioEngine()}
        storage={new GameStorage(fakeStore())}
      />,
    );
    submitWord('sane'); // off-page, uncommon

    // The rung tally opens the words found at that rung, and a chip in that
    // list runs the one definition path, not a second one of its own.
    fireEvent.click(screen.getByRole('button', { name: /1 uncommon/i }));
    const panel = screen.getByRole('group', {
      name: /uncommon words you found/i,
    });
    fireEvent.click(
      within(panel).getByRole('button', {
        name: /^sane,.*show definition/i,
      }),
    );

    expect(
      await screen.findByText(
        'No definition on hand for this one. It is still a real word you found.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.reveal--quiet')).not.toBeNull();
  });

  it('a word with no definition shows the exact no-definition copy', async () => {
    render(
      <Game
        data={fakeData()}
        audio={new NullAudioEngine()}
        storage={new GameStorage(fakeStore())}
      />,
    );
    submitWord('near');
    fireEvent.click(findWordButton('near'));
    expect(
      await screen.findByText(
        'No definition on hand for this one. It is still a real word you found.',
      ),
    ).toBeInTheDocument();
  });

  it('the quiet modal uses the category accent, not amber', async () => {
    render(
      <Game
        data={fakeData()}
        audio={new NullAudioEngine()}
        storage={new GameStorage(fakeStore())}
      />,
    );
    submitWord('sneer');
    fireEvent.click(findWordButton('sneer'));
    await screen.findByRole('dialog');
    expect(
      document.querySelector('.reveal--quiet.reveal--rare'),
    ).not.toBeNull();
    // Crown-only, so assert the element: the wording is theme-dependent now.
    expect(document.querySelector('.reveal__kicker')).toBeNull();
  });
});

/**
 * The message moved into the compose well to match the app, which makes it a
 * behaviour change rather than a relocation: the well is one slot, so showing
 * the composed word means the message has to go somewhere, and "go" means
 * cleared in the model rather than hidden in the view.
 */
describe('Game message in the tray', () => {
  const stick = () => document.querySelector('.stick') as HTMLElement;
  const reject = () => {
    // 'rns' is formable but not in ENABLE.
    type('rns');
    fireEvent.keyDown(window, { key: 'Enter' });
  };

  it('shows the message inside the well, not in a row of its own', () => {
    renderGame();
    reject();
    expect(stick().querySelector('.message')?.textContent).toMatch(
      /not in the word list/i,
    );
    // The old standalone row below the controls is gone: the well is the only
    // place a message renders now.
    const play = document.querySelector('.play') as HTMLElement;
    expect(play.querySelectorAll('.message')).toHaveLength(1);
  });

  it('lets the composed word win the slot the moment a letter lands', () => {
    renderGame();
    reject();
    fireEvent.keyDown(window, { key: 's' });

    expect(stick().querySelector('.message')).toBeNull();
    expect(stick().querySelector('.stick__slot')?.textContent).toBe('s');
  });

  // THE defect this design forecloses, and the reason the model clears rather
  // than the view hiding. Hiding looks identical right up to this moment: with
  // the value still set, deleting back to an empty well would republish a
  // rejection the player has already moved on from.
  it('does not bring a stale rejection back on delete-to-empty', () => {
    renderGame();
    reject();
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'Backspace' });

    expect(stick().querySelector('.message')).toBeNull();
    expect(stick().querySelector('.stick__empty')).not.toBeNull();
  });

  // Clearing a message is not an event worth speaking. The live region is keyed
  // by the announcement's seq, which ADD_TILE deliberately does not bump, so a
  // tile landing neither empties the region nor re-fires it.
  it('does not disturb the live region when a tile clears the message', () => {
    renderGame();
    reject();
    const region = document.querySelector('[role="status"]') as HTMLElement;
    const before = region.textContent;
    expect(before).toMatch(/not in the word list/i);

    fireEvent.keyDown(window, { key: 's' });
    expect(region.textContent).toBe(before);
  });
});

/**
 * The streak has exactly one home at any given width. Narrow: the flame in the
 * tier meter, as the app has it. Two-column: the toolbar pill, because the
 * meter lives in the glossary there and the glossary only appears with the
 * first find — a returning player on a fresh board would otherwise see no
 * streak at all until they found a word.
 */
describe('Game streak placement', () => {
  /** Six days cleared in a row, as of the day the board is on. */
  function storeWithStreak(days: number): KeyValueStore {
    const store = fakeStore();
    const storage = new GameStorage(store);
    // Walk the real day index the app will read, so the streak is current
    // rather than seeded at some future date the check happens to accept.
    const today = dayIndex(new Date(), STORAGE_EPOCH);
    for (let i = days - 1; i >= 0; i--) storage.recordDailyCleared(today - i);
    return store;
  }

  it('renders the flame in the meter at narrow widths, and no pill', () => {
    setViewportWidth(PHONE_WIDTH);
    renderGame(storeWithStreak(6));

    const meter = screen.getByRole('region', { name: /progress/i });
    const streak = meter.querySelector('.tier__streak') as HTMLElement;
    expect(streak).not.toBeNull();
    expect(streak.textContent).toMatch(/6 days/);
    expect(streak.querySelector('.tier__flame')).not.toBeNull();

    // Exactly one home: the pill is not also on the screen.
    expect(document.querySelector('.chip')).toBeNull();
  });

  it('renders the pill at two-column widths, and no flame in the meter', () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderGame(storeWithStreak(6));

    const chip = document.querySelector('.chip') as HTMLElement;
    expect(chip.textContent).toMatch(/Streak\s*6/);
    // Its explanation lives in a title attribute, which is only ever reachable
    // by a pointer. That is survivable precisely because this is the
    // two-column branch; the narrow flame says it in text instead.
    expect(chip).toHaveAttribute('title', 'Days cleared in a row');

    // The meter appears with the first find here, and carries no streak when
    // it does: two homes at one width is the thing this split rules out.
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });
    const meter = screen.getByRole('region', { name: /progress/i });
    expect(meter.querySelector('.tier__streak')).toBeNull();
  });

  // The caption row is aria-hidden per child, not as a row, precisely so the
  // streak can live in it and still be read. The pill it replaces is readable
  // text today, so a flame in a hidden subtree would be a silent regression
  // traded for a visual parity win.
  it('keeps the flame streak readable rather than inside a hidden subtree', () => {
    setViewportWidth(PHONE_WIDTH);
    renderGame(storeWithStreak(6));

    const meter = screen.getByRole('region', { name: /progress/i });
    const streak = meter.querySelector('.tier__streak') as HTMLElement;
    for (
      let node: HTMLElement | null = streak;
      node !== null;
      node = node.parentElement
    ) {
      expect(node.getAttribute('aria-hidden')).not.toBe('true');
    }
    // And it says what it counts, which the flame alone never did.
    expect(streak.textContent).toMatch(/streak/i);
    expect(streak.textContent).toMatch(/cleared in a row/i);
  });

  // The two homes differ at zero, deliberately and asymmetrically. The flame is
  // gated on a streak existing, which is what the app does and what was asked
  // for. The pill still prints "Streak 0", which is what it has always done —
  // changing it would be a two-column change nobody asked for, and the whole
  // constraint on this work is that the two-column layout does not move.
  it('hides the flame before a streak is earned, and leaves the pill alone', () => {
    setViewportWidth(PHONE_WIDTH);
    const { unmount } = renderGame();
    expect(document.querySelector('.tier__streak')).toBeNull();
    // The meter itself is still there on an empty board: it is the flame that
    // is conditional, not the furniture it sits in.
    expect(document.querySelector('.play .tier')).not.toBeNull();
    unmount();

    setViewportWidth(DESKTOP_WIDTH);
    renderGame();
    expect(
      (document.querySelector('.chip') as HTMLElement).textContent,
    ).toMatch(/Streak\s*0/);
  });
});
