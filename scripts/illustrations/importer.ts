/**
 * The way back: an edited file, a costume's, the peach's or a stage's, read
 * into its table's parts.
 *
 * Each part is found by its label, the name the export gave it. The page, the
 * reference layers and the guides are the export's own, and never come back;
 * an edit to a reference layer is not lost silently, it stops the import. So
 * does anything the tables can't hold, each named, with what to do about it.
 *
 * Pure: text in, a plan out. import.ts reads the files, writes the tables, and
 * runs the guards.
 */
import { PEACH_OUTLINE, type CostumePart } from '@/ui/costumes.ts';
import { PEACH_BODY, PEACH_FACE } from '@/ui/peachArt.ts';
import { PEACH_LABELS } from './labels.ts';
import {
  circlePath,
  ellipsePath,
  fmt,
  formatPath,
  IDENTITY,
  isUniform,
  multiply,
  parsePath,
  parseTransform,
  PathError,
  polyPath,
  rectPath,
  strokeScale,
  transformPath,
  type Matrix,
  type Seg,
} from './pathData.ts';
import { parseXml, XmlError, type XmlEl } from './xml.ts';

const FACE_ONLY = ' (face only)';

/** A part as a file draws it. */
export interface FilePart {
  /** The label without its "(face only)". */
  label: string;
  /** The object's id, to name it when it has no label. */
  id: string;
  part: CostumePart;
}

/** What a file holds, before it is compared with any table. */
export interface FileRead {
  parts: FilePart[];
  /** Each reference layer's objects, as text that changes when they do. */
  references: Map<string, string[]>;
  /** Anything the tables can't hold: the import stops on these. */
  problems: string[];
  /** Kept, but worth saying. */
  notes: string[];
  /** Read no further than its first problem: nothing in it can be compared. */
  unreadable?: true;
}

export interface Flags {
  /** Add a part the code doesn't have, named by its label (answer 3). */
  allowNewParts?: boolean;
  /** Drop a part that has no object in the file (answer 3). */
  allowDeletedParts?: boolean;
  /** Go on past an edit to a reference layer, which never comes back. */
  allowReferenceChanges?: boolean;
}

/** One drawing's way back: its new parts and labels, and what changed. */
export interface Plan {
  /** The costume's or the stage's id, or "peach". */
  id: string;
  /** For each new part, the old part's index, or null for an added one. */
  from: (number | null)[];
  parts: CostumePart[];
  labels: string[];
  /** In words, part by part. Empty when nothing changed. */
  changes: string[];
  notes: string[];
  problems: string[];
}

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

/** A colour as the tables write one, `#RRGGBB`, or null for none. */
function colour(
  v: string,
  what: string,
  problems: string[],
): string | null | undefined {
  const s = v.trim().toLowerCase();
  if (s === 'none') return null;
  const named: Record<string, string> = { black: '#000000', white: '#ffffff' };
  const hex = named[s] ?? s;
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex.toUpperCase();
  if (/^#[0-9a-f]{3}$/.test(hex))
    return `#${[...hex.slice(1)].map((c) => c + c).join('')}`.toUpperCase();
  problems.push(
    `${what} is "${v}": the apps draw flat colours, written #RRGGBB, or none`,
  );
  return undefined;
}

function styleOf(el: XmlEl): Map<string, string> {
  const style = new Map<string, string>();
  for (const attr of [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'display',
    'visibility',
    'filter',
    'mask',
    'clip-path',
  ]) {
    const v = el.getAttribute(attr);
    if (v !== null) style.set(attr, v);
  }
  // The style attribute wins over presentation attributes, as in SVG.
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) style.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
  }
  return style;
}

const num = (v: string | null | undefined, fallback = 0) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v.replace(/px$/, ''));
  if (!Number.isFinite(n)) throw new PathError(`unreadable length "${v}"`);
  return n;
};

/** An object's outline, in the page's units, its transforms applied. */
function geometry(el: XmlEl, m: Matrix): Seg[] {
  const a = (n: string) => num(el.getAttribute(n));
  let segs: Seg[];
  switch (el.localName) {
    case 'path':
      segs = parsePath(el.getAttribute('d') ?? '');
      break;
    case 'circle':
      segs = circlePath(a('cx'), a('cy'), a('r'));
      break;
    case 'ellipse':
      segs = ellipsePath(a('cx'), a('cy'), a('rx'), a('ry'));
      break;
    case 'rect': {
      const rx = el.getAttribute('rx');
      const ry = el.getAttribute('ry');
      segs = rectPath(
        a('x'),
        a('y'),
        a('width'),
        a('height'),
        num(rx ?? ry),
        num(ry ?? rx),
      );
      break;
    }
    case 'polygon':
    case 'polyline':
      segs = polyPath(
        el.getAttribute('points') ?? '',
        el.localName === 'polygon',
      );
      break;
    case 'line':
      segs = parsePath(`M${a('x1')} ${a('y1')} L${a('x2')} ${a('y2')}`);
      break;
    default:
      throw new PathError(`a ${el.localName}`);
  }
  return transformPath(
    segs,
    multiply(m, parseTransform(el.getAttribute('transform'))),
  );
}

/** What to do about an element the tables can't hold, by its kind. */
const UNREADABLE: Record<string, string> = {
  g: 'a group: select it and ungroup it (Object > Ungroup)',
  text: 'text: turn it into a path (Path > Object to Path)',
  use: 'a clone: unlink it (Edit > Clone > Unlink Clone)',
  image: 'an image: the apps draw shapes only',
};

/** One object as a part: its outline and its paint, as the tables write them. */
function readPart(
  el: XmlEl,
  m: Matrix,
  problems: string[],
  notes: string[],
): CostumePart | null {
  const label = el.getAttribute('inkscape:label') ?? el.id;
  const name = `"${label}"`;
  const before = problems.length;
  let segs: Seg[];
  try {
    segs = geometry(el, m);
  } catch (e) {
    if (e instanceof PathError) {
      problems.push(`${name}: ${e.message}`);
      return null;
    }
    throw e;
  }
  const s = styleOf(el);
  if (s.get('display') === 'none' || s.get('visibility') === 'hidden')
    problems.push(`${name} is hidden: show it, or delete it`);
  for (const p of ['filter', 'mask', 'clip-path', 'stroke-dasharray'])
    if (s.has(p) && s.get(p) !== 'none')
      problems.push(`${name} has a ${p}, which the apps don't draw`);

  let fill = s.has('fill')
    ? colour(s.get('fill')!, `${name}'s fill`, problems)
    : undefined;
  if (!s.has('fill')) {
    fill = '#000000';
    notes.push(`${name} names no fill, so it is filled black, as SVG fills it`);
  }
  let stroke = colour(s.get('stroke') ?? 'none', `${name}'s stroke`, problems);
  const fo = num(s.get('fill-opacity'), 1);
  const so = num(s.get('stroke-opacity'), 1);
  let opacity = num(s.get('opacity'), 1);
  // The tables have one opacity per part. A colour's own alpha folds into it
  // where it is the part's only paint.
  if (fill && stroke) {
    if (fo !== so)
      problems.push(
        `${name}'s fill and stroke are at different opacities (${fo}, ${so}): ` +
          'the tables keep one per part, so set it with the Opacity slider instead',
      );
    else opacity *= fo;
  } else if (fill) opacity *= fo;
  else if (stroke) opacity *= so;
  if ((fill && fo !== 1) || (stroke && so !== 1))
    notes.push(`${name}: its colour's alpha is folded into the part's opacity`);
  if (!fill && !stroke) {
    problems.push(`${name} has neither fill nor stroke, so it draws nothing`);
    fill = null;
    stroke = null;
  }

  let strokeWidth: number | undefined;
  if (stroke) {
    const full = multiply(m, parseTransform(el.getAttribute('transform')));
    strokeWidth = num(s.get('stroke-width'), 1) * strokeScale(full);
    if (!isUniform(full))
      notes.push(
        `${name} is stretched unevenly, so its stroke's width is the average`,
      );
    for (const p of ['stroke-linecap', 'stroke-linejoin'])
      if (s.has(p) && s.get(p) !== 'round')
        notes.push(
          `${name}'s ${p} is ${s.get(p)}, but the apps round every stroke's ends and joins`,
        );
  }
  if (problems.length > before) return null;

  opacity = Number(opacity.toFixed(2));
  return {
    d: formatPath(segs),
    ...(fill ? { fill } : {}),
    ...(opacity !== 1 ? { opacity } : {}),
    ...(stroke ? { stroke, strokeWidth: Number(strokeWidth!.toFixed(2)) } : {}),
  };
}

/** A reference layer's objects, as lines of text, to tell whether they changed. */
function referenceLines(layer: XmlEl, m: Matrix): string[] {
  const problems: string[] = [];
  return [...layer.children]
    .filter((el) => el.localName !== 'title' && el.localName !== 'desc')
    .map((el) => {
      const label = el.getAttribute('inkscape:label') ?? el.id;
      const p = readPart(el, m, problems, []);
      return p
        ? `${label}|${p.d}|${p.fill ?? ''}|${p.opacity ?? ''}|${p.stroke ?? ''}|${p.strokeWidth ?? ''}`
        : `${label}|?`;
    });
}

/** An Inkscape file, read: the drawing's own layer as parts, the rest checked. */
export function readFile(svg: string): FileRead {
  const out: FileRead = {
    parts: [],
    references: new Map(),
    problems: [],
    notes: [],
  };
  let root: XmlEl;
  try {
    root = parseXml(svg);
  } catch (e) {
    if (!(e instanceof XmlError)) throw e;
    out.problems.push(`this is not a file Inkscape saved: ${e.message}`);
    out.unreadable = true;
    return out;
  }
  if (root.localName !== 'svg') {
    out.problems.push('this is not an SVG file');
    out.unreadable = true;
    return out;
  }
  // Plain SVG keeps the drawing and drops every label and layer, which are
  // what the way back finds parts by.
  if (
    !root.children.some(
      (el) => el.getAttribute('inkscape:groupmode') === 'layer',
    )
  ) {
    out.problems.push(
      'this was saved as Plain SVG, which drops the labels and layers the parts are found by. ' +
        'Save it as Inkscape SVG (File > Save As, then Inkscape SVG)',
    );
    out.unreadable = true;
    return out;
  }
  const page = [
    root.getAttribute('width'),
    root.getAttribute('height'),
    root.getAttribute('viewBox'),
  ];
  if (page.join('|') !== '100|100|0 0 100 100')
    out.problems.push(
      `the page changed (${page.join(', ')}): it must stay 100 by 100, so the numbers stay the code's`,
    );
  let art = 0;
  for (const el of [...root.children]) {
    if (
      ['defs', 'metadata', 'title', 'desc', 'namedview'].includes(el.localName)
    )
      continue;
    const isLayer =
      el.localName === 'g' && el.getAttribute('inkscape:groupmode') === 'layer';
    const label = el.getAttribute('inkscape:label') ?? el.id;
    if (!isLayer) {
      out.problems.push(
        `"${label}" is outside every layer: move it to the drawing's own layer (Layer > Move Selection to Layer)`,
      );
      continue;
    }
    const m = parseTransform(el.getAttribute('transform'));
    if (el.id.startsWith('reference')) {
      out.references.set(el.id, referenceLines(el, m));
      continue;
    }
    if (el.id === 'guides') continue;
    if (el.id !== 'art') {
      out.problems.push(
        `a layer the export didn't write, "${label}": move what's on it to the drawing's own layer, and delete it`,
      );
      continue;
    }
    art++;
    if (styleOf(el).get('display') === 'none')
      out.problems.push("the drawing's own layer is hidden: show it again");
    for (const child of [...el.children]) {
      if (child.localName === 'title' || child.localName === 'desc') continue;
      const childLabel = child.getAttribute('inkscape:label') ?? child.id;
      const reason = UNREADABLE[child.localName];
      if (
        reason ||
        (child.localName === 'g' &&
          child.getAttribute('inkscape:groupmode') === 'layer')
      ) {
        out.problems.push(`"${childLabel}" is ${reason ?? UNREADABLE.g}`);
        continue;
      }
      const part = readPart(
        child,
        multiply(IDENTITY, m),
        out.problems,
        out.notes,
      );
      if (!part) continue;
      const faceOnly = childLabel.endsWith(FACE_ONLY);
      out.parts.push({
        label: faceOnly ? childLabel.slice(0, -FACE_ONLY.length) : childLabel,
        id: child.id,
        part: faceOnly ? { ...part, faceOnly: true } : part,
      });
    }
  }
  if (art !== 1)
    out.problems.push(`the file has ${art} layers of its own drawing, not one`);
  return out;
}

/** A part's paint, in words, for the change list. */
function paint(p: CostumePart): string {
  const bits = [
    p.fill ? `fill ${p.fill}` : 'no fill',
    p.stroke
      ? `stroke ${p.stroke} at ${fmt(p.strokeWidth ?? 1, 2)}`
      : 'no stroke',
  ];
  if (p.opacity !== undefined) bits.push(`opacity ${p.opacity}`);
  return bits.join(', ');
}

/** Whether a table's part and a file's part draw the same, at one decimal. */
export const sameOutline = (a: string, b: string) =>
  formatPath(parsePath(a)) === formatPath(parsePath(b));

/**
 * The peach's own outlines, by their text, to the part of the peach each is:
 * a costume's part drawn on one follows the peach (answer 5).
 */
export const PEACH_FOLLOWED: ReadonlyMap<string, string> = new Map(
  (Object.keys(PEACH_OUTLINE) as (keyof typeof PEACH_OUTLINE)[]).map((k) => [
    PEACH_OUTLINE[k],
    k,
  ]),
);

/**
 * A drawing's way back: the file's parts matched to the table's by label, in
 * the file's order (answer 2), one decimal (answer 7). A part whose outline
 * reads the same keeps the table's own text, so an untouched file changes
 * nothing, byte for byte. `followed` names the outlines that are the peach's
 * to change, not this drawing's: the costumes'. The peach and its stages pass
 * none.
 */
export function plan(
  id: string,
  file: FileRead,
  expected: FileRead,
  table: readonly CostumePart[],
  labels: readonly string[],
  flags: Flags = {},
  followed: ReadonlyMap<string, string> = PEACH_FOLLOWED,
): Plan {
  const out: Plan = {
    id,
    from: [],
    parts: [],
    labels: [],
    changes: [],
    notes: [...file.notes],
    problems: [...file.problems],
  };
  if (file.unreadable) return out;

  for (const [layer, lines] of expected.references) {
    const now = file.references.get(layer) ?? [];
    const said: string[] = [];
    const name = (l: string) => `"${l.split('|')[0]}"`;
    const was = new Map(lines.map((l) => [l.split('|')[0]!, l]));
    const is = new Map(now.map((l) => [l.split('|')[0]!, l]));
    for (const [label, line] of was) {
      if (!is.has(label)) said.push(`${name(line)} was deleted`);
      else if (is.get(label) !== line) said.push(`${name(line)} was changed`);
    }
    for (const [label, line] of is)
      if (!was.has(label)) said.push(`${name(line)} was added`);
    if (!file.references.has(layer)) said.push('the layer was deleted');
    if (said.length) {
      const msg = `the locked layer "${layer}" was edited (${said.join('; ')}). It never comes back, so the apps would still draw it as it was`;
      if (flags.allowReferenceChanges) out.notes.push(msg);
      else
        out.problems.push(
          `${msg}. To go on without it, pass --allow-reference-changes`,
        );
    }
  }

  const seen = new Map<string, number>();
  for (const fp of file.parts)
    seen.set(fp.label, (seen.get(fp.label) ?? 0) + 1);
  for (const [label, n] of seen)
    if (n > 1)
      out.problems.push(
        `${n} objects are labelled "${label}": a duplicate keeps its label, so rename the new one`,
      );

  const index = new Map(labels.map((l, i) => [l, i]));
  for (const fp of file.parts) {
    const i = index.get(fp.label);
    const name = `"${fp.label}"`;
    if (i === undefined) {
      if (!flags.allowNewParts) {
        out.problems.push(
          `${name} (${fp.id}) is not a part of this drawing. Label it with the name it should have, ` +
            'and pass --allow-new-parts to add it',
        );
        continue;
      }
      out.from.push(null);
      out.parts.push(fp.part);
      out.labels.push(fp.label);
      out.changes.push(
        `${name} is new: ${paint(fp.part)}${fp.part.faceOnly ? ', face only' : ''}`,
      );
      continue;
    }
    const old = table[i]!;
    // A part on one of the peach's own outlines follows the peach, so its
    // outline is the peach's to change, not the costume's.
    const follows = followed.get(old.d);
    if (follows && !sameOutline(old.d, fp.part.d)) {
      out.problems.push(
        `${name} is drawn on the peach's own ${follows}, so it follows the peach: ` +
          "its outline changes with the peach's, not here. To give the costume an outline " +
          'of its own, draw it as a new part',
      );
      continue;
    }
    const keep: CostumePart = sameOutline(old.d, fp.part.d)
      ? { ...fp.part, d: old.d }
      : fp.part;
    const part: CostumePart = { ...keep };
    if (!part.faceOnly) delete part.faceOnly;
    if (part.d !== old.d) out.changes.push(`${name}'s outline changed`);
    if (paint(part) !== paint(old)) {
      out.changes.push(`${name}: ${paint(old)}, now ${paint(part)}`);
      if (!old.fill !== !part.fill || !old.stroke !== !part.stroke)
        out.notes.push(
          `${name} changed kind: it was ${old.fill ? 'filled' : 'a line'}${old.stroke && old.fill ? ' and stroked' : ''}, ` +
            `and is now ${part.fill ? 'filled' : 'a line'}${part.stroke && part.fill ? ' and stroked' : ''}. Is that meant?`,
        );
    }
    if (!!old.faceOnly !== !!part.faceOnly)
      out.changes.push(
        `${name} is now drawn ${part.faceOnly ? 'only with the face' : 'at every size'}`,
      );
    out.from.push(i);
    out.parts.push(part);
    out.labels.push(fp.label);
  }

  const missing = labels.filter((l) => !seen.has(l));
  for (const label of missing) {
    if (flags.allowDeletedParts) out.changes.push(`"${label}" was deleted`);
    else
      out.problems.push(
        `"${label}" has no object in the file. If it was deleted on purpose, pass --allow-deleted-parts`,
      );
  }

  // Draw order (answer 2): the file's, saying which parts moved.
  const kept = out.from.filter((i): i is number => i !== null);
  const wasOrder = [...kept].sort((a, b) => a - b);
  if (kept.some((i, k) => i !== wasOrder[k]))
    kept.forEach((i, k) => {
      if (i !== wasOrder[k])
        out.changes.push(
          `"${labels[i]}" moved in the draw order: ${ord(wasOrder.indexOf(i) + 1)} to ${ord(k + 1)}`,
        );
    });

  if (out.problems.length) out.changes = [];
  return out;
}

// MARK: - The peach

/** The peach's labels, part for part: the leaf, the body, the highlight, then the face. */
export const PEACH_PART_LABELS: readonly string[] = [
  ...PEACH_LABELS.body,
  ...PEACH_LABELS.face,
];

/**
 * The peach as a table of parts, from peachArt.ts: a circle as the path the
 * growth table draws it with, the face's parts marked as the face's. The
 * peach's file and Perfectly Peachy's are both read against it.
 */
export function peachTable(): CostumePart[] {
  const part = (
    p: (typeof PEACH_BODY)[number],
    face: boolean,
  ): CostumePart => ({
    d: p.circle
      ? formatPath(circlePath(p.circle[0], p.circle[1], p.circle[2]))
      : p.d!,
    ...(p.fill ? { fill: p.fill } : {}),
    ...(p.opacity !== undefined ? { opacity: p.opacity } : {}),
    ...(p.stroke ? { stroke: p.stroke, strokeWidth: p.strokeWidth ?? 1 } : {}),
    ...(face ? { faceOnly: true } : {}),
  });
  return [
    ...PEACH_BODY.map((p) => part(p, false)),
    ...PEACH_FACE.map((p) => part(p, true)),
  ];
}

/**
 * What the peach's plan can't hold. Both apps find the peach's parts by
 * place: the stages recolour its body and highlight and the crown drops its
 * leaf, the costumes follow its first three outlines, and the face is what a
 * small peach and a costume with its own face leave out. So the peach keeps
 * its eight parts, in their order, the face last.
 */
export function peachProblems(p: Plan): string[] {
  if (p.problems.length) return [];
  const out: string[] = [];
  const n = PEACH_PART_LABELS.length;
  if (p.parts.length !== n || p.from.some((i, k) => i !== k))
    out.push(
      'the peach keeps its eight parts in their order (the leaf, the body, the highlight, ' +
        'then the face), since both apps and the stages find them by place. Reshape and ' +
        'recolour them freely; a new part belongs to a costume or a stage',
    );
  else
    p.parts.forEach((part, k) => {
      const face = k >= PEACH_LABELS.body.length;
      if (!!part.faceOnly !== face)
        out.push(
          `"${PEACH_PART_LABELS[k]}" ${face ? 'is part of the face, so it keeps its "(face only)"' : 'is drawn at every size, so it takes no "(face only)"'}`,
        );
    });
  return out;
}

// MARK: - Whether a file has edits of its own

/**
 * Every layer's objects but the guides', as lines of text that change when
 * they do: what a file draws, whatever its kind, for telling whether a file
 * in the vault has edits the code doesn't have.
 */
export function drawingOf(svg: string): Map<string, string[]> | null {
  let root: XmlEl;
  try {
    root = parseXml(svg);
  } catch (e) {
    if (e instanceof XmlError) return null;
    throw e;
  }
  const out = new Map<string, string[]>();
  for (const el of root.children)
    if (
      el.localName === 'g' &&
      el.getAttribute('inkscape:groupmode') === 'layer' &&
      el.id !== 'guides'
    )
      out.set(
        el.id,
        referenceLines(el, parseTransform(el.getAttribute('transform'))),
      );
  return out;
}

/** Whether two files draw the same, layer for layer, at one decimal. */
export function sameDrawing(a: string, b: string): boolean {
  const x = drawingOf(a);
  const y = drawingOf(b);
  if (!x || !y || x.size !== y.size) return false;
  for (const [id, lines] of x)
    if (lines.join('\n') !== (y.get(id) ?? []).join('\n')) return false;
  return true;
}
