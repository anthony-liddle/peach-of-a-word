import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CROWN, canonicalCrown, crownBox } from './crown.ts';

/**
 * The crown table's SHA-256. The iOS app is to pin the same value, so a crown
 * changed in one app and not the other fails in the one that was not changed.
 * Until iOS pins it, this guards the web alone: the iPhone still draws its own
 * `Crown` shape, and nothing fails here if that shape moves.
 */
const CROWN_SHA256 =
  'ce4b0ab3088cfb3039a39bf2c48d15b2358b891659bc15e6ebd8301dd587f75d';

/** Each command and its points, for absolute M, L and Z only. */
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

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
function block(sel: string): string {
  const escaped = sel.replace(/[.[\]$()+*?^|{}\\]/g, '\\$&');
  // The selector alone at the start of its line, so `.edition` is never read
  // off the end of a longer one, such as `.board > .edition`.
  const match = css.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`No rule found for selector: ${sel}`);
  return match[1]!;
}

/**
 * The iPhone's numbers, read off App/CompletionCard.swift: `CompletionOrnament`
 * frames the peach at 112pt with 16pt of padding above it, and frames the crown
 * at 46 by 26pt, centred at the top and offset 2pt up.
 */
const IPHONE = {
  peach: 112,
  paddingTop: 16,
  width: 46,
  height: 26,
  offsetY: -2,
};

describe("the completion card's crown", () => {
  it('is the table the iOS app is to pin', () => {
    const hash = createHash('sha256').update(canonicalCrown()).digest('hex');
    expect(hash).toBe(CROWN_SHA256);
  });

  it("is the iPhone's shape: its seven points, as fractions of the frame", () => {
    // Crown.path(in:) moves to (0, h), then lines to (0.08w, 0.18h),
    // (0.30w, 0.62h), (0.50w, 0), (0.70w, 0.62h), (0.92w, 0.18h) and (w, h),
    // and closes. Here the frame is a 100 by 100 box.
    const fractions = [
      [0, 1],
      [0.08, 0.18],
      [0.3, 0.62],
      [0.5, 0],
      [0.7, 0.62],
      [0.92, 0.18],
      [1, 1],
    ];
    const cmds = commands(CROWN.d);
    expect(cmds.map((c) => c.op).join('')).toBe('MLLLLLLZ');
    const points = cmds.flatMap((c) => c.points);
    expect(points).toEqual(fractions.map(([x, y]) => [x! * 100, y! * 100]));
  });

  it("stands where the iPhone stands it, over the peach's head", () => {
    // In the peach's own 100 by 100 units, 100/112 of a point.
    const unit = 100 / IPHONE.peach;
    const box = crownBox();
    expect(box.x).toBeCloseTo(((IPHONE.peach - IPHONE.width) / 2) * unit, 9);
    expect(box.y).toBeCloseTo((IPHONE.offsetY - IPHONE.paddingTop) * unit, 9);
    expect(box.width).toBeCloseTo(IPHONE.width * unit, 9);
    expect(box.height).toBeCloseTo(IPHONE.height * unit, 9);
  });

  it("stays inside the peach's width, and rises above it no higher than on the iPhone", () => {
    // The costumes' guard, widened by exactly what the iPhone allows: the
    // crown stands 18pt of a 112pt peach above the peach's box. A filled
    // polygon lies inside the hull of its points, so the points decide it.
    const box = crownBox();
    const rise = ((IPHONE.paddingTop - IPHONE.offsetY) / IPHONE.peach) * 100;
    for (const { points } of commands(CROWN.d)) {
      for (const [x, y] of points) {
        const [px, py] = [
          box.x + (x * box.width) / 100,
          box.y + (y * box.height) / 100,
        ];
        expect(px, `x ${px}`).toBeGreaterThanOrEqual(0);
        expect(px, `x ${px}`).toBeLessThanOrEqual(100);
        expect(py, `y ${py}`).toBeGreaterThanOrEqual(-rise - 1e-9);
        expect(py, `y ${py}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("fits in the completion card's top padding at its largest", () => {
    // The ornament is the peach under the iPhone's room for the crown, so the
    // crown rises past the ornament only by the iPhone's 2pt offset. At the
    // top of the entrance it is scaled about the peach's centre, so the
    // overshoot counts too. Measured at the peach's largest, when the card's
    // 30rem wins the base; at any narrower width the peach is smaller and the
    // padding, in rem, is not.
    const padTop = Number(
      block('.edition').match(/padding:\s*([\d.]+)rem/)![1],
    );
    const base = Number(
      block(':root').match(/--card-peach-base:\s*min\(([\d.]+)rem,/)![1],
    );
    const peachFactor = Number(
      block('.edition__ornament--peach').match(/\* ([\d.]+) \/ 402\)/)![1],
    );
    const roomFactor = Number(
      block('.crowned').match(
        /padding-top:\s*calc\(var\(--card-peach-base\) \* ([\d.]+) \/ 402\)/,
      )![1],
    );
    const size = (base * peachFactor) / 402;
    const room = (base * roomFactor) / 402;
    const frames = css.match(/@keyframes peach-settle\s*\{([\s\S]*?)\n\}/)![1]!;
    const overshoot = Math.max(
      1,
      ...[...frames.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1])),
    );
    // From the ornament's top: the peach's centre, and the crown's top at rest.
    const centre = room + size / 2;
    const crownTop = room + (crownBox().y / 100) * size;
    const risen = -(centre - overshoot * (centre - crownTop));
    expect(risen).toBeLessThan(padTop);
  });

  it("is the cute theme's peach colour, as on the iPhone", () => {
    // Cute.crown on the iPhone, and --crown in the cute block of index.css.
    expect(CROWN.fill).toBe('#FF9E58');
    const cute = css.slice(css.indexOf("[data-theme='cute'] {"));
    expect(cute).toMatch(/--crown:\s*#ff9e58;/i);
  });
});
