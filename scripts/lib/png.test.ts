import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeRgbaPng } from './png.ts';
import { backdropRows, overBackdrop } from './storeArtComposite.ts';

/** An 8-bit RGBA PNG of `pixels`, each row filtered with `filters[y]`. */
function encode(width: number, pixels: number[], filters: number[]): Buffer {
  const stride = width * 4;
  const height = pixels.length / stride;
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    const row = pixels.slice(y * stride, (y + 1) * stride);
    const up = y ? pixels.slice((y - 1) * stride, y * stride) : [];
    raw.push(filters[y]!);
    row.forEach((v, x) => {
      const a = x >= 4 ? row[x - 4]! : 0;
      const b = up[x] ?? 0;
      const c = x >= 4 ? (up[x - 4] ?? 0) : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][filters[y]!]!;
      raw.push((v - predicted) & 0xff);
    });
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('reading the bare frames', () => {
  it('reads every row filter back to the pixels written', () => {
    const width = 3;
    const pixels = Array.from(
      { length: width * 4 * 5 },
      (_, i) => (i * 37 + 11) % 256,
    );
    const png = encode(width, pixels, [0, 1, 2, 3, 4]);
    const { width: w, height, data } = decodeRgbaPng(png);
    expect([w, height]).toEqual([3, 5]);
    expect([...data]).toEqual(pixels);
  });

  it('refuses a PNG without alpha, rather than reading it wrong', () => {
    const png = encode(1, [1, 2, 3, 4], [0]);
    png[25] = 2;
    expect(() => decodeRgbaPng(png)).toThrow(/colour type 2/);
  });
});

describe('laying a frame over the background', () => {
  it("runs the background from cute's top colour to its bottom one", () => {
    const rows = backdropRows(1000);
    // #fff4ee at the top and #ffe6dc at the bottom, at 16 bits.
    expect([...rows.subarray(0, 3)].map((v) => Math.round(v / 257))).toEqual([
      0xff, 0xf4, 0xee,
    ]);
    expect([...rows.subarray(-3)].map((v) => Math.round(v / 257))).toEqual([
      0xff, 0xe6, 0xdc,
    ]);
  });

  it('keeps the background where the art is clear, and the art where it is solid', () => {
    const rows = backdropRows(1);
    const art = {
      width: 3,
      height: 1,
      data: Buffer.from([10, 20, 30, 0, 10, 20, 30, 255, 0, 0, 0, 51]),
    };
    const out = overBackdrop(art, rows);
    const px = (i: number) =>
      [0, 1, 2].map((c) => out.readUInt16LE(i * 6 + c * 2));
    expect(px(0)).toEqual([...rows]);
    expect(px(1)).toEqual([10 * 257, 20 * 257, 30 * 257]);
    // A fifth of black over the background: four fifths of it.
    expect(px(2)).toEqual([...rows].map((v) => Math.round((v * 204) / 255)));
  });
});
