// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Vercel compiles each file of the function from .ts to .js and leaves import
 * paths as written, so a runtime import ending in .ts names a file that isn't
 * there: the first preview of /api/flag answered 500 to everything with
 * ERR_MODULE_NOT_FOUND. Every file the function loads must import by .js,
 * which TypeScript and Vite both resolve to the .ts source. Type-only imports
 * are erased and don't count.
 */
const ROOT = resolve(__dirname, '../..');
const IMPORT =
  /^\s*(import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm;

function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT)].map((m) => m[2]!);
}

function walk(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const specs = runtimeImports(file);
    seen.set(file, specs);
    for (const spec of specs) {
      queue.push(resolve(dirname(file), spec.replace(/\.js$/, '.ts')));
    }
  }
  return seen;
}

describe("the function's own imports", () => {
  it('import every file it loads at run time by .js, never .ts', () => {
    const graph = walk(resolve(ROOT, 'api/flag.ts'));
    const byTs = [...graph].flatMap(([file, specs]) =>
      specs
        .filter((s) => s.endsWith('.ts'))
        .map((s) => `${file.slice(ROOT.length + 1)} imports ${s}`),
    );
    expect(byTs).toEqual([]);
    // The walk reached the engine's day logic, so it covers what it claims.
    expect(
      [...graph.keys()].some((f) => f.endsWith('src/engine/daily.ts')),
    ).toBe(true);
  });
});
