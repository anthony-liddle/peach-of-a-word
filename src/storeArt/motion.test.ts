import { describe, expect, it } from 'vitest';
import { GROWTH_STAGES } from './growthStages.ts';
import {
  AAC_FRAME,
  ARRIVALS,
  BEATS,
  FRAME_RATES,
  LARGEST_SCALE,
  LOOP_S,
  type Layer,
  PEACH_BOX,
  RETURN_AT,
  SAMPLE_RATE,
  SETTLED_S,
  SINK_S,
  SOIL_S,
  START_AT,
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
    for (const fps of FRAME_RATES)
      for (const at of [LOOP_S, START_AT, RETURN_AT, RETURN_AT + SINK_S]) {
        const frames = at * fps;
        expect(Math.abs(frames - Math.round(frames))).toBeLessThan(1e-9);
      }
    const aac = (LOOP_S * SAMPLE_RATE) / AAC_FRAME;
    expect(Math.abs(aac - Math.round(aac))).toBeLessThan(1e-9);
  });

  it('lasts between 8 and 12 seconds, with every stage in it', () => {
    expect(LOOP_S).toBeGreaterThanOrEqual(8);
    expect(LOOP_S).toBeLessThanOrEqual(12);
    expect(ARRIVALS.length).toBe(GROWTH_STAGES.length);
    expect(RETURN_AT + SINK_S + SOIL_S).toBeLessThan(LOOP_S);
  });

  it('changes no more than three times a second', () => {
    const changes = [
      ...ARRIVALS,
      RETURN_AT,
      RETURN_AT + SINK_S,
      LOOP_S + ARRIVALS[0]!,
    ];
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

  it('starts each file on the crown, settled, alone and still, before it sinks', () => {
    expect(START_AT).toBeGreaterThanOrEqual(ARRIVALS.at(-1)! + SETTLED_S);
    expect(START_AT).toBeLessThan(RETURN_AT);
    expect(shown(START_AT)).toEqual(['crown']);
    expect(state(START_AT).crown).toEqual([1, 1]);
    // So the file's last frame, the one before, is the same picture.
    expect(state(START_AT - 1 / 30)).toEqual(state(START_AT));
  });

  it.each(GROWTH_STAGES.map((s, i) => [s.id, i] as const))(
    'shows %s alone, whole, once it has settled',
    (id, i) => {
      const t = ARRIVALS[i]! + SETTLED_S;
      const expected = id === 'first-sprout' ? [id, 'soil'] : [id];
      expect(shown(t)).toEqual(expected);
      const drawn = peachAt(t).filter((l) => l.opacity > 0);
      for (const l of drawn) expect([l.opacity, l.scale]).toEqual([1, 1]);
      // Its own parts, in its own order, as the still draws it: the sprout's
      // soil over the foot of its stem.
      expect(drawn.flatMap((l) => l.parts)).toEqual(GROWTH_STAGES[i]!.parts);
    },
  );

  it('never shows the crown and the soil at once, so their faces never overlap', () => {
    for (let t = 0; t < LOOP_S; t += 1 / 240) {
      expect(shown(t), `at ${t.toFixed(3)} s`).not.toEqual(
        expect.arrayContaining(['soil', 'crown']),
      );
    }
  });

  it('never jumps, not even where the loop joins', () => {
    // A frame at 240 fps apart from the next; the steepest the spring moves
    // in that time is about a tenth.
    const step = 1 / 240;
    // Where a layer draws a corner of the peach's box, in the box's units.
    const corners = [
      [PEACH_BOX.x, PEACH_BOX.y],
      [PEACH_BOX.x + PEACH_BOX.w, PEACH_BOX.y + PEACH_BOX.h],
    ] as const;
    const drawn = (l: Layer, [x, y]: readonly [number, number]) => [
      l.anchor[0] + l.scale * (x - l.anchor[0]),
      l.anchor[1] + l.scale * (y - l.anchor[1]),
    ];
    let worst = 0;
    let moved = 0;
    for (let t = -1; t <= LOOP_S + 1; t += step) {
      const a = peachAt(t);
      const b = peachAt(t + step);
      a.forEach((l, i) => {
        const next = b[i]!;
        worst = Math.max(worst, Math.abs(l.opacity - next.opacity));
        // A layer's size only shows while it does: a stage gone at the end
        // of the loop is back at 0.8 for its next arrival, unseen.
        if (l.opacity > 0 || next.opacity > 0) {
          worst = Math.max(worst, Math.abs(l.scale - next.scale));
          for (const c of corners) {
            const [p, q] = [drawn(l, c), drawn(next, c)];
            moved = Math.max(moved, Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!));
          }
        }
      });
    }
    expect(worst).toBeLessThan(0.15);
    // The most a corner moves in a step is about half a unit, as the crown
    // sinks; a jump in the point a layer is scaled about would show here.
    expect(moved).toBeLessThan(1);
  });

  it('plays a rising find as each stage arrives, then the basket as the crown lands', () => {
    expect(BEATS.map((b) => b.stage)).toEqual(GROWTH_STAGES.map((s) => s.id));
    expect(BEATS.map((b) => b.at)).toEqual(ARRIVALS);
    const finds = BEATS.filter((b) => b.call === 'found');
    expect(finds.map((b) => b.length)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(BEATS.at(-1)).toMatchObject({ stage: 'crown', call: 'edition' });
  });
});
