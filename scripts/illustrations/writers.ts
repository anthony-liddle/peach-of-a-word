/**
 * Writing a plan back into the two repos' costume tables, touching only the
 * parts that changed: an unchanged part keeps its text, comments and all, so
 * a file with no edits writes nothing.
 *
 * The web's table is TypeScript, read with the compiler's own parser. iOS's is
 * Swift, hand-formatted, read with a small scanner that knows strings,
 * brackets and comments.
 */
import ts from 'typescript';
import type { CostumeId, CostumePart } from '@/ui/costumes.ts';
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

/**
 * The web's `COSTUMES` with each plan's parts: unchanged parts keep their
 * text; a changed one keeps each property whose value held, so `fill: LEAF`
 * stays `LEAF`. Parts carry their comments when they move. A new part gets its
 * label as its comment. Prettier is left to lay out what changed.
 */
export function writeCostumesTs(
  source: string,
  plans: readonly Plan[],
  old: (id: CostumeId) => readonly CostumePart[],
): string {
  const sf = ts.createSourceFile(
    'costumes.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
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
    const els = array.elements;
    const oldParts = old(plan.id);
    if (els.length !== oldParts.length)
      throw new WriteError(`${plan.id}: the table and its source disagree`);
    const indent =
      /\n([ \t]*)$/.exec(
        source.slice(els[0]!.getFullStart(), els[0]!.getStart(sf)),
      )?.[1] ?? '      ';
    const leading = (i: number) =>
      source.slice(els[i]!.getFullStart(), els[i]!.getStart(sf));
    const body = (i: number) =>
      source.slice(els[i]!.getStart(sf), els[i]!.getEnd());
    const texts = plan.parts.map((part, j) => {
      const i = plan.from[j];
      if (i === null || i === undefined)
        return `\n${indent}// ${plan.labels[j]}.\n${indent}${expanded(
          KEYS.filter((k) => valueOf(part, k) !== undefined).map((k) =>
            tsLiteral(k, valueOf(part, k)!),
          ),
          indent,
        )}`;
      const was = oldParts[i]!;
      if (KEYS.every((k) => valueOf(part, k) === valueOf(was, k)))
        return leading(i) + body(i);
      const el = els[i]!;
      if (!ts.isObjectLiteralExpression(el))
        throw new WriteError(`${plan.id}: part ${i} is not an object`);
      const props = KEYS.filter((k) => valueOf(part, k) !== undefined).map(
        (k) => {
          const prop = property(el, k, sf);
          return prop && valueOf(was, k) === valueOf(part, k)
            ? source.slice(prop.getStart(sf), prop.getEnd())
            : tsLiteral(k, valueOf(part, k)!);
        },
      );
      return `${leading(i)}${expanded(props, indent)}`;
    });
    // The first part's leading text may hold nothing but the bracket's newline.
    edits.push([
      els[0]!.getFullStart(),
      els[els.length - 1]!.getEnd(),
      texts.join(','),
    ]);
  }
  return splice(source, edits);
}

/** labels.ts's `COSTUME_LABELS`, with each plan's labels. */
export function writeLabelsTs(source: string, plans: readonly Plan[]): string {
  const sf = ts.createSourceFile(
    'labels.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const labels = objectOf(sf, 'COSTUME_LABELS');
  const edits: [number, number, string][] = [];
  for (const plan of plans) {
    if (!plan.changes.length) continue;
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
  old: (id: CostumeId) => readonly CostumePart[],
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
