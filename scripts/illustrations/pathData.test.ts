import { describe, expect, it } from 'vitest';
import {
  circlePath,
  fmt,
  formatPath,
  parsePath,
  parseTransform,
  PathError,
  pointsOf,
  rectPath,
  transformPath,
} from './pathData.ts';

const read = (d: string) => formatPath(parsePath(d));

describe('path data, as Inkscape writes it, into the tables’ form', () => {
  it('makes the peach’s own relative paths absolute, as the tables have them', () => {
    expect(read('M50 12c4-8 14-9 18-4-2 6-9 9-14 8z')).toBe(
      'M50 12 C54 4 64 3 68 8 C66 14 59 17 54 16 Z',
    );
    // S reflects the last handle: the body's third curve.
    expect(
      read(
        'M50 16c20 0 34 16 34 36 0 22-16 38-34 38S16 74 16 52c0-20 14-36 34-36z',
      ),
    ).toBe(
      'M50 16 C70 16 84 32 84 52 C84 74 68 90 50 90 C32 90 16 74 16 52 C16 32 30 16 50 16 Z',
    );
  });

  it('reads a moved path as Inkscape saves it: relative, with commas and repeats', () => {
    expect(read('m 53,9 1.6,3.6 3.8,0.3 -2.9,2.5 z')).toBe(
      'M53 9 L54.6 12.6 L58.4 12.9 L55.5 15.4 Z',
    );
  });

  it('turns lines across and down, quadratics and arcs into lines and cubics', () => {
    expect(read('M10 10 H20 V30 h-5 v-5 Z')).toBe(
      'M10 10 L20 10 L20 30 L15 30 L15 25 Z',
    );
    expect(read('M10 10 Q20 0 30 10 T50 10')).toBe(
      'M10 10 C16.7 3.3 23.3 3.3 30 10 C36.7 16.7 43.3 16.7 50 10',
    );
    // A half circle is two quarter cubics, ending exactly where the arc does.
    expect(read('M10 50 A40 40 0 0 1 90 50')).toBe(
      'M10 50 C10 27.9 27.9 10 50 10 C72.1 10 90 27.9 90 50',
    );
    // Flags may run into the next number.
    expect(read('M10 50 a40,40 0 0180,0')).toBe(
      read('M10 50 A40 40 0 0 1 90 50'),
    );
  });

  it('reads exponents and bare decimals, and writes neither', () => {
    expect(read('M1e1 0 L.5.5')).toBe('M10 0 L0.5 0.5');
    expect(fmt(-0.04)).toBe('0');
    expect(fmt(12.345)).toBe('12.3');
  });

  it('starts a new subpath with a move when drawing goes on after a close', () => {
    expect(read('M0 0 L10 0 z L5 5')).toBe('M0 0 L10 0 Z M0 0 L5 5');
  });

  it('draws a circle as growth-stages.py does, so a redrawn eye reads the same', () => {
    expect(formatPath(circlePath(40, 58, 3.4))).toBe(
      'M36.6 58 C36.6 56.1 38.1 54.6 40 54.6 C41.9 54.6 43.4 56.1 43.4 58 ' +
        'C43.4 59.9 41.9 61.4 40 61.4 C38.1 61.4 36.6 59.9 36.6 58 Z',
    );
    expect(formatPath(rectPath(1, 2, 3, 4))).toBe('M1 2 L4 2 L4 6 L1 6 Z');
  });

  it('applies a transform list to every point, handles included', () => {
    const m = parseTransform('translate(1,0) scale(2)');
    expect(formatPath(transformPath(parsePath('M52 9 L53.6 12.6'), m))).toBe(
      'M105 18 L108.2 25.2',
    );
    const r = parseTransform('rotate(90 50 50)');
    expect(
      pointsOf(transformPath(parsePath('M60 50'), r))[0]!.map((v) =>
        Math.round(v),
      ),
    ).toEqual([50, 60]);
    expect(() => parseTransform('wobble(3)')).toThrow(PathError);
  });

  it('names what it can’t read', () => {
    expect(() => parsePath('M0 0 X3 4')).toThrow(PathError);
    expect(() => parsePath('M0 0 L3')).toThrow(PathError);
  });
});
