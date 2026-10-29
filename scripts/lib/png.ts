import { inflateSync } from 'node:zlib';

/**
 * Just enough of PNG to read what headless Chrome writes with a transparent
 * background: 8-bit RGBA, colour type 6, not interlaced. Anything else
 * throws, rather than being read wrong.
 */
export interface Rgba {
  width: number;
  height: number;
  /** Four bytes a pixel, straight alpha, row after row. */
  data: Buffer;
}

export function decodeRgbaPng(png: Buffer): Rgba {
  if (png.toString('latin1', 1, 4) !== 'PNG') throw new Error('Not a PNG.');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const [depth, colour, , , interlace] = png.subarray(24, 29);
  if (depth !== 8 || colour !== 6 || interlace !== 0)
    throw new Error(
      `Expected 8-bit RGBA, not interlaced; read depth ${depth}, colour type ${colour}, interlace ${interlace}.`,
    );
  const idat: Buffer[] = [];
  for (let i = 8; i < png.length; i += 12 + png.readUInt32BE(i)) {
    if (png.toString('latin1', i + 4, i + 8) === 'IDAT')
      idat.push(png.subarray(i + 8, i + 8 + png.readUInt32BE(i)));
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = data.subarray(y * stride, (y + 1) * stride);
    const up = y ? data.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[x - 4]! : 0;
      const b = up ? up[x]! : 0;
      const c = up && x >= 4 ? up[x - 4]! : 0;
      let predicted: number;
      switch (filter) {
        case 0:
          predicted = 0;
          break;
        case 1:
          predicted = a;
          break;
        case 2:
          predicted = b;
          break;
        case 3:
          predicted = (a + b) >> 1;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`Unknown PNG filter ${filter} on row ${y}.`);
      }
      out[x] = (line[x]! + predicted) & 0xff;
    }
  }
  return { width, height, data };
}
