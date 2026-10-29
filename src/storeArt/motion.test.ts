import { describe, expect, it } from 'vitest';
import { GROWTH_STAGES } from './growthStages.ts';
import {
  AAC_FRAME,
  ARRIVALS,
  BEATS,
  FADE_AT,
  FADE_S,
  FRAME_RATES,
  LARGEST_SCALE,
  LOOP_S,
  SAMPLE_RATE,
  SETTLED_S,
  peachAt,
  spring,
} from './motion.ts';

/** Each layer's opacity and scale at `t`, by key. */
const state = (t: number) =>
  Object.fromEntries(peachAt(t).map((l) => [l.key, [l.opacity, l.scale]]));

/** The keys drawn at all at `t`. */
const shown = (t: number) =>
  peachAt(t)
    .filter((l) => l.opacity > 0)
    .map((l) => l.key);

describe('the store art in motion', () => {
  it('takes the loop as a whole number of video frames and AAC frames', () => {
    for (const fps of FRAME_RATES) {
      const frames = LOOP_S * fps;
      expect(Math.abs(frames - Math.round(frames))).toBeLessThan(1e-9);
    }
    const aac = (LOOP_S * SAMPLE_RATE) / AAC_FRAME;
    expect(Math.abs(aac - Math.round(aac))).toBeLessThan(1e-9);
  });

  it('lasts between 8 and 12 seconds, with every stage in it', () => {
    expect(LOOP_S).toBeGreaterThanOrEqual(8);
    expect(LOOP_S).toBeLessThanOrEqual(12);
    expect(ARRIVALS.length).toBe(GROWTH_STAGES.length);
    expect(FADE_AT + FADE_S).toBeLessThan(LOOP_S);
  });

  it('changes no more than three times a second', () => {
    const changes = [...ARRIVALS, FADE_AT];
    for (let i = 1; i < changes.length; i++)
      expect(changes[i]! - changes[i - 1]!).toBeGreaterThanOrEqual(1 / 3);
  });

  it('springs as the title does, and settles', () => {
    expect(spring(0)).toBe(0);
    expect(spring(SETTLED_S)).toBe(1);
    // Within 2e-5 of rest where it is called settled, so nothing jumps there.
    expect(Math.abs(1 - spring(SETTLED_S - 1e-9))).toBeLessThan(2e-5);
    expect(LARGEST_SCALE).toBeGreaterThan(1);
    expect(LARGEST_SCALE).toBeLessThan(1.002);
  });

  it('starts and ends on the empty soil', () => {
    expect(shown(0)).toEqual(['soil']);
    expect(shown(LOOP_S - 1e-6)).toEqual(['soil']);
    expect(state(LOOP_S)).toEqual(state(0));
  });

  it.each(GROWTH_STAGES.map((s, i) => [s.id, i] as const))(
    'shows %s alone, whole, once it has settled',
    (id, i) => {
      const t = ARRIVALS[i]! + SETTLED_S;
      const expected = id === 'first-sprout' ? ['soil', id] : [id];
      expect(shown(t)).toEqual(expected);
      for (const l of peachAt(t).filter((l) => l.opacity > 0))
        expect([l.opacity, l.scale]).toEqual([1, 1]);
    },
  );

  it('never jumps, not even where the loop joins', () => {
    // A frame at 240 fps apart from the next; the steepest the spring moves
    // in that time is about a tenth.
    const step = 1 / 240;
    let worst = 0;
    for (let t = -1; t <= LOOP_S + 1; t += step) {
      const a = peachAt(t);
      const b = peachAt(t + step);
      a.forEach((l, i) => {
        const next = b[i]!;
        worst = Math.max(worst, Math.abs(l.opacity - next.opacity));
        // A layer's size only shows while it does: a stage gone at the end
        // of the loop is back at 0.8 for its next arrival, unseen.
        if (l.opacity > 0 || next.opacity > 0)
          worst = Math.max(worst, Math.abs(l.scale - next.scale));
      });
    }
    expect(worst).toBeLessThan(0.15);
  });

  it('plays a rising find as each stage arrives, then the basket as the crown lands', () => {
    expect(BEATS.map((b) => b.stage)).toEqual(GROWTH_STAGES.map((s) => s.id));
    expect(BEATS.map((b) => b.at)).toEqual(ARRIVALS);
    const finds = BEATS.filter((b) => b.call === 'found');
    expect(finds.map((b) => b.length)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(BEATS.at(-1)).toMatchObject({ stage: 'crown', call: 'edition' });
  });
});
