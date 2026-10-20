import {
  COSTUMES,
  SOURCE_MARK_TRANSFORM,
  type CostumeId,
  type CostumePart,
} from './costumes.ts';

/**
 * The peach as data, so the component, the tab icon and the confetti canvas
 * draw one peach rather than three. The geometry is public/favicon-cute.svg's,
 * which PeachMark.test.tsx pins.
 */
export interface PeachPart extends Omit<CostumePart, 'd'> {
  d?: string;
  /** A circle as [cx, cy, r], in place of `d`. */
  circle?: readonly [number, number, number];
}

/** The leaf, the body and its highlight: drawn at every size. */
export const PEACH_BODY: readonly PeachPart[] = [
  { d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' },
  {
    d: 'M50 16c20 0 34 16 34 36 0 22-16 38-34 38S16 74 16 52c0-20 14-36 34-36z',
    fill: '#FFC27A',
  },
  {
    d: 'M50 16c-9 0-17 4-23 11 7 4 15 5 23 5s16-1 23-5c-6-7-14-11-23-11z',
    fill: '#FFD79B',
    opacity: 0.7,
  },
];

/** The face: eyes, cheeks, smile. Dropped at mark size. */
export const PEACH_FACE: readonly PeachPart[] = [
  { circle: [40, 58, 3.4], fill: '#7A4A33' },
  { circle: [60, 58, 3.4], fill: '#7A4A33' },
  { circle: [34, 66, 4.5], fill: '#FF9DAE', opacity: 0.7 },
  { circle: [66, 66, 4.5], fill: '#FF9DAE', opacity: 0.7 },
  { d: 'M45 67c3 3 7 3 10 0', stroke: '#7A4A33', strokeWidth: 2.2 },
];

/**
 * The source-word mark's own peach, from index.css's `.mark--source`: smaller,
 * with a cleft rather than a highlight, and never a face.
 */
export const SOURCE_MARK_BODY: readonly PeachPart[] = [
  { d: 'M50 15c4-7 13-8 17-4-2 6-8 8-13 7z', fill: '#8FD3B6' },
  {
    d: 'M50 19c19 0 32 15 32 33 0 21-15 35-32 35S18 72 18 52c0-18 13-33 32-33z',
    fill: '#FFB27A',
  },
  {
    d: 'M50 21c-3 8-3 21 0 31',
    stroke: '#E8924E',
    strokeWidth: 2.5,
    opacity: 0.6,
  },
];

export interface PeachOptions {
  costume?: CostumeId | null | undefined;
  /** The face, at card sizes. Off at mark size. */
  face?: boolean | undefined;
}

/** Every part to draw, in order, for a peach in this costume. */
export function peachParts({
  costume,
  face = true,
}: PeachOptions): PeachPart[] {
  const c = costume ? COSTUMES[costume] : null;
  const own = face && !c?.replacesFace ? PEACH_FACE : [];
  const worn = c ? c.parts.filter((p) => face || !p.faceOnly) : [];
  return [...PEACH_BODY, ...own, ...worn];
}

/** The parts of the source-word mark, with the costume moved onto its peach. */
export function sourceMarkParts(costume?: CostumeId | null | undefined): {
  base: readonly PeachPart[];
  worn: readonly PeachPart[];
  transform: string;
} {
  const c = costume ? COSTUMES[costume] : null;
  return {
    base: SOURCE_MARK_BODY,
    worn: c ? c.parts.filter((p) => !p.faceOnly) : [],
    transform: SOURCE_MARK_TRANSFORM,
  };
}

function attrs(p: PeachPart): string {
  const a: string[] = [`fill="${p.fill ?? 'none'}"`];
  if (p.opacity !== undefined) a.push(`opacity="${p.opacity}"`);
  if (p.stroke) {
    a.push(`stroke="${p.stroke}"`, `stroke-width="${p.strokeWidth ?? 1}"`);
    a.push('stroke-linecap="round"', 'stroke-linejoin="round"');
  }
  return a.join(' ');
}

function element(p: PeachPart): string {
  if (p.circle) {
    const [cx, cy, r] = p.circle;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs(p)}/>`;
  }
  return `<path d="${p.d}" ${attrs(p)}/>`;
}

/** The peach as standalone SVG markup, for a tab icon's data URI. */
export function peachSvg(options: PeachOptions): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    peachParts(options).map(element).join('') +
    '</svg>'
  );
}

/**
 * Draw the peach on a canvas, centred at (x, y), `size` pixels square. For the
 * confetti, which draws on a canvas rather than in the DOM.
 */
export function drawPeach(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  options: PeachOptions,
): void {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 100, size / 100);
  for (const p of peachParts(options)) {
    const path = new Path2D();
    if (p.circle)
      path.arc(p.circle[0], p.circle[1], p.circle[2], 0, Math.PI * 2);
    else path.addPath(new Path2D(p.d));
    ctx.globalAlpha = p.opacity ?? 1;
    if (p.fill) {
      ctx.fillStyle = p.fill;
      ctx.fill(path);
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.strokeWidth ?? 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
  }
  ctx.restore();
}
