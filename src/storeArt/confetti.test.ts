import { describe, expect, it } from 'vitest';
import {
  CONFETTI_AT,
  CONFETTI_PEACH,
  KINDS,
  MARGIN,
  PIECES,
  PIECE_COUNT,
  confettiAt,
  easeIn,
  easeInTime,
  frameOf,
  inFrame,
  lastPieceGone,
  reach,
} from './confetti.ts';
import { PERFECTLY_PEACHY } from './growthStages.ts';
import {
  ARRIVALS,
  BEATS,
  LOOP_S,
  POSTERS,
  RETURN_AT,
  START_AT,
  peachAt,
} from './motion.ts';

/** The placements that take a video. */
const MOVING = ['header', 'search'] as const;
const STEP = 1 / 240;

describe('the confetti in the store art', () => {
  it("throws the app's burst: 42 pieces, a peach, a heart, a star and a sparkle in turn", () => {
    expect(PIECES).toHaveLength(PIECE_COUNT);
    expect(PIECE_COUNT).toBe(42);
    PIECES.forEach((p, i) => {
      expect(p.kind).toBe(KINDS[i % 4]);
      expect(p.x).toBeGreaterThanOrEqual(0.02);
      expect(p.x).toBeLessThanOrEqual(0.98);
      expect(Math.abs(p.drift)).toBeLessThanOrEqual(50);
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThanOrEqual(0.55);
      expect(p.duration).toBeGreaterThanOrEqual(1.5);
      expect(p.duration).toBeLessThanOrEqual(2.6);
      expect(Math.abs(p.spin)).toBeLessThanOrEqual(420);
      expect(p.size).toBeGreaterThanOrEqual(12);
      expect(p.size).toBeLessThanOrEqual(22);
    });
  });

  it('is seeded, so the same burst every time', () => {
    // Pinned, so a change to the seed or the order of the draws shows here.
    expect(PIECES[0]).toMatchInlineSnapshot(`
      {
        "delay": 0.04764748784946278,
        "drift": 30.300258728675544,
        "duration": 1.6865233310731127,
        "kind": "peach",
        "size": 13.788254433777183,
        "spin": -173.27521685510874,
        "x": 0.28221182301640513,
      }
    `);
    const frame = frameOf('header');
    expect(confettiAt(CONFETTI_AT + 1.2, frame)).toEqual(
      confettiAt(CONFETTI_AT + 1.2, frame),
    );
  });

  it("wears no costume and shows no face: the app's PeachMark(showsFace: false)", () => {
    expect(CONFETTI_PEACH).toEqual(PERFECTLY_PEACHY.filter((p) => !p.faceOnly));
    expect(CONFETTI_PEACH.length).toBeGreaterThan(0);
  });

  it("falls on SwiftUI's easeIn, the bezier (0.42, 0, 1, 1)", () => {
    // UnitCurve.easeIn.value(at: 0.5), read from SwiftUI on 15 November 2026.
    expect(easeIn(0.5)).toBeCloseTo(0.3153572, 6);
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    for (let p = 0.05; p < 1; p += 0.05)
      expect(easeInTime(easeIn(p))).toBeCloseTo(p, 9);
  });

  it('starts with the fanfare, as the crown lands', () => {
    expect(CONFETTI_AT).toBe(ARRIVALS.at(-1));
    expect(BEATS.find((b) => b.call === 'edition')!.at).toBe(CONFETTI_AT);
    for (const placement of MOVING) {
      const frame = frameOf(placement);
      expect(confettiAt(CONFETTI_AT - STEP, frame)).toEqual([]);
      expect(confettiAt(CONFETTI_AT + STEP, frame).length).toBeGreaterThan(0);
    }
  });

  it.each(MOVING)(
    'never pops in or out in the %s: each piece starts clear above the frame, unseen, and ends clear below it',
    (placement) => {
      const frame = frameOf(placement);
      PIECES.forEach((piece, i) => {
        const start = CONFETTI_AT + piece.delay;
        const first = confettiAt(start + 1e-9, frame).find(
          (d) => d.index === i,
        )!;
        expect(first.opacity).toBeLessThan(1e-6);
        expect(first.y + reach(first)).toBeLessThan(0);
        const end = start + piece.duration;
        const last = confettiAt(end - 1e-9, frame).find((d) => d.index === i)!;
        expect(last.y - reach(last)).toBeGreaterThan(frame.height);
        expect(MARGIN * frame.point).toBeGreaterThan(reach(last));
      });
    },
  );

  it.each(MOVING)(
    'nothing flashes in the %s: no piece fades or turns faster than its fall allows',
    (placement) => {
      const frame = frameOf(placement);
      let fade = 0;
      for (let t = CONFETTI_AT; t < CONFETTI_AT + 3.2; t += STEP) {
        const now = new Map(confettiAt(t, frame).map((d) => [d.index, d]));
        for (const next of confettiAt(t + STEP, frame)) {
          const was = now.get(next.index);
          if (was) fade = Math.max(fade, Math.abs(next.opacity - was.opacity));
        }
      }
      // From 0 to 0.9 over at least 1.5 s, at easeIn's steepest, 1.72.
      expect(fade).toBeLessThan(0.005);
    },
  );

  it.each(MOVING)(
    'has every piece out of the %s before the crown starts to sink',
    (placement) => {
      const frame = frameOf(placement);
      // Every moment from the sink to the loop's end, each piece's box
      // turned any way, against the whole frame, not just the safe area.
      for (let t = RETURN_AT; t < LOOP_S; t += STEP) {
        const there = confettiAt(t, frame).filter((d) => inFrame(d, frame));
        expect(there.length, `pieces in the frame at ${t.toFixed(3)} s`).toBe(
          0,
        );
      }
      expect(lastPieceGone(frame)).toBeLessThanOrEqual(RETURN_AT);
    },
  );

  it('leaves room for a file to start on the still crown with the confetti gone', () => {
    const start = POSTERS.clear;
    // The file's last frame is the one before its first: both clear of
    // confetti in both placements, and the crown settled, alone and still.
    for (const t of [start - 1 / 30, start])
      for (const placement of MOVING) {
        const frame = frameOf(placement);
        expect(
          confettiAt(t, frame).filter((d) => inFrame(d, frame)),
          `${placement} at ${t.toFixed(3)} s`,
        ).toEqual([]);
      }
    for (const placement of MOVING)
      expect(lastPieceGone(frameOf(placement))).toBeLessThan(start - 1 / 30);
    expect(peachAt(start - 1 / 30)).toEqual(peachAt(start));
    expect(start).toBeLessThan(RETURN_AT);
  });

  it('starts the other file on the crown with the confetti in the air, after Edition Complete', () => {
    const start = POSTERS.air;
    for (const placement of MOVING) {
      const frame = frameOf(placement);
      expect(
        confettiAt(start, frame).filter((d) => inFrame(d, frame)).length,
      ).toBeGreaterThan(PIECE_COUNT / 2);
    }
    expect(peachAt(start)).toEqual(peachAt(START_AT));
  });
});
