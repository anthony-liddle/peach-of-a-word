import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CROWN, crownBox } from '@/ui/crown.ts';
import { crownFile } from './export.ts';
import { crownPlan, readFile } from './importer.ts';
import { formatPath, parsePath, transformPath } from './pathData.ts';
import { WriteError, writeCrownSwift, writeCrownTs } from './writers.ts';

/**
 * The completion card's crown, back from Inkscape (answer 8): drawn in the
 * peach's box as it looks on the card, written in its own 100 by 100 box.
 * Each edit is planted in the file the export writes, as Inkscape would save
 * it, and read back the way import.ts reads it.
 */
const expected = readFile(crownFile().svg);
const planOf = (svg: string) => crownPlan(readFile(svg), expected);

/** The file, with the crown's own object's attribute changed. */
const withCrown = (attr: 'd' | 'style', value: string) => {
  const svg = crownFile().svg;
  const re = new RegExp(`(id="crown-crown"[\\s\\S]*?${attr}=")[^"]*(")`);
  expect(re.test(svg)).toBe(true);
  return svg.replace(re, `$1${value}$2`);
};

/** The crown's own box to the peach's, as the file draws it, at 3 decimals. */
const onPeach = (d: string) => {
  const b = crownBox();
  return formatPath(
    transformPath(parsePath(d), [
      b.width / 100,
      0,
      0,
      b.height / 100,
      b.x,
      b.y,
    ]),
    3,
  );
};

describe("the completion card's crown, back from Inkscape", () => {
  it('an untouched file changes nothing, byte for byte', () => {
    const p = planOf(crownFile().svg);
    expect(p.problems).toEqual([]);
    expect(p.changes).toEqual([]);
    expect(p.d).toBe(CROWN.d);
  });

  it('undoes the stretch before rounding: rounded first, an untouched crown would move', () => {
    // The file's outline at one decimal in the peach's units, as every other
    // part is read, then unstretched: the crown it came from is not what
    // comes back. This is why the crown is read at full precision.
    const part = readFile(crownFile().svg).parts[0]!.part;
    const b = crownBox();
    const roundedFirst = formatPath(
      transformPath(parsePath(part.d), [
        100 / b.width,
        0,
        0,
        100 / b.height,
        (-b.x * 100) / b.width,
        (-b.y * 100) / b.height,
      ]),
    );
    expect(roundedFirst).not.toBe(CROWN.d);
  });

  it('brings an edit back exactly: a peak moved, a curve, decimals', () => {
    const d =
      'M0 100 L8 18 L30 62 C36.5 41.2 44 9.5 50.4 2.5 L70 62 L92 18 L100 100 Z';
    const p = planOf(crownFile(d).svg);
    expect(p.problems).toEqual([]);
    expect(p.d).toBe(d);
    expect(p.changes).toEqual([`"crown"'s outline changed: ${d}`]);
    // And the file the export then writes reads back as the same edit.
    expect(
      crownPlan(readFile(crownFile(d).svg), readFile(crownFile(d).svg), {
        ...CROWN,
        d,
      }),
    ).toMatchObject({ d, changes: [], problems: [] });
  });

  it('takes the edit as Inkscape draws it, in the peach box, not the code', () => {
    const d = 'M0 100 L8 18 L30 62 L50 6.4 L70 62 L92 18 L100 100 Z';
    expect(planOf(withCrown('d', onPeach(d))).d).toBe(d);
  });

  it("stops on a colour, an opacity or a stroke: the colour is the theme's", () => {
    for (const style of [
      'fill:#FF0000',
      'fill:#FF9E58;opacity:0.5',
      'fill:#FF9E58;stroke:#000000;stroke-width:1',
    ]) {
      const p = planOf(withCrown('style', style));
      expect(p.problems.join('\n')).toMatch(/--crown in src\/index.css/);
      expect(p.d).toBe(CROWN.d);
      expect(p.changes).toEqual([]);
    }
  });

  it("stops on a crown rising above its frame, or past the peach's width", () => {
    const higher = 'M0 100 L8 18 L30 62 L50 -6 L70 62 L92 18 L100 100 Z';
    expect(planOf(withCrown('d', onPeach(higher))).problems.join('\n')).toMatch(
      /rises to y .* above the top of its frame/,
    );
    const wider = 'M-80 100 L8 18 L30 62 L50 0 L70 62 L92 18 L100 100 Z';
    expect(planOf(withCrown('d', onPeach(wider))).problems.join('\n')).toMatch(
      /outside the peach's width/,
    );
  });

  it('stops on a second shape, or none: the crown is one', () => {
    const svg = crownFile().svg;
    const second = svg.replace(
      /(<path\s+id="crown-crown"[^>]*\/>)/,
      '$1\n    <path id="jewel" inkscape:label="jewel" d="M45 0 L55 0 L50 5 Z" style="fill:#FF9E58" />',
    );
    expect(second).toContain('id="jewel"');
    expect(planOf(second).problems.join('\n')).toMatch(
      /the crown is one shape, labelled "crown"/,
    );
    const none = svg.replace(/<path\s+id="crown-crown"[^>]*\/>/, '');
    expect(planOf(none).problems.join('\n')).toMatch(
      /can be reshaped, not deleted/,
    );
  });

  it('stops on an edit to the locked peach under it', () => {
    const svg = crownFile().svg.replace(
      'id="ref-smile"',
      'id="ref-smile" transform="translate(1 0)"',
    );
    expect(planOf(svg).problems.join('\n')).toMatch(
      /the locked layer "reference" was edited/,
    );
  });
});

describe("the crown's writers", () => {
  const d = 'M0 100 L8 18 L30 62 L50 6.4 L70 62 L92 18 L100 100 Z';

  it("writes the web's CROWN.d and nothing else", () => {
    const at = resolve(process.cwd(), 'src/ui/crown.ts');
    const before = readFileSync(at, 'utf8');
    const after = writeCrownTs(before, d);
    expect(after).toBe(before.replace(`'${CROWN.d}'`, `'${d}'`));
  });

  it("writes iOS's CompletionCrown.d, and stops on a checkout from before #119", () => {
    const swift = `public enum CompletionCrown {\n    public static let d = "${CROWN.d}"\n    public static let fill = "#FF9E58"\n}\n`;
    expect(writeCrownSwift(swift, d)).toBe(swift.replace(CROWN.d, d));
    expect(() => writeCrownSwift('', d)).toThrow(WriteError);
    expect(() => writeCrownSwift('', d)).toThrow(
      /bring that checkout up to date with main/,
    );
  });
});
