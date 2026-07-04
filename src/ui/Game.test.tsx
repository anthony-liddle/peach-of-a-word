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
import { useDefinitions } from './useDefinitions.ts';

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

  it('carries the quiet dedication in the footer', () => {
    renderGame();
    const footer = document.querySelector('.colophon') as HTMLElement;
    expect(footer.textContent).toMatch(/for Bea/);
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
    expect(within(glossary).getByText('sea')).toBeInTheDocument();
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
    return within(glossary).getByText(text).closest('button') as HTMLElement;
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

  it('renders exactly one progress bar, and it lives in the glossary', () => {
    renderGame();
    type('sea');
    fireEvent.keyDown(window, { key: 'Enter' });

    // One bar on the screen, not two.
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(1);

    // The surviving bar sits in the glossary, where the totals live.
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByRole('progressbar')).toBe(bars[0]);

    // The standalone bar under the input is gone: the play column has none.
    const play = document.querySelector('.play') as HTMLElement;
    expect(play.querySelector('[role="progressbar"]')).toBeNull();
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
    expect(within(glossary).getByText('sea')).toBeInTheDocument();
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
    expect(screen.getByText(/Set in Fredoka and Nunito/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Classic' }));
    expect(document.documentElement.dataset.theme).toBe('letterpress');
    expect(
      screen.getByText(/Set in Fraunces and Spectral/i),
    ).toBeInTheDocument();
  });

  it('swaps the theme from the compact button and keeps name and label in sync', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();

    // In classic it shows the current theme and offers to switch to cute.
    const fromClassic = screen.getByRole('button', {
      name: /theme: classic\. activate to switch to cute/i,
    });
    expect(fromClassic).toHaveTextContent(/classic/i);

    fireEvent.click(fromClassic);
    expect(document.documentElement.dataset.theme).toBe('cute');

    // Now it shows Cute and offers the way back to Classic.
    const fromCute = screen.getByRole('button', {
      name: /theme: cute\. activate to switch to classic/i,
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
    expect(within(glossary()).getByText('sea')).toBeInTheDocument();
  });

  it('keeps daily and endless progress separate', () => {
    renderGame();
    findWord('near'); // found in daily (default mode)
    toEndless();
    expect(within(glossary()).queryByText('near')).not.toBeInTheDocument();

    findWord('sea'); // found in endless
    toDaily();
    expect(within(glossary()).getByText('near')).toBeInTheDocument();
    expect(within(glossary()).queryByText('sea')).not.toBeInTheDocument();
  });

  it('only New Puzzle changes the endless game', () => {
    renderGame();
    toEndless();
    findWord('sea');
    expect(within(glossary()).getByText('sea')).toBeInTheDocument();

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
    expect(within(glossary()).getByText('sea')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /back to the case/i }));
    SET.slice(0, -1).forEach(findWord);
    findWord(SET[SET.length - 1]!); // the last set word completes the edition
  }

  it('does not celebrate before the set is finished', () => {
    renderGame();
    findWord('serenade');
    fireEvent.click(screen.getByRole('button', { name: /back to the case/i }));
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
    expect(within(glossary).getByText('sane')).toBeInTheDocument();

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
    fireEvent.click(screen.getByRole('button', { name: /back to the case/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /back to the case/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /back to the case/i }));
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
    (window as { matchMedia?: unknown }).matchMedia = vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
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
  const controlNames = () =>
    within(controls())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');

  it('orders the controls Shuffle, Clear, Delete, Submit', () => {
    renderGame();
    const names = controlNames();
    expect(names).toEqual([
      'Shuffle',
      'Clear',
      'Delete last letter',
      'Set word',
    ]);
    // Delete sits before Submit: Bea's "delete before submit".
    expect(names.indexOf('Delete last letter')).toBeLessThan(
      names.indexOf('Set word'),
    );
  });

  it('groups the controls into a utility cluster and a primary cluster', () => {
    renderGame();
    const groups = controls().querySelectorAll<HTMLElement>('.controls__group');
    expect(groups).toHaveLength(2);

    const utility = groups[0]!;
    const primary = groups[1]!;
    expect(
      within(utility).getByRole('button', { name: 'Shuffle' }),
    ).toBeInTheDocument();
    expect(
      within(utility).getByRole('button', { name: 'Clear' }),
    ).toBeInTheDocument();
    expect(
      within(primary).getByRole('button', { name: 'Delete last letter' }),
    ).toBeInTheDocument();
    expect(
      within(primary).getByRole('button', { name: 'Set word' }),
    ).toBeInTheDocument();
  });

  it('gives every control its accessible name', () => {
    renderGame();
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete last letter' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Set word' }),
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
    expect(stickText()).toBe('Set letters to make a word');
  });

  it('Submit sets the composed word into the glossary', () => {
    renderGame();
    type('sea');
    fireEvent.click(screen.getByRole('button', { name: 'Set word' }));
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).getByText('sea')).toBeInTheDocument();
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
    expect(within(glossary).getByText('sea')).toBeInTheDocument();
  });

  it('renders one shared structure for both themes (skin differs, not layout)', () => {
    document.documentElement.dataset.theme = 'letterpress';
    renderGame();
    const classic = controls().innerHTML;

    fireEvent.click(screen.getByRole('button', { name: 'Cute' }));
    const cute = controls().innerHTML;

    expect(cute).toBe(classic);
  });
});

describe('Game word tap routing', () => {
  function submitWord(word: string) {
    for (const ch of word) fireEvent.keyDown(window, { key: ch });
    fireEvent.keyDown(window, { key: 'Enter' });
  }

  function findWordButton(word: string) {
    return screen.getByRole('button', {
      name: new RegExp(`${word}, show definition`, 'i'),
    });
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
    expect(screen.queryByText('The word the type was cut for')).toBeNull();
  });
});
