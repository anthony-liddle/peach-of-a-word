/**
 * Saves the App Store's header and search results art from storeart.html, at
 * Apple's pixel sizes, with a safe-area copy of each for checking, and the
 * sheets that show each search asset on a phone and on a dark page.
 *
 *     pnpm exec tsx scripts/capture-store-art.ts --out <dir>
 *
 * The page is served by Vite in dev and drawn by headless Chrome, so the art
 * is the page's own rendering, fonts and all. A safe-area copy is named
 * `…-safe-area.png` and is never the file to upload.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { launchChrome, type Chrome } from './lib/cdp.ts';
import {
  DIRECTIONS,
  PLACEMENTS,
  type DirectionId,
  type PlacementId,
} from '../src/storeArt/storeArtSpec.ts';

const ROOT = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out <dir>.');
const OUT = resolve(values.out);
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  server: { host: 'localhost', port: 5198 },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('Vite did not report a URL.');

/** Load `query`, and wait until both faces have arrived and painted. */
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
  const ready = await chrome.evaluate<boolean>(`(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('600 100px Fredoka'),
      document.fonts.load('600 100px Nunito'),
      document.fonts.load('italic 600 100px Nunito'),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.fonts.check('600 100px Fredoka') && document.fonts.check('600 100px Nunito');
  })()`);
  if (!ready) throw new Error(`Fonts did not load for ${query}.`);
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

async function shoot(
  chrome: Chrome,
  name: string,
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
  writeFileSync(resolve(OUT, name), Buffer.from(data, 'base64'));
  console.log(`wrote ${name} ${width * scale}x${height * scale}`);
}

const failures: string[] = [];
const chrome = await launchChrome();
try {
  await chrome.send('Page.enable');
  await chrome.send('Runtime.enable');
  for (const direction of Object.keys(DIRECTIONS) as DirectionId[]) {
    for (const placement of Object.keys(PLACEMENTS) as PlacementId[]) {
      const { width, height } = PLACEMENTS[placement];
      await chrome.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const stem = `${direction}-${placement}-${width}x${height}`;
      await open(chrome, `?art=${direction}-${placement}`);
      const out = await strays(chrome);
      if (out.length) {
        failures.push(...out.map((o) => `${stem}: ${o}`));
        continue;
      }
      await shoot(chrome, `${stem}.png`, width, height);
      await open(chrome, `?art=${direction}-${placement}&guides=1`);
      await shoot(chrome, `${stem}-safe-area.png`, width, height);
    }
  }
  if (failures.length)
    throw new Error(`Outside the safe area:\n${failures.join('\n')}`);
  // The sheets, at a phone's 3x, sized to what they draw.
  for (const sheet of ['side', 'side&guides=1', 'light', 'dark']) {
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: 2400,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await open(chrome, `?sheet=${sheet}`);
    const box = await chrome.evaluate<{ width: number; height: number }>(
      `(() => { const r = document.querySelector('main').getBoundingClientRect();
        return { width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`,
    );
    await shoot(
      chrome,
      `sheet-${sheet.replace('&guides=1', '-safe-areas')}.png`,
      box.width,
      box.height,
      sheet.startsWith('side') ? 2 : 3,
    );
  }
} finally {
  chrome.close();
  await server.close();
}
