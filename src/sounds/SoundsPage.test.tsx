import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NullAudioEngine } from '@/audio/AudioEngine.ts';
import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import { installFakeAudio } from '@/testing/fakeAudioContext.ts';
import { SoundsPage } from './SoundsPage.tsx';
import { SOUNDS, inTheme } from './inventory.ts';

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

  test('plays each mythic row in its own theme, and leaves the page in cute', () => {
    const engine = new NullAudioEngine();
    const seen: (string | undefined)[] = [];
    vi.spyOn(engine, 'playFound').mockImplementation(() => {
      seen.push(document.documentElement.dataset.theme);
    });
    render(<SoundsPage engine={engine} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Length 8, mythic, letterpress' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Length 8, mythic, cute' }),
    );

    expect(seen).toEqual(['letterpress', 'cute']);
    expect(document.documentElement.dataset.theme).toBe('cute');
    // Set on the root directly, never through the game's theme setter, so the
    // player's saved theme is not touched.
    expect(localStorage.getItem('e8-theme')).toBeNull();
  });

  test('puts the theme back even when the cue throws', () => {
    expect(() =>
      inTheme('letterpress', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(document.documentElement.dataset.theme).toBe('cute');
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
