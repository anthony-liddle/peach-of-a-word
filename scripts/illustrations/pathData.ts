/**
 * Path data as the apps read it, from path data as Inkscape writes it.
 *
 * The costume and growth tables hold absolute M, L, C and Z only, because the
 * iOS app parses those four and nothing else, and because a cubic stays inside
 * the hull of its points, which is what the footprint guard checks. Inkscape
 * writes any of SVG's commands, relative or absolute, with commas, implicit
 * repeats and exponents, and may leave a `transform` on a moved object. This
 * reads all of that and writes the tables' form.
 */

export type Pt = readonly [number, number];

export type Seg =
  | { kind: 'M'; to: Pt }
  | { kind: 'L'; to: Pt }
  | { kind: 'C'; c1: Pt; c2: Pt; to: Pt }
  | { kind: 'Z' };

/** A 2D affine transform, as SVG's `matrix(a b c d e f)`. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** A circle's cubic control distance, as a fraction of its radius. */
export const KAPPA = 0.5523;

export class PathError extends Error {}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const ARGS: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/** The commands of a path, each with its numbers, as written. */
function tokenize(d: string): { cmd: string; args: number[] }[] {
  const out: { cmd: string; args: number[] }[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (): number => {
    skip();
    const m = NUMBER.exec(d.slice(i));
    if (!m) throw new PathError(`expected a number at ${i} in "${d}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  // An arc's two flags may be written with nothing between them: "a1 1 0 011 1".
  const flag = (): number => {
    skip();
    const c = d[i];
    if (c !== '0' && c !== '1')
      throw new PathError(`expected an arc flag at ${i} in "${d}"`);
    i++;
    return Number(c);
  };
  skip();
  while (i < d.length) {
    const cmd = d[i]!;
    if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(cmd))
      throw new PathError(`unknown path command "${cmd}" at ${i} in "${d}"`);
    i++;
    const n = ARGS[cmd.toUpperCase()]!;
    if (n === 0) {
      out.push({ cmd, args: [] });
      skip();
      continue;
    }
    // A command's numbers may repeat it: "l 1 2 3 4" is two lines.
    let first = true;
    do {
      const args: number[] = [];
      for (let k = 0; k < n; k++)
        args.push(
          cmd.toUpperCase() === 'A' && (k === 3 || k === 4) ? flag() : number(),
        );
      // After a move, repeats are lines, relative or not as the move was.
      const c = !first && cmd === 'M' ? 'L' : !first && cmd === 'm' ? 'l' : cmd;
      out.push({ cmd: c, args });
      first = false;
      skip();
    } while (i < d.length && !/[A-Za-z]/.test(d[i]!));
  }
  return out;
}

/**
 * An elliptical arc as cubics, by SVG's own endpoint parameterisation
 * (SVG 1.1, appendix F.6), in quarters or less.
 */
function arcToCubics(
  p0: Pt,
  rx: number,
  ry: number,
  angle: number,
  large: number,
  sweep: number,
  p: Pt,
): Seg[] {
  if (p0[0] === p[0] && p0[1] === p[1]) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [{ kind: 'L', to: p }];
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p[0]) / 2;
  const dy = (p0[1] - p[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p[1]) / 2;
  const angleOf = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angleOf(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angleOf(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry,
  );
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const pieces = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
  const step = dt / pieces;
  const h = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const tangent = (t: number): Pt => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const out: Seg[] = [];
  for (let n = 0; n < pieces; n++) {
    const a = t1 + n * step;
    const b = a + step;
    const [ax, ay] = at(a);
    const [bx, by] = n === pieces - 1 ? p : at(b);
    const [tax, tay] = tangent(a);
    const [tbx, tby] = tangent(b);
    out.push({
      kind: 'C',
      c1: [ax + h * tax, ay + h * tay],
      c2: [bx - h * tbx, by - h * tby],
      to: [bx, by],
    });
  }
  return out;
}

/** Any SVG path data, as absolute moves, lines, cubics and closes. */
export function parsePath(d: string): Seg[] {
  const out: Seg[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let open = false; // whether a subpath has begun since the last close
  let lastCubic: Pt | null = null; // the last C or S's second handle
  let lastQuad: Pt | null = null; // the last Q or T's handle
  const begin = () => {
    // A drawing command right after a close starts a new subpath where the
    // last one began; say so with a move, which the tables always have.
    if (!open) {
      out.push({ kind: 'M', to: cur });
      start = cur;
      open = true;
    }
  };
  for (const { cmd, args } of tokenize(d)) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const pt = (x: number, y: number): Pt =>
      rel ? [cur[0] + x, cur[1] + y] : [x, y];
    let nextCubic: Pt | null = null;
    let nextQuad: Pt | null = null;
    switch (C) {
      case 'M': {
        cur = pt(args[0]!, args[1]!);
        start = cur;
        out.push({ kind: 'M', to: cur });
        open = true;
        break;
      }
      case 'L':
      case 'H':
      case 'V': {
        begin();
        const to: Pt =
          C === 'L'
            ? pt(args[0]!, args[1]!)
            : C === 'H'
              ? [rel ? cur[0] + args[0]! : args[0]!, cur[1]]
              : [cur[0], rel ? cur[1] + args[0]! : args[0]!];
        out.push({ kind: 'L', to });
        cur = to;
        break;
      }
      case 'C':
      case 'S': {
        begin();
        let c1: Pt;
        let rest = args;
        if (C === 'C') {
          c1 = pt(args[0]!, args[1]!);
          rest = args.slice(2);
        } else {
          c1 = lastCubic
            ? [2 * cur[0] - lastCubic[0], 2 * cur[1] - lastCubic[1]]
            : cur;
        }
        const c2 = pt(rest[0]!, rest[1]!);
        const to = pt(rest[2]!, rest[3]!);
        out.push({ kind: 'C', c1, c2, to });
        nextCubic = c2;
        cur = to;
        break;
      }
      case 'Q':
      case 'T': {
        begin();
        let q: Pt;
        let to: Pt;
        if (C === 'Q') {
          q = pt(args[0]!, args[1]!);
          to = pt(args[2]!, args[3]!);
        } else {
          q = lastQuad
            ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]]
            : cur;
          to = pt(args[0]!, args[1]!);
        }
        // A quadratic is a cubic with its handles two thirds of the way to q.
        out.push({
          kind: 'C',
          c1: [
            cur[0] + (2 / 3) * (q[0] - cur[0]),
            cur[1] + (2 / 3) * (q[1] - cur[1]),
          ],
          c2: [
            to[0] + (2 / 3) * (q[0] - to[0]),
            to[1] + (2 / 3) * (q[1] - to[1]),
          ],
          to,
        });
        nextQuad = q;
        cur = to;
        break;
      }
      case 'A': {
        begin();
        const to = pt(args[5]!, args[6]!);
        out.push(
          ...arcToCubics(
            cur,
            args[0]!,
            args[1]!,
            args[2]!,
            args[3]!,
            args[4]!,
            to,
          ),
        );
        cur = to;
        break;
      }
      case 'Z': {
        if (open) out.push({ kind: 'Z' });
        cur = start;
        open = false;
        break;
      }
    }
    lastCubic = nextCubic;
    lastQuad = nextQuad;
  }
  return out;
}

/** Inkscape's shapes, as paths. */
export function circlePath(cx: number, cy: number, r: number): Seg[] {
  return ellipsePath(cx, cy, r, r);
}

export function ellipsePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): Seg[] {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  // From the left, through the top, as growth-stages.py draws a circle.
  return [
    { kind: 'M', to: [cx - rx, cy] },
    {
      kind: 'C',
      c1: [cx - rx, cy - ky],
      c2: [cx - kx, cy - ry],
      to: [cx, cy - ry],
    },
    {
      kind: 'C',
      c1: [cx + kx, cy - ry],
      c2: [cx + rx, cy - ky],
      to: [cx + rx, cy],
    },
    {
      kind: 'C',
      c1: [cx + rx, cy + ky],
      c2: [cx + kx, cy + ry],
      to: [cx, cy + ry],
    },
    {
      kind: 'C',
      c1: [cx - kx, cy + ry],
      c2: [cx - rx, cy + ky],
      to: [cx - rx, cy],
    },
    { kind: 'Z' },
  ];
}

export function rectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 0,
  ry = rx,
): Seg[] {
  rx = Math.min(Math.abs(rx), w / 2);
  ry = Math.min(Math.abs(ry), h / 2);
  if (rx === 0 || ry === 0)
    return parsePath(
      `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`,
    );
  return parsePath(
    `M${x + rx} ${y} L${x + w - rx} ${y} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} ` +
      `L${x + w} ${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} ` +
      `L${x + rx} ${y + h} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} ` +
      `L${x} ${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`,
  );
}

export function polyPath(points: string, closed: boolean): Seg[] {
  const n = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (n.length < 4 || n.length % 2 || n.some((v) => !Number.isFinite(v)))
    throw new PathError(`unreadable points "${points}"`);
  const segs: Seg[] = [];
  for (let i = 0; i < n.length; i += 2)
    segs.push({ kind: i ? 'L' : 'M', to: [n[i]!, n[i + 1]!] });
  if (closed) segs.push({ kind: 'Z' });
  return segs;
}

/** SVG's `transform` attribute, as one matrix. */
export function parseTransform(t: string | null | undefined): Matrix {
  let m: Matrix = IDENTITY;
  if (!t) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let found: RegExpExecArray | null;
  let used = 0;
  while ((found = re.exec(t))) {
    used += found[0].length;
    const a = found[2]!
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let n: Matrix;
    switch (found[1]) {
      case 'matrix':
        n = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0]!, a[1] ?? 0];
        break;
      case 'scale':
        n = [a[0]!, 0, 0, a[1] ?? a[0]!, 0, 0];
        break;
      case 'rotate': {
        const r = (a[0]! * Math.PI) / 180;
        const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
        const [c, s] = [Math.cos(r), Math.sin(r)];
        n = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan((a[0]! * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        n = [1, Math.tan((a[0]! * Math.PI) / 180), 0, 1, 0, 0];
    }
    if (n.some((v) => !Number.isFinite(v)))
      throw new PathError(`unreadable transform "${t}"`);
    m = multiply(m, n);
  }
  if (t.replace(/[\s,]/g, '').length > 0 && used === 0)
    throw new PathError(`unreadable transform "${t}"`);
  return m;
}

/** `a` then `b`, as SVG composes a list: a point goes through `b` first. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export const isIdentity = (m: Matrix) => m.every((v, i) => v === IDENTITY[i]);

/** How much a transform scales a stroke: the root of its area's scale. */
export const strokeScale = (m: Matrix) =>
  Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** Whether a transform scales every direction alike, as a stroke can follow. */
export const isUniform = (m: Matrix) =>
  Math.abs(m[0] * m[0] + m[1] * m[1] - (m[2] * m[2] + m[3] * m[3])) < 1e-9 &&
  Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9;

/** A cubic is still a cubic after an affine transform, so only points move. */
export function transformPath(segs: readonly Seg[], m: Matrix): Seg[] {
  if (isIdentity(m)) return [...segs];
  const p = ([x, y]: Pt): Pt => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  return segs.map((s) =>
    s.kind === 'Z'
      ? s
      : s.kind === 'C'
        ? { ...s, c1: p(s.c1), c2: p(s.c2), to: p(s.to) }
        : { ...s, to: p(s.to) },
  );
}

/** A number as the tables write one: to `places` decimals, plain. */
export function fmt(v: number, places = 1): string {
  const s = v.toFixed(places).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** The tables' form: `M50 12 C54 4 64 3 68 8 Z`. */
export function formatPath(segs: readonly Seg[], places = 1): string {
  const p = (pt: Pt) => `${fmt(pt[0], places)} ${fmt(pt[1], places)}`;
  return segs
    .map((s) =>
      s.kind === 'Z'
        ? 'Z'
        : s.kind === 'C'
          ? `C${p(s.c1)} ${p(s.c2)} ${p(s.to)}`
          : `${s.kind}${p(s.to)}`,
    )
    .join(' ');
}

/** Every point, handles included, as the footprint guard sees them. */
export const pointsOf = (segs: readonly Seg[]): Pt[] =>
  segs.flatMap((s) =>
    s.kind === 'Z' ? [] : s.kind === 'C' ? [s.c1, s.c2, s.to] : [s.to],
  );
