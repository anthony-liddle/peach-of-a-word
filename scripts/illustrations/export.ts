/**
 * Out to Inkscape: every illustration the apps draw from path data, one
 * Inkscape SVG each, generated from the code's own tables, never retyped.
 *
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/illustrations/export.ts \
 *     <out dir> [--candidates <candidates.json>] [--glyphs <glyphs.json>] \
 *     [--cell <path data>]
 *
 * `--candidates` is a costume candidates file kept outside the repo. Its rows
 * that never shipped are written to `Alternates/`, named by their own ids,
 * which this file does not know. `--glyphs` is the marks' outlines, from
 * probe-marks.ts and the fonts it names; without it the cute marks and the
 * florette are left out. `--cell` is SwiftUI's own outline of the calendar's
 * cell, which iOS draws with continuous corners; without it the cell is drawn
 * with circular ones.
 *
 * Also writes `<out dir>/manifest.json`: each file, its kind and its source,
 * for the render check.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COSTUMES,
  COSTUME_ORDER,
  PEACH_OUTLINE,
  type CostumeId,
  type CostumePart,
} from '@/ui/costumes.ts';
import { CROWN, crownBox } from '@/ui/crown.ts';
import {
  PEACH_BODY,
  PEACH_FACE,
  SOURCE_MARK_BODY,
  type PeachPart,
} from '@/ui/peachArt.ts';
import { Decorations } from '@/ui/components/Decorations.tsx';
import { GROWTH_STAGES } from '@/storeArt/growthStages.ts';
import {
  boxGuide,
  crownBandGuide,
  inkscapeSvg,
  limitGuide,
  num,
  partStyle,
  slug,
  type Layer,
  type Obj,
} from './inkscape.ts';
import {
  calendarEntry,
  glintEntry,
  flameEntry,
  glyphEntries,
  iconEntry,
  letterpressEntries,
  type Glyph,
  type MarkEntry,
} from './marks.ts';
import { COSTUME_LABELS, PEACH_LABELS, STAGE_LABELS } from './labels.ts';

const FACE = PEACH_LABELS.face;

export const STAGE_FILES: Record<string, string> = {
  'first-sprout': 'stage-1-first-sprout',
  'little-bud': 'stage-2-little-bud',
  blossom: 'stage-3-blossom',
  ripening: 'stage-4-ripening',
  sweet: 'stage-5-sweet',
  'perfectly-peachy': 'stage-6-perfectly-peachy',
  crown: 'stage-7-crown',
};

export const FOLDERS = {
  peach: 'Peach And Stages',
  costumes: 'Costumes',
  alternates: 'Alternates',
  marks: 'Marks And Details',
  icon: 'Icon',
} as const;

/** One part's object, path data or a circle. */
function partObj(
  prefix: string,
  label: string,
  p: PeachPart | CostumePart,
): Obj {
  const circle = 'circle' in p ? p.circle : undefined;
  const faceOnly = 'faceOnly' in p && p.faceOnly;
  const full = faceOnly ? `${label} (face only)` : label;
  if (circle)
    return {
      id: `${prefix}-${slug(full)}`,
      label: full,
      tag: 'circle',
      attrs: [
        ['cx', circle[0]],
        ['cy', circle[1]],
        ['r', circle[2]],
      ],
      style: partStyle(p),
    };
  return {
    id: `${prefix}-${slug(full)}`,
    label: full,
    tag: 'path',
    attrs: [['d', p.d!]],
    style: partStyle(p),
  };
}

function labelled<T>(
  what: string,
  parts: readonly T[],
  labels: readonly string[],
): [T, string][] {
  if (parts.length !== labels.length)
    throw new Error(
      `${what}: ${parts.length} parts in the code, ${labels.length} labels here`,
    );
  if (new Set(labels).size !== labels.length)
    throw new Error(`${what}: two parts share a label`);
  return parts.map((p, i) => [p, labels[i]!]);
}

/** The plain peach as a locked reference, with or without its face. */
function peachReference(face: boolean): Layer {
  const parts: [PeachPart, string][] = [
    ...labelled('peach', PEACH_BODY, PEACH_LABELS.body),
    ...(face ? labelled('peach face', PEACH_FACE, FACE) : []),
  ];
  return {
    id: 'reference',
    label: face
      ? 'Reference: the plain peach (locked, never comes back)'
      : 'Reference: the plain peach, its face hidden by the costume (locked, never comes back)',
    locked: true,
    objs: parts.map(([p, l]) => partObj('ref', l, p)),
  };
}

const strokeWidths = (parts: readonly { strokeWidth?: number | undefined }[]) =>
  [...new Set(parts.map((p) => p.strokeWidth).filter((w) => w !== undefined))]
    .map(Number)
    .sort((a, b) => a - b);

function guides(objs: Obj[]): Layer {
  return {
    id: 'guides',
    label: 'Guides (locked, never come back)',
    locked: true,
    objs,
  };
}

export interface Entry {
  folder: string;
  name: string;
  kind: string;
  /** What the render check draws from the apps' own code. */
  source: Record<string, unknown>;
  width: number;
  height: number;
  /** Averaging block for the render check, in px, when not the scale. */
  block?: number;
  /** Px per unit for the render check, when not the run's own. */
  renderScale?: number;
  /** The area the render check draws, in the file's units, when not the page. */
  compareArea?: { x: number; y: number; width: number; height: number };
  /** The render check's size in px, with `compareArea`. */
  compareSize?: [number, number];
  /** The area the contact sheet shows, x0 y0 x1 y1, when not the page. */
  sheetArea?: [number, number, number, number];
  /** The file's text. */
  svg: string;
}

function fromMark(m: MarkEntry): Entry {
  const { title, description, layers, defs, ...rest } = m;
  return {
    ...rest,
    svg: inkscapeSvg({
      name: m.name,
      width: m.width,
      height: m.height,
      title,
      description,
      layers,
      ...(defs ? { defs } : {}),
    }),
  };
}

function entry(
  folder: string,
  name: string,
  kind: string,
  source: Record<string, unknown>,
  title: string,
  description: string,
  layers: Layer[],
  width = 100,
  height = 100,
): Entry {
  return {
    folder,
    name,
    kind,
    source,
    width,
    height,
    svg: inkscapeSvg({ name, width, height, title, description, layers }),
  };
}

const band = crownBox();

/**
 * A costume's part drawn on one of the peach's own outlines says so, in
 * Inkscape's Object Properties: its outline follows the peach, so the import
 * refuses an edit to it here.
 */
function followed(obj: Obj, p: CostumePart): Obj {
  const outline = (
    Object.keys(PEACH_OUTLINE) as (keyof typeof PEACH_OUTLINE)[]
  ).find((k) => PEACH_OUTLINE[k] === p.d);
  return outline
    ? {
        ...obj,
        title:
          `Drawn on the peach's own ${outline}, so its outline follows the peach and ` +
          "changes with it, not here. Its colour and opacity are the costume's.",
      }
    : obj;
}

/**
 * The crown's outline in the peach's own units: its own 100 by 100 drawing
 * placed and stretched as the phone does, so the file shows it as it looks.
 */
function crownOnPeach(): string {
  return CROWN.d.replace(
    /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) =>
      `${num(band.x + (Number(x) * band.width) / 100)} ${num(band.y + (Number(y) * band.height) / 100)}`,
  );
}

const crownObj = (id: string): Obj => ({
  id,
  label: 'crown',
  tag: 'path',
  attrs: [['d', crownOnPeach()]],
  style: [['fill', CROWN.fill]],
});

/**
 * The completion card's crown, locked, in front of the costume as the card
 * draws it. It shows what the crown hides; it never comes back.
 */
const crownReference: Layer = {
  id: 'reference-crown',
  label:
    "Reference: the completion card's crown, in front of the costume (locked, never comes back)",
  locked: true,
  objs: [crownObj('ref-crown')],
};

function costumeEntry(
  folder: string,
  id: string,
  spoken: string,
  replacesFace: boolean,
  parts: readonly CostumePart[],
  labels: readonly string[],
  source: Record<string, unknown>,
  title: string,
): Entry {
  const art: Layer = {
    id: 'art',
    label: title,
    objs: labelled(id, parts, labels).map(([p, l]) =>
      // Alternates have no table, so nothing of theirs follows the peach.
      'costume' in source ? followed(partObj(id, l, p), p) : partObj(id, l, p),
    ),
  };
  return entry(
    folder,
    id,
    'costume',
    source,
    title,
    `The peach ${spoken}. Drawn over the plain peach in its 100 by 100 box. ` +
      (replacesFace
        ? "The costume draws its own face, so the peach's is hidden."
        : "The peach's own face shows under it."),
    [
      peachReference(!replacesFace),
      art,
      crownReference,
      guides([
        boxGuide(100, 100),
        ...strokeWidths(parts).map((w) => limitGuide(w)),
        crownBandGuide(band),
      ]),
    ],
  );
}

const sentence = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** A costume's file, from its table and its labels: the code's own by default. */
export function costumeFile(
  id: CostumeId,
  parts: readonly CostumePart[] = COSTUMES[id].parts,
  labels: readonly string[] = COSTUME_LABELS[id],
): Entry {
  const c = COSTUMES[id];
  return costumeEntry(
    FOLDERS.costumes,
    id,
    c.spoken,
    c.replacesFace,
    parts,
    labels,
    { costume: id },
    sentence(c.spoken.replace(/^(in|wearing|carved as) /, '')),
  );
}

/** The plain peach's file, from peachArt.ts. */
export function peachFile(): Entry {
  const peachParts: [PeachPart, string][] = [
    ...labelled('peach', PEACH_BODY, PEACH_LABELS.body),
    ...labelled('peach face', PEACH_FACE, FACE).map(
      ([p, l]) => [p, `${l} (face only)`] as [PeachPart, string],
    ),
  ];
  return entry(
    FOLDERS.peach,
    'peach',
    'peach',
    { web: 'PeachMark', ios: 'PeachMark' },
    'The peach',
    'The plain peach in its 100 by 100 box. The face is dropped at mark size.',
    [
      {
        id: 'art',
        label: 'The peach',
        objs: peachParts.map(([p, l]) => partObj('peach', l, p)),
      },
      guides([boxGuide(100, 100), crownBandGuide(band)]),
    ],
  );
}

/** A growing peach's stage's file, from the web's copy of the table. */
export function stageFile(id: string): Entry {
  const s = GROWTH_STAGES.find((g) => g.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  const labels = STAGE_LABELS[s.id];
  if (!labels) throw new Error(`no labels for the stage ${s.id}`);
  const title = `The peach ${s.spoken}`;
  return entry(
    FOLDERS.peach,
    STAGE_FILES[s.id]!,
    'stage',
    { stage: s.id },
    sentence(s.spoken),
    `${title}: the title's growing peach, in the peach's 100 by 100 box.`,
    [
      {
        id: 'art',
        label: sentence(s.spoken),
        objs: labelled(s.id, s.parts, labels).map(([p, l]) =>
          partObj(slug(s.id), l, p),
        ),
      },
      guides([
        boxGuide(100, 100),
        ...strokeWidths(s.parts).map((w) => limitGuide(w)),
      ]),
    ],
  );
}

export function shippedEntries(): Entry[] {
  const out: Entry[] = [];

  // The plain peach.
  out.push(peachFile());

  // The web's source-word mark: its own peach, never a face.
  out.push(
    entry(
      FOLDERS.peach,
      'source-mark-peach',
      'peach',
      { web: 'SourcePeach' },
      "The source word's peach",
      "The web's source-word mark: a smaller peach with a cleft, never a face.",
      [
        {
          id: 'art',
          label: "The source word's peach",
          objs: labelled('source mark', SOURCE_MARK_BODY, [
            'leaf',
            'body',
            'cleft',
          ]).map(([p, l]) => partObj('source', l, p)),
        },
        guides([
          boxGuide(100, 100),
          ...strokeWidths(SOURCE_MARK_BODY).map((w) => limitGuide(w)),
        ]),
      ],
    ),
  );

  // The growing peach.
  for (const s of GROWTH_STAGES) out.push(stageFile(s.id));

  // The costumes.
  for (const id of COSTUME_ORDER) out.push(costumeFile(id));

  // The completion card's crown, where it stands on the peach and as it looks
  // there, in the peach's box: most of it rises above the page. The code keeps
  // it in its own 100 by 100 box, stretched to 46 by 26 points on the phone;
  // the way back will undo that stretch.
  const crownTop = band.y;
  const crownFoot = band.y + band.height;
  out.push({
    ...entry(
      FOLDERS.marks,
      'completion-crown',
      'crown',
      { crown: true },
      'The crown',
      "The completion card's crown, where it stands on the peach and as it " +
        "looks there, in the peach's 100 by 100 box. It rises above the box, so " +
        'most of it sits above the page. The apps keep it in its own box, ' +
        'stretched to 46 by 26 points; the way back will do that stretching.',
      [
        peachReference(true),
        { id: 'art', label: 'The crown', objs: [crownObj('crown-crown')] },
        guides([
          boxGuide(100, 100),
          {
            id: 'guide-crown-box',
            label: `the crown's box on the phone: x ${num(band.x)} to ${num(band.x + band.width)}, y ${num(crownTop)} to ${num(crownFoot)}`,
            tag: 'rect',
            attrs: [
              ['x', num(band.x)],
              ['y', num(crownTop)],
              ['width', num(band.width)],
              ['height', num(band.height)],
            ],
            style: [
              ['fill', 'none'],
              ['stroke', '#E5007A'],
              ['stroke-width', 0.25],
              ['stroke-dasharray', '1,0.5'],
            ],
            title:
              'The frame the phone stretches the crown to, 46 by 26 points over ' +
              "a 112-point peach. crown.test.ts holds the crown's top to the " +
              "top of this frame, the iPhone's rise above the peach, and its " +
              "seven points to the iPhone's Crown shape.",
          },
        ]),
      ],
    ),
    compareArea: band,
    compareSize: [368, 208],
    block: 8,
    sheetArea: [0, -18, 100, 100],
  });

  // The web's decorations: the second peach and the dinosaur, read from the
  // component's own markup.
  const deco = renderToStaticMarkup(createElement(Decorations));
  const decoSvg = (cls: string) => {
    const m = deco.match(
      new RegExp(`<svg class="deco ${cls}[^"]*" viewBox="([^"]+)">(.*?)</svg>`),
    );
    if (!m) throw new Error(`Decorations has no ${cls}`);
    return { viewBox: m[1]!, body: m[2]! };
  };
  const attrsOf = (el: string) =>
    new Map(
      [...el.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]),
    );
  const decoObjs = (
    svg: { body: string },
    prefix: string,
    labels: string[],
  ): Obj[] => {
    const els = [...svg.body.matchAll(/<(path|circle)\b([^>]*)\/?>/g)];
    return labelled(prefix, els, labels).map(([m, label]) => {
      const tag = m[1]!;
      const a = attrsOf(m[2]!);
      const geo: [string, string][] =
        tag === 'circle'
          ? (['cx', 'cy', 'r'] as const).map((k) => [k, a.get(k)!])
          : [['d', a.get('d')!]];
      const style: [string, string][] = [];
      for (const k of [
        'opacity',
        'fill',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
      ]) {
        const v = a.get(k);
        if (v !== undefined) style.push([k, v]);
      }
      return { id: `${prefix}-${slug(label)}`, label, tag, attrs: geo, style };
    });
  };
  const peach2 = decoSvg('deco--peach2');
  out.push(
    entry(
      FOLDERS.peach,
      'small-peach',
      'decoration',
      { decoration: 'deco--peach2' },
      'The small peach',
      "The web's second floating peach, in the cute theme's page margins.",
      [
        {
          id: 'art',
          label: 'The small peach',
          objs: decoObjs(peach2, 'small-peach', [
            'leaf',
            'body',
            'eye, left',
            'eye, right',
            'smile',
          ]),
        },
        guides([boxGuide(100, 100)]),
      ],
    ),
  );
  const dino = decoSvg('deco--dino');
  const [, , dw, dh] = dino.viewBox.split(' ').map(Number);
  out.push(
    entry(
      FOLDERS.marks,
      'dino',
      'decoration',
      { decoration: 'deco--dino' },
      'The dinosaur',
      "The web's small silly dinosaur, in the cute theme's page margins.",
      [
        {
          id: 'art',
          label: 'The dinosaur',
          objs: decoObjs(dino, 'dino', [
            'body',
            'tuft',
            'eye',
            'eye glint',
            'cheek',
            'legs',
            'spikes',
          ]),
        },
        guides([boxGuide(dw!, dh!)]),
      ],
      dw,
      dh,
    ),
  );

  return out;
}

export interface Candidate {
  id: string;
  costume: string;
  status: string;
  spoken: string;
  replacesFace: boolean;
  parts: CostumePart[];
}

const sameParts = (a: readonly CostumePart[], b: readonly CostumePart[]) =>
  JSON.stringify(a.map((p) => ({ ...p, faceOnly: p.faceOnly ?? false }))) ===
  JSON.stringify(b.map((p) => ({ ...p, faceOnly: p.faceOnly ?? false })));

/**
 * The candidates that never shipped, and what became of the rest. A row that
 * is a shipped costume, part for part, is not written again: the costume's
 * own file is the one to edit.
 */
export function alternateEntries(rows: Candidate[]): {
  entries: Entry[];
  notes: { id: string; status: string; note: string }[];
} {
  const entries: Entry[] = [];
  const notes: { id: string; status: string; note: string }[] = [];
  for (const r of rows) {
    const shipped = (COSTUMES as Record<string, (typeof COSTUMES)[CostumeId]>)[
      r.costume
    ];
    if (shipped && sameParts(shipped.parts, r.parts)) {
      notes.push({
        id: r.id,
        status: r.status,
        note: `the shipped ${r.costume}, part for part`,
      });
      continue;
    }
    if (r.status !== 'alternate' && !r.status.startsWith('alternate')) {
      notes.push({
        id: r.id,
        status: r.status,
        note: shipped
          ? `a draft of ${r.costume}, superseded by the shipped drawing`
          : 'not shipped, and not an alternate',
      });
      continue;
    }
    const labels = r.parts.map(
      (_, i) => `part ${String(i + 1).padStart(2, '0')}`,
    );
    entries.push(
      costumeEntry(
        FOLDERS.alternates,
        r.id,
        r.spoken,
        r.replacesFace,
        r.parts,
        labels,
        { alternate: r.id },
        sentence(r.spoken.replace(/^(in|wearing|carved as|as) /, '')),
      ),
    );
    notes.push({ id: r.id, status: r.status, note: 'written' });
  }
  return { entries, notes };
}

/** Every file, with the inputs that live outside the repo when given. */
export function allEntries(
  inputs: { glyphs?: Glyph[]; cell?: string; candidates?: Candidate[] } = {},
): { entries: Entry[]; notes: unknown[] } {
  const glyphs = inputs.glyphs ?? [];
  const all = shippedEntries();
  all.push(
    ...[
      ...glyphEntries(glyphs),
      glintEntry(glyphs.find((g) => g.name === 'mark-mythic-gem')),
      ...letterpressEntries(),
      flameEntry(),
      calendarEntry(inputs.cell),
      iconEntry(),
    ].map(fromMark),
  );
  let notes: unknown[] = [];
  if (inputs.candidates) {
    const alt = alternateEntries(inputs.candidates);
    all.push(...alt.entries);
    notes = alt.notes;
  }
  return { entries: all, notes };
}

function main(argv: string[]) {
  const [out, ...flags] = argv;
  if (!out)
    throw new Error(
      'usage: export.ts <out dir> [--candidates <file>] [--glyphs <file>] [--cell <file>]',
    );
  const flag = (name: string) => {
    const i = flags.indexOf(name);
    return i < 0 ? undefined : flags[i + 1];
  };
  const read = (name: string) => {
    const path = flag(name);
    return path ? readFileSync(path, 'utf8') : undefined;
  };
  const glyphs = read('--glyphs');
  const cell = read('--cell');
  const candidates = read('--candidates');
  const { entries: all, notes } = allEntries({
    ...(glyphs ? { glyphs: JSON.parse(glyphs) as Glyph[] } : {}),
    ...(cell ? { cell: cell.trim() } : {}),
    ...(candidates
      ? { candidates: JSON.parse(candidates) as Candidate[] }
      : {}),
  });
  for (const e of all) {
    mkdirSync(join(out, e.folder), { recursive: true });
    writeFileSync(join(out, e.folder, `${e.name}.svg`), e.svg);
  }
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify(
      {
        files: all.map(({ svg: _svg, ...e }) => ({
          ...e,
          path: `${e.folder}/${e.name}.svg`,
        })),
        candidates: notes,
      },
      null,
      1,
    ),
  );
  console.log(`${all.length} files written to ${out}`);
  for (const n of notes) console.log('candidate', JSON.stringify(n));
}

// Run as a script, not when imported by the import or its tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
