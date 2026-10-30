import { BACKDROP } from '../../src/storeArt/storeArtSpec.ts';
import type { Rgba } from './png.ts';

/**
 * The store art's frames in motion, put back together outside the browser:
 * what the page draws, captured on transparency, laid over its background
 * worked out here at 16 bits a channel.
 *
 * **Why not let the browser draw the background:** Chrome dithers a CSS
 * gradient with an ordered pattern placed by its raster tiles, and a long
 * capture can raster a tile again two rows off, so the same moment came out
 * a level different. Worked out here, the background is the same in every
 * frame, and keeps the precision a video encoder can use to avoid banding.
 */

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * The background's colour on each row, 16 bits a channel: CSS's
 * `linear-gradient(180deg, top, bottom)`, mixed in sRGB as CSS mixes a
 * gradient of hex colours, at each row's middle.
 */
export function backdropRows(height: number): Uint16Array {
  const [top, bottom] = BACKDROP.map(channels);
  const rows = new Uint16Array(height * 3);
  for (let y = 0; y < height; y++) {
    const p = (y + 0.5) / height;
    for (let c = 0; c < 3; c++)
      rows[y * 3 + c] = Math.round(
        257 * (top![c]! + (bottom![c]! - top![c]!) * p),
      );
  }
  return rows;
}

/**
 * `art`, captured on transparency, over the background: 16-bit RGB,
 * little-endian, the `rgb48le` that ffmpeg reads raw.
 */
export function overBackdrop(art: Rgba, rows: Uint16Array): Buffer {
  const { width, height, data } = art;
  if (rows.length !== height * 3)
    throw new Error(
      `The background has ${rows.length / 3} rows, not ${height}.`,
    );
  const out = Buffer.alloc(width * height * 6);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]!;
      const o = (y * width + x) * 6;
      for (let c = 0; c < 3; c++) {
        const bg = rows[y * 3 + c]!;
        const v =
          a === 0
            ? bg
            : a === 255
              ? data[i + c]! * 257
              : Math.round((data[i + c]! * 257 * a + bg * (255 - a)) / 255);
        out.writeUInt16LE(v, o + c * 2);
      }
    }
  }
  return out;
}
