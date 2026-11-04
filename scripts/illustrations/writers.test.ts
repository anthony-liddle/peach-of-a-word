import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COSTUMES, type CostumeId, type CostumePart } from '@/ui/costumes.ts';
import type { Plan } from './importer.ts';
import {
  writeCostumesSwift,
  writeCostumesTs,
  writeHash,
  writeLabelsTs,
} from './writers.ts';

/**
 * A small table in each repo's layout, so these hold whatever the costumes
 * become: comments on the parts, a colour by its constant's name, a part laid
 * out over two lines in Swift.
 */
const TS = `const LEAF = '#8FD3B6';

export const COSTUMES: Record<CostumeId, Costume> = {
  'witch-hat': {
    id: 'witch-hat',
    spoken: "in a witch's hat",
    replacesFace: false,
    parts: [
      // The cone.
      {
        d: 'M33 27 L47 7 L66 27 Z',
        fill: '#5B3F8C',
      },
      // The band, in the leaf's mint.
      {
        d: 'M35 24 L64 24 L62 19 Z',
        fill: LEAF,
      },
      // The star, with the face.
      {
        d: 'M52 9 L53.6 12.6 L50.4 12.6 Z',
        fill: '#FFE08A',
        faceOnly: true,
      },
    ],
  },
};
`;

const SWIFT = `extension Costume {
    static let witchHatTable = CostumeTable(
        spoken: "in a witch's hat",
        replacesFace: false,
        parts: [
            CostumePart("M33 27 L47 7 L66 27 Z",
                        fill: "#5B3F8C"),
            CostumePart("M35 24 L64 24 L62 19 Z", fill: leaf),
            CostumePart("M52 9 L53.6 12.6 L50.4 12.6 Z", fill: "#FFE08A", faceOnly: true),
        ]
    )
}
`;

const PARTS: CostumePart[] = [
  { d: 'M33 27 L47 7 L66 27 Z', fill: '#5B3F8C' },
  { d: 'M35 24 L64 24 L62 19 Z', fill: '#8FD3B6' },
  { d: 'M52 9 L53.6 12.6 L50.4 12.6 Z', fill: '#FFE08A', faceOnly: true },
];
const old = () => PARTS;

const plan = (
  parts: CostumePart[],
  from: (number | null)[],
  labels: string[],
): Plan => ({
  id: 'witch-hat',
  from,
  parts,
  labels,
  changes: ['changed'],
  notes: [],
  problems: [],
});
const same = () =>
  plan(
    PARTS.map((p) => ({ ...p })),
    [0, 1, 2],
    ['cone', 'band', 'star'],
  );

describe('writing the tables back', () => {
  it('leaves the live costumes.ts byte for byte when no part changed', () => {
    const live = readFileSync(
      resolve(import.meta.dirname, '../../src/ui/costumes.ts'),
      'utf8',
    );
    for (const id of Object.keys(COSTUMES) as CostumeId[]) {
      const parts = COSTUMES[id].parts.map((p) => ({ ...p }));
      const unchanged: Plan = {
        ...same(),
        id,
        parts,
        from: parts.map((_, i) => i),
      };
      expect(writeCostumesTs(live, [unchanged], (c) => COSTUMES[c].parts)).toBe(
        live,
      );
    }
  });

  it('leaves both tables as they were when no part changed', () => {
    expect(writeCostumesTs(TS, [same()], old)).toBe(TS);
    expect(writeCostumesSwift(SWIFT, [same()], old)).toBe(SWIFT);
    expect(writeCostumesTs(TS, [{ ...same(), changes: [] }], old)).toBe(TS);
  });

  it('rewrites only what changed, keeping the comments and the constants that held', () => {
    const p = same();
    p.parts[0] = { ...p.parts[0]!, fill: '#241F1C' };
    p.parts[1] = { ...p.parts[1]!, d: 'M35 24 L64 24 Z' };
    expect(writeCostumesTs(TS, [p], old)).toBe(
      TS.replace("fill: '#5B3F8C'", "fill: '#241F1C'").replace(
        "d: 'M35 24 L64 24 L62 19 Z'",
        "d: 'M35 24 L64 24 Z'",
      ),
    );
    expect(writeCostumesSwift(SWIFT, [p], old)).toBe(
      SWIFT.replace(
        'CostumePart("M33 27 L47 7 L66 27 Z",\n                        fill: "#5B3F8C")',
        'CostumePart("M33 27 L47 7 L66 27 Z", fill: "#241F1C")',
      ).replace(
        '"M35 24 L64 24 L62 19 Z", fill: leaf',
        '"M35 24 L64 24 Z", fill: leaf',
      ),
    );
  });

  it('moves a part with its comment, and gives a new part its label as one', () => {
    const whisker: CostumePart = {
      d: 'M40 40 L45 45',
      stroke: '#000000',
      strokeWidth: 1,
    };
    const p = plan(
      [PARTS[1]!, PARTS[0]!, PARTS[2]!, whisker],
      [1, 0, 2, null],
      ['band', 'cone', 'star', 'whisker'],
    );
    const ts = writeCostumesTs(TS, [p], old);
    expect(ts.indexOf("// The band, in the leaf's mint.")).toBeLessThan(
      ts.indexOf('// The cone.'),
    );
    expect(ts).toContain(
      "// whisker.\n      {\n        d: 'M40 40 L45 45',\n        stroke: '#000000',\n        strokeWidth: 1,\n      }",
    );
    const swift = writeCostumesSwift(SWIFT, [p], old);
    expect(swift.indexOf('fill: leaf')).toBeLessThan(
      swift.indexOf('fill: "#5B3F8C"'),
    );
    expect(swift).toContain(
      'CostumePart("M40 40 L45 45", stroke: "#000000", strokeWidth: 1)',
    );
  });

  it('keeps a part on the peach’s own outline named, when only its paint changes', () => {
    const ts =
      'export const COSTUMES = {\n  ghost: {\n    parts: [\n      // The leaf.\n' +
      '      { d: PEACH_OUTLINE.leaf, fill: LEAF },\n    ],\n  },\n};\n';
    const swift =
      '    static let ghostTable = CostumeTable(\n        parts: [\n' +
      '            CostumePart(PeachOutline.leaf, fill: leaf),\n        ]\n    )\n';
    const leaf = 'M50 12 C54 4 64 3 68 8 C66 14 59 17 54 16 Z';
    const p: Plan = {
      ...same(),
      id: 'ghost',
      from: [0],
      parts: [{ d: leaf, fill: '#123456' }],
      labels: ['leaf'],
    };
    const was = () => [{ d: leaf, fill: '#8FD3B6' }];
    expect(writeCostumesTs(ts, [p], was)).toContain(
      "d: PEACH_OUTLINE.leaf,\n        fill: '#123456',",
    );
    expect(writeCostumesSwift(swift, [p], was)).toContain(
      'CostumePart(PeachOutline.leaf, fill: "#123456")',
    );
  });

  it('breaks a long new path as the Swift table breaks one', () => {
    const p = same();
    const long = Array.from(
      { length: 12 },
      (_, i) => `L${10 + i}.5 ${20 + i}.5`,
    ).join(' ');
    p.parts[0] = { ...p.parts[0]!, d: `M10 10 ${long} Z` };
    const swift = writeCostumesSwift(SWIFT, [p], old);
    const part = swift.slice(
      swift.indexOf('CostumePart("M10 10'),
      swift.indexOf('fill: "#5B3F8C")') + 17,
    );
    expect(part.split('\n').length).toBeGreaterThan(2);
    expect(part.split('\n').every((l) => l.length <= 100)).toBe(true);
    expect(part).toContain('\n                        + "L');
  });

  it('rewrites a costume’s labels, and moves a pinned hash', () => {
    const labels =
      "export const COSTUME_LABELS = {\n  'witch-hat': ['cone', 'fold'],\n  lantern: ['stem'],\n};\n";
    const p = plan([], [], ['fold', "cone's tip"]);
    expect(writeLabelsTs(labels, [p])).toContain(
      "'witch-hat': ['fold', 'cone\\'s tip'],\n  lantern: ['stem'],",
    );
    const pinned = `const COSTUME_TABLE_SHA256 =\n  '${'a'.repeat(64)}';`;
    expect(writeHash(pinned, 'COSTUME_TABLE_SHA256', 'b'.repeat(64))).toBe(
      `const COSTUME_TABLE_SHA256 =\n  '${'b'.repeat(64)}';`,
    );
  });
});
