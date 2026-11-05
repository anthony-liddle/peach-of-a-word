import { afterEach, describe, expect, test, vi } from 'vitest';
import { candidatesOnTap } from './candidatePlayer.ts';
import { CANDIDATE_CUES } from './shuffleCandidates.ts';

const { calls } = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('soundscape-engine', () => ({
  AudioEngine: class {
    constructor(options: { context: unknown }) {
      calls.push(['new', options.context]);
    }
    initialize(): Promise<void> {
      return new Promise(() => {});
    }
    loadCues(document: unknown): void {
      calls.push(['loadCues', document]);
    }
    playCue(name: string, when: number): void {
      calls.push(['playCue', name, when]);
    }
    setCuesMuted(muted: boolean): void {
      calls.push(['setCuesMuted', muted]);
    }
  },
}));

afterEach(() => {
  calls.length = 0;
});

describe('candidatesOnTap', () => {
  test("makes one engine, on the page's context, holding the candidates and not the game's cues", () => {
    const context = { currentTime: 2 } as unknown as BaseAudioContext;
    const candidates = candidatesOnTap(() => context);
    expect(calls).toEqual([]);
    const player = candidates()!;
    expect(candidates()).toBe(player);
    expect(calls).toEqual([
      ['new', context],
      ['loadCues', CANDIDATE_CUES],
    ]);
  });

  test('plays on the audio clock, offset from now, and mutes through the engine', () => {
    const context = { currentTime: 2 } as unknown as BaseAudioContext;
    const player = candidatesOnTap(() => context)()!;
    calls.length = 0;
    player.play('shuffle-a-1');
    player.play('shuffle-a-2', 0.125);
    player.setMuted(true);
    expect(calls).toEqual([
      ['playCue', 'shuffle-a-1', 2],
      ['playCue', 'shuffle-a-2', 2.125],
      ['setCuesMuted', true],
    ]);
  });

  test('gives nothing where there is no Web Audio', () => {
    expect(candidatesOnTap(() => null)()).toBeNull();
    expect(calls).toEqual([]);
  });
});
