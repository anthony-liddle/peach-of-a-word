import type { CostumePart } from '@/ui/costumes.ts';
import { PERFECTLY_PEACHY } from './growthStages.ts';
import { ARRIVALS, LOOP_S, peachUnit } from './motion.ts';
import { PLACEMENTS, type PlacementId } from './storeArtSpec.ts';

/**
 * The confetti the iPhone app throws when the basket fills (`Confetti.swift`),
 * as the store art throws it when the crown lands: its peaches, hearts, stars
 * and sparkles, in the cute palette, falling as the app's do.
 *
 * **The app's numbers, every one:** 42 pieces, taking turns as a peach, a
 * heart, a star and a sparkle; each across 0.02 to 0.98 of the width,
 * drifting up to 50 points either way, starting up to 0.55 s late, falling
 * for 1.5 to 2.6 s from 60 points above the frame to 60 below it, turning up
 * to 420 degrees either way, 12 to 22 points across, and fading in to 0.9 as
 * it goes, all on SwiftUI's `.easeIn`.
 *
 * **Where it differs from the app's, and why:**
 * - **Seeded, not random,** so a second render gives the same pixels.
 * - **Each piece turns about its own middle.** The app turns each piece after
 *   placing it, so SwiftUI turns its whole path about the middle of the card,
 *   and the pieces swing round it as they fall. In the header's wide frame,
 *   turned that way, a piece ending a little below the frame's foot and
 *   turned a quarter would come to rest inside it, so they could never all
 *   leave.
 * - **Sized beside the crown** as the app's are beside the crown card's peach,
 *   112 points across: a point here is the peach's drawn size over 112.
 * - **The frame is the art,** not the card: the pieces fall from above it to
 *   below it in the app's own times, so they fall fewer points a second.
 * - **No costume** on the peaches, as with all the store art.
 *
 * Like `peachAt`, everything is a function of the time it's given, never of
 * the clock.
 */

/** When the confetti starts: as the crown lands, with Edition Complete. */
export const CONFETTI_AT = ARRIVALS.at(-1)!;

/** `Confetti.swift`'s numbers. */
export const PIECE_COUNT = 42;
const ACROSS = [0.02, 0.98] as const;
const DRIFT = 50;
const DELAY = [0, 0.55] as const;
const DURATION = [1.5, 2.6] as const;
const SPIN = 420;
const SIZE = [12, 22] as const;
/** How far above and below the frame each piece starts and ends, in points. */
export const MARGIN = 60;
/** How opaque a piece gets, at the very end of its fall. */
const MOST_OPAQUE = 0.9;
/** The crown card's peach, in points per 100 units of the peach's box. */
const CARD_PEACH = 112;

/** What each piece is, by its place in the burst, as the app takes turns. */
export const KINDS = ['peach', 'heart', 'star', 'sparkle'] as const;
export type Kind = (typeof KINDS)[number];

/**
 * The glyphs, and the cute palette's light colours (`Cute.accent`,
 * `Cute.discovery`, `Cute.crown`), since the art is cute's light page.
 */
export const GLYPHS: Record<Exclude<Kind, 'peach'>, [string, string]> = {
  heart: ['♥', '#C42E60'],
  star: ['★', '#6E4FB8'],
  sparkle: ['✦', '#FF9E58'],
};

/** The peach in the burst: `PeachMark(showsFace: false)`, and no costume. */
export const CONFETTI_PEACH: readonly CostumePart[] = PERFECTLY_PEACHY.filter(
  (p) => !p.faceOnly,
);

/** One piece of the burst, as the app draws its numbers. */
export interface Piece {
  kind: Kind;
  /** Where it starts, 0 to 1 across the width. */
  x: number;
  /** How far it drifts sideways, in points. */
  drift: number;
  /** How long after the crown lands it starts, in seconds. */
  delay: number;
  /** How long it takes to fall, in seconds. */
  duration: number;
  /** How far it turns, in degrees. */
  spin: number;
  /** Its size, in points. */
  size: number;
}

/**
 * The seed: the day the confetti was put in the store art. Any number would
 * do; this one is never tuned.
 */
export const SEED = 20261115;

/** mulberry32: 32-bit integer steps, so every engine draws the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The burst, drawn in the app's order: x, drift, delay, duration, spin, size. */
export const PIECES: readonly Piece[] = (() => {
  const next = seeded(SEED);
  const within = ([lo, hi]: readonly [number, number]) =>
    lo + (hi - lo) * next();
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    kind: KINDS[i % KINDS.length]!,
    x: within(ACROSS),
    drift: within([-DRIFT, DRIFT]),
    delay: within(DELAY),
    duration: within(DURATION),
    spin: within([-SPIN, SPIN]),
    size: within(SIZE),
  }));
})();

// ---- SwiftUI's easeIn ----------------------------------------------------------

/**
 * `.easeIn`: the cubic bezier (0.42, 0, 1, 1), the curve SwiftUI's
 * `UnitCurve.easeIn` gives, measured within 1e-6 of this.
 */
const bx = (s: number) =>
  3 * (1 - s) * (1 - s) * s * 0.42 + 3 * (1 - s) * s * s + s ** 3;
const by = (s: number) => 3 * (1 - s) * s * s + s ** 3;

/** The bezier's parameter where `f` reaches `v`, by halving: both rise. */
function solve(f: (s: number) => number, v: number): number {
  let [lo, hi] = [0, 1];
  for (let k = 0; k < 52; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < v) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** How far along its fall a piece is, 0 to 1, a share `p` of the way through its time. */
export function easeIn(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return by(solve(bx, p));
}

/** The share of its time a piece takes to come `e` of the way, easeIn's inverse. */
export function easeInTime(e: number): number {
  if (e <= 0) return 0;
  if (e >= 1) return 1;
  return bx(solve(by, e));
}

// ---- Where each piece is ---------------------------------------------------------

/** A frame the confetti falls in: its size in pixels, and a point's size. */
export interface Frame {
  width: number;
  height: number;
  /** Pixels to one of the app's points. */
  point: number;
}

/** A placement's frame: the art's size, and a point sized beside its crown. */
export function frameOf(placement: PlacementId): Frame {
  const { width, height, safe } = PLACEMENTS[placement];
  return { width, height, point: (peachUnit(safe) * 100) / CARD_PEACH };
}

/** One piece as it's drawn at one moment, in the frame's pixels. */
export interface Drawn {
  index: number;
  kind: Kind;
  /** Its middle. */
  x: number;
  y: number;
  /** Its box, square, before it turns. */
  size: number;
  /** How far it has turned about its middle, in degrees. */
  rotation: number;
  opacity: number;
}

/**
 * The pieces in flight at `t` seconds, in `frame`. `t` is taken within the
 * loop. A piece not yet started, or done, isn't drawn: it's above the frame
 * and clear until it starts, and below it once it's done.
 */
export function confettiAt(t: number, frame: Frame): Drawn[] {
  const within = t % LOOP_S;
  const u = within < 0 ? within + LOOP_S : within;
  const { width, height, point } = frame;
  const drawn: Drawn[] = [];
  PIECES.forEach((piece, index) => {
    const p = (u - CONFETTI_AT - piece.delay) / piece.duration;
    if (p <= 0 || p >= 1) return;
    const e = easeIn(p);
    drawn.push({
      index,
      kind: piece.kind,
      x: piece.x * width + e * piece.drift * point,
      y: -MARGIN * point + e * (height + 2 * MARGIN * point),
      size: piece.size * point,
      rotation: e * piece.spin,
      opacity: MOST_OPAQUE * e,
    });
  });
  return drawn;
}

/** How far a piece's box reaches from its middle, at any turn. */
export const reach = (d: Pick<Drawn, 'size'>) => (d.size * Math.SQRT2) / 2;

/** Whether any of a drawn piece's box, turned any way, is in the frame. */
export function inFrame(d: Drawn, frame: Frame): boolean {
  const r = reach(d);
  return (
    d.x + r > 0 &&
    d.x - r < frame.width &&
    d.y + r > 0 &&
    d.y - r < frame.height
  );
}

/**
 * When the last piece has wholly left `frame`, below it, in seconds into the
 * loop: each piece's box, turned any way, is clear of the frame's foot once
 * its middle is its reach below it.
 */
export function lastPieceGone(frame: Frame): number {
  const { height, point } = frame;
  return Math.max(
    ...PIECES.map((piece) => {
      const below = height + reach({ size: piece.size * point });
      const e = (below + MARGIN * point) / (height + 2 * MARGIN * point);
      return CONFETTI_AT + piece.delay + easeInTime(e) * piece.duration;
    }),
  );
}
