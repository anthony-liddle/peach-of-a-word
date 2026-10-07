import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { server } from 'vitest/browser';
import { SOUNDS, type Sound } from '@/sounds/inventory.ts';
import { lengthOf } from '@/sounds/pair.ts';
import type { AudioEngine } from './AudioEngine.ts';
import { SoundscapeAudioEngine } from './SoundscapeAudioEngine.ts';
import { ReferenceAudioEngine } from '@/reference/ReferenceAudioEngine.ts';
import fixture from './baseline/sounds.json';
import {
  PAIR_SPLIT_S,
  measure,
  type Measurement,
} from '../../scripts/lib/soundMeasure.ts';
import { spreadBetween } from '../../scripts/lib/renderSpread.ts';

/**
 * Every sound the game makes, as its Soundscape cue and through the game's
 * previous engine, rendered offline in the same browser in the same run and
 * compared sample by sample: in Chromium, Firefox and WebKit.
 *
 * Each sound starts four times, in four power-of-two ranges up to 8 to 16 s:
 * a time is rounded to float32 inside the renderer, by an amount that grows
 * with its size, so a cue that matches at 0.1 s need not at 10 s. In Chromium
 * each cue is also measured as the frozen fixture was, against the fixture,
 * beside the old engine measured the same way as a control.
 */
const RATE = 48000;
/**
 * Where each pass over a group of sounds starts, on a render quantum, so its
 * sounds start in [0.125, 2), then [2, 4), [4, 8) and [8, 16).
 */
const PASSES = [48, 751, 1501, 3001].map((quanta) => (quanta * 128) / RATE);
/** Silence after each sound, so one that runs long shows in its own row. */
const GAP_S = 0.2;
/** How long a group can last, end to end, and still end before the next pass. */
const ROOM_S = PASSES[1]! - PASSES[0]!;
/**
 * About ten times the largest difference any browser showed when this was
 * written, 9e-8 in Chromium and 6e-8 in Firefox and WebKit, which is the size
 * of float32 rounding. A cue with one interval a semitone wrong differs by
 * about 0.28.
 */
const TOLERANCE = 1e-6;

type Make = (context: BaseAudioContext) => AudioEngine;
const soundscape: Make = (c) => new SoundscapeAudioEngine(c);
const game: Make = (c) => new ReferenceAudioEngine(c as AudioContext);

interface Play {
  sound: Sound;
  at: number;
}

/**
 * One engine plays every sound in `plays`, each when the context's clock reads
 * its `at`. Both engines schedule from currentTime, as the game does, so the
 * clock is moved to each sound in turn while it is scheduled.
 */
async function render(make: Make, plays: Play[], seconds: number) {
  let now = 0;
  const context = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  Object.defineProperty(context, 'currentTime', { get: () => now });
  const engine = make(context);
  for (const { sound, at } of plays) {
    now = at;
    sound.play(engine);
  }
  // Copied, so nothing holds the context or its engine once this returns
  return Float32Array.from((await context.startRendering()).getChannelData(0));
}

/**
 * The sounds in groups that each fit between two passes, longest first. One
 * engine plays a whole group, as the game's one engine plays every sound. An
 * engine for each render held WebKit on Linux to about 70 renders: each
 * engine's effect chains and worklet take about 68 MB there, which the page
 * does not get back before the next.
 */
const GROUPS: Sound[][] = (() => {
  const groups: { sounds: Sound[]; used: number }[] = [];
  const longestFirst = [...SOUNDS].sort(
    (a, b) => lengthOf(b.id) - lengthOf(a.id),
  );
  for (const sound of longestFirst) {
    const needs = lengthOf(sound.id) + GAP_S;
    const room = groups.find((g) => g.used + needs <= ROOM_S);
    if (room) {
      room.sounds.push(sound);
      room.used += needs;
    } else groups.push({ sounds: [sound], used: needs });
  }
  return groups.map((g) => g.sounds);
})();

/** A group's sounds one after another, in each pass, in the order they play. */
function passesOver(group: Sound[]): Play[] {
  return PASSES.flatMap((pass) => {
    let at = pass;
    return group.map((sound) => {
      const play = { sound, at };
      at += lengthOf(sound.id) + GAP_S;
      return play;
    });
  });
}

/** The largest difference between the two, and the old engine's peak. */
function compare(
  cue: Float32Array,
  old: Float32Array,
  from: number,
  to: number,
) {
  let largest = 0;
  let peak = 0;
  for (let i = from; i < to; i++) {
    largest = Math.max(largest, Math.abs((cue[i] ?? 0) - (old[i] ?? 0)));
    peak = Math.max(peak, Math.abs(old[i] ?? 0));
  }
  return { largest, peak };
}

describe(`every sound's cue against the game's engine, in this browser`, () => {
  // The largest difference any sound showed, to set TOLERANCE by
  let worst = { largest: 0, at: '' };
  afterAll(() => {
    console.log(
      `${server.browser}, ${navigator.userAgent}: largest difference ${worst.largest}, ${worst.at}; ${GROUPS.length} engines of each kind`,
    );
  });

  test('covers every sound the game makes, each once in a group', () => {
    expect(SOUNDS).toHaveLength(34);
    expect(
      GROUPS.flat()
        .map((s) => s.id)
        .sort(),
    ).toEqual(SOUNDS.map((s) => s.id).sort());
  });

  for (const [g, group] of GROUPS.entries()) {
    describe(`group ${g + 1} of ${GROUPS.length}`, () => {
      const plays = passesOver(group);
      const seconds = PASSES.at(-1)! + ROOM_S;
      let cue = new Float32Array();
      let old = new Float32Array();
      beforeAll(async () => {
        cue = await render(soundscape, plays, seconds);
        old = await render(game, plays, seconds);
      });

      for (const [k, { sound, at }] of plays.entries()) {
        test(`${sound.id} at ${at.toFixed(3)} s`, () => {
          // Each row runs from its sound's start to the next one's, the first
          // from 0 and the last to the end, so every sample is in one row
          const next = plays[k + 1];
          const from = k === 0 ? 0 : Math.round(at * RATE);
          const to = next ? Math.round(next.at * RATE) : cue.length;
          const { largest, peak } = compare(cue, old, from, to);
          if (largest > worst.largest)
            worst = { largest, at: `${sound.id} at ${at} s` };
          // The quietest sound, the tick, peaks at about 0.02
          expect(peak).toBeGreaterThan(0.01);
          expect(largest).toBeLessThan(TOLERANCE);
        });
      }
    });
  }
});

/**
 * The fixture was captured in Chrome 154 by rendering each sound from time 0
 * for 2 s, trimming it where the oscillators stop, and measuring that; the
 * rejected guess also note by note. The same here, through each engine.
 */
async function measured(make: Make, sound: Sound): Promise<Measurement> {
  const options =
    sound.cue === 'playInvalid' ? { pairSplitS: PAIR_SPLIT_S } : {};
  const full = await render(make, [{ sound, at: 0 }], 2);
  const first = measure(full, RATE, options);
  return measure(
    full.subarray(0, Math.round(first.stop * RATE)),
    RATE,
    options,
  );
}

function withinFixture(id: string, m: Measurement): string[] {
  const allow = fixture.tolerance.allow;
  const s = spreadBetween(
    fixture.sounds[id as keyof typeof fixture.sounds] as unknown as Measurement,
    m,
  );
  const out: string[] = [];
  if (s.seconds > allow.seconds) out.push(`seconds ${s.seconds}`);
  if (s.db > allow.db) out.push(`dB ${s.db}`);
  if (s.hz > allow.hz) out.push(`Hz ${s.hz}`);
  if (s.windowDbfs > allow.db) out.push(`window dBFS ${s.windowDbfs}`);
  if (s.partialHz > allow.partialHz) out.push(`partial Hz ${s.partialHz}`);
  if (s.partialDb > allow.partialDb) out.push(`partial dB ${s.partialDb}`);
  if (s.membershipChanges)
    out.push(`${s.membershipChanges} partials came or went`);
  if (s.strongestChanges)
    out.push(`${s.strongestChanges} windows changed their strongest`);
  return out;
}

describe.runIf(server.browser === 'chromium')(
  "every sound's cue against the frozen fixture, in Chromium",
  () => {
    for (const sound of SOUNDS) {
      test(`${sound.id}: the old engine, as a control, then the cue`, async () => {
        // If the control misses, this Chromium is not the one the fixture was
        // captured in, and a miss below says nothing about the cue
        expect(
          withinFixture(sound.id, await measured(game, sound)),
          'control',
        ).toEqual([]);
        expect(
          withinFixture(sound.id, await measured(soundscape, sound)),
          'cue',
        ).toEqual([]);
      });
    }
  },
);
