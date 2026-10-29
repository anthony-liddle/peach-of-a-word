import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COSTUMES,
  COSTUME_ORDER,
  SOURCE_MARK_TRANSFORM,
  canonicalCostumeTable,
} from './costumes.ts';

/**
 * The table's SHA-256. The iOS app pins the same value in
 * `CostumeTests.swift`, so a costume or a day changed in one app and not the
 * other fails in the one that was not changed.
 */
const COSTUME_TABLE_SHA256 =
  '6ce9309b2de3cbd9d651cb6213ef02a4e3bff819f299e62c130a403e66cf97a0';

/** Each command and its numbers, for absolute M, L, C and Z only. */
function commands(d: string): { op: string; points: [number, number][] }[] {
  const out: { op: string; points: [number, number][] }[] = [];
  for (const m of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const nums = (m[2]!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2)
      points.push([nums[i]!, nums[i + 1]!]);
    out.push({ op: m[1]!, points });
  }
  return out;
}

const parts = COSTUME_ORDER.flatMap((id) =>
  COSTUMES[id].parts.map((p) => ({ id, ...p })),
);

describe('the costumes', () => {
  it('are drawn in absolute M, L, C and Z only, with whole point pairs', () => {
    for (const p of parts) {
      for (const { op, points } of commands(p.d)) {
        expect('MLCZ', `${p.id}: ${op} in ${p.d}`).toContain(op);
        const want = { M: 1, L: 1, C: 3, Z: 0 }[op as 'M' | 'L' | 'C' | 'Z'];
        expect(points.length % Math.max(want, 1), `${p.id}: ${p.d}`).toBe(0);
      }
    }
  });

  it("stay inside the peach's 100 by 100 box, strokes included", () => {
    // A cubic lies inside the hull of its four points, so every point inside
    // the box, less half the stroke, keeps every edge inside it.
    for (const p of parts) {
      const pad = (p.strokeWidth ?? 0) / 2;
      for (const { points } of commands(p.d)) {
        for (const [x, y] of points) {
          expect(x, `${p.id}: x ${x} in ${p.d}`).toBeGreaterThanOrEqual(pad);
          expect(x, `${p.id}: x ${x} in ${p.d}`).toBeLessThanOrEqual(100 - pad);
          expect(y, `${p.id}: y ${y} in ${p.d}`).toBeGreaterThanOrEqual(pad);
          expect(y, `${p.id}: y ${y} in ${p.d}`).toBeLessThanOrEqual(100 - pad);
        }
      }
    }
  });

  it("stay inside the box moved onto the source-word mark's peach", () => {
    const [a, , , d, e, f] =
      SOURCE_MARK_TRANSFORM.match(/-?\d*\.?\d+/g)!.map(Number);
    for (const p of parts) {
      const pad = ((p.strokeWidth ?? 0) / 2) * Math.max(a!, d!);
      for (const { points } of commands(p.d)) {
        for (const [x, y] of points) {
          const [tx, ty] = [a! * x + e!, d! * y + f!];
          expect(tx).toBeGreaterThanOrEqual(pad);
          expect(tx).toBeLessThanOrEqual(100 - pad);
          expect(ty).toBeGreaterThanOrEqual(pad);
          expect(ty).toBeLessThanOrEqual(100 - pad);
        }
      }
    }
  });

  it("map PeachMark's body onto the mark's body", () => {
    const [a, , , d, e, f] =
      SOURCE_MARK_TRANSFORM.match(/-?\d*\.?\d+/g)!.map(Number);
    // PeachMark's body spans 16 to 84 across and 16 to 90 down; the mark's
    // spans 18 to 82 and 19 to 87 (index.css, `.mark--source`).
    expect(a! * 16 + e!).toBeCloseTo(18, 1);
    expect(a! * 84 + e!).toBeCloseTo(82, 1);
    expect(d! * 16 + f!).toBeCloseTo(19, 1);
    expect(d! * 90 + f!).toBeCloseTo(87, 1);
  });

  it('each say what the peach is wearing, differently', () => {
    const spoken = COSTUME_ORDER.map((id) => COSTUMES[id].spoken);
    expect(new Set(spoken).size).toBe(COSTUME_ORDER.length);
    for (const s of spoken) expect(s.trim().length).toBeGreaterThan(4);
  });

  it('are the table the iOS app pins', () => {
    const hash = createHash('sha256')
      .update(canonicalCostumeTable())
      .digest('hex');
    expect(hash).toBe(COSTUME_TABLE_SHA256);
  });
});

describe('the costume page', () => {
  it('is a development page only, never a build entry', () => {
    // A surprise: nothing Bea can open before the day may show a costume, so
    // costumes.html must stay out of the production build's entries.
    const config = readFileSync(
      resolve(process.cwd(), 'vite.config.ts'),
      'utf8',
    );
    const inputs = config.slice(config.indexOf('input: {'));
    expect(inputs.slice(0, inputs.indexOf('}'))).not.toMatch(/costume/i);
  });
});
