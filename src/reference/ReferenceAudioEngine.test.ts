import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Rung } from '@/engine/index.ts';
import type { AudioEngine } from '@/audio/AudioEngine.ts';
import { MASTER_GAIN, ReferenceAudioEngine } from './ReferenceAudioEngine.ts';
import {
  FakeAudioContext,
  describeContext,
  describeNotes,
  installFakeAudio,
} from '@/testing/fakeAudioContext.ts';

/**
 * The reference engine, the way the game built it before Soundscape:
 * `new ReferenceAudioEngine()`, no arguments, finding its AudioContext on
 * window. The describe and test names below are the ones the snapshot was
 * recorded under, kept so the snapshot stays byte for byte as recorded.
 *
 * The snapshot was written against the engine as it stood on main (7073354),
 * before this branch touched it, so "the same as before" is a recorded fact,
 * not a claim. Update it with -u only for a change to the sound that is meant.
 * Every oscillator is pinned: its waveform, frequency, start, stop, the gain
 * envelope it passes through, and the master it lands in. So is the context's
 * own setup, the master level and the resume on the first cue.
 *
 * The inputs are written out by hand rather than taken from the engine's tables,
 * so a change to a table shows up here as a changed sound instead of quietly
 * moving the inputs along with it. The lengths outside 3 to 8, the omitted rung
 * and the absent theme pin the edges the game can reach without meaning to.
 */
type Theme = 'cute' | 'letterpress' | undefined;

const RUNGS: readonly Rung[] = ['set', 'uncommon', 'rare', 'mythic'];

const CALLS: [label: string, theme: Theme, play: (e: AudioEngine) => void][] = [
  ...[3, 4, 5, 6, 7, 8].flatMap((length) =>
    RUNGS.flatMap((rung) =>
      (rung === 'mythic'
        ? (['letterpress', 'cute'] as const)
        : (['cute'] as const)
      ).map((theme): [string, Theme, (e: AudioEngine) => void] => [
        `playFound(${length}, '${rung}') in ${theme}`,
        theme,
        (e) => e.playFound(length, rung),
      ]),
    ),
  ),
  ['playFound(2) with no rung, in cute', 'cute', (e) => e.playFound(2)],
  ['playFound(9, rare) in cute', 'cute', (e) => e.playFound(9, 'rare')],
  [
    'playFound(5, mythic) with no theme set',
    undefined,
    (e) => e.playFound(5, 'mythic'),
  ],
  ['playSource()', 'cute', (e) => e.playSource()],
  ['playEdition()', 'cute', (e) => e.playEdition()],
  ['playInvalid()', 'cute', (e) => e.playInvalid()],
  ['tick()', 'cute', (e) => e.tick()],
];

/** The engine, told the call's theme if it has one, as the game's is told. */
function inTheme(engine: AudioEngine, theme: Theme): AudioEngine {
  if (theme !== undefined) engine.setTheme(theme);
  return engine;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('the no-argument engine the game builds', () => {
  test.each(CALLS)('%s schedules what it did before', (_label, theme, play) => {
    const { contexts } = installFakeAudio();
    play(inTheme(new ReferenceAudioEngine(), theme));

    expect(contexts).toHaveLength(1);
    const [ctx] = contexts;
    expect({
      context: describeContext(ctx!),
      notes: describeNotes(ctx!),
    }).toMatchSnapshot();
  });

  test('makes no context until the first cue', () => {
    const { contexts } = installFakeAudio();
    new ReferenceAudioEngine();
    expect(contexts).toHaveLength(0);
  });

  test('makes no context and schedules nothing while muted', () => {
    const { contexts } = installFakeAudio();
    const engine = new ReferenceAudioEngine();
    engine.setMuted(true);
    for (const [, theme, play] of CALLS) play(inTheme(engine, theme));
    expect(contexts).toHaveLength(0);
  });

  test('reuses one context, and resumes it only while it is suspended', () => {
    const { contexts } = installFakeAudio();
    const engine = new ReferenceAudioEngine();
    engine.tick();
    engine.tick();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resumes).toBe(1);
  });
});

/**
 * The offline path the sound baseline is rendered through. Whatever it records
 * is only a record of the game if it schedules what the game's path does, so
 * every call above is played both ways and the notes compared.
 */
describe('an engine given a context', () => {
  const given = () => {
    const ctx = new FakeAudioContext();
    return {
      ctx,
      engine: new ReferenceAudioEngine(ctx as unknown as AudioContext),
    };
  };

  test.each(CALLS)(
    '%s schedules the same notes as the game',
    (_l, theme, play) => {
      const { contexts } = installFakeAudio();
      play(inTheme(new ReferenceAudioEngine(), theme));
      const { ctx, engine } = given();
      play(inTheme(engine, theme));

      expect(describeNotes(ctx)).toEqual(describeNotes(contexts[0]!));
    },
  );

  test('builds its master on the given context at the same level', () => {
    const { ctx, engine } = given();
    engine.playSource();
    expect(describeContext(ctx)).toBe(
      `resumed 0 time(s), master gain ${MASTER_GAIN} [] to destination`,
    );
  });

  test('makes no context of its own, and never resumes the one it was given', () => {
    const { contexts } = installFakeAudio();
    const { ctx, engine } = given();
    engine.tick();
    engine.playEdition();
    expect(contexts).toHaveLength(0);
    expect(ctx.resumes).toBe(0);
  });

  test('stays silent on the given context while muted', () => {
    const { ctx, engine } = given();
    engine.setMuted(true);
    for (const [, theme, play] of CALLS) play(inTheme(engine, theme));
    expect(ctx.oscillators).toHaveLength(0);
  });
});

/**
 * The theme reaches the engine the way it reaches the game's: setTheme. The
 * page's theme is not read, so the engine sounds the same whatever the page
 * says, and with none given it plays as it did with no theme on the page.
 */
describe('the theme', () => {
  /** The frequencies a mythic length-5 cue plays, in a theme and a page. */
  const mythicFive = (
    given: 'cute' | 'letterpress' | undefined,
    page: string,
  ) => {
    document.documentElement.dataset.theme = page;
    const ctx = new FakeAudioContext();
    const engine = new ReferenceAudioEngine(ctx as unknown as AudioContext);
    if (given) engine.setTheme(given);
    engine.playFound(5, 'mythic');
    return ctx.oscillators.map((o) => o.frequency.value);
  };
  const CUTE_GLINT = 523.25 * 5;

  test('is never read from the page: given none, a cute page adds no glint', () => {
    expect(mythicFive(undefined, 'cute')).not.toContain(CUTE_GLINT);
  });

  test('is the one it was given, whatever the page says', () => {
    expect(mythicFive('cute', 'letterpress')).toContain(CUTE_GLINT);
    expect(mythicFive('letterpress', 'cute')).not.toContain(CUTE_GLINT);
  });
});
