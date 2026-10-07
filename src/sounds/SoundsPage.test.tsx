import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NullAudioEngine, type AudioEngine } from '@/audio/AudioEngine.ts';
import { SoundsPage } from './SoundsPage.tsx';
import { SOUNDS } from './inventory.ts';
import { lengthOf, type Pair } from './pair.ts';

beforeEach(() => {
  // The page's own document pins cute before the first paint.
  document.documentElement.dataset.theme = 'cute';
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

/**
 * Two recording engines, and how often the page asked for them: every call
 * each engine receives, prefixed with which one it was.
 */
function recordingPair() {
  const log: string[] = [];
  let made = 0;
  const engine = (side: keyof Pair): AudioEngine => {
    const e: AudioEngine = new NullAudioEngine();
    vi.spyOn(e, 'playFound').mockImplementation((length, rung) => {
      log.push(`${side} playFound ${length} ${rung}`);
    });
    vi.spyOn(e, 'setTheme').mockImplementation((theme) => {
      log.push(`${side} setTheme ${theme}`);
    });
    vi.spyOn(e, 'setMuted').mockImplementation((muted) => {
      log.push(`${side} setMuted ${muted}`);
    });
    for (const cue of [
      'playSource',
      'playEdition',
      'playInvalid',
      'tick',
    ] as const)
      vi.spyOn(e, cue).mockImplementation(() => {
        log.push(`${side} ${cue}`);
      });
    return e;
  };
  const both: Pair = {
    before: engine('before'),
    soundscape: engine('soundscape'),
  };
  return {
    log,
    made: () => made,
    pair: () => {
      made += 1;
      return both;
    },
  };
}

const soundButtons = () =>
  screen.getAllByRole('button').filter((b) => b.hasAttribute('data-sound'));

/** Run the timer that plays the second sound of a tap on `id`. */
const second = (id: string) =>
  act(() => vi.advanceTimersByTime((lengthOf(id) + 0.4) * 1000));

describe('the sounds page', () => {
  test('has one button per sound in the inventory', () => {
    render(<SoundsPage pair={recordingPair().pair} />);
    expect(soundButtons().map((b) => b.dataset.sound)).toEqual(
      SOUNDS.map((s) => s.id),
    );
  });

  test('names each button with what it plays, the same words it shows', () => {
    render(<SoundsPage pair={recordingPair().pair} />);
    for (const sound of SOUNDS) {
      const button = screen.getByRole('button', { name: sound.label });
      expect(button).toHaveTextContent(sound.label);
    }
    expect(
      screen.getByRole('button', { name: 'Length 5, mythic, letterpress' }),
    ).toBeInTheDocument();
  });

  test('makes nothing on load: the engines come with the first tap', () => {
    const { pair, made } = recordingPair();
    render(<SoundsPage pair={pair} />);
    expect(made()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tile tap' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tile tap' }));
    expect(made()).toBe(1);
  });

  test('a tap plays the sound as it was, then on Soundscape once the first has finished', () => {
    const { pair, log } = recordingPair();
    render(<SoundsPage pair={pair} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edition Complete' }));
    expect(log).toEqual(['before playEdition']);
    act(() => vi.advanceTimersByTime((lengthOf('edition') + 0.4) * 1000 - 1));
    expect(log).toEqual(['before playEdition']);
    act(() => vi.advanceTimersByTime(1));
    expect(log).toEqual(['before playEdition', 'soundscape playEdition']);
    expect(
      screen.getByText(
        'Played Edition Complete: the game before Soundscape, then Soundscape.',
      ),
    ).toBeInTheDocument();
  });

  test("gives each engine a mythic row's theme, and leaves the page and the player's theme alone", () => {
    const { pair, log } = recordingPair();
    render(<SoundsPage pair={pair} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Length 8, mythic, letterpress' }),
    );
    second('found-8-mythic-letterpress');
    expect(log).toEqual([
      'before setTheme letterpress',
      'before playFound 8 mythic',
      'soundscape setTheme letterpress',
      'soundscape playFound 8 mythic',
    ]);
    expect(document.documentElement.dataset.theme).toBe('cute');
    expect(localStorage.getItem('e8-theme')).toBeNull();
  });

  test('blind mode plays A and B in an order nothing shows, until the reveal', () => {
    const { pair, log } = recordingPair();
    const draws = [0.9, 0.1];
    render(<SoundsPage pair={pair} random={() => draws.shift()!} />);
    const blind = screen.getByRole('button', { name: 'Blind' });
    fireEvent.click(blind);
    expect(blind).toHaveAttribute('aria-pressed', 'true');

    // Before Soundscape first, then Soundscape first: both orders happen
    for (const draw of ['before', 'soundscape']) {
      log.length = 0;
      fireEvent.click(screen.getByRole('button', { name: 'Source word' }));
      second('source');
      expect(log).toEqual(
        draw === 'before'
          ? ['before playSource', 'soundscape playSource']
          : ['soundscape playSource', 'before playSource'],
      );
      // Nothing about the order is on the page: the status, the reveal and
      // every attribute of them say A and B and no more
      const played = screen.getByText(
        'Played Source word: A, then B.',
      ).parentElement!;
      expect(played.outerHTML).not.toMatch(/Soundscape|before|soundscape/);
      expect(
        screen.getByRole('button', { name: 'Source word' }).outerHTML,
      ).not.toMatch(/Soundscape|before/);
    }

    fireEvent.click(
      screen.getByRole('button', { name: 'Reveal which was which' }),
    );
    expect(
      screen.getByText(
        'Played Source word: A was Soundscape, B was the game before Soundscape.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reveal which was which' }),
    ).toBeNull();
  });

  test('the mute row silences every cue, and unmuting brings them back', () => {
    const { pair, log, made } = recordingPair();
    render(<SoundsPage pair={pair} />);
    const mute = screen.getByRole('button', { name: 'Mute every cue' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(mute);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/plays nothing/);
    for (const button of soundButtons()) fireEvent.click(button);
    act(() => vi.runAllTimers());
    expect(made()).toBe(0);
    expect(log).toEqual([]);

    fireEvent.click(mute);
    fireEvent.click(screen.getByRole('button', { name: 'Tile tap' }));
    second('tick');
    expect(log).toEqual(['before tick', 'soundscape tick']);

    // Muting once the engines exist mutes both
    log.length = 0;
    fireEvent.click(mute);
    expect(log).toEqual(['before setMuted true', 'soundscape setMuted true']);
  });

  test('groups the found word by length, with the note each length plays', () => {
    render(<SoundsPage pair={recordingPair().pair} />);
    const found = screen.getByRole('region', { name: 'Found word' });
    expect(
      within(found).getByRole('heading', { name: 'Length 3, 392 Hz' }),
    ).toBeInTheDocument();
    expect(
      within(found).getByRole('heading', { name: 'Length 8, 783.99 Hz' }),
    ).toBeInTheDocument();
  });
});
