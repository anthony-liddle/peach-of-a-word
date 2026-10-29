import type { CostumePart } from '@/ui/costumes.ts';
import { GROWTH_STAGES, bounds } from './growthStages.ts';
import type { Rect } from './storeArtSpec.ts';

/**
 * The store art in motion: one peach growing in place, from the empty soil
 * through each stage to the crown, as the iOS title's peach grows over a day,
 * then a soft fade back to the soil, on a loop with no seam.
 *
 * **Everything is a function of the time it's given,** never of the clock, so
 * a frame captured twice is the same frame, and the capture can step through
 * the loop one frame at a time.
 *
 * **Each stage arrives as the title's does** (`TitleTop.growth` in the iOS
 * app): the new stage grows in from 0.8 of its size as it fades in, over the
 * old one, which fades out, both on the title's spring, `Feel.settle`. The
 * first sprout is the one exception: its soil is already there, so only its
 * shoot grows in, from the soil.
 */

/** The loop, in seconds. */
export const LOOP_S = 9.6;

/**
 * When each stage arrives, in seconds into the loop, in the order of
 * `GROWTH_STAGES`: a beat for each, and a longer one before the crown.
 */
export const ARRIVALS: readonly number[] = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.6];

/** When the crown starts to fade back to the soil, and for how long. */
export const FADE_AT = 8.4;
export const FADE_S = 0.8;

/**
 * The frame rates Apple takes, and the audio frame an AAC encoder works in at
 * 48 kHz. The loop is a whole number of each, so neither picture nor sound
 * has a part frame where the loop joins.
 */
export const FRAME_RATES = [30, 60] as const;
export const SAMPLE_RATE = 48000;
export const AAC_FRAME = 1024;

// ---- The title's spring ---------------------------------------------------

/** `Feel.settle`: SwiftUI's spring with a 0.45 s response, damped to 0.85. */
const RESPONSE = 0.45;
const DAMPING = 0.85;
const W0 = (2 * Math.PI) / RESPONSE;
const WD = W0 * Math.sqrt(1 - DAMPING * DAMPING);
const DECAY = DAMPING * W0;

/**
 * After this long the spring is within 2e-5 of rest, a hundredth of a pixel at
 * the largest size the peach is drawn, so it's called settled. A settled
 * frame is then exactly the same as every other.
 */
export const SETTLED_S = 1;

/**
 * How far the title's spring has gone, 0 to 1, `s` seconds after it starts:
 * the closed form of a damped spring let go from rest. It overshoots by a
 * little over half a percent before it settles.
 */
export function spring(s: number): number {
  if (s <= 0) return 0;
  if (s >= SETTLED_S) return 1;
  return (
    1 -
    Math.exp(-DECAY * s) * (Math.cos(WD * s) + (DECAY / WD) * Math.sin(WD * s))
  );
}

/** The fade back to the soil: a half cosine, soft at both ends. */
export function fade(s: number): number {
  if (s <= 0) return 0;
  if (s >= FADE_S) return 1;
  return 0.5 - 0.5 * Math.cos((Math.PI * s) / FADE_S);
}

// ---- What's drawn ---------------------------------------------------------

/** One drawing in the peach's 100 by 100 box, as it is at one moment. */
export interface Layer {
  key: string;
  parts: readonly CostumePart[];
  opacity: number;
  /** Its size, as a share of its own, about `anchor`. */
  scale: number;
  /** The point it grows from, in the peach's box. */
  anchor: readonly [number, number];
}

const [SPROUT, ...LATER] = GROWTH_STAGES;
/** The first sprout's soil: its mound, the mound's furrow, and its face. */
const SOIL = SPROUT!.parts.slice(3);
/** The first sprout's shoot: its stem and its two leaves. */
const SHOOT = SPROUT!.parts.slice(0, 3);

/** The title grows a stage from the middle of the peach's box. */
const MIDDLE = [50, 50] as const;
/** The shoot grows from where its stem meets the soil. */
const STEM_FOOT = [50, 72] as const;

/**
 * The one box every stage is drawn in: all of them together, so the peach
 * never moves as it grows, and only the drawing changes.
 */
export const PEACH_BOX: Rect = (() => {
  const all = GROWTH_STAGES.map((s) => bounds(s.parts));
  const x = Math.min(...all.map((b) => b.x));
  const y = Math.min(...all.map((b) => b.y));
  const r = Math.max(...all.map((b) => b.x + b.w));
  const b = Math.max(...all.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: b - y };
})();

/**
 * The largest any drawing gets: a stage's grow-in overshoots its full size by
 * the spring's overshoot of its fifth of a size. Measured, not assumed.
 */
export const LARGEST_SCALE = (() => {
  let most = 1;
  for (let s = 0; s < SETTLED_S; s += 0.0005)
    most = Math.max(most, 0.8 + 0.2 * spring(s));
  return most;
})();

/** Seconds since `at`, within the loop that `t` falls in. */
const since = (t: number, at: number) => t - at;

/**
 * The peach at `t` seconds, as the layers to draw, bottom first. `t` may be
 * any number; it's taken within the loop.
 */
export function peachAt(t: number): Layer[] {
  const u = ((t % LOOP_S) + LOOP_S) % LOOP_S;
  const [sprout, ...rest] = ARRIVALS as [number, ...number[]];
  const growsOut = (i: number) =>
    i + 1 < ARRIVALS.length
      ? spring(since(u, ARRIVALS[i + 1]!))
      : fade(since(u, FADE_AT));

  // The soil is there from the last fade until the sprout gives way to the
  // little bud, and fades back in at the end of the loop.
  const soil =
    u < ARRIVALS[1]!
      ? 1
      : u < FADE_AT
        ? 1 - spring(since(u, ARRIVALS[1]!))
        : fade(since(u, FADE_AT));
  const shootIn = spring(since(u, sprout));

  const layers: Layer[] = [
    { key: 'soil', parts: SOIL, opacity: soil, scale: 1, anchor: STEM_FOOT },
    {
      key: 'first-sprout',
      parts: SHOOT,
      opacity: shootIn * (1 - growsOut(0)),
      scale: 0.8 + 0.2 * shootIn,
      anchor: STEM_FOOT,
    },
    ...LATER.map((stage, j) => {
      const grownIn = spring(since(u, rest[j]!));
      return {
        key: stage.id,
        parts: stage.parts,
        opacity: grownIn * (1 - growsOut(j + 1)),
        scale: 0.8 + 0.2 * grownIn,
        anchor: MIDDLE,
      };
    }),
  ];
  return layers.map((l) => ({ ...l, opacity: Math.min(1, l.opacity) }));
}

// ---- What's heard ---------------------------------------------------------

/**
 * A cue the header plays, by the game's own call: a find of `length` letters,
 * or the basket filling.
 */
export type Beat =
  | { at: number; stage: string; call: 'found'; length: number }
  | { at: number; stage: string; call: 'edition' };

/**
 * The header's sound: a find for each stage as it arrives, rising with the
 * game's own rise for longer words, three letters for the first sprout up to
 * eight for Perfectly Peachy; then the basket filling, Edition Complete, as
 * the crown lands.
 */
export const BEATS: readonly Beat[] = GROWTH_STAGES.map((stage, i) =>
  stage.id === 'crown'
    ? { at: ARRIVALS[i]!, stage: stage.id, call: 'edition' as const }
    : {
        at: ARRIVALS[i]!,
        stage: stage.id,
        call: 'found' as const,
        length: 3 + i,
      },
);
