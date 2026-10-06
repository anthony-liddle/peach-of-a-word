import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FakeAudioContext,
  installFakeAudio,
} from '@/testing/fakeAudioContext.ts';
import { SOUNDS } from '@/sounds/inventory.ts';
import { SoundscapeAudioEngine } from './SoundscapeAudioEngine.ts';

/**
 * The game's engine on Soundscape, held to the lifecycle of the engine it
 * replaces: nothing until the first cue, the context made and resumed by that
 * cue, a resume on every cue the browser has suspended, and nothing at all
 * while muted. Soundscape itself is replaced by a recorder here; the browser
 * tests render the real thing against the old engine, sample by sample.
 */
const { made } = vi.hoisted(() => ({
  made: [] as {
    context: unknown;
    calls: string[];
    document: unknown;
  }[],
}));

vi.mock('soundscape-engine', () => ({
  AudioEngine: class {
    readonly record: { context: unknown; calls: string[]; document: unknown };
    constructor(options: { context: unknown }) {
      this.record = { context: options.context, calls: [], document: null };
      made.push(this.record);
    }
    // Never settles: anything that waited on it would never play.
    initialize(): Promise<void> {
      this.record.calls.push('initialize');
      return new Promise(() => {});
    }
    loadCues(document: unknown): void {
      this.record.calls.push('loadCues');
      this.record.document = document;
    }
    playCue(name: string): void {
      this.record.calls.push(`playCue ${name}`);
    }
    setCuesMuted(): void {
      this.record.calls.push('setCuesMuted');
    }
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  made.length = 0;
});

const played = () =>
  made.flatMap((m) => m.calls).filter((c) => c.startsWith('playCue'));

describe('the lifecycle it keeps', () => {
  test('makes nothing until the first cue', () => {
    const { contexts } = installFakeAudio();
    new SoundscapeAudioEngine();
    expect(contexts).toHaveLength(0);
    expect(made).toHaveLength(0);
  });

  test('the first cue makes the context, resumes it, and plays at once', () => {
    const { contexts } = installFakeAudio();
    new SoundscapeAudioEngine().tick();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resumes).toBe(1);
    expect(made).toHaveLength(1);
    expect(made[0]!.context).toBe(contexts[0]);
    // initialize() never settles here, and the cue still plays in this call
    expect(made[0]!.calls).toEqual(['initialize', 'loadCues', 'playCue tick']);
    const committed = JSON.parse(
      readFileSync(resolve(__dirname, 'peach.cues.json'), 'utf8'),
    );
    expect(made[0]!.document).toEqual(committed);
  });

  test('resumes again whenever the browser has suspended the context, and only then', () => {
    const { contexts } = installFakeAudio();
    const engine = new SoundscapeAudioEngine();
    engine.tick();
    engine.tick();
    expect(contexts[0]!.resumes).toBe(1);
    contexts[0]!.state = 'suspended';
    engine.playInvalid();
    expect(contexts[0]!.resumes).toBe(2);
    expect(contexts).toHaveLength(1);
  });

  test('while muted, makes nothing and plays nothing', () => {
    const { contexts } = installFakeAudio();
    const engine = new SoundscapeAudioEngine();
    engine.setMuted(true);
    engine.tick();
    engine.playEdition();
    expect(contexts).toHaveLength(0);
    expect(made).toHaveLength(0);
    engine.setMuted(false);
    engine.playEdition();
    expect(played()).toEqual(['playCue edition']);
  });

  test('muting does not cut a cue already ringing', () => {
    installFakeAudio();
    const engine = new SoundscapeAudioEngine();
    engine.playEdition();
    engine.setMuted(true);
    expect(made[0]!.calls).not.toContain('setCuesMuted');
    expect(engine.muted).toBe(true);
  });

  test('stays silent where there is no Web Audio, rather than throwing', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const engine = new SoundscapeAudioEngine();
    expect(() => engine.tick()).not.toThrow();
    expect(made).toHaveLength(0);
  });

  test("falls back to Safari's prefixed webkitAudioContext", () => {
    const contexts: FakeAudioContext[] = [];
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal(
      'webkitAudioContext',
      class extends FakeAudioContext {
        constructor() {
          super();
          contexts.push(this);
        }
      },
    );
    new SoundscapeAudioEngine().tick();
    expect(contexts).toHaveLength(1);
    expect(played()).toEqual(['playCue tick']);
  });

  test('plays into a context it is given, and never resumes that one', () => {
    const context = new FakeAudioContext();
    new SoundscapeAudioEngine(context as unknown as BaseAudioContext).tick();
    expect(made[0]!.context).toBe(context);
    expect(context.resumes).toBe(0);
  });
});

describe('the cue each call plays', () => {
  test('every sound on the /sounds page plays the cue of the same name', () => {
    installFakeAudio();
    for (const sound of SOUNDS) {
      made.length = 0;
      sound.play(new SoundscapeAudioEngine());
      expect(played(), sound.id).toEqual([`playCue ${sound.id}`]);
    }
  });

  test('a length outside 3 to 8 plays the nearest found note, as before', () => {
    installFakeAudio();
    const engine = new SoundscapeAudioEngine();
    engine.playFound(2);
    engine.playFound(-1, 'uncommon');
    engine.playFound(20, 'rare');
    expect(played()).toEqual([
      'playCue found-3-set',
      'playCue found-3-uncommon',
      'playCue found-8-rare',
    ]);
  });

  test('plays a mythic word in the theme it was given, cute until it is told', () => {
    installFakeAudio();
    const engine = new SoundscapeAudioEngine();
    engine.playFound(5, 'mythic');
    engine.setTheme('letterpress');
    engine.playFound(5, 'mythic');
    engine.playFound(5, 'rare');
    expect(played()).toEqual([
      'playCue found-5-mythic-cute',
      'playCue found-5-mythic-letterpress',
      'playCue found-5-rare',
    ]);
  });
});
