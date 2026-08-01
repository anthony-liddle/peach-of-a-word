import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

/**
 * The letterpress metaphor belongs in themeCopy.ts and nowhere else. A string
 * that carries it from anywhere else renders the same under both themes, so no
 * per-theme test catches it: it just quietly says "type" to a player who is
 * picking peaches. That is exactly how "Setting the type." survived the cute
 * vocabulary pass on the loading screen.
 *
 * This scans for the metaphor's distinctive terms in the strings that reach a
 * player, and only those. Three things it must never fire on, and how each is
 * excluded structurally rather than by a list of forgiven lines:
 *
 *   Comments. The sources are parsed, not read line by line, and only literal
 *   nodes are collected. Comments are not nodes, so they never arrive.
 *
 *   Class names, data attributes, and other identifiers. The compose area is a
 *   "stick" and the tile area is a "case" in the stylesheet; those are code. The
 *   prose filter below keeps only strings holding more than one word, which is
 *   what a sentence looks like and what an identifier never does.
 *
 *   Test fixtures and design documents. Only src/ sources ship to a player, and
 *   test files are dropped by name.
 */
const TERMS = ['the type', 'the case', 'type sorts', 'letterpress', 'off-page'];

/**
 * Only strings holding more than one word are candidates. Every user-facing
 * string is prose; identifiers, class names, module paths, and storage keys are
 * single tokens. Filtering on the shape of the value is what lets the term list
 * stay short and literal instead of carrying an exception for every code site
 * that legitimately says "letterpress" or "case".
 */
function isProse(value: string): boolean {
  return /\S\s+\S/.test(value.trim());
}

/** Every string literal, template chunk, and JSX text node in a source file. */
function prose(source: string, file: string): string[] {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (isProse(node.text)) found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

function offenders(strings: string[]): string[] {
  return strings.filter((s) =>
    TERMS.some((term) => s.toLowerCase().includes(term)),
  );
}

const srcDir = resolve(process.cwd(), 'src');
const sources = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
  // The one place the vocabulary is supposed to live.
  .filter((f) => f !== 'ui/themeCopy.ts')
  .map((f) => ({ file: f, text: readFileSync(resolve(srcDir, f), 'utf8') }));

describe('letterpress vocabulary stays in themeCopy.ts', () => {
  test('no rendered string in src carries a letterpress term', () => {
    const caught = sources.flatMap(({ file, text }) =>
      offenders(prose(text, file)).map((s) => `${file}: ${s}`),
    );
    expect(caught).toEqual([]);
  });

  test('scanned the real sources, so an empty result means something', () => {
    // A bad glob would pass the test above on zero files. App.tsx is the file
    // that motivated this guard, so it has to be among the scanned ones.
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.map((s) => s.file)).toContain('App.tsx');
  });

  test('the scan reaches the strings a player actually reads', () => {
    // Proves the parser collects rendered text rather than only quoted
    // literals: this line is JSX text and a template chunk away from either.
    const all = sources.flatMap(({ file, text }) => prose(text, file));
    expect(all).toContain('The word lists did not load. Reload to try again.');
  });
});

describe('the static head and manifest describe what ships', () => {
  // These are read by crawlers and installers before any JS runs, so they can
  // never be theme-skinned. They can only be accurate, which for one baked
  // peach-cream card and a cute-default app means no letterpress terms.
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  test('no meta content or title in index.html carries a letterpress term', () => {
    // Attribute values and the title only. The raw file also holds the inline
    // theme script and HTML comments, which are code, not copy.
    const values = [
      ...html.matchAll(/content="([^"]*)"/g),
      ...html.matchAll(/<title>([^<]*)<\/title>/g),
    ].map((m) => m[1] ?? '');
    expect(values.length).toBeGreaterThan(5);
    expect(offenders(values.filter(isProse))).toEqual([]);
  });

  test('no manifest string carries a letterpress term', () => {
    const manifest = readFileSync(
      resolve(process.cwd(), 'public/site.webmanifest'),
      'utf8',
    );
    const values = Object.values(
      JSON.parse(manifest) as Record<string, unknown>,
    ).filter((v): v is string => typeof v === 'string');
    expect(values.length).toBeGreaterThan(3);
    expect(offenders(values.filter(isProse))).toEqual([]);
  });
});
