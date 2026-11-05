/**
 * Writing a plan back into the two repos' tables, touching only the parts that
 * changed: an unchanged part keeps its text, comments and all, so a file with
 * no edits writes nothing.
 *
 * The web's tables are TypeScript, read with the compiler's own parser. iOS's
 * costume table is Swift, hand-formatted, and its growth table is generated
 * from Python; both are read with small scanners that know strings, brackets
 * and comments.
 */
import ts from 'typescript';
import type { CostumePart } from '@/ui/costumes.ts';
import type { PeachPart } from '@/ui/peachArt.ts';
import type { Plan } from './importer.ts';

const KEYS = [
  'd',
  'fill',
  'opacity',
  'stroke',
  'strokeWidth',
  'faceOnly',
] as const;
type Key = (typeof KEYS)[number];

const valueOf = (p: CostumePart, k: Key) =>
  k === 'faceOnly' ? p.faceOnly || undefined : p[k];

export class WriteError extends Error {}

// MARK: - TypeScript

function find<T extends ts.Node>(
  node: ts.Node,
  test: (n: ts.Node) => n is T,
): T | undefined {
  if (test(node)) return node;
  return ts.forEachChild(node, (child) => find(child, test));
}

const propName = (p: ts.ObjectLiteralElementLike, sf: ts.SourceFile) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ? p.name.text
    : p.name?.getText(sf);

function property(
  obj: ts.ObjectLiteralExpression,
  name: string,
  sf: ts.SourceFile,
) {
  const p = obj.properties.find((q) => propName(q, sf) === name);
  return p && ts.isPropertyAssignment(p) ? p : undefined;
}

/** `const NAME = { ... }`'s object, or its `{ ... } as const`. */
function objectOf(sf: ts.SourceFile, name: string): ts.ObjectLiteralExpression {
  const decl = find(
    sf,
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name,
  );
  let init = decl?.initializer;
  while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)))
    init = init.expression;
  if (!init || !ts.isObjectLiteralExpression(init))
    throw new WriteError(`no ${name} object`);
  return init;
}

/** Splices replacements, given as [start, end, text], into a text. */
function splice(text: string, edits: [number, number, string][]): string {
  return [...edits]
    .sort((a, b) => b[0] - a[0])
    .reduce((t, [s, e, r]) => t.slice(0, s) + r + t.slice(e), text);
}

/** An object laid out one property to a line, as Prettier keeps the table's. */
const expanded = (props: string[], indent: string) =>
  `{\n${props.map((p) => `${indent}  ${p},\n`).join('')}${indent}}`;

const tsLiteral = (k: Key, v: string | number | boolean) =>
  `${k}: ${typeof v === 'string' ? `'${v}'` : String(v)}`;

/** What changed in one table's parts, for a writer. */
export interface PartsChange {
  /** For each new part, the old part's index, or null for an added one. */
  from: readonly (number | null)[];
  parts: readonly CostumePart[];
  labels: readonly string[];
}

/** No part moved, came or went: each new part is the old one in its place. */
export const inPlace = (
  parts: readonly CostumePart[],
  labels: readonly string[] = [],
) => ({
  from: parts.map((_, i) => i),
  parts,
  labels,
});

const sameParts = (
  a: readonly CostumePart[],
  b: readonly CostumePart[],
  keys: readonly Key[] = KEYS,
) =>
  a.length === b.length &&
  a.every((p, i) => keys.every((k) => valueOf(p, k) === valueOf(b[i]!, k)));

/**
 * An array literal of parts, rewritten: an unchanged part keeps its text; a
 * changed one keeps each property whose value held, so `fill: LEAF` stays
 * `LEAF`. Parts carry their comments when they move. A new part gets its label
 * as its comment. `keys` are the properties the array's parts can have, and a
 * part whose outline held keeps whichever of `d` and `circle` it is written
 * with. Prettier is left to lay out what changed.
 */
function arrayEdit(
  source: string,
  sf: ts.SourceFile,
  array: ts.ArrayLiteralExpression,
  change: PartsChange,
  oldParts: readonly CostumePart[],
  what: string,
  keys: readonly Key[] = KEYS,
): [number, number, string] {
  const els = array.elements;
  if (els.length !== oldParts.length)
    throw new WriteError(`${what}: the table and its source disagree`);
  const indent =
    /\n([ \t]*)$/.exec(
      source.slice(els[0]!.getFullStart(), els[0]!.getStart(sf)),
    )?.[1] ?? '      ';
  const leading = (i: number) =>
    source.slice(els[i]!.getFullStart(), els[i]!.getStart(sf));
  const body = (i: number) =>
    source.slice(els[i]!.getStart(sf), els[i]!.getEnd());
  const texts = change.parts.map((part, j) => {
    const i = change.from[j];
    if (i === null || i === undefined)
      return `\n${indent}// ${change.labels[j]}.\n${indent}${expanded(
        keys
          .filter((k) => valueOf(part, k) !== undefined)
          .map((k) => tsLiteral(k, valueOf(part, k)!)),
        indent,
      )}`;
    const was = oldParts[i]!;
    if (keys.every((k) => valueOf(part, k) === valueOf(was, k)))
      return leading(i) + body(i);
    const el = els[i]!;
    if (!ts.isObjectLiteralExpression(el))
      throw new WriteError(`${what}: part ${i} is not an object`);
    const props = keys
      .filter((k) => valueOf(part, k) !== undefined)
      .map((k) => {
        const held = valueOf(was, k) === valueOf(part, k);
        const prop =
          k === 'd' && held
            ? (property(el, 'd', sf) ?? property(el, 'circle', sf))
            : property(el, k, sf);
        return prop && held
          ? source.slice(prop.getStart(sf), prop.getEnd())
          : tsLiteral(k, valueOf(part, k)!);
      });
    return `${leading(i)}${expanded(props, indent)}`;
  });
  // The first part's leading text may hold nothing but the bracket's newline.
  return [
    els[0]!.getFullStart(),
    els[els.length - 1]!.getEnd(),
    texts.join(','),
  ];
}

/** The array a `const NAME = [...]` holds. */
function arrayOf(sf: ts.SourceFile, name: string): ts.ArrayLiteralExpression {
  const decl = find(
    sf,
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name,
  );
  let init = decl?.initializer;
  while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)))
    init = init.expression;
  if (!init || !ts.isArrayLiteralExpression(init))
    throw new WriteError(`no ${name} array`);
  return init;
}

const parse = (name: string, source: string) =>
  ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);

/** The web's `COSTUMES` with each plan's parts. */
export function writeCostumesTs(
  source: string,
  plans: readonly Plan[],
  old: (id: string) => readonly CostumePart[],
): string {
  const sf = parse('costumes.ts', source);
  const costumes = objectOf(sf, 'COSTUMES');
  const edits: [number, number, string][] = [];
  for (const plan of plans) {
    if (!plan.changes.length) continue;
    const entry = property(costumes, plan.id, sf);
    const obj =
      entry && ts.isObjectLiteralExpression(entry.initializer)
        ? entry.initializer
        : undefined;
    const parts = obj && property(obj, 'parts', sf);
    const array =
      parts && ts.isArrayLiteralExpression(parts.initializer)
        ? parts.initializer
        : undefined;
    if (!array)
      throw new WriteError(`no parts array for ${plan.id} in costumes.ts`);
    edits.push(arrayEdit(source, sf, array, plan, old(plan.id), plan.id));
  }
  return splice(source, edits);
}

/**
 * peachArt.ts's `PEACH_BODY` and `PEACH_FACE` with the peach's new parts, the
 * leaf, the body and the highlight, then the face. The face's parts are the
 * face's by being in `PEACH_FACE`, so they are written without `faceOnly`, and
 * an outline that changed is written as absolute path data, a circle's too.
 */
export function writePeachArtTs(
  source: string,
  parts: readonly CostumePart[],
  old: readonly CostumePart[],
): string {
  const sf = parse('peachArt.ts', source);
  const keys = KEYS.filter((k) => k !== 'faceOnly');
  const body = arrayOf(sf, 'PEACH_BODY');
  const n = body.elements.length;
  const edits: [number, number, string][] = [];
  if (!sameParts(parts.slice(0, n), old.slice(0, n), keys))
    edits.push(
      arrayEdit(
        source,
        sf,
        body,
        inPlace(parts.slice(0, n)),
        old.slice(0, n),
        'PEACH_BODY',
        keys,
      ),
    );
  if (!sameParts(parts.slice(n), old.slice(n), keys))
    edits.push(
      arrayEdit(
        source,
        sf,
        arrayOf(sf, 'PEACH_FACE'),
        inPlace(parts.slice(n)),
        old.slice(n),
        'PEACH_FACE',
        keys,
      ),
    );
  return splice(source, edits);
}

/**
 * The peach's new parts as peachArt.ts holds them: a part that held is the
 * old one, a circle still a circle; a changed one is path data, absolute.
 * What the game draws, and the tab icon is written from.
 */
export function peachArtParts(
  parts: readonly CostumePart[],
  was: readonly CostumePart[],
  old: readonly PeachPart[],
): PeachPart[] {
  return parts.map((part, i) =>
    KEYS.every((k) => valueOf(part, k) === valueOf(was[i]!, k))
      ? old[i]!
      : {
          d: part.d,
          ...(part.fill ? { fill: part.fill } : {}),
          ...(part.opacity !== undefined ? { opacity: part.opacity } : {}),
          ...(part.stroke
            ? { stroke: part.stroke, strokeWidth: part.strokeWidth ?? 1 }
            : {}),
        },
  );
}

/** One stage of the growth table, as the generator's `--json` writes it. */
export interface StageJson {
  id: string;
  spoken: string;
  parts: CostumePart[];
}

/**
 * The web's copy of the growth table, `growthStages.ts`, written from the
 * generator's own output: each stage whose parts changed, Perfectly Peachy's
 * in `PERFECTLY_PEACHY`. `changes` says how an edited stage's parts moved,
 * came or went; a stage that changed only because the peach did keeps its
 * parts in place.
 */
export function writeGrowthStagesTs(
  source: string,
  stages: readonly StageJson[],
  old: readonly StageJson[],
  changes: ReadonlyMap<string, PartsChange> = new Map(),
): string {
  const sf = parse('growthStages.ts', source);
  const table = arrayOf(sf, 'GROWTH_STAGES');
  const edits: [number, number, string][] = [];
  for (const stage of stages) {
    const was = old.find((s) => s.id === stage.id);
    if (!was) throw new WriteError(`growthStages.ts has no stage ${stage.id}`);
    if (sameParts(stage.parts, was.parts)) continue;
    const obj = table.elements.find(
      (el): el is ts.ObjectLiteralExpression =>
        ts.isObjectLiteralExpression(el) &&
        (property(el, 'id', sf)?.initializer as ts.StringLiteral | undefined)
          ?.text === stage.id,
    );
    const init = obj && property(obj, 'parts', sf)?.initializer;
    const array =
      init && ts.isIdentifier(init)
        ? arrayOf(sf, init.text)
        : init && ts.isArrayLiteralExpression(init)
          ? init
          : undefined;
    if (!array)
      throw new WriteError(`no parts for ${stage.id} in growthStages.ts`);
    const change = changes.get(stage.id) ?? inPlace(stage.parts);
    edits.push(
      arrayEdit(
        source,
        sf,
        array,
        { ...change, parts: stage.parts },
        was.parts,
        stage.id,
      ),
    );
  }
  return splice(source, edits);
}

/**
 * labels.ts's `COSTUME_LABELS`, or another of its tables, with each plan's
 * labels: written out only where they changed, so `PEACH_STAGE` stays.
 */
export function writeLabelsTs(
  source: string,
  plans: readonly Plan[],
  table = 'COSTUME_LABELS',
  now: (id: string) => readonly string[] | undefined = () => undefined,
): string {
  const sf = parse('labels.ts', source);
  const labels = objectOf(sf, table);
  const edits: [number, number, string][] = [];
  for (const plan of plans) {
    if (!plan.changes.length) continue;
    const was = now(plan.id);
    if (was && was.join('\n') === plan.labels.join('\n')) continue;
    const prop = property(labels, plan.id, sf);
    if (!prop) throw new WriteError(`no labels for ${plan.id}`);
    const text = `[${plan.labels.map((l) => `'${l.replace(/'/g, "\\'")}'`).join(', ')}]`;
    if (prop.initializer.getText(sf) !== text)
      edits.push([
        prop.initializer.getStart(sf),
        prop.initializer.getEnd(),
        text,
      ]);
  }
  return splice(source, edits);
}

// MARK: - Swift

/** Where each top-level item of a bracketed Swift list starts and ends. */
function swiftItems(
  src: string,
  open: number,
): { items: [number, number][]; close: number } {
  const items: [number, number][] = [];
  let depth = 0;
  let start = open + 1;
  let i = open;
  for (; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"') {
      for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if ('([{'.includes(c)) {
      depth++;
    } else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) {
        if (src.slice(start, i).trim()) items.push([start, i]);
        return { items, close: i };
      }
    } else if (c === ',' && depth === 1) {
      items.push([start, i]);
      start = i + 1;
    }
  }
  throw new WriteError('an unclosed bracket in Costumes.swift');
}

/** A `CostumePart(...)` call's arguments, by label; the first is `d`. */
function swiftArgs(call: string): Map<string, string> {
  const open = call.indexOf('(');
  const { items } = swiftItems(call, open);
  const args = new Map<string, string>();
  items.forEach(([s, e], n) => {
    const text = call.slice(s, e).trim();
    const m = /^([a-zA-Z]+):\s*([\s\S]*)$/.exec(text);
    if (n === 0 && !m) args.set('d', text);
    else if (m) args.set(m[1]!, m[2]!);
    else throw new WriteError(`an unlabelled argument in ${call}`);
  });
  return args;
}

const swiftCamel = (id: string) =>
  id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const swiftLiteral = (v: string | number | boolean) =>
  typeof v === 'string' ? `"${v}"` : String(v);

/** A long path, broken at its commands as the hand-written table breaks one. */
function swiftPath(d: string, room: number, continuation: string): string {
  if (d.length + 2 <= room) return `"${d}"`;
  const lines: string[] = [];
  let line = '';
  for (const piece of d.split(/ (?=[MLCZ])/)) {
    if (line && line.length + piece.length + 1 > room - 4) {
      lines.push(line + ' ');
      line = piece;
    } else line = line ? `${line} ${piece}` : piece;
  }
  lines.push(line);
  return lines.map((l) => `"${l}"`).join(`\n${continuation}+ `);
}

/**
 * iOS's `Costumes.swift` with each plan's parts. Unchanged parts keep their
 * text. A changed part keeps each argument whose value held (`fill: leaf`
 * stays `leaf`), and is laid out as the file lays one out: on one line when it
 * fits in 100 columns, else broken after the path.
 */
export function writeCostumesSwift(
  source: string,
  plans: readonly Plan[],
  old: (id: string) => readonly CostumePart[],
): string {
  const edits: [number, number, string][] = [];
  for (const plan of plans) {
    if (!plan.changes.length) continue;
    const decl = source.indexOf(
      `static let ${swiftCamel(plan.id)}Table = CostumeTable(`,
    );
    const partsAt = decl < 0 ? -1 : source.indexOf('parts: [', decl);
    if (partsAt < 0)
      throw new WriteError(`no ${swiftCamel(plan.id)}Table in Costumes.swift`);
    const { items } = swiftItems(source, partsAt + 'parts: '.length);
    const oldParts = old(plan.id);
    if (items.length !== oldParts.length)
      throw new WriteError(`${plan.id}: the table and Costumes.swift disagree`);
    const first = source.slice(items[0]![0], items[0]![1]);
    const indent = /\n([ \t]*)\S/.exec(first)?.[1] ?? '            ';
    const continuation = indent + ' '.repeat('CostumePart('.length);
    const texts = plan.parts.map((part, j) => {
      const i = plan.from[j];
      const was = i === null || i === undefined ? undefined : oldParts[i]!;
      if (was && KEYS.every((k) => valueOf(part, k) === valueOf(was, k)))
        return source.slice(items[i!]![0], items[i!]![1]);
      const oldText = was ? source.slice(items[i!]![0], items[i!]![1]) : '';
      const leading = was
        ? (/^\s*(?:\/\/[^\n]*\n\s*)*/.exec(oldText)?.[0] ?? `\n${indent}`)
        : `\n${indent}`;
      const args = was
        ? swiftArgs(oldText.trim().replace(/^(?:\/\/[^\n]*\n\s*)*/, ''))
        : new Map<string, string>();
      const arg = (k: Key) =>
        was && args.has(k) && valueOf(was, k) === valueOf(part, k)
          ? args.get(k)!
          : swiftLiteral(valueOf(part, k)!);
      const rest = KEYS.slice(1)
        .filter((k) => valueOf(part, k) !== undefined)
        .map((k) => `${k}: ${arg(k)}`)
        .join(', ');
      const d =
        was && args.has('d') && was.d === part.d ? args.get('d')! : undefined;
      const oneLine = `CostumePart(${d ?? swiftLiteral(part.d)}${rest ? `, ${rest}` : ''})`;
      if (!oneLine.includes('\n') && indent.length + oneLine.length + 1 <= 100)
        return leading + oneLine;
      const path =
        d ?? swiftPath(part.d, 100 - continuation.length, continuation);
      return `${leading}CostumePart(${path}${rest ? `,\n${continuation}${rest}` : ''})`;
    });
    edits.push([items[0]![0], items[items.length - 1]![1], texts.join(',')]);
  }
  return splice(source, edits);
}

// MARK: - Python: the growth table's generator

/** Where each top-level item of a bracketed Python list or call starts and ends. */
function pyItems(
  src: string,
  open: number,
): { items: [number, number][]; close: number } {
  const items: [number, number][] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"' || c === "'") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '#') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) {
        if (
          src
            .slice(start, i)
            .replace(/#[^\n]*/g, '')
            .trim()
        )
          items.push([start, i]);
        return { items, close: i };
      }
    } else if (c === ',' && depth === 1) {
      items.push([start, i]);
      start = i + 1;
    }
  }
  throw new WriteError('an unclosed bracket in growth-stages.py');
}

/** A `dict(...)` call's keyword arguments, by name, as written. */
function pyKwargs(call: string): Map<string, string> {
  const { items } = pyItems(call, call.indexOf('('));
  const args = new Map<string, string>();
  for (const [s, e] of items) {
    const m = /^\s*([a-zA-Z]+)=([\s\S]*?)\s*$/.exec(call.slice(s, e));
    if (!m) throw new WriteError(`an argument without a name in ${call}`);
    args.set(m[1]!, m[2]!);
  }
  return args;
}

const pyLiteral = (v: string | number | boolean) =>
  typeof v === 'string'
    ? `"${v}"`
    : typeof v === 'boolean'
      ? v
        ? 'True'
        : 'False'
      : String(v);

/** A part as the generator writes one, keeping each argument whose value held. */
function pyDict(
  part: CostumePart,
  was?: CostumePart,
  args: Map<string, string> = new Map(),
): string {
  const kw = KEYS.filter((k) => valueOf(part, k) !== undefined).map((k) => {
    const held = was && args.has(k) && valueOf(was, k) === valueOf(part, k);
    return `${k}=${held ? args.get(k)! : pyLiteral(valueOf(part, k)!)}`;
  });
  return `dict(${kw.join(', ')})`;
}

/** The text of the `dict(...)` call that starts a line, to its own closing bracket. */
function dictCall(line: string): { call: string; rest: string } {
  const at = line.indexOf('dict(');
  if (at < 0) throw new WriteError(`not a part: ${line}`);
  const { close } = pyItems(line, at + 'dict'.length);
  return { call: line.slice(at, close + 1), rest: line.slice(close + 1) };
}

const PEACH_FROM = '# The peach: from here';
const PEACH_TO = '# The peach: to here';

/**
 * The generator's `PEACH_PARTS`, one part to a line, with the peach's new
 * parts: an unchanged line stays as it is, and a changed one keeps each
 * argument whose value held, `fill=LEAF` included, and its label.
 */
export function writePeachPy(
  source: string,
  parts: readonly CostumePart[],
  old: readonly CostumePart[],
): string {
  const from = source.indexOf(PEACH_FROM);
  const to = source.indexOf(PEACH_TO);
  if (from < 0 || to < from)
    throw new WriteError(
      "the iOS checkout's tools/growth-stages.py has no PEACH_PARTS between its markers, " +
        'so it is older than this import: bring that checkout up to date with main',
    );
  const block = source.slice(from, to);
  const lines = block.split('\n');
  const partLines = lines
    .map((l, i) => [l, i] as const)
    .filter(([l]) => /^\s*dict\(/.test(l));
  if (partLines.length !== old.length || parts.length !== old.length)
    throw new WriteError(
      `growth-stages.py's peach has ${partLines.length} parts, the table ${old.length}`,
    );
  partLines.forEach(([line, at], k) => {
    const part = parts[k]!;
    const was = old[k]!;
    if (KEYS.every((key) => valueOf(part, key) === valueOf(was, key))) return;
    const indent = /^\s*/.exec(line)![0];
    const { call, rest } = dictCall(line);
    lines[at] = `${indent}${pyDict(part, was, pyKwargs(call))}${rest}`;
  });
  return source.slice(0, from) + lines.join('\n') + source.slice(to);
}

/** How a stage's parts are written in the generator. */
export interface StageForm {
  /** Where the expression after `"parts":` starts and ends. */
  start: number;
  end: number;
  /**
   * How many of its parts are the peach's, drawn by `peach_parts()`: all of
   * them for Ripening, Sweet and Perfectly Peachy, all but the leaf for the
   * crowned stage. Zero for a stage drawn on its own.
   */
  peach: number;
  /** For a stage drawn from the peach with parts of its own: that list's `[`. */
  own?: number;
}

/** A stage's parts expression in the generator, found by what the stage says. */
export function stageForm(source: string, spoken: string): StageForm {
  const at = source.indexOf(`"spoken": "${spoken}",`);
  const key = at < 0 ? -1 : source.indexOf('"parts":', at);
  if (key < 0)
    throw new WriteError(`growth-stages.py has no stage "${spoken}"`);
  let start = key + '"parts":'.length;
  while (/\s/.test(source[start]!)) start++;
  let depth = 0;
  let end = start;
  for (; end < source.length; end++) {
    const c = source[end]!;
    if (c === '"' || c === "'") {
      for (end++; end < source.length && source[end] !== c; end++)
        if (source[end] === '\\') end++;
    } else if (c === '#') {
      while (end < source.length && source[end] !== '\n') end++;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) break;
  }
  const expr = source.slice(start, end).trimEnd();
  end = start + expr.length;
  if (/^peach_parts\([^()]*\)$/.test(expr)) return { start, end, peach: 8 };
  const crowned = /^peach_parts\(\)\[1:\]\s*\+\s*\[/.exec(expr);
  if (crowned)
    return { start, end, peach: 7, own: start + crowned[0].length - 1 };
  return { start, end, peach: 0 };
}

/** Where the generator's `DRAWN_ON_THEIR_OWN = [...]` list is, and what it names. */
function drawnOnTheirOwn(source: string): {
  start: number;
  end: number;
  ids: string[];
} {
  const m = /^DRAWN_ON_THEIR_OWN = \[([^\]\n]*)\]$/m.exec(source);
  if (!m)
    throw new WriteError(
      "the iOS checkout's tools/growth-stages.py has no DRAWN_ON_THEIR_OWN list, " +
        'so it is older than this import: bring that checkout up to date with main',
    );
  const ids = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
  return { start: m.index, end: m.index + m[0].length, ids };
}

/** Whether the generator names a stage as drawn on its own. */
export const isDrawnOnItsOwn = (source: string, id: string) =>
  drawnOnTheirOwn(source).ids.includes(id);

/**
 * One stage in the generator, with its new parts (answer 6). A stage drawn on
 * its own comes back as literal path data in place of its formula. A stage
 * drawn from the peach goes on following it while only its own parts change,
 * as the crown's jewels. An edit to its peach draws it on its own only when
 * `drawOnItsOwn` says to: the stage is then named in `DRAWN_ON_THEIR_OWN`,
 * which is what lets it stop following the peach (Antoine, 4 November 2026),
 * and says so where it stands. Without it, the edit stops the import.
 */
export function writeStagePy(
  source: string,
  stage: { id: string; spoken: string },
  change: PartsChange,
  old: readonly CostumePart[],
  edited: string,
  drawOnItsOwn = false,
): { text: string; drawnOnItsOwn: boolean } {
  const form = stageForm(source, stage.spoken);
  const lineStart = source.lastIndexOf('\n', form.start) + 1;
  const keyIndent = /^\s*/.exec(source.slice(lineStart))![0];
  const indent = `${keyIndent}    `;
  const peachHeld =
    form.peach > 0 &&
    change.from.slice(0, form.peach).every((i, k) => i === k) &&
    KEYS.every((key) =>
      change.parts
        .slice(0, form.peach)
        .every((p, k) => valueOf(p, key) === valueOf(old[k]!, key)),
    );
  if (peachHeld && form.own !== undefined) {
    // Only the crown's own parts changed: they are written, the peach stays.
    const { items } = pyItems(source, form.own);
    const texts = change.parts.slice(form.peach).map((part, j) => {
      const i = change.from[form.peach + j];
      if (i === null || i === undefined)
        return `\n${indent}# ${change.labels[form.peach + j]}\n${indent}${pyDict(part)}`;
      const [s, e] = items[i - form.peach]!;
      const text = source.slice(s, e);
      const was = old[i]!;
      if (KEYS.every((k) => valueOf(part, k) === valueOf(was, k))) return text;
      const lead = /^\s*/.exec(text)![0];
      const { call } = dictCall(text.trim());
      return `${lead}${pyDict(part, was, pyKwargs(call))}`;
    });
    const text =
      source.slice(0, items[0]![0]) +
      texts.join(',') +
      source.slice(items[items.length - 1]![1]);
    return { text, drawnOnItsOwn: false };
  }
  if (peachHeld && change.parts.length === form.peach)
    return { text: source, drawnOnItsOwn: false };
  const drawnOnItsOwn = form.peach > 0;
  if (drawnOnItsOwn && !drawOnItsOwn)
    throw new WriteError(
      `"${stage.spoken}" is drawn from the peach and follows it, so this edit to its peach ` +
        "would part it from the peach's. Edit peach.svg to change the peach everywhere. To " +
        'draw this stage on its own from now on, out of reach of later edits to the peach, ' +
        'import it again with --draw-on-its-own',
    );
  const literal =
    '[\n' +
    change.parts
      .map((part, j) => `${indent}${pyDict(part)},  # ${change.labels[j]}\n`)
      .join('') +
    `${keyIndent}]`;
  let text = source.slice(0, form.start) + literal + source.slice(form.end);
  if (drawnOnItsOwn) {
    text =
      text.slice(0, lineStart) +
      `${keyIndent}# Edited in Inkscape on ${edited} and drawn on its own, as DRAWN_ON_THEIR_OWN\n` +
      `${keyIndent}# says: it no longer follows the peach (Antoine, 4 November 2026).\n` +
      text.slice(lineStart);
    const list = drawnOnTheirOwn(text);
    if (!list.ids.includes(stage.id))
      text =
        text.slice(0, list.start) +
        `DRAWN_ON_THEIR_OWN = [${[...list.ids, stage.id].map((id) => `"${id}"`).join(', ')}]` +
        text.slice(list.end);
  }
  return { text, drawnOnItsOwn };
}

// MARK: - The hashes

const HEX = /[0-9a-f]{64}/;

/** Moves the pinned hash that follows `name` in a test file. */
export function writeHash(source: string, name: string, hash: string): string {
  const at = source.indexOf(name);
  const m = at < 0 ? null : HEX.exec(source.slice(at));
  if (!m) throw new WriteError(`no hash after ${name}`);
  const start = at + m.index;
  return source.slice(0, start) + hash + source.slice(start + 64);
}
