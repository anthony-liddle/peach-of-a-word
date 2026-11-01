import type { Rgba } from './png.ts';

/**
 * The store art's frames as the video carries them: 8-bit Y'CbCr 4:2:0, in
 * BT.709's matrix at limited range, worked out here from the 16-bit
 * composite, so ffmpeg encodes them as they are and converts nothing.
 *
 * **Why here, with a dither:** the background is a pale gradient whose luma
 * moves about ten levels over the frame's height, so rounded to 8 bits it's
 * ten bands. An ordered dither mixes the levels around each row's colour in
 * the proportion that keeps it, and its pattern is fixed to the pixel, so the
 * background is the same in every frame and the encoder can skip it.
 * ffmpeg's own conversion half-dithers, whatever `sws_dither` says: measured
 * on this background, its rows were 0.34 of a level off the ramp, with flat
 * runs of 11 rows.
 *
 * **Why two levels wide, `SPREAD`:** one level wide, a colour near a whole
 * level becomes a few lone dots in a flat patch, and x264 drops lone dots at
 * every lossy setting, down to quantiser 1, leaving runs of 56 rows flat.
 * Two levels wide, every tile keeps dots either side, and through x264 at
 * quantiser 4 the background measured no flat run and stayed within 0.07 of
 * a level of its ramp.
 */

const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;

/**
 * R'G'B', each 0 to 1, as Y', Cb and Cr in 8-bit limited-range levels,
 * unrounded: Y' 16 to 235, Cb and Cr 16 to 240 about 128.
 */
export function ycbcr(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const y = KR * r + KG * g + KB * b;
  return [
    16 + 219 * y,
    128 + (224 * (b - y)) / (2 * (1 - KB)),
    128 + (224 * (r - y)) / (2 * (1 - KR)),
  ];
}

/** The 8 by 8 Bayer matrix, 0 to 63, row by row. */
const BAYER = (() => {
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length;
    const quarter = [
      [0, 2],
      [3, 1],
    ];
    m = Array.from({ length: 2 * n }, (_, y) =>
      Array.from(
        { length: 2 * n },
        (_, x) => 4 * m[y % n]![x % n]! + quarter[(y / n) | 0]![(x / n) | 0]!,
      ),
    );
  }
  return m.flat();
})();

/** How many levels the dither spreads a colour across. */
const SPREAD = 2;

/** `v` levels to a byte at (x, y), dithered or rounded. */
function quantize(v: number, x: number, y: number, dither: boolean): number {
  const d = dither
    ? SPREAD * ((BAYER[(y & 7) * 8 + (x & 7)]! + 0.5) / 64 - 0.5)
    : 0;
  return Math.min(255, Math.max(0, Math.round(v + d)));
}

/** A frame in 4:2:0: the luma plane, then Cb's, then Cr's. */
export interface Yuv {
  width: number;
  height: number;
  data: Buffer;
}

/** One plane of `frame`, with its own width and height. */
export function planeOf(frame: Yuv, which: 'y' | 'cb' | 'cr') {
  const { width, height, data } = frame;
  const luma = width * height;
  const chroma = luma / 4;
  const from = which === 'y' ? 0 : which === 'cb' ? luma : luma + chroma;
  return {
    width: which === 'y' ? width : width / 2,
    height: which === 'y' ? height : height / 2,
    data: data.subarray(from, from + (which === 'y' ? luma : chroma)),
  };
}

/** Row `y` of the background, 16 bits a channel, as R'G'B' 0 to 1. */
const rowColour = (rows: Uint16Array, y: number) =>
  [
    rows[y * 3]! / 65535,
    rows[y * 3 + 1]! / 65535,
    rows[y * 3 + 2]! / 65535,
  ] as const;

/**
 * The background alone, `rows` from `backdropRows`, in 4:2:0. Each chroma
 * sample is the mean of the 2 by 2 block of pixels it stands for.
 */
export function yuvBackdrop(
  width: number,
  height: number,
  rows: Uint16Array,
  dither: boolean,
): Yuv {
  if (width % 2 || height % 2)
    throw new Error(`4:2:0 needs an even size, not ${width} x ${height}.`);
  const frame = { width, height, data: Buffer.alloc((width * height * 3) / 2) };
  const [Y, Cb, Cr] = (['y', 'cb', 'cr'] as const).map(
    (p) => planeOf(frame, p).data,
  );
  for (let y = 0; y < height; y++) {
    const [luma] = ycbcr(...rowColour(rows, y));
    for (let x = 0; x < width; x++)
      Y![y * width + x] = quantize(luma, x, y, dither);
  }
  for (let cy = 0; cy < height / 2; cy++) {
    const a = rowColour(rows, 2 * cy);
    const b = rowColour(rows, 2 * cy + 1);
    const [, cb, cr] = ycbcr(
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
    );
    for (let cx = 0; cx < width / 2; cx++) {
      Cb![cy * (width / 2) + cx] = quantize(cb, cx, cy, dither);
      Cr![cy * (width / 2) + cx] = quantize(cr, cx, cy, dither);
    }
  }
  return frame;
}

/**
 * `art`, captured on transparency, over the background, in 4:2:0: a copy of
 * `backdrop`, made with the same `rows` and `dither`, with only the pixels
 * the art touches, and their chroma blocks, worked out again.
 */
export function yuvFrame(
  art: Rgba,
  rows: Uint16Array,
  backdrop: Yuv,
  dither: boolean,
): Buffer {
  const { width, height, data } = art;
  if (width !== backdrop.width || height !== backdrop.height)
    throw new Error(
      `The art is ${width} x ${height}, the background ${backdrop.width} x ${backdrop.height}.`,
    );
  const out = Buffer.from(backdrop.data);
  const frame = { width, height, data: out };
  const [Y, Cb, Cr] = (['y', 'cb', 'cr'] as const).map(
    (p) => planeOf(frame, p).data,
  );
  // The composite's colour at a pixel, R'G'B' 0 to 1, as `overBackdrop`
  // makes it at 16 bits.
  const colour = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const a = data[i + 3]!;
    const bg = rowColour(rows, y);
    if (a === 0) return bg;
    return [0, 1, 2].map(
      (c) =>
        (data[i + c]! * 257 * a + bg[c]! * 65535 * (255 - a)) / 255 / 65535,
    ) as unknown as readonly [number, number, number];
  };
  const half = width / 2;
  const dirty = new Uint8Array(half * (height / 2));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      const [luma] = ycbcr(...colour(x, y));
      Y![y * width + x] = quantize(luma, x, y, dither);
      dirty[(y >> 1) * half + (x >> 1)] = 1;
    }
  for (let k = 0; k < dirty.length; k++) {
    if (!dirty[k]) continue;
    const [cx, cy] = [k % half, (k / half) | 0];
    const sum = [0, 0, 0];
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const c = colour(2 * cx + dx, 2 * cy + dy);
      for (let n = 0; n < 3; n++) sum[n]! += c[n]!;
    }
    const [, cb, cr] = ycbcr(sum[0]! / 4, sum[1]! / 4, sum[2]! / 4);
    Cb![k] = quantize(cb, cx, cy, dither);
    Cr![k] = quantize(cr, cx, cy, dither);
  }
  return out;
}

/**
 * How banded one plane's columns `x0` to `x1` are, down the frame's height:
 * - `flatRows`, the most rows in a row that are all one level, the same
 *   level as the row before: a band;
 * - `off`, how far, in levels, the mean of any 8 rows strays from a straight
 *   ramp. Eight rows, so a dither's own pattern averages out.
 */
export function banding(
  plane: { width: number; height: number; data: Uint8Array },
  x0: number,
  x1: number,
): { flatRows: number; off: number; from: number; to: number } {
  const { width, height, data } = plane;
  const means: number[] = [];
  let flatRows = 0;
  let run = 0;
  let previous = -1;
  for (let y = 0; y < height; y++) {
    const first = data[y * width + x0]!;
    let one = true;
    let sum = 0;
    for (let x = x0; x < x1; x++) {
      const v = data[y * width + x]!;
      sum += v;
      if (v !== first) one = false;
    }
    means.push(sum / (x1 - x0));
    run = one && first === previous ? run + 1 : one ? 1 : 0;
    previous = one ? first : -1;
    flatRows = Math.max(flatRows, run);
  }
  const windows: [number, number][] = [];
  for (let y = 0; y + 8 <= height; y += 8)
    windows.push([
      y + 3.5,
      means.slice(y, y + 8).reduce((s, m) => s + m, 0) / 8,
    ]);
  const n = windows.length;
  const [sx, sy, sxx, sxy] = windows.reduce(
    ([a, b, c, d], [x, m]) => [a + x, b + m, c + x * x, d + x * m],
    [0, 0, 0, 0],
  );
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const at = (sy - slope * sx) / n;
  const off = Math.max(
    ...windows.map(([x, m]) => Math.abs(m - (at + slope * x))),
  );
  return { flatRows, off, from: windows[0]![1], to: windows.at(-1)![1] };
}
