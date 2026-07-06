/**
 * Build-time image pipeline. Generates the Open Graph share image, the tab
 * favicons, and the home-screen icon set from source SVGs. Runs offline after
 * the first font fetch; every output is a byproduct, never a hand-exported
 * binary.
 *
 *   pnpm icons:build
 *
 * Outputs to public/:
 *   favicon-cute.svg, favicon-classic.svg (the theme-aware tab icons),
 *   apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png
 *   (the peach home-screen icons), og.png (1200x630), site.webmanifest
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { loadCuteFonts } from './lib/fonts.ts';
import { PEACH_MARK_PATHS, pwaIconSvg } from './lib/icons.ts';
import { REPO_ROOT, ensureDir } from './lib/util.ts';

const PUBLIC_DIR = join(REPO_ROOT, 'public');

/** The canonical letterpress palette. Mirrors the app's CSS tokens. */
const BRAND = {
  paper: '#F1EEE6',
  ink: '#211D17',
  inkSoft: '#5A5446',
  sage: '#4B6A52',
  crown: '#B5872F', // the source-word colour
  tileFace: '#F7F3E8',
  tileEdge: '#C9BD9C',
  foot: 'rgba(33, 29, 23, 0.15)',
};

/**
 * The cute palette, for the Open Graph card. Mirrors the app's [data-theme='cute']
 * CSS tokens, since cute is now the default theme a stranger meets first.
 */
const CUTE = {
  paperTop: '#FFF4EE', // page-bg gradient, top
  paperBottom: '#FFE6DC', // page-bg gradient, bottom
  ink: '#6B4636', // warm cocoa
  accent: '#C42E60', // candy pink: the wordmark's emphasis
  accentDeep: '#A8264F', // the kicker
  peach: '#FF9E58', // the mark and the accented tile
  tileFace: '#FFFFFF',
  tileEdge: '#FFD9C8',
  tileShadow: '#FFC9B4', // the chunky drop shadow under a tile
};

const SITE_NAME = 'Peach of a Word';
const SHORT_NAME = 'Peach';
const DESCRIPTION =
  'Make words from eight scrambled letters, then find the source word they all came from. A new puzzle daily.';
const OG_ALT =
  'The wordmark Peach of a Word in the cute theme: a smiling cartoon peach above the name in rounded type, over a row of soft letter tiles, one in peach.';

// --- Shared marks --------------------------------------------------------

/** The peach mark placed on the card, centered on cx at the given top y. */
function peachMark(cx: number, top: number, size: number): string {
  const s = size / 100;
  const x = cx - size / 2;
  return `<g transform="translate(${x} ${top}) scale(${s})">
    ${PEACH_MARK_PATHS}
  </g>`;
}

// --- Theme-aware favicons ------------------------------------------------

/** The cute tab icon: the peach mark on its own, on a transparent field. */
function faviconCuteSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${PEACH_MARK_PATHS}
</svg>`;
}

/**
 * The classic tab icon: the source-word crown, the same silhouette the app draws
 * for the source-word mark (.mark--source), in the letterpress amber with an ink
 * outline for the two-colour press feel and definition at small sizes. Centered
 * with padding so it reads down to 16px.
 */
function faviconClassicSvg(): string {
  // The .mark--source polygon (three peaks on a base), mapped from its percent
  // coordinates onto a centered box in the 0-100 canvas.
  const points = [
    [15, 78],
    [15, 42.2],
    [30.4, 55.6],
    [50, 32.1],
    [69.6, 55.6],
    [85, 42.2],
    [85, 78],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="${points}" fill="${BRAND.crown}" stroke="${BRAND.ink}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
}

function ogSvg(): string {
  const W = 1200;
  const H = 630;
  const cx = W / 2;

  // A row of soft rounded tiles spelling a fitting eight-letter word, one in
  // peach to echo the source-word moment. Evergreen and spoiler-free: never a
  // daily answer, just the game's rounded identity.
  const word = 'serenade';
  const accentIndex = 3;
  const tileW = 104;
  const tileH = 132;
  const gap = 16;
  const radius = 18;
  const rowW = word.length * tileW + (word.length - 1) * gap;
  const rowX = (W - rowW) / 2;
  const rowY = 430;

  const tiles = [...word]
    .map((ch, i) => {
      const x = rowX + i * (tileW + gap);
      const isAccent = i === accentIndex;
      const strokeC = isAccent ? CUTE.peach : CUTE.tileEdge;
      const letterC = isAccent ? CUTE.peach : CUTE.ink;
      const baseline = rowY + tileH * 0.68;
      // A solid, unblurred drop shadow gives the chunky cute-tile look.
      return `<rect x="${x}" y="${rowY + 6}" width="${tileW}" height="${tileH}" rx="${radius}" fill="${CUTE.tileShadow}"/>
    <rect x="${x}" y="${rowY}" width="${tileW}" height="${tileH}" rx="${radius}" fill="${CUTE.tileFace}" stroke="${strokeC}" stroke-width="3"/>
    <text x="${x + tileW / 2}" y="${baseline}" font-family="Fredoka" font-weight="600" font-size="66" fill="${letterC}" text-anchor="middle">${ch}</text>`;
    })
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${CUTE.paperTop}"/>
      <stop offset="1" stop-color="${CUTE.paperBottom}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#page)"/>
  ${peachMark(cx, 46, 150)}
  <!-- Kicker: keep in sync with the masthead kicker in src/ui/Game.tsx. -->
  <text x="${cx}" y="262" font-family="Nunito" font-weight="700" font-size="27" letter-spacing="7" fill="${CUTE.accentDeep}" text-anchor="middle">A GAME ABOUT FINDING WORDS IN WORDS</text>
  <text x="${cx}" y="366" font-family="Fredoka" font-weight="600" font-size="104" text-anchor="middle"><tspan fill="${CUTE.accent}">Peach</tspan><tspan fill="${CUTE.ink}"> of a Word</tspan></text>
  ${tiles}
</svg>`;
}

// --- Rasterizing ---------------------------------------------------------

interface RenderFonts {
  /** TTF paths for the rasterizer. Omit for glyph-path art that needs no font. */
  files: string[];
  /** The family resvg falls back to for text without an explicit match. */
  defaultFamily: string;
}

function renderPng(svg: string, width: number, fonts?: RenderFonts): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: fonts
      ? {
          fontFiles: fonts.files,
          loadSystemFonts: false,
          defaultFontFamily: fonts.defaultFamily,
        }
      : { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

async function write(name: string, contents: string | Buffer): Promise<void> {
  await writeFile(join(PUBLIC_DIR, name), contents);
  console.log(`  ${name}`);
}

async function main(): Promise<void> {
  console.log('Building icons and the OG image.\n');
  await ensureDir(PUBLIC_DIR);

  // The home-screen icons are the peach on the cute peach-cream, matching the
  // OG card, the share, and the default face. One install-time icon (no theme
  // swap): the standard composition for Apple and the "any" manifest icons, the
  // padded composition for the maskable icon so an Android crop cuts only
  // background.
  const filledSvg = pwaIconSvg({ maskable: false, background: CUTE.paperTop });
  const maskableSvg = pwaIconSvg({ maskable: true, background: CUTE.paperTop });

  // The tab icon follows the theme, so it is two SVGs the runtime swaps between,
  // not a single baked file. Served as-is (SVG favicons need no rasterizing).
  console.log('Favicons:');
  await write('favicon-cute.svg', faviconCuteSvg());
  await write('favicon-classic.svg', faviconClassicSvg());
  console.log('Home-screen icons:');
  await write('apple-touch-icon.png', renderPng(filledSvg, 180));
  await write('icon-192.png', renderPng(filledSvg, 192));
  await write('icon-512.png', renderPng(filledSvg, 512));
  await write('icon-maskable-512.png', renderPng(maskableSvg, 512));

  console.log('Open Graph:');
  const cute = await loadCuteFonts();
  await write(
    'og.png',
    renderPng(ogSvg(), 1200, { files: cute.files, defaultFamily: 'Fredoka' }),
  );

  console.log('Manifest:');
  const manifest = {
    name: SITE_NAME,
    short_name: SHORT_NAME,
    description: DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    // The splash and chrome tint follow the default theme, which is now cute.
    // Static values (read before any JS), so they show one theme regardless of
    // a runtime toggle; cute is the right default-facing choice.
    background_color: CUTE.paperTop,
    theme_color: CUTE.paperTop,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  await write('site.webmanifest', JSON.stringify(manifest, null, 2));

  // The OG alt text lives in index.html; surface it here for reference.
  console.log(`\nDone. og:image:alt is "${OG_ALT}"`);
}

main().catch((err) => {
  console.error('\nIcon build failed:', err);
  process.exitCode = 1;
});
