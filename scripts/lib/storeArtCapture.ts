import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import type { Chrome } from './cdp.ts';

/**
 * What the store art's capture scripts share: storeart.html served by Vite in
 * dev, a page opened and painted in headless Chrome, the safe-area check, and
 * a screenshot saved and read back.
 */

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Serve the repo with Vite in dev, on `port` or the next one free. Without
 * hot reload, so an edit saved during a capture can't reload the page under
 * it.
 */
export async function serveStoreArt(port: number) {
  const server = await createServer({
    root: ROOT,
    configFile: resolve(ROOT, 'vite.config.ts'),
    server: { host: 'localhost', port, hmr: false },
    logLevel: 'error',
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite did not report a URL.');
  return { base, close: () => server.close() };
}

/** Load storeart.html with `query`, and wait until its faces have painted. */
export async function openStoreArt(
  chrome: Chrome,
  base: string,
  query: string,
): Promise<void> {
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
export async function strays(chrome: Chrome): Promise<string[]> {
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

/** Apple's size, 8-bit RGB, and nothing that could carry transparency. */
export function readBack(path: string, width: number, height: number): void {
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

/** The page's top-left `width` by `height`, at `scale`, as a PNG's bytes. */
export async function screenshot(
  chrome: Chrome,
  width: number,
  height: number,
  scale = 1,
): Promise<Buffer> {
  const { data } = await chrome.send<{ data: string }>(
    'Page.captureScreenshot',
    {
      format: 'png',
      clip: { x: 0, y: 0, width, height, scale },
      captureBeyondViewport: true,
    },
  );
  return Buffer.from(data, 'base64');
}

/** A screenshot saved to `path`, and read back. */
export async function shoot(
  chrome: Chrome,
  path: string,
  width: number,
  height: number,
  scale = 1,
): Promise<void> {
  writeFileSync(path, await screenshot(chrome, width, height, scale));
  readBack(path, Math.round(width * scale), Math.round(height * scale));
}

/** The size of the page's `main`, for a sheet sized to what it draws. */
export function mainBox(
  chrome: Chrome,
): Promise<{ width: number; height: number }> {
  return chrome.evaluate(
    `(() => { const r = document.querySelector('main').getBoundingClientRect();
      return { width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`,
  );
}
