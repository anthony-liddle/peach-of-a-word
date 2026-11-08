import { describe, expect, test } from 'vitest';
import { server } from 'vitest/browser';
import {
  AudioEngine as Soundscape,
  validateCueDocument,
  type CueDocument,
} from 'soundscape-engine';
import { MIXES, factor, mixDocument, type MixId } from './mixes.ts';
import { LEVELS } from './mixLevels.ts';
import { BALANCE } from './balance.ts';
import { lengthOf } from './pair.ts';
import { momentaryLoudness, truePeak } from '../../scripts/lib/loudness.ts';

/**
 * The three mixes on the sounds page, played by Soundscape in this browser:
 * each is today's sound times its gains, sample for sample; each shows the
 * numbers this browser measures; and no pile-up of sounds the game can make
 * passes -1 dBTP in any of them.
 */
const RATE = 48000;
const docs = new Map<MixId, CueDocument>(
  MIXES.map((m) => [m.id, mixDocument(m)]),
);

interface Hit {
  cue: string;
  /** Frames from the start. */
  at: number;
}

/** The hits through one engine, offline, from frame 0, as the game plays them. */
async function render(
  mix: MixId,
  hits: Hit[],
  seconds: number,
): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  const engine = new Soundscape({ context });
  void engine.initialize();
  engine.loadCues(docs.get(mix)!);
  for (const { cue, at } of hits) engine.playCue(cue, at / RATE);
  return Float32Array.from((await context.startRendering()).getChannelData(0));
}

const alone = (mix: MixId, cue: string) =>
  render(mix, [{ cue, at: 0 }], lengthOf(cue) + 0.05);

/** The cue file's instrument for each cue: every note of a cue shares one. */
const instrumentOf = (cue: string): string =>
  docs.get('today')!.cues[cue]!.notes[0]!.instrument;

describe(`the three mixes, in ${server.browser}`, () => {
  test("each is a valid cue document, and today is the game's own file", () => {
    for (const doc of docs.values())
      expect(validateCueDocument(doc).ok).toBe(true);
    expect(docs.get('today')).toEqual(
      mixDocument({ id: 'today', title: '', line: '', gains: {} }),
    );
  });

  test("each mix is today's sound times its gain, every cue, sample for sample", async () => {
    let worst = 0;
    for (const cue of Object.keys(docs.get('today')!.cues)) {
      const today = await alone('today', cue);
      for (const mix of MIXES.filter((m) => m.id !== 'today')) {
        const k = factor(
          mix.gains[instrumentOf(cue) as keyof typeof mix.gains] ?? 0,
        );
        const mixed = await alone(mix.id, cue);
        let peak = 0;
        let diff = 0;
        for (let i = 0; i < today.length; i++) {
          peak = Math.max(peak, Math.abs(k * today[i]!));
          diff = Math.max(diff, Math.abs(mixed[i]! - k * today[i]!));
        }
        worst = Math.max(worst, diff / peak);
      }
    }
    // Float32 rounding: about 2e-7 of the peak in every browser
    expect(worst).toBeLessThan(1e-6);
  });

  test('shows the numbers this browser measures, within 0.15 dB', async () => {
    for (const mix of MIXES)
      for (const row of LEVELS[mix.id].rows) {
        const x = await alone(mix.id, row.cue);
        expect(Math.abs(truePeak(x) - row.dbtp)).toBeLessThan(0.15);
        expect(Math.abs(momentaryLoudness(x, RATE) - row.lufs)).toBeLessThan(
          0.15,
        );
      }
  });

  /**
   * The worst stack of each new mix, found by searching every offset of every
   * stack in every renderer: the full basket, a length 8 find landing 501 ms
   * into it, on the web's 128-frame grid, and two taps in one audio cycle 13
   * ms after that, which starts them on the same frame, so they sum exactly.
   */
  const worst = (mix: MixId) =>
    render(
      mix,
      [
        { cue: 'edition', at: 0 },
        { cue: 'found-8-mythic-cute', at: 24064 },
        { cue: 'tick', at: 24687 },
        { cue: 'tick', at: 24687 },
      ],
      1.8,
    );

  test('the worst pile-up of either new mix stays under -1 dBTP, and is what binds it', async () => {
    for (const mix of ['raised', 'closer'] as const) {
      const tp = truePeak(await worst(mix));
      expect(tp).toBeLessThanOrEqual(-1);
      // Within 0.3 dB of the ceiling: if this ever reads far under, the stack
      // named here is no longer the one that sets the mix
      expect(tp).toBeGreaterThan(-1.3);
      expect(tp).toBeLessThanOrEqual(LEVELS[mix].worst + 0.05);
    }
  });

  test('the game played fast stays under -1 dBTP in every mix: typing, rolls, Shuffles and a held Enter', async () => {
    const tick = (n: number, every: number, from = 0): Hit[] =>
      Array.from({ length: n }, (_, i) => ({
        cue: 'tick',
        at: from + Math.round(i * every * RATE),
      }));
    const scenes: Hit[][] = [
      // Typing at 20 letters a second, with three keys in one cycle at the end
      [...tick(20, 0.05), ...tick(3, 0, Math.round(1.0 * RATE))],
      // Ten Shuffles 60 ms apart, a tap landing on each
      Array.from({ length: 10 }, (_, i) => [
        { cue: 'shuffle', at: Math.round(i * 0.06 * RATE) },
        { cue: 'tick', at: Math.round(i * 0.06 * RATE) },
      ]).flat(),
      // Enter held: a miss every 30 ms for a second
      Array.from({ length: 34 }, (_, i) => ({
        cue: 'invalid',
        at: Math.round(i * 0.03 * RATE),
      })),
      // Every find landing on a roll, 128 frames apart
      Object.keys(docs.get('today')!.cues)
        .filter((c) => c.startsWith('found-'))
        .flatMap((cue, i) => [
          { cue, at: i * RATE * 0.4 },
          ...tick(2, 0, i * RATE * 0.4 + 128),
        ]),
    ];
    for (const mix of MIXES)
      for (const scene of scenes) {
        const end = Math.max(...scene.map((h) => h.at)) / RATE + 0.4;
        expect(truePeak(await render(mix.id, scene, end))).toBeLessThan(-1);
      }
  });

  test('the balance itself, as the page plays it, stays under -1 dBTP', async () => {
    for (const mix of MIXES) {
      const x = await render(
        mix.id,
        BALANCE.map((b) => ({ cue: b.cue, at: Math.round(b.at * RATE) })),
        BALANCE[BALANCE.length - 1]!.at + 1.8,
      );
      expect(truePeak(x)).toBeLessThan(-1);
    }
  });
});
