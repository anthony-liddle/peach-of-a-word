import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NullAudioEngine, type AudioEngine } from '@/audio/AudioEngine.ts';
import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import { installFakeAudio } from '@/testing/fakeAudioContext.ts';
import { SoundsPage } from './SoundsPage.tsx';
import { SOUNDS } from './inventory.ts';

beforeEach(() => {
  // The page's own document pins cute before the first paint.
  document.documentElement.dataset.theme = 'cute';
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

const soundButtons = () =>
  screen.getAllByRole('button').filter((b) => b.hasAttribute('data-sound'));

describe('the sounds page', () => {
  test('has one button per sound in the inventory', () => {
    render(<SoundsPage engine={new NullAudioEngine()} />);
    expect(soundButtons().map((b) => b.dataset.sound)).toEqual(
      SOUNDS.map((s) => s.id),
    );
  });

  test('names each button with what it plays, the same words it shows', () => {
    render(<SoundsPage engine={new NullAudioEngine()} />);
    for (const sound of SOUNDS) {
      const button = screen.getByRole('button', { name: sound.label });
      expect(button).toHaveTextContent(sound.label);
    }
    expect(
      screen.getByRole('button', { name: 'Length 5, mythic, letterpress' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Length 5, rare' }),
    ).toBeInTheDocument();
  });

  test('plays nothing on load: no audio context until the first tap', () => {
    const { contexts } = installFakeAudio();
    render(<SoundsPage engine={new WebAudioEngine()} />);
    expect(contexts).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Tile tap' }));
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.oscillators).toHaveLength(1);
  });

  test("gives the engine each mythic row's theme, and leaves the page and the player's theme alone", () => {
    const engine: AudioEngine = new NullAudioEngine();
    const calls: string[] = [];
    vi.spyOn(engine, 'setTheme').mockImplementation((theme) => {
      calls.push(`setTheme ${theme}`);
    });
    vi.spyOn(engine, 'playFound').mockImplementation((length, rung) => {
      calls.push(`playFound ${length} ${rung}`);
    });
    render(<SoundsPage engine={engine} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Length 8, mythic, letterpress' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Length 8, mythic, cute' }),
    );

    expect(calls).toEqual([
      'setTheme letterpress',
      'playFound 8 mythic',
      'setTheme cute',
      'playFound 8 mythic',
    ]);
    // The engine is told; the page's own theme and the player's saved one are
    // never touched.
    expect(document.documentElement.dataset.theme).toBe('cute');
    expect(localStorage.getItem('e8-theme')).toBeNull();
  });

  test('the mute row silences every cue, and unmuting brings them back', () => {
    const { contexts } = installFakeAudio();
    render(<SoundsPage engine={new WebAudioEngine()} />);
    const mute = screen.getByRole('button', { name: 'Mute every cue' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(mute);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/plays nothing/);
    for (const button of soundButtons()) fireEvent.click(button);
    expect(contexts).toHaveLength(0);

    fireEvent.click(mute);
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Source word' }));
    expect(contexts).toHaveLength(1);
  });

  test('groups the found word by length, with the note each length plays', () => {
    render(<SoundsPage engine={new NullAudioEngine()} />);
    const found = screen.getByRole('region', { name: 'Found word' });
    expect(
      within(found).getByRole('heading', { name: 'Length 3, 392 Hz' }),
    ).toBeInTheDocument();
    expect(
      within(found).getByRole('heading', { name: 'Length 8, 783.99 Hz' }),
    ).toBeInTheDocument();
  });
});
