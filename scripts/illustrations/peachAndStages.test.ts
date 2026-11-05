import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CostumePart } from '@/ui/costumes.ts';
import type { PeachPart } from '@/ui/peachArt.ts';
import { GROWTH_STAGES } from '@/storeArt/growthStages.ts';
import * as prettier from 'prettier';
import { faviconCuteSvg } from '../lib/icons.ts';
import { costumeFile, peachFile, stageFile } from './export.ts';
import {
  PEACH_PART_LABELS,
  peachProblems,
  peachTable,
  plan,
  readFile,
  sameDrawing,
  type Flags,
} from './importer.ts';
import { STAGE_LABELS } from './labels.ts';
import { circlePath, formatPath } from './pathData.ts';
import { iconPeachFromGame } from './redraw.ts';
import {
  inPlace,
  isDrawnOnItsOwn,
  peachArtParts,
  stageForm,
  writeGrowthStagesTs,
  writePeachArtTs,
  writePeachPy,
  writeStagePy,
  type StageJson,
} from './writers.ts';

/**
 * The peach's and the stages' way back. Every file here is written in memory
 * from the repo's own tables by the export, then edited as Inkscape would
 * edit it; the generator is iOS's, so its layout is a small fixture here.
 */

const peachSvg = () => peachFile().svg;

const readPeach = (svg: string, flags: Flags = {}) => {
  const p = plan(
    'peach',
    readFile(svg),
    readFile(peachSvg()),
    peachTable(),
    PEACH_PART_LABELS,
    flags,
    new Map(),
  );
  return { ...p, problems: [...p.problems, ...peachProblems(p)] };
};

/** The left eye, redrawn by hand as a path, whatever it was drawn as. */
const EYE = 'M36 58 L44 58 L40 52 Z';
const reshapedEye = (svg: string) => {
  const out = svg.replace(
    /<(circle|path)\s+id="peach-eye-left-face-only"[^>]*\/>/,
    `<path id="peach-eye-left-face-only" inkscape:label="eye, left (face only)" d="${EYE}" style="fill:#7A4A33" />`,
  );
  if (out === svg) throw new Error('no left eye to redraw');
  return out;
};

describe('the peach, read back', () => {
  it('reads its own file back unchanged', () => {
    const p = readPeach(peachSvg());
    expect(p.problems).toEqual([]);
    expect(p.changes).toEqual([]);
    expect(p.parts).toEqual(peachTable());
  });

  it("reads Perfectly Peachy's file as the peach: the same parts, the same labels", () => {
    expect(STAGE_LABELS['perfectly-peachy']).toEqual(PEACH_PART_LABELS);
    const p = plan(
      'peach',
      readFile(stageFile('perfectly-peachy').svg),
      readFile(stageFile('perfectly-peachy').svg),
      peachTable(),
      PEACH_PART_LABELS,
      {},
      new Map(),
    );
    expect(p.problems).toEqual([]);
    expect(p.changes).toEqual([]);
  });

  it('takes an eye redrawn as a path, still with the face', () => {
    const p = readPeach(reshapedEye(peachSvg()));
    expect(p.problems).toEqual([]);
    expect(p.changes).toEqual(['"eye, left"\'s outline changed']);
    expect(p.parts[3]).toEqual({ d: EYE, fill: '#7A4A33', faceOnly: true });
  });

  it("reshapes the peach's own leaf, which a costume can't", () => {
    const leaf = 'M50 12 C55 3 65 2 69 8 C66 14 59 17 54 16 Z';
    const svg = peachSvg().replace(
      /(id="peach-leaf"[^>]*?\sd=")[^"]*/,
      `$1${leaf}`,
    );
    const p = readPeach(svg);
    expect(p.problems).toEqual([]);
    expect(p.parts[0]!.d).toBe(leaf);
  });

  it('keeps its eight parts in their order, flag or no flag', () => {
    const noSmile = peachSvg().replace(
      /\s*<path\s+id="peach-smile-face-only"[^>]*\/>/,
      '',
    );
    expect(
      readPeach(noSmile, { allowDeletedParts: true }).problems.join(),
    ).toContain('the peach keeps its eight parts in their order');
    const noFace = peachSvg().replace(
      'inkscape:label="eye, left (face only)"',
      'inkscape:label="eye, left"',
    );
    expect(readPeach(noFace).problems.join()).toContain(
      '"eye, left" is part of the face',
    );
  });
});

describe('an eye redrawn as a path, through every writer', () => {
  // A circle in peachArt.ts and the tab icon, and a circle() call in the
  // generator, each become path data, and nothing else moves. A small peach
  // of their own, so these hold whatever the peach becomes.
  const ART = `export const PEACH_BODY: readonly PeachPart[] = [
  { d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' },
];

/** The face. */
export const PEACH_FACE: readonly PeachPart[] = [
  { circle: [40, 58, 3.4], fill: '#7A4A33' },
  { circle: [60, 58, 3.4], fill: '#7A4A33' },
];
`;
  const oldArt: PeachPart[] = [
    { d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' },
    { circle: [40, 58, 3.4], fill: '#7A4A33' },
    { circle: [60, 58, 3.4], fill: '#7A4A33' },
  ];
  const circleD = (cx: number, cy: number, r: number) =>
    formatPath(circlePath(cx, cy, r));
  const was: CostumePart[] = [
    { d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' },
    { d: circleD(40, 58, 3.4), fill: '#7A4A33', faceOnly: true },
    { d: circleD(60, 58, 3.4), fill: '#7A4A33', faceOnly: true },
  ];
  const now: CostumePart[] = [
    was[0]!,
    { d: EYE, fill: '#7A4A33', faceOnly: true },
    was[2]!,
  ];

  it("peachArt.ts: the eye's circle becomes path data, the rest as written", () => {
    const out = writePeachArtTs(ART, now, was);
    expect(out).not.toContain('circle: [40, 58, 3.4]');
    expect(out).toContain(`d: '${EYE}'`);
    expect(out).toContain("{ circle: [60, 58, 3.4], fill: '#7A4A33' }");
    expect(out).toContain(
      "{ d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' }",
    );
    expect(writePeachArtTs(ART, was, was)).toBe(ART);
  });

  it('the tab icon: the eye is a path, the other eye still a circle', () => {
    const svg = faviconCuteSvg(peachArtParts(now, was, oldArt));
    expect(svg).toContain(`<path d="${EYE}" fill="#7A4A33"/>`);
    expect(svg).not.toContain('<circle cx="40"');
    expect(svg).toContain('<circle cx="60" cy="58" r="3.4" fill="#7A4A33"/>');
  });

  it("the generator: the eye's circle() becomes literal, keeping COCOA and its label", () => {
    const py = [
      '# The peach: from here',
      'PEACH_PARTS = [',
      '    dict(d="M50 12 C54 4 64 3 68 8 C66 14 59 17 54 16 Z", fill=LEAF),  # leaf',
      '    dict(d=circle(40, 58, 3.4), fill=COCOA, faceOnly=True),  # eye, left',
      ']',
      '# The peach: to here',
    ].join('\n');
    const two = (parts: readonly CostumePart[]) => [parts[0]!, parts[1]!];
    const out = writePeachPy(py, two(now), two(was));
    expect(out.split('\n')[2]).toBe(py.split('\n')[2]);
    expect(out.split('\n')[3]).toBe(
      `    dict(d="${EYE}", fill=COCOA, faceOnly=True),  # eye, left`,
    );
    expect(writePeachPy(py, two(was), two(was))).toBe(py);
  });

  it('the whole peach, read from its file and written to the live peachArt.ts', () => {
    // Whatever the live peach is, the eye redrawn in its file lands in
    // PEACH_FACE as path data, and an untouched peach writes nothing.
    const p = readPeach(reshapedEye(peachSvg()));
    const source = readFileSync(
      resolve(process.cwd(), 'src/ui/peachArt.ts'),
      'utf8',
    );
    expect(writePeachArtTs(source, p.parts, peachTable())).toContain(
      `d: '${EYE}'`,
    );
    expect(writePeachArtTs(source, peachTable(), peachTable())).toBe(source);
  });
});

/** The generator's three ways of writing a stage, as growth-stages.py has them. */
const GENERATOR = `DRAWN_ON_THEIR_OWN = []

STAGES = [
    {
        "rank": "First Sprout",
        "spoken": "a first sprout",
        "parts": [
            dict(d="M50 72 C50 62 49 54 50 46", stroke=LEAF_DEEP, strokeWidth=4),
            dict(d=SOIL_MOUND, fill=SOIL),
        ] + small_face(50, 81, 0.9),
    },
    {
        "rank": "Sweet",
        "spoken": "ripe and sweet",
        "parts": peach_parts(0.86, 7, 12),
    },
    {
        # Today's peach, full size, crowned.
        "rank": "Peachy Keen Supreme",
        "spoken": "wearing its crown",
        "parts": peach_parts()[1:] + [
            dict(d="M29 33 L26 11 L39 21 Z",
                 fill=CROWN),
            dict(d=circle(26, 11, 3), fill=POLLEN, faceOnly=True),
        ],
    },
]
`;

const parts = (n: number, fill = '#FFC27A'): CostumePart[] =>
  Array.from({ length: n }, (_, i) => ({ d: `M${i} 0 L${i} 1 Z`, fill }));

describe('a stage, written back into the generator', () => {
  it('finds each way a stage is written', () => {
    expect(stageForm(GENERATOR, 'a first sprout').peach).toBe(0);
    expect(stageForm(GENERATOR, 'ripe and sweet').peach).toBe(8);
    const crown = stageForm(GENERATOR, 'wearing its crown');
    expect(crown.peach).toBe(7);
    expect(GENERATOR[crown.own!]).toBe('[');
  });

  it('writes a stage drawn on its own as literal path data, in place of its formula', () => {
    const old = parts(5);
    const now = [...old.slice(0, 4), { ...old[4]!, fill: '#CFE3A0' }];
    const labels = ['stem', 'soil', 'eye, left', 'eye, right', 'smile'];
    const w = writeStagePy(
      GENERATOR,
      { id: 'first-sprout', spoken: 'a first sprout' },
      inPlace(now, labels),
      old,
      '2026-11-05',
    );
    expect(w.drawnOnItsOwn).toBe(false);
    expect(w.text).not.toContain('small_face(50, 81, 0.9)');
    expect(w.text).toContain(
      '            dict(d="M4 0 L4 1 Z", fill="#CFE3A0"),  # smile\n',
    );
    expect(w.text).not.toContain('Edited in Inkscape');
    // The other stages are as they were.
    expect(w.text).toContain('"parts": peach_parts(0.86, 7, 12),');
    expect(stageForm(w.text, 'a first sprout').peach).toBe(0);
  });

  const SWEET = { id: 'sweet', spoken: 'ripe and sweet' };
  const CROWN = { id: 'crown', spoken: 'wearing its crown' };

  it("stops on an edit to a following stage's peach, unless told to draw it on its own", () => {
    // Antoine, 4 November 2026: a stage drawn from the peach stops following
    // it only when DRAWN_ON_THEIR_OWN names it, and only with the flag.
    const old = parts(8);
    const now = [{ ...old[0]!, fill: '#000000' }, ...old.slice(1)];
    expect(() =>
      writeStagePy(
        GENERATOR,
        SWEET,
        inPlace(now, PEACH_PART_LABELS),
        old,
        '2026-11-05',
      ),
    ).toThrow(/follows it.*--draw-on-its-own/s);
  });

  it('with the flag, names it in DRAWN_ON_THEIR_OWN, writes it out, and says so where it stands', () => {
    const old = parts(8);
    const now = [{ ...old[0]!, fill: '#000000' }, ...old.slice(1)];
    const w = writeStagePy(
      GENERATOR,
      SWEET,
      inPlace(now, PEACH_PART_LABELS),
      old,
      '2026-11-05',
      true,
    );
    expect(w.drawnOnItsOwn).toBe(true);
    expect(w.text).toContain('DRAWN_ON_THEIR_OWN = ["sweet"]\n');
    expect(isDrawnOnItsOwn(w.text, 'sweet')).toBe(true);
    expect(isDrawnOnItsOwn(w.text, 'crown')).toBe(false);
    expect(w.text).not.toContain('peach_parts(0.86, 7, 12)');
    expect(w.text).toContain(
      '        # Edited in Inkscape on 2026-11-05 and drawn on its own, as DRAWN_ON_THEIR_OWN\n' +
        '        # says: it no longer follows the peach (Antoine, 4 November 2026).\n' +
        '        "parts": [\n',
    );
    expect(stageForm(w.text, 'ripe and sweet').peach).toBe(0);
    // Edited again, it is already on its own: no flag, and named once.
    const again = writeStagePy(
      w.text,
      SWEET,
      inPlace(
        [{ ...now[0]!, fill: '#111111' }, ...now.slice(1)],
        PEACH_PART_LABELS,
      ),
      now,
      '2026-11-06',
    );
    expect(again.drawnOnItsOwn).toBe(false);
    expect(again.text).toContain('DRAWN_ON_THEIR_OWN = ["sweet"]\n');
  });

  it("keeps the crown on the peach when only the crown's own parts change", () => {
    const [crown, jewel] = parts(2, '#FF9E58');
    const old = [...parts(7), crown!, { ...jewel!, faceOnly: true }];
    const now = [...old.slice(0, 8), { ...old[8]!, fill: '#FF0000' }];
    const w = writeStagePy(GENERATOR, CROWN, inPlace(now), old, '2026-11-05');
    expect(w.drawnOnItsOwn).toBe(false);
    expect(isDrawnOnItsOwn(w.text, 'crown')).toBe(false);
    expect(w.text).toContain('"parts": peach_parts()[1:] + [');
    // The crown itself is untouched, laid out over two lines as it was.
    expect(w.text).toContain(
      'dict(d="M29 33 L26 11 L39 21 Z",\n                 fill=CROWN),',
    );
    // The jewel keeps its circle() and its faceOnly, and takes its new colour.
    expect(w.text).toContain(
      'dict(d=circle(26, 11, 3), fill="#FF0000", faceOnly=True)',
    );
    expect(w.text).not.toContain('Edited in Inkscape');
  });

  it('draws the crown on its own when the peach under it is edited, only with the flag', () => {
    const old = [...parts(7), ...parts(2, '#FF9E58')];
    const now = [{ ...old[0]!, d: 'M9 9 L9 8 Z' }, ...old.slice(1)];
    const change = inPlace(now, STAGE_LABELS.crown);
    expect(() =>
      writeStagePy(GENERATOR, CROWN, change, old, '2026-11-05'),
    ).toThrow('--draw-on-its-own');
    const w = writeStagePy(GENERATOR, CROWN, change, old, '2026-11-05', true);
    expect(w.drawnOnItsOwn).toBe(true);
    expect(isDrawnOnItsOwn(w.text, 'crown')).toBe(true);
    expect(w.text).not.toContain('peach_parts()[1:]');
    expect(w.text).toContain('dict(d="M9 9 L9 8 Z", fill="#FFC27A"),  # body');
  });

  it('leaves the generator as it is when nothing changed', () => {
    const old = parts(8);
    expect(writeStagePy(GENERATOR, SWEET, inPlace(old), old, 'x').text).toBe(
      GENERATOR,
    );
  });
});

describe("the web's copy of the growth table, from the generator's output", () => {
  const TS = `export const PERFECTLY_PEACHY: readonly CostumePart[] = [
  { d: 'M1 1 L2 2 Z', fill: '#8FD3B6' },
];

export const GROWTH_STAGES: readonly GrowthStage[] = [
  {
    id: 'sweet',
    spoken: 'ripe and sweet',
    parts: [
      // The leaf.
      { d: 'M1.5 1.5 L2 2 Z', fill: '#8FD3B6' },
    ],
  },
  {
    id: 'perfectly-peachy',
    spoken: 'perfectly peachy',
    parts: PERFECTLY_PEACHY,
  },
];
`;
  const old: StageJson[] = [
    {
      id: 'sweet',
      spoken: 'ripe and sweet',
      parts: [{ d: 'M1.5 1.5 L2 2 Z', fill: '#8FD3B6' }],
    },
    {
      id: 'perfectly-peachy',
      spoken: 'perfectly peachy',
      parts: [{ d: 'M1 1 L2 2 Z', fill: '#8FD3B6' }],
    },
  ];

  it('writes nothing when the table held', () => {
    expect(writeGrowthStagesTs(TS, old, old)).toBe(TS);
  });

  it('writes the peach into PERFECTLY_PEACHY, and a stage that follows it in place', () => {
    const now: StageJson[] = [
      { ...old[0]!, parts: [{ d: 'M1.5 1.5 L3 3 Z', fill: '#8FD3B6' }] },
      { ...old[1]!, parts: [{ d: 'M1 1 L3 3 Z', fill: '#8FD3B6' }] },
    ];
    const out = writeGrowthStagesTs(TS, now, old);
    expect(out).toContain('parts: PERFECTLY_PEACHY,');
    expect(out).toContain("d: 'M1 1 L3 3 Z'");
    expect(out).toContain("d: 'M1.5 1.5 L3 3 Z'");
    // A part keeps its comment when it changes.
    expect(out).toContain('// The leaf.');
  });

  it("matches the live table's stages, so the live file can be written", () => {
    const live: StageJson[] = GROWTH_STAGES.map((s) => ({
      ...s,
      parts: [...s.parts],
    }));
    const source = readFileSync(
      resolve(process.cwd(), 'src/storeArt/growthStages.ts'),
      'utf8',
    );
    expect(writeGrowthStagesTs(source, live, live)).toBe(source);
  });
});

describe('whether a file in the vault has edits of its own', () => {
  it("a file draws the same as itself, and an edited one doesn't", () => {
    const ghost = costumeFile('ghost').svg;
    expect(sameDrawing(ghost, ghost)).toBe(true);
    const moved = ghost.replace(
      /(id="ghost-sheet"[^>]*?\sd="M)(\d+)/,
      (_, a, n) => `${a}${Number(n) + 1}`,
    );
    expect(moved).not.toBe(ghost);
    expect(sameDrawing(moved, ghost)).toBe(false);
  });

  it("an edit to a locked reference layer counts: it is the file's own", () => {
    const ghost = costumeFile('ghost').svg;
    const moved = ghost.replace(
      /(id="ref-body"[^>]*?\sd="M)(\d+)/,
      (_, a, n) => `${a}${Number(n) + 1}`,
    );
    expect(moved).not.toBe(ghost);
    expect(sameDrawing(moved, ghost)).toBe(false);
  });
});

describe("the icons' peach, brought up to the game's when asked", () => {
  // Small files of their own: whether the live icons trail the live peach is
  // the import's to say, never a failing test (Antoine keeps the redraw).
  const ART = `export const PEACH_BODY: readonly PeachPart[] = [
  { d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' },
];
export const PEACH_FACE: readonly PeachPart[] = [
  { circle: [40, 58, 3.4], fill: '#7A4A33' },
];
`;
  const ICONS = (
    parts: string,
  ) => `import type { PeachPart } from '@/ui/peachArt.ts';

/** The peach the raster icons were last drawn from. */
export const ICON_PEACH: readonly PeachPart[] = [${parts}];

export const PEACH_MARK_PATHS = peachMarkup(ICON_PEACH);
`;
  const format = async (text: string) =>
    prettier.format(text, {
      ...(await prettier.resolveConfig('scripts/lib/icons.ts')),
      filepath: 'scripts/lib/icons.ts',
    });

  it("changes nothing when the icons' peach is already the game's", async () => {
    const same = ICONS(
      "{ d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' }, { circle: [40, 58, 3.4], fill: '#7A4A33' }",
    );
    expect(await format(iconPeachFromGame(same, ART))).toBe(await format(same));
  });

  it("takes the game's peach part for part, as peachArt.ts writes it, and nothing else", async () => {
    const behind = ICONS("{ d: 'M1 1 L2 2 Z', fill: '#000000' }");
    const out = await format(
      iconPeachFromGame(
        behind,
        ART.replace('{ circle: [40, 58, 3.4], fill', `{ d: '${EYE}', fill`),
      ),
    );
    expect(out).toContain(`{ d: '${EYE}', fill: '#7A4A33' }`);
    expect(out).toContain(
      "{ d: 'M50 12c4-8 14-9 18-4-2 6-9 9-14 8z', fill: '#8FD3B6' }",
    );
    expect(out).not.toContain("'M1 1 L2 2 Z'");
    expect(out).toContain(
      '/** The peach the raster icons were last drawn from. */',
    );
    expect(out).toContain(
      'export const PEACH_MARK_PATHS = peachMarkup(ICON_PEACH);',
    );
  });

  it('finds ICON_PEACH in the live icons.ts', () => {
    const icons = readFileSync(
      resolve(process.cwd(), 'scripts/lib/icons.ts'),
      'utf8',
    );
    const art = readFileSync(
      resolve(process.cwd(), 'src/ui/peachArt.ts'),
      'utf8',
    );
    expect(iconPeachFromGame(icons, art)).toContain('export const ICON_PEACH');
  });
});
