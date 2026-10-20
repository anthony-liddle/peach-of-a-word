/** Confetti tunables and particle seeding, kept out of the component file. */
import type { CostumeId } from '../costumes.ts';

/** The whole burst, start to fully torn down. One coordinated beat, never a loop. */
export const CONFETTI_DURATION_MS = 2600;

/** Hard cap on particles: one bounded canvas beats a swarm of DOM nodes on mobile. */
export const CONFETTI_MAX_PARTICLES = 64;

/** Gravity and sideways sway, in px and seconds. */
export const CONFETTI_GRAVITY = 900;
export const CONFETTI_DRIFT = 40;

/**
 * The cute motifs as glyphs, reusing the theme's own marks so the burst reads as
 * this game's confetti: hearts, stars, sparkles, peaches, and a rare little
 * dinosaur as an easter egg. Each carries its drawn colour; emoji ignore it.
 */
export interface Motif {
  glyph: string;
  /** Fill colour for non-emoji glyphs. Emoji render in their own colour. */
  color: string | null;
  /** Relative draw weight, so the dino stays rare. */
  weight: number;
}

const CANDY = '#e8568a';
const PEACH = '#ff9e58';
const CREAM = '#ffd9a8';

const MOTIFS: readonly Motif[] = [
  { glyph: '♥', color: CANDY, weight: 5 }, // heart
  { glyph: '★', color: PEACH, weight: 4 }, // star
  { glyph: '✦', color: CREAM, weight: 4 }, // sparkle
  { glyph: '♥', color: PEACH, weight: 3 }, // heart, peach
  { glyph: '🍑', color: null, weight: 4 }, // peach emoji
  { glyph: '🦕', color: null, weight: 1 }, // dino, the rare easter egg
];

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  motif: Motif;
}

function pickMotif(): Motif {
  const total = MOTIFS.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * total;
  for (const m of MOTIFS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return MOTIFS[0]!;
}

/**
 * Seed the burst near the top centre (where the card slides in), launching up
 * and out so the particles arc and then fall. Bounded by CONFETTI_MAX_PARTICLES.
 */
export function createParticles(width: number, height: number): Particle[] {
  const count = Math.min(CONFETTI_MAX_PARTICLES, 56);
  const originX = width / 2;
  const originY = Math.min(height * 0.18, 160);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (-Math.PI / 2) * (0.5 + Math.random()); // mostly upward
    const speed = 220 + Math.random() * 320;
    const spread = (Math.random() - 0.5) * 2.2; // sideways fan
    particles.push({
      x: originX + (Math.random() - 0.5) * width * 0.3,
      y: originY,
      vx: Math.cos(angle) * speed * spread,
      vy: Math.sin(angle) * speed,
      size: 14 + Math.random() * 16,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 6,
      motif: pickMotif(),
    });
  }
  return particles;
}

/** The peach emoji, the one motif a costume replaces. */
const PEACH_GLYPH = '\u{1F351}';

/**
 * Whether this motif is drawn as the costumed peach rather than as its glyph.
 * The emoji cannot wear anything, so on a costume day the burst draws the
 * peach itself, from the same parts as every other peach.
 */
export function paintsPeach(motif: Motif, costume: CostumeId | null): boolean {
  return costume !== null && motif.glyph === PEACH_GLYPH;
}
