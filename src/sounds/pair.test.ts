import { afterEach, describe, expect, test, vi } from 'vitest';
import { installFakeAudio } from '@/testing/fakeAudioContext.ts';
import { lengthOf, pairOnTap } from './pair.ts';

const { contextsGiven } = vi.hoisted(() => ({
  contextsGiven: [] as unknown[],
}));
vi.mock('soundscape-engine', () => ({
  AudioEngine: class {
    constructor(options: { context: unknown }) {
      contextsGiven.push(options.context);
    }
    initialize(): Promise<void> {
      return new Promise(() => {});
    }
    loadCues(): void {}
    playCue(): void {}
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  contextsGiven.length = 0;
});

describe('pairOnTap', () => {
  test('makes one context on the first call, and both engines play on it', () => {
    const { contexts } = installFakeAudio();
    const pair = pairOnTap();
    expect(contexts).toHaveLength(0);
    const both = pair()!;
    expect(pair()).toBe(both);
    expect(contexts).toHaveLength(1);

    both.before.tick();
    both.soundscape.tick();
    // The old engine builds its master on the shared context, and Soundscape
    // is handed the same one
    expect(contexts[0]!.oscillators).toHaveLength(1);
    expect(contextsGiven).toEqual([contexts[0]]);
  });

  test('resumes the context on the call that makes it, and whenever it is suspended', () => {
    const { contexts } = installFakeAudio();
    const pair = pairOnTap();
    pair();
    expect(contexts[0]!.resumes).toBe(1);
    pair();
    expect(contexts[0]!.resumes).toBe(1);
    contexts[0]!.state = 'suspended';
    pair();
    expect(contexts[0]!.resumes).toBe(2);
  });

  test('gives nothing where there is no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(pairOnTap()()).toBeNull();
  });
});

describe('lengthOf', () => {
  test("is a sound's last note's end, plus the 20 ms tail", () => {
    expect(lengthOf('tick')).toBeCloseTo(0.05, 12);
    expect(lengthOf('found-5-rare')).toBeCloseTo(0.3, 12);
    expect(lengthOf('invalid')).toBeCloseTo(0.26, 12);
    expect(lengthOf('source')).toBeCloseTo(0.82, 12);
    expect(lengthOf('edition')).toBeCloseTo(1.62, 12);
  });
});
