/**
 * Saves the App Store's header and search results art from storeart.html, at
 * Apple's pixel sizes, with what checks it.
 *
 *     pnpm exec tsx scripts/capture-store-art.ts --out <dir>
 *
 * Into `<dir>`, the files to upload and their `SHA256SUMS.txt`. Into
 * `<dir>/check`, never to upload: each placement with its safe area drawn
 * over it, the 16:9 universal asset kept for comparison, and the sheets that
 * show the art side by side and on a phone, light and dark.
 *
 * The page is served by Vite in dev and drawn by headless Chrome, so the art
 * is the page's own rendering. Before saving, every focal element is checked
 * against Apple's safe area, and every saved file's PNG header is read back:
 * Apple's size, 8-bit RGB, no alpha channel and no transparency chunk.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { launchChrome, type Chrome } from './lib/cdp.ts';
import {
  PLACEMENTS,
  SEARCH_POINTS_ON_A_PHONE,
  type PlacementId,
} from '../src/storeArt/storeArtSpec.ts';

const ROOT = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out <dir>.');
const OUT = resolve(values.out);
const CHECK = resolve(OUT, 'check');
mkdirSync(CHECK, { recursive: true });

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  server: { host: 'localhost', port: 5198 },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('Vite did not report a URL.');

/** Load `query`, and wait until the page's faces have arrived and painted. */
async function open(chrome: Chrome, query: string): Promise<void> {
  const loaded = new Promise<void>((done) => {
    const off = chrome.on((event) => {
      if (event.method === 'Page.loadEventFired') {
        off();
        done();
      }
    });
  });
  await chrome.send('Page.navigate', { url: `${base}storeart.html${query}` });
  await loaded;
  await chrome.evaluate(`(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`);
}

/**
 * Every focal element, with everything inside it, must sit in the safe area:
 * the part of the art Apple's template says every device keeps. Returns what
 * strays, so a layout that leaves it fails the capture rather than the store.
 */
async function strays(chrome: Chrome): Promise<string[]> {
  return chrome.evaluate<string[]>(`(() => {
    const art = document.querySelector('.store-art');
    const o = art.getBoundingClientRect();
    const safe = JSON.parse(art.dataset.safe);
    const out = [];
    const focal = [...art.querySelectorAll('[data-focal]')];
    if (!focal.length) return ['no focal elements'];
    focal.forEach((el, i) => {
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const e of [el, ...el.querySelectorAll('*')]) {
        const q = e.getBoundingClientRect();
        if (!q.width && !q.height) continue;
        l = Math.min(l, q.left - o.left); t = Math.min(t, q.top - o.top);
        r = Math.max(r, q.right - o.left); b = Math.max(b, q.bottom - o.top);
      }
      const slack = 1;
      if (l < safe.x - slack || t < safe.y - slack ||
          r > safe.x + safe.w + slack || b > safe.y + safe.h + slack)
        out.push('focal ' + i + ' spans x ' + Math.round(l) + '-' + Math.round(r) +
          ', y ' + Math.round(t) + '-' + Math.round(b) + '; safe x ' + safe.x + '-' +
          (safe.x + safe.w) + ', y ' + safe.y + '-' + (safe.y + safe.h));
    });
    return out;
  })()`);
}

/** Each stage's drawn width and height in the art's pixels. */
async function stages(
  chrome: Chrome,
): Promise<{ id: string; w: number; h: number }[]> {
  return chrome.evaluate(`[...document.querySelectorAll('[data-stage]')].map((e) => {
    const r = e.getBoundingClientRect();
    return { id: e.dataset.stage, w: r.width, h: r.height };
  })`);
}

/** Apple's size, 8-bit RGB, and nothing that could carry transparency. */
function readBack(path: string, width: number, height: number): void {
  const b = readFileSync(path);
  const at = (i: number) => b.readUInt32BE(i);
  if (b.toString('latin1', 1, 4) !== 'PNG')
    throw new Error(`${path}: not a PNG`);
  const [w, h, depth, colour] = [at(16), at(20), b[24], b[25]];
  const chunks: string[] = [];
  for (let i = 8; i < b.length; i += 12 + at(i))
    chunks.push(b.toString('latin1', i + 4, i + 8));
  const wrong = [
    w !== width || h !== height ? `${w}x${h}, not ${width}x${height}` : '',
    depth !== 8 ? `${depth}-bit` : '',
    colour !== 2 ? `colour type ${colour}, not RGB` : '',
    chunks.includes('tRNS') ? 'a tRNS chunk' : '',
  ].filter(Boolean);
  if (wrong.length) throw new Error(`${path}: ${wrong.join(', ')}`);
}

async function shoot(
  chrome: Chrome,
  path: string,
  width: number,
  height: number,
  scale = 1,
): Promise<void> {
  const { data } = await chrome.send<{ data: string }>(
    'Page.captureScreenshot',
    {
      format: 'png',
      clip: { x: 0, y: 0, width, height, scale },
      captureBeyondViewport: true,
    },
  );
  writeFileSync(path, Buffer.from(data, 'base64'));
  readBack(path, Math.round(width * scale), Math.round(height * scale));
  console.log(`wrote ${path.slice(OUT.length + 1)}`);
}

const failures: string[] = [];
const sums: string[] = [];
const chrome = await launchChrome();
try {
  await chrome.send('Page.enable');
  await chrome.send('Runtime.enable');
  for (const placement of Object.keys(PLACEMENTS) as PlacementId[]) {
    const { width, height, file, upload } = PLACEMENTS[placement];
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const name = `${file}-${width}x${height}`;
    await open(chrome, `?art=${placement}`);
    const out = await strays(chrome);
    if (out.length) {
      failures.push(...out.map((o) => `${name}: ${o}`));
      continue;
    }
    // In a phone's search results, the card is 3:2 and so many points wide,
    // so it shows a 3:2 slice of the art's full height.
    if (placement !== 'header') {
      const points = SEARCH_POINTS_ON_A_PHONE / (height * 1.5);
      const sizes = (await stages(chrome))
        .map(
          (s) =>
            `${s.id} ${(s.w * points).toFixed(0)} x ${(s.h * points).toFixed(0)} pt`,
        )
        .join(', ');
      console.log(`${name} in a phone's search results: ${sizes}`);
    }
    const path = resolve(upload ? OUT : CHECK, `${name}.png`);
    await shoot(chrome, path, width, height);
    if (upload)
      sums.push(
        `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${name}.png`,
      );
    await open(chrome, `?art=${placement}&guides=1`);
    await shoot(chrome, resolve(CHECK, `${name}-safe-area.png`), width, height);
  }
  if (failures.length)
    throw new Error(`Outside the safe area:\n${failures.join('\n')}`);
  writeFileSync(resolve(OUT, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
  // The sheets, sized to what they draw: side by side at 2x, phones at 3x.
  for (const [query, name, scale] of [
    ['side', 'sheet-side', 2],
    ['side&guides=1', 'sheet-side-safe-areas', 2],
    ['light', 'sheet-light', 3],
    ['dark', 'sheet-dark', 3],
  ] as const) {
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: 2400,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await open(chrome, `?sheet=${query}`);
    const box = await chrome.evaluate<{ width: number; height: number }>(
      `(() => { const r = document.querySelector('main').getBoundingClientRect();
        return { width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`,
    );
    await shoot(
      chrome,
      resolve(CHECK, `${name}.png`),
      box.width,
      box.height,
      scale,
    );
  }
} finally {
  chrome.close();
  await server.close();
}
