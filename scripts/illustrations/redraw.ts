/**
 * Redraws what the peach is drawn into but the import leaves alone: only when
 * Antoine asks (4 November 2026).
 *
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/illustrations/redraw.ts \
 *     --out <dir> [--store-art]
 *
 * 1. Brings `ICON_PEACH` in `scripts/lib/icons.ts` up to the game's peach, the
 *    parts as `peachArt.ts` writes them, and runs `pnpm icons:build`: the
 *    home-screen icons and the link-preview card in `public/`, with the tab
 *    icons and the manifest.
 * 2. Draws the App Store icon into `<dir>/icon-1024.png`: the 512 icon at
 *    1024, 8-bit RGB with no alpha, as the App Store takes it. Never into the
 *    iOS app: putting it there is Antoine's call, and not before the
 *    Thanksgiving submission unless he says so.
 * 3. With `--store-art`, captures the store art, the stills and the videos,
 *    into `<dir>/store-art` and `<dir>/store-art-motion`, with the capture
 *    scripts' own checks.
 *
 * The App Store screenshots show the peach too. They are retaken by hand, as
 * the Submission Kit says, so this only names them.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';
import ts from 'typescript';
import { Resvg } from '@resvg/resvg-js';
import { pwaIconSvg } from '../lib/icons.ts';
import { encodeRgbPng } from '../lib/png.ts';

const WEB = resolve(import.meta.dirname, '../..');

/** The element texts of a `const NAME = [...]` in a file. */
function elements(
  sf: ts.SourceFile,
  name: string,
): ts.NodeArray<ts.Expression> {
  let found: ts.ArrayLiteralExpression | undefined;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      ts.isArrayLiteralExpression(n.initializer)
    )
      found = n.initializer;
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error(`no ${name} array in ${sf.fileName}`);
  return found.elements;
}

/** icons.ts with `ICON_PEACH` as the game's peach, part for part as written. */
export function iconPeachFromGame(icons: string, peachArt: string): string {
  const art = ts.createSourceFile(
    'peachArt.ts',
    peachArt,
    ts.ScriptTarget.Latest,
    true,
  );
  const parts = [
    ...elements(art, 'PEACH_BODY'),
    ...elements(art, 'PEACH_FACE'),
  ].map((e) => e.getText(art));
  const sf = ts.createSourceFile(
    'icons.ts',
    icons,
    ts.ScriptTarget.Latest,
    true,
  );
  const els = elements(sf, 'ICON_PEACH');
  const open = els.pos - 1;
  const close = els.end + (icons.slice(els.end).indexOf(']') + 1);
  return `${icons.slice(0, open)}[${parts.join(', ')}]${icons.slice(close)}`;
}

async function main(argv: string[]) {
  const outAt = argv.indexOf('--out');
  const out = outAt < 0 ? undefined : argv[outAt + 1];
  if (!out) throw new Error('usage: redraw.ts --out <dir> [--store-art]');
  mkdirSync(out, { recursive: true });

  // 1. The icons' peach, then the icons.
  const iconsAt = join(WEB, 'scripts/lib/icons.ts');
  const before = readFileSync(iconsAt, 'utf8');
  const raw = iconPeachFromGame(
    before,
    readFileSync(join(WEB, 'src/ui/peachArt.ts'), 'utf8'),
  );
  const after = await prettier.format(raw, {
    ...(await prettier.resolveConfig(iconsAt)),
    filepath: iconsAt,
  });
  if (after !== before) {
    writeFileSync(iconsAt, after);
    console.log("ICON_PEACH is now the game's peach: scripts/lib/icons.ts");
  } else console.log("ICON_PEACH was already the game's peach.");
  execFileSync('pnpm', ['icons:build'], { cwd: WEB, stdio: 'inherit' });

  // 2. The App Store icon, drawn here in a fresh process so it takes the new
  // ICON_PEACH, into the out dir only.
  const icon = join(out, 'icon-1024.png');
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      '--tsconfig',
      'tsconfig.app.json',
      'scripts/illustrations/redraw.ts',
      '--app-store-icon',
      icon,
    ],
    { cwd: WEB, stdio: 'inherit' },
  );

  // 3. The store art, when asked for.
  if (argv.includes('--store-art')) {
    for (const [script, dir] of [
      ['scripts/capture-store-art.ts', 'store-art'],
      ['scripts/capture-store-motion.ts', 'store-art-motion'],
    ] as const)
      execFileSync('pnpm', ['exec', 'tsx', script, '--out', join(out, dir)], {
        cwd: WEB,
        stdio: 'inherit',
      });
  }

  console.log(`
Redrawn:
  public/: the home-screen icons, og.png, the tab icons and the manifest
  ${icon}: the App Store icon, for the iOS app's
    App/Assets.xcassets/AppIcon.appiconset/icon-1024.png when Antoine says so${
      argv.includes('--store-art')
        ? `\n  ${join(out, 'store-art')} and ${join(out, 'store-art-motion')}: the store art`
        : ''
    }
Not redrawn here:
  the App Store screenshots, retaken by hand, as the Submission Kit says
  the vault's Icon/app-icon.svg, which the export draws again from ICON_PEACH`);
}

/** The App Store icon, from this process's ICON_PEACH. */
function appStoreIcon(path: string) {
  const build = readFileSync(join(WEB, 'scripts/build-icons.ts'), 'utf8');
  const background = /paperTop:\s*'(#[0-9A-Fa-f]{6})'/.exec(build)![1]!;
  const svg = pwaIconSvg({ maskable: false, background });
  const image = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1024 },
    font: { loadSystemFonts: false },
  }).render();
  writeFileSync(path, encodeRgbPng(image.width, image.height, image.pixels));
}

// Run as a script, not when its tests import it.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const iconAt = process.argv.indexOf('--app-store-icon');
  if (iconAt >= 0) appStoreIcon(process.argv[iconAt + 1]!);
  else await main(process.argv.slice(2));
}
