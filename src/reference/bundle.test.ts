import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { build, type Plugin, type PluginOption, type Rollup } from 'vite';
import viteConfig from '../../vite.config.ts';

/**
 * The reference engine is not in the game's bundle. It records how the game
 * sounded before Soundscape, for /sounds and the comparisons, and the game
 * itself has no use for it.
 *
 * The site is built in memory from vite.config.ts, as `pnpm build` builds it,
 * and every chunk the game's page can load is followed from the script its
 * index.html names, through static and dynamic imports. None of them may hold
 * the reference engine. The same walk from sounds.html must find it, and the
 * game's must find the Soundscape adapter, so the test cannot pass by looking
 * at the wrong thing.
 *
 * Left out of this build: the versioned-data plugin, whose closeBundle renames
 * dist/data on disk. Its only other part is __DATA_VERSION__, defined here.
 */
const ROOT = resolve(__dirname, '../..');
const REFERENCE = resolve(ROOT, 'src/reference/ReferenceAudioEngine.ts');
const SOUNDSCAPE = resolve(ROOT, 'src/audio/SoundscapeAudioEngine.ts');

type Output = Rollup.RollupOutput['output'];

async function buildInMemory(): Promise<Output> {
  const config = viteConfig({ command: 'build', mode: 'production' });
  const plugins = (config.plugins as PluginOption[])
    .flat()
    .filter((p): p is Plugin => !!p && (p as Plugin).name !== 'versioned-data');
  const result = await build({
    ...config,
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    plugins,
    define: { __DATA_VERSION__: '""' },
    build: { ...config.build, write: false },
  });
  return (result as Rollup.RollupOutput).output;
}

/** Every module in every chunk a page can load, from the script its HTML names. */
function modulesOf(output: Output, page: string): Set<string> {
  const html = output.find((o) => o.fileName === page);
  if (!html || html.type !== 'asset')
    throw new Error(`no ${page} in the build`);
  const entry = /<script type="module"[^>]*src="\/([^"]+)"/.exec(
    String(html.source),
  )?.[1];
  const chunks = new Map(
    output
      .filter((o): o is Rollup.OutputChunk => o.type === 'chunk')
      .map((c) => [c.fileName, c]),
  );
  if (!entry || !chunks.has(entry))
    throw new Error(`${page} names no script the build made`);
  const seen = new Set<string>();
  const modules = new Set<string>();
  const visit = (fileName: string) => {
    if (seen.has(fileName)) return;
    seen.add(fileName);
    const chunk = chunks.get(fileName)!;
    for (const id of chunk.moduleIds) modules.add(id);
    for (const next of [...chunk.imports, ...chunk.dynamicImports]) visit(next);
  };
  visit(entry);
  return modules;
}

describe("the game's bundle", () => {
  test('holds the Soundscape adapter and not the reference engine, which /sounds holds', async () => {
    const output = await buildInMemory();
    const game = modulesOf(output, 'index.html');
    const sounds = modulesOf(output, 'sounds.html');
    expect(game.has(SOUNDSCAPE)).toBe(true);
    expect(sounds.has(REFERENCE)).toBe(true);
    expect(game.has(REFERENCE)).toBe(false);
  }, 60_000);
});
