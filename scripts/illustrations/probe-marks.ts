/**
 * The web's cute marks and its florettes are characters, not drawings: this
 * asks Chromium which font draws each one, where its origin and baseline fall
 * in its box, and renders the app's own mark at `<px per unit>` times its
 * 100-unit box (one em).
 *
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/illustrations/probe-marks.ts \
 *     <out dir> <px per unit>
 *
 * The page is index.css and the Google Fonts link from index.html, so the
 * font stack is the app's. A twin of each, its character in a real span
 * rather than `::before`, gives the measurements; the probe reports how far
 * the twin's ink lies from the real one's.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [out, scaleArg] = process.argv.slice(2);
if (!out || !scaleArg) throw new Error('usage: probe-marks.ts <out> <scale>');
const scale = Number(scaleArg);
const box = 100 * scale;
const css = readFileSync('src/index.css', 'utf8');
const fonts = readFileSync('index.html', 'utf8').match(
  /href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/,
)![1]!;

interface Item {
  name: string;
  glyph: string;
  /** The app's own element, and its twin, inside a div sized in em. */
  real: string;
  twin: string;
  /** The real element's font-size is this times its container's. */
  emOfParent: number;
  colorVar: string;
}

const mark = (rung: string, glyph: string, colorVar: string): Item => ({
  name: '',
  glyph,
  real: `<span class="mark mark--${rung}" aria-hidden="true"></span>`,
  twin: `<span class="mark mark--${rung} probe"><span class="g">${glyph}<span class="base"></span></span></span>`,
  // The cute mark is 1em of its own font-size, which is 0.95em of its parent's.
  emOfParent: 0.95,
  colorVar,
});

const ITEMS: Item[] = [
  { ...mark('set', '♥', 'good'), name: 'mark-set-heart' },
  { ...mark('uncommon', '★', 'discovery'), name: 'mark-uncommon-star' },
  { ...mark('rare', '✦', 'discovery'), name: 'mark-rare-sparkle' },
  { ...mark('mythic', '❖', 'discovery'), name: 'mark-mythic-gem' },
  {
    // The decoration's florette, in a box one em square: its own
    // positioning and size are set aside, the glyph and colour are the app's.
    name: 'florette',
    glyph: '✿',
    real: '<span class="bloom flat">✿</span>',
    twin: '<span class="bloom flat probe"><span class="g">✿<span class="base"></span></span></span>',
    emOfParent: 1,
    colorVar: 'deco-bloom',
  },
];

const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: box * 3, height: box * 2 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  for (const it of ITEMS) {
    const parent = box / it.emOfParent;
    await page.setContent(
      `<!doctype html><html data-theme="cute"><head>` +
        `<link rel="stylesheet" href="${fonts}">` +
        `<style>${css}</style><style>` +
        `html,body{margin:0;background:transparent!important;background-image:none!important}` +
        `.row,.twin{position:absolute;top:0;font-size:${parent}px;line-height:1}` +
        `.row{left:0}.twin{left:${box * 1.5}px}` +
        `.bloom.flat{position:static;font-size:inherit;display:inline-block;width:1em;height:1em;animation:none}` +
        `.probe::before{content:none!important}` +
        `.probe .g{color:var(--${it.colorVar})}` +
        `.base{display:inline-block;width:0;height:0;vertical-align:baseline}` +
        `</style></head><body>` +
        `<div class="row">${it.real}</div><div class="twin">${it.twin}</div>` +
        `</body></html>`,
      { waitUntil: 'networkidle' },
    );
    await page.evaluate('document.fonts.ready');
    // A string, not a function: tsx would add helpers the page does not have.
    const geo = (await page.evaluate(`(() => {
      const r = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      const g = document.querySelector('.twin .g');
      const range = document.createRange();
      range.selectNodeContents(g.firstChild);
      return {
        real: r(document.querySelector('.row > *')),
        twin: r(document.querySelector('.twin > *')),
        text: r(range),
        baseline: document.querySelector('.base').getBoundingClientRect().top,
        fontSize: parseFloat(getComputedStyle(g).fontSize),
        fontWeight: getComputedStyle(g).fontWeight,
        color: getComputedStyle(g).color,
        opacity: getComputedStyle(document.querySelector('.row > *')).opacity,
      };
    })()`)) as {
      real: { x: number; y: number; w: number; h: number };
      twin: { x: number; y: number; w: number; h: number };
      text: { x: number; y: number; w: number; h: number };
      baseline: number;
      fontSize: number;
      fontWeight: string;
      color: string;
      opacity: string;
    };
    if (Math.abs(geo.real.w - box) > 0.01 || Math.abs(geo.real.h - box) > 0.01)
      throw new Error(
        `${it.name}: box ${geo.real.w} by ${geo.real.h}, not ${box}`,
      );
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '.twin .g',
    });
    const { fonts: used } = await cdp.send('CSS.getPlatformFontsForNode', {
      nodeId,
    });
    mkdirSync(join(out, 'Marks And Details'), { recursive: true });
    const file = join(out, 'Marks And Details', `${it.name}.png`);
    for (const [b, f] of [
      [geo.real, file],
      [geo.twin, file.replace('.png', '.twin.png')],
    ] as const)
      writeFileSync(
        f,
        await page.screenshot({
          omitBackground: true,
          clip: { x: b.x, y: b.y, width: box, height: box },
        }),
      );
    results.push({
      name: it.name,
      glyph: it.glyph,
      used,
      // In the box's own units, 100 to the em: the glyph's origin and baseline.
      origin: (geo.text.x - geo.twin.x) / scale,
      baseline: (geo.baseline - geo.twin.y) / scale,
      em: geo.fontSize / scale,
      fontWeight: geo.fontWeight,
      color: geo.color,
      opacity: geo.opacity,
    });
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'marks.json'), JSON.stringify(results, null, 1));
for (const r of results) console.log(JSON.stringify(r));
