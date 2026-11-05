import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { validateCueDocument } from 'soundscape-engine';
import { NullAudioEngine, type AudioEngine } from '@/audio/AudioEngine.ts';
import cues from '@/audio/peach.cues.json';
import { SoundsPage } from './SoundsPage.tsx';
import { SOUNDS } from './inventory.ts';
import type { Pair } from './pair.ts';
import type { CandidatePlayer } from './candidatePlayer.ts';
import {
  CANDIDATE_CUES,
  CANDIDATES,
  TAKES,
  TEN_GAP_S,
  cueName,
} from './shuffleCandidates.ts';

beforeEach(() => {
  document.documentElement.dataset.theme = 'cute';
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

/** A recording page: both engines and the candidates' player, and what each was asked. */
function recording() {
  const log: string[] = [];
  let made = 0;
  const engine = (side: keyof Pair): AudioEngine => {
    const e = new NullAudioEngine();
    vi.spyOn(e, 'tick').mockImplementation(() => {
      log.push(`${side} tick`);
    });
    vi.spyOn(e, 'playFound').mockImplementation(
      (length?: number, rung?: string) => {
        log.push(`${side} playFound ${length} ${rung}`);
      },
    );
    vi.spyOn(e, 'setMuted').mockImplementation((m: boolean) => {
      log.push(`${side} setMuted ${m}`);
    });
    return e;
  };
  const both: Pair = {
    before: engine('before'),
    soundscape: engine('soundscape'),
  };
  const player: CandidatePlayer = {
    play: (cue, inS = 0) => {
      log.push(`play ${cue} in ${inS.toFixed(3)}`);
    },
    setMuted: (m) => {
      log.push(`candidates setMuted ${m}`);
    },
  };
  render(
    <SoundsPage
      pair={() => both}
      candidates={() => {
        made += 1;
        return player;
      }}
    />,
  );
  return { log, made: () => made };
}

const section = () =>
  screen.getByRole('region', { name: 'Shuffle candidates' });

describe('the Shuffle candidates on the sounds page', () => {
  test('every candidate has its line, its numbers, and three ways to play it', () => {
    recording();
    for (const candidate of CANDIDATES) {
      const letter = candidate.id.toUpperCase();
      for (const kind of ['once', 'ten in turn', 'ten of one'])
        expect(
          within(section()).getByRole('button', { name: `${letter}, ${kind}` }),
        ).toBeInTheDocument();
      expect(within(section()).getByText(candidate.about)).toBeInTheDocument();
    }
    // Each line sets the candidate's peak and loudness beside the tick's and a find's
    expect(
      within(section()).getAllByText(
        /dB under the tick's and .* under a find's/,
      ),
    ).toHaveLength(CANDIDATES.length);
  });

  test('once plays the first take, now', () => {
    const { log } = recording();
    fireEvent.click(screen.getByRole('button', { name: 'B, once' }));
    expect(log).toEqual(['play shuffle-b-1 in 0.000']);
    expect(within(section()).getByRole('status')).toHaveTextContent(
      'Played B, once.',
    );
  });

  test('ten in turn plays the three takes in turn, eight presses a second', () => {
    const { log } = recording();
    fireEvent.click(screen.getByRole('button', { name: 'C, ten in turn' }));
    expect(log).toEqual(
      Array.from(
        { length: 10 },
        (_, i) =>
          `play shuffle-c-${(i % TAKES) + 1} in ${(i * TEN_GAP_S).toFixed(3)}`,
      ),
    );
  });

  test('ten of one plays the first take ten times', () => {
    const { log } = recording();
    fireEvent.click(screen.getByRole('button', { name: 'D, ten of one' }));
    expect(log).toHaveLength(10);
    expect(new Set(log.map((l) => l.split(' ')[1]))).toEqual(
      new Set(['shuffle-d-1']),
    );
  });

  test('the tick and the find to compare play once, on Soundscape alone', () => {
    const { log } = recording();
    fireEvent.click(
      screen.getByRole('button', { name: 'Tile tap, on Soundscape' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Length 5 find, on Soundscape' }),
    );
    expect(log).toEqual(['soundscape tick', 'soundscape playFound 5 set']);
  });

  test('the mute silences every candidate, ten in a row included, and unmuting brings them back', () => {
    const { log, made } = recording();
    const mute = screen.getByRole('button', { name: 'Mute every cue' });

    // Muted first: a tap makes nothing at all
    fireEvent.click(mute);
    log.length = 0;
    for (const button of within(section()).getAllByRole('button'))
      fireEvent.click(button);
    expect(made()).toBe(0);
    expect(log).toEqual([]);

    // Unmuted, the player is made and plays
    fireEvent.click(mute);
    fireEvent.click(screen.getByRole('button', { name: 'A, ten in turn' }));
    expect(made()).toBe(1);
    expect(log.filter((l) => l.startsWith('play'))).toHaveLength(10);

    // Muting once the player exists mutes it too, so the presses still to
    // come from ten in a row are silenced with the rest
    log.length = 0;
    fireEvent.click(mute);
    expect(log).toContain('candidates setMuted true');
    fireEvent.click(mute);
    expect(log).toContain('candidates setMuted false');
  });

  test('the masthead still counts only the sounds the game makes', () => {
    recording();
    expect(
      screen.getByText(
        `${SOUNDS.length} sounds, each as it was, then on Soundscape`,
      ),
    ).toBeInTheDocument();
  });
});

describe('the candidates cue document', () => {
  test('is a valid cue document of three takes a candidate, and nothing else', () => {
    expect(validateCueDocument(CANDIDATE_CUES).ok).toBe(true);
    expect(Object.keys(CANDIDATE_CUES.cues)).toEqual(
      CANDIDATES.flatMap((c) =>
        Array.from({ length: TAKES }, (_, take) => cueName(c, take)),
      ),
    );
  });

  test('is not the game: none of its cues is in peach.cues.json', () => {
    const game = Object.keys(cues.cues);
    expect(game.filter((name) => name.startsWith('shuffle'))).toEqual([]);
  });

  test('pitches every partial a quarter tone between two semitones', () => {
    const pitches = Object.values(CANDIDATE_CUES.cues).flatMap((cue) =>
      cue.notes.map((n) => n.pitch),
    );
    expect(pitches.filter((p) => p % 1 !== 0.5)).toEqual([]);
  });

  test('clicks: the fastest attack, gone by its release, on a sine with nothing after it', () => {
    const click = CANDIDATE_CUES.instruments.click!;
    expect(click).toMatchObject({
      waveform: 'sine',
      attack: 0,
      sustain: 0,
      release: 0,
      filterType: 'none',
      distortion: 0,
      delayMix: 0,
    });
  });
});
