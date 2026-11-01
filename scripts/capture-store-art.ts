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
import { launchChrome, type Chrome } from './lib/cdp.ts';
import {
  mainBox,
  openStoreArt,
  serveStoreArt,
  shoot as shootTo,
  strays,
} from './lib/storeArtCapture.ts';
import {
  PLACEMENTS,
  SEARCH_POINTS_ON_A_PHONE,
  type PlacementId,
} from '../src/storeArt/storeArtSpec.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out <dir>.');
const OUT = resolve(values.out);
const CHECK = resolve(OUT, 'check');
mkdirSync(CHECK, { recursive: true });

const server = await serveStoreArt(5198);
const open = (chrome: Chrome, query: string) =>
  openStoreArt(chrome, server.base, query);

/** Each stage's drawn width and height in the art's pixels. */
async function stages(
  chrome: Chrome,
): Promise<{ id: string; w: number; h: number }[]> {
  return chrome.evaluate(`[...document.querySelectorAll('[data-stage]')].map((e) => {
    const r = e.getBoundingClientRect();
    return { id: e.dataset.stage, w: r.width, h: r.height };
  })`);
}

async function shoot(
  chrome: Chrome,
  path: string,
  width: number,
  height: number,
  scale = 1,
): Promise<void> {
  await shootTo(chrome, path, width, height, scale);
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
    const box = await mainBox(chrome);
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
