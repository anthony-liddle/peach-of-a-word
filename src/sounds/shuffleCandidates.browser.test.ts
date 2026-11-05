import { describe, expect, test } from 'vitest';
import { server } from 'vitest/browser';
import { AudioEngine as Soundscape } from 'soundscape-engine';
import cues from '@/audio/peach.cues.json';
import { measure } from '../../scripts/lib/soundMeasure.ts';
import { momentaryLoudness, periodicity } from '../../scripts/lib/loudness.ts';
import {
  CANDIDATE_CUES,
  CANDIDATES,
  TAKES,
  TEN_GAP_S,
  TILE_TAP_CUE,
  cueName,
  tenInTurn,
} from './shuffleCandidates.ts';
import { HEARD, type Heard } from './shuffleNumbers.ts';

/**
 * The Shuffle candidates, rendered offline through Soundscape beside the
 * game's own tick and a find, in the same browser at the same rate, and held
 * to the brief: well under a quarter of a second, no louder than the tick in
 * peak or in loudness, and no pitch to speak of. Ten presses in a row, as
 * fast as the page's button plays them, peak no higher than one.
 *
 * The numbers the page prints beside each candidate are checked here too, in
 * every browser, so the page cannot say what the render does not.
 */
const RATE = 48000;
const SECONDS = 2;
/** Where each cue starts in its render: past the first quantum, on none's edge. */
const AT = 0.1;

/** One render: each cue in `plays` on one engine, each at its time. */
async function render(
  document: unknown,
  plays: { cue: string; at: number }[],
): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, SECONDS * RATE, RATE);
  const engine = new Soundscape({ context });
  void engine.initialize();
  engine.loadCues(document);
  for (const { cue, at } of plays) engine.playCue(cue, at);
  return Float32Array.from((await context.startRendering()).getChannelData(0));
}

interface Reading extends Heard {
  /** YIN's deepest dip over the first 40 ms: under 0.1 is a pitch. */
  periodicity: number;
  stopS: number;
}

async function heard(document: unknown, cue: string): Promise<Reading> {
  const x = await render(document, [{ cue, at: AT }]);
  const m = measure(x.subarray(Math.round(AT * RATE)), RATE);
  return {
    durationMs: m.duration * 1000,
    peakDbfs: m.peakDbfs,
    lufs: momentaryLoudness(x, RATE),
    periodicity: periodicity(x, RATE, AT + m.onset, Math.min(0.04, m.duration)),
    stopS: m.stop,
  };
}

/** A candidate's takes, read as the page reports them: the longest, the highest peak, the loudest. */
function most(readings: Reading[]): Reading {
  return {
    durationMs: Math.max(...readings.map((r) => r.durationMs)),
    peakDbfs: Math.max(...readings.map((r) => r.peakDbfs)),
    lufs: Math.max(...readings.map((r) => r.lufs)),
    periodicity: Math.min(...readings.map((r) => r.periodicity)),
    stopS: Math.max(...readings.map((r) => r.stopS)),
  };
}

const peak = (x: Float32Array) =>
  x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Within a rounding step and a little: the page prints a tenth of a dB, and a millisecond. */
function printedAs(reading: Heard, printed: Heard) {
  expect(Math.abs(reading.durationMs - printed.durationMs)).toBeLessThan(1);
  expect(Math.abs(reading.peakDbfs - printed.peakDbfs)).toBeLessThan(0.15);
  expect(Math.abs(reading.lufs - printed.lufs)).toBeLessThan(0.15);
}

describe(`the candidates, in ${server.browser}`, () => {
  test('the tick and the find read as the page says', async () => {
    const tick = await heard(cues, 'tick');
    const find = await heard(cues, 'found-5-set');
    console.log(JSON.stringify({ tick, find }));
    printedAs(tick, HEARD.tick!);
    printedAs(find, HEARD.find!);
  });

  test("the tile tap the page plays to compare is the game's tick, exactly", async () => {
    const game = await render(cues, [{ cue: 'tick', at: AT }]);
    const copy = await render(CANDIDATE_CUES, [{ cue: TILE_TAP_CUE, at: AT }]);
    expect(copy).toEqual(game);
  });

  for (const candidate of CANDIDATES.filter((c) => c.role === 'shuffle')) {
    test(`${candidate.label}: short, under the tick, with no pitch, and as the page says`, async () => {
      const tick = await heard(cues, 'tick');
      const readings: Reading[] = [];
      for (let take = 0; take < TAKES; take++)
        readings.push(await heard(CANDIDATE_CUES, cueName(candidate, take)));
      const all = most(readings);
      console.log(candidate.id, JSON.stringify({ readings, most: all }));

      // Well under a quarter of a second, to the last partial's stop
      expect(all.stopS).toBeLessThan(0.16);
      // No louder than the tick, in peak or in loudness, take for take
      for (const r of readings) {
        expect(r.peakDbfs).toBeLessThan(tick.peakDbfs);
        expect(r.lufs).toBeLessThan(tick.lufs);
      }
      // No pitch to speak of: the tick, a square at 880 Hz, dips to about
      // 0.12 over its 19 ms; a candidate stays well above that
      expect(all.periodicity).toBeGreaterThan(0.25);
      printedAs(all, HEARD[candidate.id]!);
    });
  }

  for (const candidate of CANDIDATES.filter((c) => c.role === 'tap')) {
    test(`${candidate.label}: no longer than the tick, as loud and no louder, and as the page says`, async () => {
      const tick = await heard(cues, 'tick');
      const readings: Reading[] = [];
      for (let take = 0; take < TAKES; take++)
        readings.push(await heard(CANDIDATE_CUES, cueName(candidate, take)));
      const all = most(readings);
      console.log(candidate.id, JSON.stringify({ tick, readings, most: all }));

      expect(all.stopS).toBeLessThanOrEqual(tick.stopS);
      expect(all.durationMs).toBeLessThanOrEqual(tick.durationMs);
      // Matched to the tick's loudness: the loudest take within half a dB
      // under it, and none over
      for (const r of readings) expect(r.lufs).toBeLessThan(tick.lufs);
      expect(all.lufs).toBeGreaterThan(tick.lufs - 0.5);
      printedAs(all, HEARD[candidate.id]!);
    });
  }

  for (const candidate of CANDIDATES) {
    test(`${candidate.label}: ten presses in a row peak no higher than one`, async () => {
      let loudest = 0;
      for (let take = 0; take < TAKES; take++) {
        const solo = await render(CANDIDATE_CUES, [
          { cue: cueName(candidate, take), at: AT },
        ]);
        loudest = Math.max(loudest, peak(solo));
      }
      const ten = await render(
        CANDIDATE_CUES,
        tenInTurn(candidate).map((cue, i) => ({
          cue,
          at: AT + i * TEN_GAP_S,
        })),
      );
      console.log(
        candidate.id,
        'ten in turn',
        JSON.stringify({
          peakDbfs: 20 * Math.log10(peak(ten)),
          lufs: momentaryLoudness(ten, RATE),
        }),
      );
      // The loudest single take, to within 0.1 dB: nothing stacks. D's last
      // partials still sound at the envelope's floor, about 95 dB down, when
      // the next press begins 125 ms later, which adds 0.015 dB to its peak.
      expect(peak(ten)).toBeLessThanOrEqual(loudest * 10 ** (0.1 / 20));
    });
  }
});
