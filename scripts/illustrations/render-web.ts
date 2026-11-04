/**
 * The web app's own render of each illustration in a manifest: the app's
 * components, rendered to markup by React and drawn by Chromium, one PNG per
 * file on a transparent background.
 *
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/illustrations/render-web.ts \
 *     <manifest.json> <out dir> <px per unit> [--candidates <file>] [--probe <dir>]
 *
 * `--probe` is probe-marks.ts's output at the same scale: its shots of the
 * cute marks and the florette are the app's own, and are copied across.
 *
 * For a costume it draws three: the peach in the costume, and the peach the
 * costume is drawn over (with or without its face), so the costume can be
 * checked alone. Candidates that never shipped are added to the costume table
 * in memory only, so the app's own code draws them.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { Resvg } from '@resvg/resvg-js';
import { pwaIconSvg } from '../lib/icons.ts';
import { COSTUMES, type CostumeId } from '@/ui/costumes.ts';
import { crownBox } from '@/ui/crown.ts';
import {
  CompletionOrnament,
  PeachMark,
  SourcePeach,
} from '@/ui/components/PeachMark.tsx';
import { Decorations } from '@/ui/components/Decorations.tsx';

interface File {
  path: string;
  name: string;
  kind: string;
  width: number;
  height: number;
  source: Record<string, string | boolean>;
  block?: number;
  renderScale?: number;
  compareSize?: [number, number];
}

const [manifestPath, out, scaleArg, ...flags] = process.argv.slice(2);
if (!manifestPath || !out || !scaleArg)
  throw new Error(
    'usage: render-web.ts <manifest> <out> <scale> [--candidates f] [--probe d]',
  );
const flag = (name: string) => {
  const i = flags.indexOf(name);
  return i < 0 ? undefined : flags[i + 1];
};
const candidates = flag('--candidates');
const probe = flag('--probe');
const css = readFileSync('src/index.css', 'utf8');
const scale = Number(scaleArg);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  files: File[];
};

if (candidates) {
  for (const r of JSON.parse(readFileSync(candidates, 'utf8')) as {
    id: string;
    spoken: string;
    replacesFace: boolean;
    parts: unknown[];
  }[]) {
    if (r.id in COSTUMES) continue;
    (COSTUMES as Record<string, unknown>)[r.id] = {
      id: r.id,
      spoken: r.spoken,
      replacesFace: r.replacesFace,
      parts: r.parts,
    };
  }
}

const markup = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el);

/** The pieces to draw for one file: name suffix and SVG markup. */
function pieces(f: File): [string, string][] {
  const s = f.source;
  if (s.web === 'PeachMark') return [['', markup(createElement(PeachMark))]];
  if (s.web === 'SourcePeach')
    return [['', markup(createElement(SourcePeach))]];
  const id = (s.costume ?? s.alternate) as CostumeId | undefined;
  if (id) {
    const c = COSTUMES[id];
    return [
      ['', markup(createElement(PeachMark, { costume: id }))],
      ['.base', markup(createElement(PeachMark, { face: !c.replacesFace }))],
    ];
  }
  if (s.crown) {
    // The card's own crown, its viewport narrowed to the crown's box on the
    // peach, the area the check draws of the file, at the phone's 46 by 26.
    const card = markup(
      createElement(CompletionOrnament, { className: 'x', costume: null }),
    );
    const svg = card.match(/<svg class="crowned__crown"[\s\S]*?<\/svg>/)![0];
    const b = crownBox();
    return [
      [
        '',
        svg.replace(
          'viewBox="0 0 100 100"',
          `viewBox="${b.x} ${b.y} ${b.width} ${b.height}" preserveAspectRatio="none"`,
        ),
      ],
    ];
  }
  if (s.decoration) {
    const deco = markup(createElement(Decorations));
    const m = deco.match(
      new RegExp(
        `<svg class="deco ${s.decoration as string}[^"]*"[\\s\\S]*?</svg>`,
      ),
    );
    if (!m) throw new Error(`no ${s.decoration as string}`);
    return [['', m[0]]];
  }
  return [];
}

/**
 * A CSS-drawn element, at its real CSS size, captured from its layout box at
 * enough device pixels that each unit of the file is `scale` pixels.
 */
async function cssShot(
  browser: Browser,
  html: string,
  selector: string,
  unitPx: number,
  file: string,
  w: number,
  h: number,
  /** Units of page around the element's box, on every side. */
  pad = 0,
): Promise<void> {
  // Only as large as the drawing needs: at many device pixels to the CSS
  // pixel, a larger page passes what Chromium will draw.
  const ctx = await browser.newContext({
    // Room for the line the mark sits in, which is taller than the mark.
    viewport: {
      width: Math.ceil(w * unitPx + 160),
      height: Math.ceil(Math.max(w, h) * unitPx * 2.5 + 60),
    },
    deviceScaleFactor: scale / unitPx,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  // The layout box, to the fraction of a pixel: the centre of the drawn box
  // (a rotation keeps it) and the computed size. offsetLeft and its kin round
  // to whole pixels, which at these sizes is units.
  // A string, not a function: tsx would add helpers the page does not have.
  const measure = async () =>
    (await page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.width), h = parseFloat(cs.height);
      return { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - h / 2, w, h };
    })()`)) as { x: number; y: number; w: number; h: number };
  let r = await measure();
  // Playwright clips screenshots to whole CSS pixels, so the box's corner is
  // moved onto one: layout is in 64ths of a pixel, so the move is exact.
  const [dx, dy] = [Math.ceil(r.x) - r.x, Math.ceil(r.y) - r.y];
  await page.evaluate(`(() => {
    const c = document.body.firstElementChild;
    c.style.left = (parseFloat(c.style.left) + ${dx}) + 'px';
    c.style.top = (parseFloat(c.style.top) + ${dy}) + 'px';
  })()`);
  r = await measure();
  // A turned box's corner is found through its turned bounds, to within a
  // 64th of a pixel.
  if (
    Math.abs(r.x - Math.round(r.x)) > 1 / 64 ||
    Math.abs(r.y - Math.round(r.y)) > 1 / 64
  )
    throw new Error(`${file}: the box's corner is at ${r.x}, ${r.y}`);
  r = { ...r, x: Math.round(r.x), y: Math.round(r.y) };
  // Chromium lays lengths out in 64ths of a pixel, so 0.48em of 17.6px is
  // 8.4375, not 8.448: the app's own geometry, kept in the render.
  if (
    Math.abs(r.w - (w - 2 * pad) * unitPx) > 1 / 32 ||
    Math.abs(r.h - (h - 2 * pad) * unitPx) > 1 / 32
  )
    throw new Error(
      `${file}: the box is ${r.w} by ${r.h} px, not ${w * unitPx} by ${h * unitPx}`,
    );
  // A whole-pixel clip from the corner, a little over; the check crops it to
  // the file's own size from the top left.
  const png = await page.screenshot({
    omitBackground: true,
    clip: {
      x: r.x - pad * unitPx,
      y: r.y - pad * unitPx,
      width: Math.ceil(w * unitPx),
      height: Math.ceil(h * unitPx),
    },
  });
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, png);
  await ctx.close();
}

const page = (theme: string, body: string, extra = '') =>
  `<!doctype html><html${theme ? ` data-theme="${theme}"` : ''}><head><style>${css}</style>` +
  `<style>html,body{margin:0;background:transparent!important;background-image:none!important}${extra}</style>` +
  `</head><body>${body}</body></html>`;

/** Renders that are not an SVG of the app's: returns true if it drew one. */
async function special(browser: Browser, f: File): Promise<boolean> {
  const s = f.source;
  const file = join(out!, f.path.replace(/\.svg$/, '.png'));
  mkdirSync(join(file, '..'), { recursive: true });
  if (s.glyph) {
    const shot = join(probe ?? '', f.path.replace(/\.svg$/, '.png'));
    if (!probe || !existsSync(shot)) return false;
    copyFileSync(shot, file);
    return true;
  }
  if (s.icon) {
    // The web's own icon pipeline: pwaIconSvg drawn by resvg, as
    // scripts/build-icons.ts draws it, at the iOS icon's 1024.
    const background = readFileSync('scripts/build-icons.ts', 'utf8').match(
      /paperTop:\s*'(#[0-9A-Fa-f]{6})'/,
    )![1]!;
    const svg = pwaIconSvg({ maskable: false, background });
    writeFileSync(
      file,
      new Resvg(svg, {
        fitTo: { mode: 'width', value: f.width * (f.renderScale ?? scale) },
      })
        .render()
        .asPng(),
    );
    return true;
  }
  if (s.letterpress) {
    // Drawn large, 800px to the em at one device pixel to the CSS pixel, so
    // nothing is snapped to a pixel the app would not snap it to. The corner
    // radii, given in px, are scaled to keep the share of the mark they have
    // at the default text size, where the found word is 17.6px.
    const k = 800 / 17.6;
    await cssShot(
      browser,
      page(
        '',
        `<div style="position:absolute;left:100px;top:100px;font-size:800px;line-height:1"><span class="mark mark--${s.letterpress as string}"></span></div>`,
        `.mark--set,.mark--rare{border-radius:${k}px!important}` +
          `.mark--uncommon::before,.mark--uncommon::after{border-radius:${0.5 * k}px!important}`,
      ),
      '.mark',
      8,
      file,
      f.width,
      f.height,
      Number(s.pad ?? 0),
    );
    return true;
  }
  if (s.glint) {
    // Held still as the file draws it: full strength, the band across the
    // middle, the gem beneath hidden as the file's reference layer is.
    const unitPx = 1;
    const parent = 100 / 0.95;
    await cssShot(
      browser,
      page(
        'cute',
        `<div style="position:absolute;left:30px;top:30px;font-size:${parent}px;line-height:1"><span class="mark mark--mythic"><span class="mark__glint"></span></span></div>`,
        '.mark--mythic::before{visibility:hidden}' +
          '.mark__glint{animation:none!important;opacity:1!important;transform:none!important;background-position:50% 0,center!important}',
      ),
      '.mark__glint',
      unitPx,
      file,
      f.width,
      f.height,
    );
    return true;
  }
  if (s.flame) {
    // The flame's own path from TierMeter.tsx, in the colour it inherits in
    // the cute theme, drawn by Chromium.
    const src = readFileSync('src/ui/components/TierMeter.tsx', 'utf8');
    const fn = src.slice(src.indexOf('function Flame()'));
    const viewBox = fn.match(/viewBox="([^"]+)"/)![1]!;
    const d = fn.match(/\bd="([^"]+)"/)![1]!;
    const crown = css
      .slice(css.indexOf("[data-theme='cute'] {"))
      .match(/--crown:\s*(#[0-9a-f]{6})/i)![1]!;
    const k = f.renderScale ?? scale;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${f.width * k}" height="${f.height * k}"><path fill="${crown}" d="${d}"/></svg>`;
    writeFileSync(file.replace(/\.png$/, '.svg'), svg);
    const ctx = await browser.newContext({
      viewport: { width: f.width * k, height: f.height * k },
      deviceScaleFactor: 1,
    });
    const p = await ctx.newPage();
    await p.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`,
    );
    writeFileSync(
      file,
      await p.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: f.width * k, height: f.height * k },
      }),
    );
    await ctx.close();
    return true;
  }
  if (typeof s.file === 'string') {
    const svg = readFileSync(s.file, 'utf8').replace(
      '<svg ',
      `<svg width="${f.width * scale}" height="${f.height * scale}" `,
    );
    const ctx = await browser.newContext({
      viewport: { width: f.width * scale, height: f.height * scale },
      deviceScaleFactor: 1,
    });
    const p = await ctx.newPage();
    await p.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`,
    );
    writeFileSync(
      file,
      await p.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: f.width * scale, height: f.height * scale },
      }),
    );
    await ctx.close();
    return true;
  }
  return false;
}

const browser = await chromium.launch();
const done: string[] = [];
const skipped: string[] = [];
try {
  for (const f of manifest.files) {
    if (await special(browser, f)) {
      done.push(f.path);
      continue;
    }
    const list = pieces(f);
    if (!list.length) {
      skipped.push(f.path);
      continue;
    }
    const [w, h] = f.compareSize ?? [f.width * scale, f.height * scale];
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    for (const [suffix, svg] of list) {
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;background:transparent}` +
          `svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`,
      );
      const size = await page.evaluate(() => {
        const r = document.querySelector('svg')!.getBoundingClientRect();
        return [r.width, r.height, window.innerWidth, window.innerHeight];
      });
      if (size[0] !== w || size[1] !== h || size[2] !== w || size[3] !== h)
        throw new Error(
          `${f.path}: drew at ${size.join(' by ')}, not ${w} by ${h}`,
        );
      const file = join(out, `${f.path.replace(/\.svg$/, '')}${suffix}.png`);
      mkdirSync(join(file, '..'), { recursive: true });
      // The app's own markup too, so another renderer can draw the same thing.
      writeFileSync(
        file.replace(/\.png$/, '.svg'),
        svg.replace(
          '<svg ',
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `,
        ),
      );
      writeFileSync(
        file,
        await page.screenshot({
          omitBackground: true,
          clip: { x: 0, y: 0, width: w, height: h },
        }),
      );
      done.push(file);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(
  `${done.length} web renders; no web drawing for ${skipped.length}: ${skipped.join(', ')}`,
);
