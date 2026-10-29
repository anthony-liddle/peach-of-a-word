import { describe, expect, it } from 'vitest';
import { backdropRows } from './storeArtComposite.ts';
import {
  banding,
  planeOf,
  ycbcr,
  yuvBackdrop,
  yuvFrame,
} from './storeArtYuv.ts';

/** `height` rows of one 16-bit colour. */
const flat = (height: number, rgb: [number, number, number]) => {
  const rows = new Uint16Array(height * 3);
  for (let y = 0; y < height; y++) rows.set(rgb, y * 3);
  return rows;
};

const mean = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / a.length;

describe('the store art as the video carries it', () => {
  it("converts with BT.709's matrix at limited range", () => {
    expect(ycbcr(1, 1, 1)).toEqual([235, 128, 128]);
    expect(ycbcr(0, 0, 0)).toEqual([16, 128, 128]);
    // Red, as BT.709 tabulates it: 63, 102, 240.
    expect(ycbcr(1, 0, 0).map(Math.round)).toEqual([63, 102, 240]);
  });

  it('dithers a level between two to its true mean, and rounding leaves it flat', () => {
    // A pale peach whose luma falls about a third of the way between levels.
    const rows = flat(16, [65535, 61000, 58000]);
    const [y] = ycbcr(1, 61000 / 65535, 58000 / 65535);
    const dithered = planeOf(yuvBackdrop(16, 16, rows, true), 'y');
    const rounded = planeOf(yuvBackdrop(16, 16, rows, false), 'y');
    expect(Math.abs(mean(dithered.data) - y)).toBeLessThan(1 / 32);
    expect(new Set(dithered.data).size).toBeGreaterThanOrEqual(2);
    expect(new Set(rounded.data)).toEqual(new Set([Math.round(y)]));
  });

  it('dots every tile, even where the colour sits on a whole level', () => {
    // A grey whose luma is 199.9986: one level wide, the dither would round
    // every pixel to 200, a flat patch an encoder has nothing to keep of.
    const rows = flat(16, [55061, 55061, 55061]);
    const [y] = ycbcr(
      ...([55061, 55061, 55061].map((v) => v / 65535) as [
        number,
        number,
        number,
      ]),
    );
    expect(Math.abs(y - 200)).toBeLessThan(0.01);
    const frame = yuvBackdrop(16, 16, rows, true);
    for (const p of ['y', 'cb', 'cr'] as const) {
      const plane = planeOf(frame, p);
      for (let ty = 0; ty < plane.height; ty += 8)
        for (let tx = 0; tx < plane.width; tx += 8) {
          const tile = new Set<number>();
          for (let dy = 0; dy < 8; dy++)
            for (let dx = 0; dx < 8; dx++)
              tile.add(plane.data[(ty + dy) * plane.width + tx + dx]!);
          expect(tile.size, `${p} tile at ${tx}, ${ty}`).toBeGreaterThan(1);
        }
    }
    expect(Math.abs(mean(planeOf(frame, 'y').data) - y)).toBeLessThan(1 / 32);
  });

  it('keeps the background exactly where the art is clear, and redraws only the art', () => {
    const rows = backdropRows(8);
    const backdrop = yuvBackdrop(8, 8, rows, true);
    const clear = { width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4) };
    expect(yuvFrame(clear, rows, backdrop, true).equals(backdrop.data)).toBe(
      true,
    );

    // One opaque white pixel at (5, 2): its luma is white's, and only its
    // chroma block, (2, 1), changes.
    const art = { width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4) };
    art.data.fill(255, (2 * 8 + 5) * 4, (2 * 8 + 5) * 4 + 4);
    const frame = yuvFrame(art, rows, backdrop, true);
    const y = planeOf({ width: 8, height: 8, data: frame }, 'y');
    // White, within the dither's spread.
    expect(Math.abs(y.data[2 * 8 + 5]! - 235)).toBeLessThanOrEqual(1);
    const changed = (which: 'y' | 'cb' | 'cr') => {
      const before = planeOf(backdrop, which).data;
      const after = planeOf({ width: 8, height: 8, data: frame }, which).data;
      return [...after.keys()].filter((i) => after[i] !== before[i]);
    };
    expect(changed('y')).toEqual([2 * 8 + 5]);
    // White pulls the peach's red-difference well toward neutral; its
    // blue-difference is nearer, and may round the same.
    expect(changed('cr')).toEqual([1 * 4 + 2]);
    expect(changed('cb').every((i) => i === 1 * 4 + 2)).toBe(true);
  });

  it('finds bands in a rounded ramp, and none in a dithered one', () => {
    const [width, height] = [64, 512];
    const rows = backdropRows(height);
    const look = (dither: boolean) =>
      banding(planeOf(yuvBackdrop(width, height, rows, dither), 'y'), 0, 64);
    const rounded = look(false);
    const dithered = look(true);
    // Luma moves about 9.5 levels over the height: bands about 54 rows tall.
    expect(rounded.flatRows).toBeGreaterThan(40);
    expect(rounded.off).toBeGreaterThan(0.3);
    expect(dithered.flatRows).toBeLessThanOrEqual(16);
    expect(dithered.off).toBeLessThanOrEqual(0.1);
  });
});
