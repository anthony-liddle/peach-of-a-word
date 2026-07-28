import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Game } from '../Game.tsx';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { copy } from '../themeCopy.ts';
import { DEFAULT_THEME } from '../useTheme.ts';

const ENABLE = ['serenade', 'sea', 'near', 'sane', 'eased'];
const COMMON = ['serenade', 'sea', 'near', 'eased'];

function fakeData(): GameData {
  return {
    dictionary: createListDictionary(ENABLE),
    commonPool: createListWordSource(COMMON),
    beyond70Pool: createListWordSource(['sane']),
    beyond95Pool: createListWordSource([]),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['serenade'],
    },
    sourceEntry: () => undefined,
  };
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function renderGame() {
  return render(
    <Game
      data={fakeData()}
      audio={new NullAudioEngine()}
      storage={new GameStorage(fakeStore())}
    />,
  );
}

const trigger = () =>
  screen.getByRole('button', { name: /how the words work/i });
const openPopup = () => fireEvent.click(trigger());
const popup = () =>
  screen.queryByRole('dialog', { name: /how the words work/i });

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

describe('How the Words Work popup', () => {
  it('renders the trigger in the footer colophon and opens the popup', () => {
    renderGame();
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('button', { name: /how the words work/i }),
    ).toBeInTheDocument();

    expect(popup()).not.toBeInTheDocument();
    openPopup();
    expect(popup()).toBeInTheDocument();
  });

  it('is a dialog with an accessible name and moves focus to the top of itself on open', () => {
    renderGame();
    openPopup();
    const dialog = popup() as HTMLElement;
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus lands on the dialog container, not an interior control: focusing a
    // button at the foot of a scrollable card would scroll it past the title.
    expect(document.activeElement).toBe(dialog);
  });

  it('closes via the close control and returns focus to the trigger', () => {
    renderGame();
    openPopup();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(popup()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes via the Escape key and returns focus to the trigger', () => {
    renderGame();
    openPopup();
    fireEvent.keyDown(popup() as HTMLElement, { key: 'Escape' });
    expect(popup()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes via an outside click and returns focus to the trigger', () => {
    renderGame();
    openPopup();
    const backdrop = document.querySelector('.reveal-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(popup()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it('renders the ENABLE source link safely in a new tab', () => {
    renderGame();
    openPopup();
    const link = within(popup() as HTMLElement).getByRole('link', {
      name: 'ENABLE',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://www.bananagrammer.com/2013/12/the-amazing-enable-word-list-project.html',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the SCOWL source link safely in a new tab', () => {
    renderGame();
    openPopup();
    const link = within(popup() as HTMLElement).getByRole('link', {
      name: 'SCOWL',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://wordlist.aspell.net/scowl_v1-readme/',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the same dialog structure in both themes', () => {
    document.documentElement.dataset.theme = 'letterpress';
    const classic = renderGame();
    openPopup();
    expect(popup()).toBeInTheDocument();
    expect(
      within(popup() as HTMLElement).getByRole('link', { name: 'ENABLE' }),
    ).toBeInTheDocument();
    expect(
      within(popup() as HTMLElement).getByRole('link', { name: 'SCOWL' }),
    ).toBeInTheDocument();
    classic.unmount();

    document.documentElement.dataset.theme = 'cute';
    renderGame();
    openPopup();
    expect(popup()).toBeInTheDocument();
    expect(
      within(popup() as HTMLElement).getByRole('link', { name: 'ENABLE' }),
    ).toBeInTheDocument();
    expect(
      within(popup() as HTMLElement).getByRole('link', { name: 'SCOWL' }),
    ).toBeInTheDocument();
  });

  it('suppresses keyboard play behind the open popup', () => {
    renderGame();
    openPopup();

    // Typing and submitting must not reach the board behind the modal.
    'sea'.split('').forEach((ch) => fireEvent.keyDown(window, { key: ch }));
    fireEvent.keyDown(window, { key: 'Enter' });

    const stick = document.querySelector('.stick') as HTMLElement;
    const theme =
      document.documentElement.dataset.theme === 'letterpress'
        ? 'letterpress'
        : DEFAULT_THEME;
    expect(stick.textContent?.trim()).toBe(copy(theme).inputPlaceholder);
    const glossary = screen.getByRole('region', { name: /words found/i });
    expect(within(glossary).queryByText('sea')).not.toBeInTheDocument();
  });

  it('traps focus within the dialog at both ends', () => {
    renderGame();
    openPopup();
    const dialog = popup() as HTMLElement;
    const focusables = within(dialog).getAllByRole('link') as HTMLElement[];
    const first = focusables[0]!;
    const close = within(dialog).getByRole('button', {
      name: /close/i,
    });

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });
});

/**
 * The panel is the one place in the app that teaches the model to a new player,
 * so these pin it to the model the game actually runs. Each assertion names a
 * claim the panel used to make and no longer should: they are regression pins
 * against the retired pre-Phase-3 framing creeping back in a copy edit.
 */
describe('How the Words Work explains the current model', () => {
  const body = () => (popup() as HTMLElement).textContent ?? '';

  it('never names the retired Edition Complete win state', () => {
    renderGame();
    openPopup();
    expect(body()).not.toMatch(/edition complete/i);
  });

  it('does not call completion the goal, nor what the bar fills toward', () => {
    renderGame();
    openPopup();
    // The bar fills toward par in points. Completion is a separate word-count
    // peak above the named ladder, which is exactly what the goal rebuild split.
    expect(body()).not.toMatch(/is the goal/i);
    expect(body()).not.toMatch(/bar fills toward/i);
  });

  it('says the ladder is climbed by points, with rarer words worth more', () => {
    renderGame();
    openPopup();
    expect(body()).toMatch(/points/i);
    expect(body()).toMatch(/rarer/i);
  });

  it('puts completion above the ladder and never calls it required', () => {
    renderGame();
    openPopup();
    expect(body()).toMatch(/every common word/i);
    expect(body()).toMatch(/never required|not required/i);
  });

  it('names the real validation boundary, not ENABLE alone', () => {
    renderGame();
    openPopup();
    // ENABLE union SCOWL 95 plus the curated patch layer, since Phase 1.
    expect(body()).not.toMatch(/ENABLE is the dictionary that decides/i);
    expect(body()).toMatch(/ENABLE/);
    expect(body()).toMatch(/SCOWL/);
    expect(body()).toMatch(/patch/i);
  });

  it('keeps the paragraph on a common-feeling word landing outside the set', () => {
    renderGame();
    openPopup();
    expect(body()).toMatch(/common here is a statistical line/i);
    expect(body()).toMatch(/It simply was not on today's short list\./);
  });

  it('still grades the off-page finds and calls them extra, not lesser', () => {
    renderGame();
    openPopup();
    expect(body()).toMatch(/Uncommon/);
    expect(body()).toMatch(/Rare/);
    expect(body()).toMatch(/Mythic/);
    expect(body()).toMatch(/not lesser, they are\s+extra/i);
  });
});
