import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Game } from './Game.tsx';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { useDefinitions } from './useDefinitions.ts';
import { copy } from './themeCopy.ts';
import type { Theme } from './useTheme.ts';

vi.mock('./useDefinitions.ts', () => ({
  useDefinitions: vi.fn(),
}));

/**
 * The cute peach at the game's two big moments, played through the game rather
 * than handed in as props: the reveal card when the eight-letter word is found,
 * and the completion card, crowned, when the basket is full. Each wears the
 * costume of the board's own date, as the source mark does.
 */
const COMMON = ['serenade', 'sea', 'near', 'dean', 'eased', 'erase'];

function fakeData(): GameData {
  return {
    dictionary: createListDictionary(COMMON),
    commonPool: createListWordSource(COMMON),
    beyond70Pool: createListWordSource([]),
    beyond95Pool: createListWordSource([]),
    // One word, so every daily board and every Endless deal is serenade.
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['serenade'],
    },
    sourceEntry: (w) =>
      w === 'serenade'
        ? {
            word: 'serenade',
            definition: 'noun. a love song.',
            etymology: 'From Italian serenata.',
          }
        : undefined,
  };
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/** Today's board on this date, in this theme. */
function playOn(y: number, m: number, d: number, theme: Theme = 'cute') {
  vi.setSystemTime(new Date(y, m - 1, d, 9));
  document.documentElement.dataset.theme = theme;
  return render(
    <Game
      data={fakeData()}
      audio={new NullAudioEngine()}
      storage={new GameStorage(fakeStore())}
    />,
  );
}

function find(word: string) {
  for (const ch of word) fireEvent.keyDown(window, { key: ch });
  fireEvent.keyDown(window, { key: 'Enter' });
}

const revealPeach = () =>
  screen.getByRole('dialog').querySelector('svg.reveal__peach');
/** The ghost sheet's lilac edge, which no other part of any peach draws. */
const wearsGhost = (el: Element | null) =>
  Boolean(el?.querySelector('path[stroke="#D6C9EE"]'));

/** Each winter costume's day, and what its peach says on it. */
const WINTER_DAYS: readonly (readonly [number, number, number, string])[] = [
  [2026, 11, 26, 'The peach is wearing a pie crust hat.'],
  [2026, 12, 21, 'The peach is wearing a knit beanie and scarf.'],
  [2026, 12, 24, 'The peach is wearing antlers and a red nose.'],
  [2026, 12, 25, 'The peach is wearing a Santa hat.'],
  [2026, 12, 31, 'The peach is wearing a top hat.'],
  [2027, 1, 1, 'The peach is wearing a top hat.'],
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  (useDefinitions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    getDefinition: async () => null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

describe('the peach on the reveal card', () => {
  it('opens the card in cute, above the kicker', () => {
    playOn(2026, 10, 25);
    find('serenade');
    const peach = revealPeach();
    expect(peach).toBeTruthy();
    const kicker = screen.getByText('The peach every word grew from');
    expect(
      peach!.compareDocumentPosition(kicker) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is not on the card in letterpress, which stays text', () => {
    playOn(2026, 10, 31, 'letterpress');
    find('serenade');
    expect(screen.getByRole('dialog').querySelector('svg')).toBeNull();
  });

  it("wears the ghost on 31 October's board, in any year, and says so", () => {
    for (const year of [2026, 2027]) {
      const { unmount } = playOn(year, 10, 31);
      find('serenade');
      expect(wearsGhost(revealPeach()), `${year}`).toBe(true);
      expect(
        screen.getByText('The peach is in a ghost sheet.'),
      ).toBeInTheDocument();
      unmount();
      localStorage.clear();
    }
  });

  it.each(WINTER_DAYS)(
    "wears the winter's costume on %i-%i-%i's board, and says so",
    (y, m, d, spoken) => {
      playOn(y, m, d);
      find('serenade');
      expect(revealPeach()).toBeTruthy();
      expect(screen.getByText(spoken)).toBeInTheDocument();
    },
  );

  it('is the plain peach, and says nothing, on another day', () => {
    playOn(2026, 10, 30);
    find('serenade');
    const peach = revealPeach();
    expect(peach).toBeTruthy();
    expect(wearsGhost(peach)).toBe(false);
    expect(peach!.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByText(/The peach is/)).toBeNull();
  });

  it('is the plain peach in Endless, which has no date', () => {
    playOn(2026, 10, 31);
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
    find('serenade');
    const peach = revealPeach();
    expect(peach).toBeTruthy();
    expect(wearsGhost(peach)).toBe(false);
    expect(screen.queryByText(/The peach is/)).toBeNull();
  });
});

/** Every common word, the source first and its reveal put away. */
function fillTheBasket(theme: Theme) {
  find('serenade');
  fireEvent.click(
    screen.getByRole('button', { name: copy(theme).revealClose }),
  );
  for (const word of COMMON.slice(1)) find(word);
}

describe("the crown on the completion card's peach", () => {
  const card = () => document.querySelector<HTMLElement>('.edition')!;

  it("sits on the ghost on 31 October's board", () => {
    playOn(2026, 10, 31);
    fillTheBasket('cute');
    expect(wearsGhost(card().querySelector('.edition__ornament--peach'))).toBe(
      true,
    );
    expect(card().querySelector('svg.crowned__crown')).toBeTruthy();
  });

  it.each(WINTER_DAYS)(
    "sits on the winter's costume on %i-%i-%i's board",
    (y, m, d, spoken) => {
      playOn(y, m, d);
      fillTheBasket('cute');
      expect(within(card()).getByText(spoken)).toBeInTheDocument();
      expect(card().querySelector('svg.crowned__crown')).toBeTruthy();
    },
  );

  it('is worn by the plain peach on another day', () => {
    playOn(2026, 10, 30);
    fillTheBasket('cute');
    expect(wearsGhost(card().querySelector('.edition__ornament--peach'))).toBe(
      false,
    );
    expect(card().querySelector('svg.crowned__crown')).toBeTruthy();
  });

  it('is absent in letterpress', () => {
    playOn(2026, 10, 31, 'letterpress');
    fillTheBasket('letterpress');
    expect(card().querySelector('svg')).toBeNull();
  });
});
