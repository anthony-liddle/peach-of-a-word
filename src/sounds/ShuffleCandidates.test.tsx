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
  TILE_TAP_CUE,
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
const tapSection = () =>
  screen.getByRole('region', { name: 'Tile tap candidate' });
const sectionOf = (role: string) => (role === 'tap' ? tapSection() : section());

describe('the Shuffle candidates on the sounds page', () => {
  test('every candidate has its line, its numbers, and three ways to play it', () => {
    recording();
    for (const candidate of CANDIDATES) {
      const here = sectionOf(candidate.role);
      for (const kind of ['once', 'ten in turn', 'ten of one'])
        expect(
          within(here).getByRole('button', {
            name: `${candidate.short}, ${kind}`,
          }),
        ).toBeInTheDocument();
      expect(within(here).getByText(candidate.about)).toBeInTheDocument();
    }
    // Each line sets the candidate's peak and loudness beside the tick's and a find's
    expect(
      screen.getAllByText(
        /dB (under|over) the tick's and .* dB (under|over) a find's/,
      ),
    ).toHaveLength(CANDIDATES.length);
    // The tap is the one louder in peak than the tick it would replace
    expect(
      within(tapSection()).getByText(/dB over the tick's\. Loudness/),
    ).toBeInTheDocument();
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
    for (const button of [
      ...within(section()).getAllByRole('button'),
      ...within(tapSection()).getAllByRole('button'),
    ])
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

  test('the tap candidate plays its takes in turn, and the tile tap beside it plays once or ten in a row', () => {
    const { log } = recording();
    fireEvent.click(screen.getByRole('button', { name: 'Tap, ten in turn' }));
    expect(log).toEqual(
      Array.from(
        { length: 10 },
        (_, i) =>
          `play tap-${(i % TAKES) + 1} in ${(i * TEN_GAP_S).toFixed(3)}`,
      ),
    );
    expect(within(tapSection()).getByRole('status')).toHaveTextContent(
      'Played Tap, ten in turn.',
    );
    expect(within(section()).getByRole('status')).toHaveTextContent('');

    log.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'The tile tap, once' }));
    expect(log).toEqual([`play ${TILE_TAP_CUE} in 0.000`]);
    log.length = 0;
    fireEvent.click(
      screen.getByRole('button', { name: 'The tile tap, ten in a row' }),
    );
    expect(log).toEqual(
      Array.from(
        { length: 10 },
        (_, i) => `play ${TILE_TAP_CUE} in ${(i * TEN_GAP_S).toFixed(3)}`,
      ),
    );
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
  test("is a valid cue document of three takes a candidate, and the game's tick to compare", () => {
    expect(validateCueDocument(CANDIDATE_CUES).ok).toBe(true);
    expect(Object.keys(CANDIDATE_CUES.cues)).toEqual([
      ...CANDIDATES.flatMap((c) =>
        Array.from({ length: TAKES }, (_, take) => cueName(c, take)),
      ),
      TILE_TAP_CUE,
    ]);
    // The tick to compare is the game's, note for note and instrument too
    const { id: _, ...tick } = cues.cues.tick.notes[0]!;
    const { id: __, ...copy } = CANDIDATE_CUES.cues[TILE_TAP_CUE]!.notes[0]!;
    expect(copy).toEqual(tick);
    expect(CANDIDATE_CUES.cues[TILE_TAP_CUE]!.notes).toHaveLength(1);
    expect(CANDIDATE_CUES.instruments.square).toEqual(cues.instruments.square);
  });

  test('is not the game: none of its cues is in peach.cues.json', () => {
    const game = new Set(Object.keys(cues.cues));
    expect(
      Object.keys(CANDIDATE_CUES.cues).filter((name) => game.has(name)),
    ).toEqual([]);
  });

  test('pitches every partial a quarter tone between two semitones', () => {
    const pitches = Object.values(CANDIDATE_CUES.cues).flatMap((cue) =>
      cue.notes.filter((n) => n.instrument === 'click').map((n) => n.pitch),
    );
    expect(pitches.length).toBeGreaterThan(0);
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
