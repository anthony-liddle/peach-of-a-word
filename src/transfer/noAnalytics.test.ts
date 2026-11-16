import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * The transfer page counts no visits.
 *
 * The privacy page says counting visits is the one thing the site does that
 * the app doesn't, and Vercel Web Analytics is mounted only inside the game
 * (src/App.tsx). This page reads a player's save to hand it to the app, so it
 * stays out of that: nothing it loads reaches the analytics package.
 *
 * Walked from the page's own module through every import it makes, the way the
 * build follows them. A shared chunk can't carry the package to this page
 * unless some module on this walk imports it.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const html = read('transfer.html');

/** Every module specifier a file imports, static or dynamic. */
function specifiers(source: string): string[] {
  const found = [
    ...source.matchAll(/\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bexport\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ];
  return found.map((m) => m[1]!);
}

/** A specifier as a repo file, or null for a package. */
function fileFor(spec: string, from: string): string | null {
  const base = spec.startsWith('@/')
    ? resolve(root, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(resolve(root, from)), spec)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`])
    if (existsSync(candidate) && !candidate.endsWith('/'))
      return candidate.slice(root.length + 1);
  throw new Error(`${from} imports ${spec}, which isn't a file`);
}

function walk(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (file.endsWith('.json')) continue;
    for (const spec of specifiers(read(file))) {
      const next = fileFor(spec, file);
      if (next) queue.push(next);
      else packages.add(spec);
    }
  }
  return { files, packages };
}

describe('the transfer page', () => {
  const entry = html.match(
    /<script type="module" src="\/(src\/transfer\/[^"]+)"><\/script>/,
  )?.[1];

  test('loads its own module', () => {
    expect(entry).toBe('src/transfer/main.ts');
  });

  test('reaches no analytics through anything it imports', () => {
    const { files, packages } = walk(entry!);
    // The walk reached the real modules, so an empty result means something.
    expect(files).toContain('src/transfer/page.ts');
    expect(files).toContain('src/persistence/storage.ts');
    expect([...packages].filter((p) => p.includes('analytics'))).toEqual([]);
    expect(files).not.toContain('src/App.tsx');
    expect(files).not.toContain('src/main.tsx');
  });

  test('names no analytics script of its own', () => {
    expect(html).not.toContain('_vercel/insights');
    expect(html).not.toContain('analytics');
  });
});
