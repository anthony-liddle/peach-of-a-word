/**
 * The marks and details that are not path data in the apps: characters drawn
 * by a font, CSS shapes, a CSS glint, the calendar's cell, and the icon. Each
 * gets a file to look at and draw on; none of them comes back automatically,
 * and each file says why.
 */
import { readFileSync } from 'node:fs';
import { ICON_PEACH, ICON_SAFE_PADDING, ICON_SIZE } from '../lib/icons.ts';
import { PEACH_BODY, PEACH_FACE, type PeachPart } from '@/ui/peachArt.ts';
import {
  boxGuide,
  num,
  partStyle,
  slug,
  type Layer,
  type Obj,
} from './inkscape.ts';

export interface Glyph {
  name: string;
  glyph: string;
  codepoint: string;
  font: string;
  d: string;
  fill: string;
  baseline: number;
}

const PEACH_LABELS = [
  'leaf',
  'body',
  'highlight',
  'eye, left',
  'eye, right',
  'cheek, left',
  'cheek, right',
  'smile',
];

function peachObjs(
  prefix: string,
  parts: readonly PeachPart[] = [...PEACH_BODY, ...PEACH_FACE],
): Obj[] {
  return parts.map((p: PeachPart, i) => {
    const label = PEACH_LABELS[i]!;
    const id = `${prefix}-${slug(label)}`;
    if (p.circle)
      return {
        id,
        label,
        tag: 'circle',
        attrs: [
          ['cx', p.circle[0]],
          ['cy', p.circle[1]],
          ['r', p.circle[2]],
        ],
        style: partStyle(p),
      };
    return {
      id,
      label,
      tag: 'path',
      attrs: [['d', p.d!]],
      style: partStyle(p),
    };
  });
}

const guides = (objs: Obj[]): Layer => ({
  id: 'guides',
  label: 'Guides (locked, never come back)',
  locked: true,
  objs,
});

const line = (id: string, label: string, d: string, title: string): Obj => ({
  id,
  label,
  tag: 'path',
  attrs: [['d', d]],
  style: [
    ['fill', 'none'],
    ['stroke', '#00A0FF'],
    ['stroke-width', 0.25],
    ['stroke-dasharray', '1,1'],
  ],
  title,
});

const outline = (
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  colour = '#E5007A',
  width = 0.25,
): Obj => ({
  id,
  label,
  tag: 'rect',
  attrs: [
    ['x', num(x)],
    ['y', num(y)],
    ['width', num(w)],
    ['height', num(h)],
  ],
  style: [
    ['fill', 'none'],
    ['stroke', colour],
    ['stroke-width', width],
    ['stroke-dasharray', `${num(width * 4)},${num(width * 4)}`],
  ],
  title,
});

export interface MarkEntry {
  folder: string;
  name: string;
  kind: string;
  source: Record<string, unknown>;
  width: number;
  height: number;
  /** Averaging block for the render check, in px, when not the scale. */
  block?: number;
  /** Px per unit for the render check, when not the run's own. */
  renderScale?: number;
  title: string;
  description: string;
  layers: Layer[];
  /** Gradients and the like, inside <defs>. */
  defs?: string;
}

const MARKS = 'Marks And Details';

const GLYPH_TEXT: Record<
  string,
  { label: string; title: string; what: string }
> = {
  'mark-set-heart': {
    label: 'heart',
    title: 'The set mark, a heart',
    what: "a word in the set, on the cute theme's found list",
  },
  'mark-uncommon-star': {
    label: 'star',
    title: 'The Uncommon mark, a star',
    what: 'an Uncommon find',
  },
  'mark-rare-sparkle': {
    label: 'sparkle',
    title: 'The Rare mark, a sparkle',
    what: 'a Rare find',
  },
  'mark-mythic-gem': {
    label: 'gem',
    title: 'The Mythic mark, a gem',
    what: 'a Mythic find',
  },
  florette: {
    label: 'florette',
    title: 'The florette',
    what: "the decoration's flower, in the page margins on the web and around the empty basket and the colophon on iOS",
  },
};

/** The cute marks and the florette: a character, drawn as its font draws it. */
export function glyphEntries(glyphs: Glyph[]): MarkEntry[] {
  return glyphs.map((g) => {
    const t = GLYPH_TEXT[g.name];
    if (!t) throw new Error(`no words for the glyph ${g.name}`);
    return {
      folder: MARKS,
      name: g.name,
      kind: 'glyph',
      source: { glyph: g.name, character: g.glyph },
      width: 100,
      height: 100,
      title: t.title,
      description:
        `${t.title}, for ${t.what}. Both apps draw it as the character ` +
        `${g.glyph} (${g.codepoint}) in whatever font the device has, not as a ` +
        `drawing of their own. This is the outline Chrome on this Mac drew, ` +
        `from ${g.font}, in a box one em square. It cannot come back ` +
        'automatically: the apps would first have to draw the mark as a path.',
      layers: [
        {
          id: 'art',
          label: t.title,
          objs: [
            {
              id: slug(t.label),
              label: `${t.label} (the character ${g.codepoint}, from ${g.font})`,
              tag: 'path',
              attrs: [['d', g.d]],
              style: [['fill', g.fill]],
            },
          ],
        },
        guides([
          boxGuide(100, 100),
          line(
            'guide-baseline',
            `the baseline: y ${num(g.baseline)}`,
            `M 0 ${num(g.baseline)} L 100 ${num(g.baseline)}`,
            "Where the character sits on the line, in the web's mark.",
          ),
        ]),
      ],
    };
  });
}

/**
 * The web's letterpress marks: CSS boxes and clip-paths, in a box at 100 units
 * to the em of the found word's text, so 0.48em is 48 units. A corner radius
 * given in px is shown at the default text size.
 */
export function letterpressEntries(): MarkEntry[] {
  const css = readFileSync('src/index.css', 'utf8');
  // The rule for exactly this selector: not one where it ends a list.
  const rule = (sel: string) => {
    const re = new RegExp(
      `^${sel.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
      'gm',
    );
    const m = [...css.matchAll(re)].find(
      (x) => !/,\s*$/.test(css.slice(0, x.index)),
    );
    if (!m) throw new Error(`no rule ${sel}`);
    return m[1]!;
  };
  const em = (body: string, prop: string) =>
    Number(body.match(new RegExp(`(?:^|\\s)${prop}:\\s*([\\d.]+)em`))![1]) *
    100;
  const polygon = (body: string, w: number, h: number) =>
    body
      .match(/polygon\(([^)]*)\)/)![1]!
      .split(',')
      .map((pt) => {
        const [x, y] = pt
          .trim()
          .split(/\s+/)
          .map((v) => parseFloat(v));
        return `${num((x! / 100) * w)},${num((y! / 100) * h)}`;
      })
      .join(' ');
  // The found word is 1.1rem: 17.6px at the default text size.
  const px = 100 / 17.6;
  const colours: Record<string, string> = {
    good: css.match(/--good:\s*(#[0-9a-f]{6})/i)![1]!.toUpperCase(),
    discovery: css.match(/--discovery:\s*(#[0-9a-f]{6})/i)![1]!.toUpperCase(),
    crown: css.match(/--crown:\s*(#[0-9a-f]{6})/i)![1]!.toUpperCase(),
  };
  const base = rule('.mark');
  const size = em(base, 'width');
  const describe = (what: string) =>
    `The web's letterpress mark for ${what}, as index.css draws it: CSS, not ` +
    'path data, in a box at 100 units to the em of the found word, so 0.48em ' +
    'is 48. It cannot come back automatically: its form is CSS.';
  const out: MarkEntry[] = [];

  const set = rule('.mark--set');
  out.push({
    folder: MARKS,
    name: 'letterpress-set',
    kind: 'letterpress',
    source: { letterpress: 'set' },
    width: size,
    height: size,
    title: 'The letterpress set mark',
    description: describe('a word in the set: a green square'),
    layers: [
      {
        id: 'art',
        label: 'The letterpress set mark',
        objs: [
          {
            id: 'square',
            label: 'square',
            tag: 'rect',
            attrs: [
              ['x', 0],
              ['y', 0],
              ['width', size],
              ['height', size],
              [
                'rx',
                num(Number(set.match(/border-radius:\s*([\d.]+)px/)![1]) * px),
              ],
            ],
            style: [['fill', colours.good!]],
          },
        ],
      },
      guides([boxGuide(size, size)]),
    ],
  });

  const stem = rule('.mark--uncommon::before');
  const bar = rule('.mark--uncommon::after');
  const r =
    Number(
      rule('.mark--uncommon::before,\n.mark--uncommon::after').match(
        /border-radius:\s*([\d.]+)px/,
      )![1],
    ) * px;
  const sw = em(stem, 'width');
  const bw = em(bar, 'width');
  const bh = em(bar, 'height');
  const top = (Number(bar.match(/top:\s*([\d.]+)%/)![1]) / 100) * size;
  out.push({
    folder: MARKS,
    name: 'letterpress-uncommon',
    kind: 'letterpress',
    source: { letterpress: 'uncommon' },
    width: size,
    height: size,
    title: 'The letterpress Uncommon mark',
    description: describe('an Uncommon find: a dagger, a stem and a crossbar'),
    layers: [
      {
        id: 'art',
        label: 'The letterpress Uncommon mark',
        objs: [
          {
            id: 'stem',
            label: 'stem',
            tag: 'rect',
            attrs: [
              ['x', num((size - sw) / 2)],
              ['y', 0],
              ['width', num(sw)],
              ['height', size],
              ['rx', num(r)],
            ],
            style: [['fill', colours.discovery!]],
          },
          {
            id: 'crossbar',
            label: 'crossbar',
            tag: 'rect',
            attrs: [
              ['x', num((size - bw) / 2)],
              ['y', num(top)],
              ['width', num(bw)],
              ['height', num(bh)],
              ['rx', num(r)],
            ],
            style: [['fill', colours.discovery!]],
          },
        ],
      },
      guides([boxGuide(size, size)]),
    ],
  });

  // The turned square reaches past its own box, as it does on the page, so
  // the page is wider than the box by enough to show it whole.
  const rare = rule('.mark--rare');
  const rs = em(rare, 'width');
  const rp = Math.ceil((rs * (Math.SQRT2 - 1)) / 2);
  const rpage = rs + 2 * rp;
  out.push({
    folder: MARKS,
    name: 'letterpress-rare',
    kind: 'letterpress',
    source: { letterpress: 'rare', pad: rp },
    width: rpage,
    height: rpage,
    title: 'The letterpress Rare mark',
    description:
      describe('a Rare find: a diamond, a square turned 45 degrees') +
      ` The turned square reaches past its own ${num(rs)} box, as it does on ` +
      `the page, so the page here is ${num(rpage)} across and the box sits ` +
      `at ${num(rp)} to ${num(rp + rs)}.`,
    layers: [
      {
        id: 'art',
        label: 'The letterpress Rare mark',
        objs: [
          {
            id: 'diamond',
            label: 'diamond (a square turned 45 degrees)',
            tag: 'rect',
            attrs: [
              ['x', rp],
              ['y', rp],
              ['width', rs],
              ['height', rs],
              [
                'rx',
                num(Number(rare.match(/border-radius:\s*([\d.]+)px/)![1]) * px),
              ],
              [
                'transform',
                `rotate(45 ${num(rp + rs / 2)} ${num(rp + rs / 2)})`,
              ],
            ],
            style: [['fill', colours.discovery!]],
          },
        ],
      },
      guides([
        boxGuide(rpage, rpage),
        outline(
          'guide-css-box',
          "the mark's own box, before it is turned",
          rp,
          rp,
          rs,
          rs,
          `The CSS box, ${num(rs / 100)}em square, which the square is turned within.`,
          '#00A0FF',
        ),
      ]),
    ],
  });

  const mythic = rule('.mark--mythic');
  const ms = em(mythic, 'width');
  out.push({
    folder: MARKS,
    name: 'letterpress-mythic',
    kind: 'letterpress',
    source: { letterpress: 'mythic' },
    width: ms,
    height: ms,
    title: 'The letterpress Mythic mark',
    description: describe('a Mythic find: a five-point star, its clip-path'),
    layers: [
      {
        id: 'art',
        label: 'The letterpress Mythic mark',
        objs: [
          {
            id: 'star',
            label: 'star',
            tag: 'polygon',
            attrs: [['points', polygon(mythic, ms, ms)]],
            style: [['fill', colours.discovery!]],
          },
        ],
      },
      guides([boxGuide(ms, ms)]),
    ],
  });

  const source = rule('.mark--source');
  const srcW = em(source, 'width');
  const srcH = em(source, 'height');
  out.push({
    folder: MARKS,
    name: 'letterpress-source',
    kind: 'letterpress',
    source: { letterpress: 'source' },
    width: srcW,
    height: srcH,
    title: 'The letterpress source-word mark',
    description: describe(
      'the source word: an amber crown, three peaks on a base, its clip-path',
    ),
    layers: [
      {
        id: 'art',
        label: 'The letterpress source-word mark',
        objs: [
          {
            id: 'crown',
            label: 'crown',
            tag: 'polygon',
            attrs: [['points', polygon(source, srcW, srcH)]],
            style: [['fill', colours.crown!]],
          },
        ],
      },
      guides([boxGuide(srcW, srcH)]),
    ],
  });

  // The letterpress tab icon, as build-icons.ts writes public/favicon-classic.svg.
  const fav = readFileSync('public/favicon-classic.svg', 'utf8');
  const a = (k: string) => fav.match(new RegExp(`\\b${k}="([^"]+)"`))![1]!;
  out.push({
    folder: MARKS,
    name: 'letterpress-tab-icon',
    kind: 'letterpress',
    source: { file: 'public/favicon-classic.svg' },
    width: 100,
    height: 100,
    title: 'The letterpress tab icon',
    description:
      "The browser tab's icon in the letterpress theme, the source word's " +
      'crown, as scripts/build-icons.ts writes public/favicon-classic.svg. It ' +
      'cannot come back automatically: build-icons.ts writes it from its own ' +
      'numbers.',
    layers: [
      {
        id: 'art',
        label: 'The letterpress tab icon',
        objs: [
          {
            id: 'crown',
            label: 'crown',
            tag: 'polygon',
            attrs: [['points', a('points')]],
            style: [
              ['fill', a('fill')],
              ['stroke', a('stroke')],
              ['stroke-width', a('stroke-width')],
              ['stroke-linejoin', a('stroke-linejoin')],
            ],
          },
        ],
      },
      guides([boxGuide(100, 100)]),
    ],
  });
  return out;
}

/**
 * A new Mythic find's glint on the web, held still: the halo and the band of
 * light, both at full strength, the band across the middle. The page is the
 * glint's own box, which reaches 0.2em past the gem's on every side, so the
 * gem's box is 20 to 120.
 */
export function glintEntry(gem: Glyph | undefined): MarkEntry {
  const css = readFileSync('src/index.css', 'utf8');
  const discovery = css
    .slice(css.indexOf("[data-theme='cute'] {"))
    .match(/--discovery:\s*(#[0-9a-f]{6})/i)![1]!
    .toUpperCase();
  const glint = css.match(
    /\[data-theme='cute'\] \.mark__glint \{([\s\S]*?)\n\}/,
  )![1]!;
  const inset = -Number(glint.match(/inset:\s*(-?[\d.]+)em/)![1]) * 100;
  const mix = Number(glint.match(/var\(--discovery\) (\d+)%/)![1]) / 100;
  // The halo's own fade, inside radial-gradient(): the band has one too.
  const halo =
    Number(
      glint.match(/radial-gradient\([\s\S]*?transparent (\d+)%\s*\)/)![1],
    ) / 100;
  const [, angle, t0, peak, t1] = glint
    .match(
      /linear-gradient\(\s*(\d+)deg,\s*transparent (\d+)%,\s*rgb\(255 255 255 \/ ([\d.]+)\) \d+%,\s*transparent (\d+)%/,
    )!
    .map(Number) as number[];
  const mid = Number(glint.match(/rgb\(255 255 255 \/ [\d.]+\) (\d+)%/)![1]);
  const size = 100 + 2 * inset;
  const c = size / 2;
  // The band's gradient line, as CSS draws it for a tile three boxes wide,
  // set at 50%: through the middle, at `angle` from the vertical.
  const tileW = size * 3;
  const rad = (angle! * Math.PI) / 180;
  const len = Math.abs(tileW * Math.sin(rad)) + Math.abs(size * Math.cos(rad));
  const [dx, dy] = [Math.sin(rad) * (len / 2), -Math.cos(rad) * (len / 2)];
  const layers: Layer[] = [];
  if (gem)
    layers.push({
      id: 'reference',
      label:
        'Reference: the Mythic gem it plays over (locked, never comes back)',
      locked: true,
      objs: [
        {
          id: 'ref-gem',
          label: 'gem',
          tag: 'path',
          attrs: [
            ['d', gem.d],
            ['transform', `translate(${inset} ${inset})`],
          ],
          style: [['fill', gem.fill]],
        },
      ],
    });
  return {
    folder: MARKS,
    name: 'mythic-glint',
    kind: 'glint',
    source: { glint: true },
    width: size,
    height: size,
    title: 'The Mythic glint',
    description:
      "A new Mythic find's glint on the web, held still at full strength with " +
      'the band of light across the middle; on the page it opens, sweeps and ' +
      `fades in 900ms. Its box reaches ${num(inset / 100)}em past the gem's on ` +
      `every side, so the gem's box is ${num(inset)} to ${num(inset + 100)} here. ` +
      'iOS draws its own glint, a blurred ring and a band, in SwiftUI. ' +
      'Neither can come back automatically: both are animated code, not data.',
    layers: [
      ...layers,
      {
        id: 'art',
        label: 'The Mythic glint',
        objs: [
          {
            id: 'halo',
            label: `halo (the discovery purple at ${Math.round(mix * 100)}%, fading out by ${Math.round(halo * 100)}% of the way to the corner)`,
            tag: 'circle',
            attrs: [
              ['cx', num(c)],
              ['cy', num(c)],
              ['r', num(c)],
            ],
            style: [['fill', 'url(#glint-halo)']],
          },
          {
            id: 'band',
            label: 'band of light',
            tag: 'circle',
            attrs: [
              ['cx', num(c)],
              ['cy', num(c)],
              ['r', num(c)],
            ],
            style: [['fill', 'url(#glint-band)']],
          },
        ],
      },
      guides([
        boxGuide(size, size),
        outline(
          'guide-gem-box',
          "the gem's box",
          inset,
          inset,
          100,
          100,
          "The Mythic mark's own box.",
          '#00A0FF',
        ),
      ]),
    ],
    defs:
      `    <radialGradient id="glint-halo" cx="${num(c)}" cy="${num(c)}" r="${num(Math.hypot(c, c))}" gradientUnits="userSpaceOnUse">\n` +
      `      <stop offset="0" style="stop-color:${discovery};stop-opacity:${mix}" id="glint-halo-0" />\n` +
      `      <stop offset="${halo}" style="stop-color:${discovery};stop-opacity:0" id="glint-halo-1" />\n` +
      `    </radialGradient>\n` +
      `    <linearGradient id="glint-band" x1="${num(c - dx)}" y1="${num(c - dy)}" x2="${num(c + dx)}" y2="${num(c + dy)}" gradientUnits="userSpaceOnUse">\n` +
      `      <stop offset="${num(t0! / 100)}" style="stop-color:#FFFFFF;stop-opacity:0" id="glint-band-0" />\n` +
      `      <stop offset="${num(mid / 100)}" style="stop-color:#FFFFFF;stop-opacity:${peak}" id="glint-band-1" />\n` +
      `      <stop offset="${num(t1! / 100)}" style="stop-color:#FFFFFF;stop-opacity:0" id="glint-band-2" />\n` +
      `    </linearGradient>\n`,
  };
}

/**
 * The web's streak flame, beside the day count over the goal bar: its own
 * path in TierMeter.tsx, in the cute theme's colour. iOS shows an SF Symbol,
 * Apple's flame, in its place.
 */
export function flameEntry(): MarkEntry {
  const src = readFileSync('src/ui/components/TierMeter.tsx', 'utf8');
  const fn = src.slice(src.indexOf('function Flame()'));
  const [, , w, h] = fn
    .match(/viewBox="([^"]+)"/)![1]!
    .split(' ')
    .map(Number);
  const d = fn.match(/\bd="([^"]+)"/)![1]!;
  const css = readFileSync('src/index.css', 'utf8');
  const crown = css
    .slice(css.indexOf("[data-theme='cute'] {"))
    .match(/--crown:\s*(#[0-9a-f]{6})/i)![1]!
    .toUpperCase();
  return {
    folder: MARKS,
    name: 'streak-flame',
    kind: 'flame',
    source: { flame: true },
    width: w!,
    height: h!,
    renderScale: 50,
    block: 8,
    title: 'The streak flame',
    description:
      "The web's streak flame, beside the count of days cleared in a row, in " +
      `its own ${w} by ${h} box from TierMeter.tsx. It takes the text's colour: ` +
      "the cute theme's peach here, amber in letterpress. iOS shows Apple's " +
      'flame symbol instead.',
    layers: [
      {
        id: 'art',
        label: 'The streak flame',
        objs: [
          {
            id: 'flame',
            label: 'flame',
            tag: 'path',
            attrs: [['d', d]],
            style: [['fill', crown]],
          },
        ],
      },
      guides([boxGuide(w!, h!)]),
    ],
  };
}

/**
 * The calendar's found-day mark, on iOS: the peach itself, with its face, in
 * the cell's lower corner. The page is one cell, 100 units across, drawn as a
 * cleared day with its date left out. The peach is placed by the numbers in
 * `ArchiveCellFace`, and is edited in peach.svg.
 */
export function calendarEntry(cellPath?: string): MarkEntry {
  const cell = 100;
  const peach = cell * 0.44;
  const corner = cell * 0.3;
  const inset = Math.max(0, (1 - 1 / Math.SQRT2) * (corner - peach * 0.35));
  const x = cell - inset - peach + peach * 0.16;
  const y = cell - inset - peach + peach * 0.1;
  return {
    folder: MARKS,
    name: 'calendar-found-day',
    kind: 'calendar',
    source: { calendar: 'cleared' },
    width: cell,
    height: cell,
    title: "The calendar's found-day mark",
    description:
      'On iOS, a day in the calendar whose words include its own word shows ' +
      "the peach, with its face, in the cell's lower corner. It is the peach " +
      'itself, not a drawing of its own: edit it in peach.svg. This file shows ' +
      'where it sits, in a cell one hundred units across, on a cleared day ' +
      'with the date left out. The cell and the placement are SwiftUI layout ' +
      'in ArchiveSheet.swift and do not come back automatically.',
    layers: [
      {
        id: 'art-cell',
        label: 'The cell, on a cleared day (SwiftUI, does not come back)',
        locked: true,
        objs: [
          // SwiftUI's own outline when given, its corners continuous rather
          // than circular, from RoundedRectangle(cornerRadius:).path(in:).
          {
            id: 'cell',
            label: 'cell',
            ...(cellPath
              ? { tag: 'path', attrs: [['d', cellPath]] as [string, string][] }
              : {
                  tag: 'rect',
                  attrs: [
                    ['x', 0],
                    ['y', 0],
                    ['width', cell],
                    ['height', cell],
                    ['rx', num(corner)],
                  ] as [string, number | string][],
                }),
            style: [
              ['fill', '#C42E60'],
              ['fill-opacity', 0.32],
            ],
          },
        ],
      },
      {
        id: 'art-peach',
        label: 'The peach, placed as the cell places it (edit it in peach.svg)',
        locked: true,
        transform: `matrix(${num(peach / 100)} 0 0 ${num(peach / 100)} ${num(x)} ${num(y)})`,
        objs: peachObjs('placed'),
      },
      guides([boxGuide(cell, cell)]),
    ],
  };
}

/**
 * The app icon: the peach on the cream, as scripts/lib/icons.ts composes it.
 * The iOS icon is this at 1024, pixel for pixel; the web's home-screen icons
 * are it at 512, and a roomier one for Android's masks.
 */
export function iconEntry(): MarkEntry {
  const size = 1024;
  const k = size / ICON_SIZE;
  const pad = ICON_SAFE_PADDING.standard * size;
  const box = size - 2 * pad;
  const maskPad = ICON_SAFE_PADDING.maskable * size;
  const background = readFileSync('scripts/build-icons.ts', 'utf8').match(
    /paperTop:\s*'(#[0-9A-Fa-f]{6})'/,
  )![1]!;
  return {
    folder: 'Icon',
    name: 'app-icon',
    kind: 'icon',
    source: { icon: true },
    width: size,
    height: size,
    renderScale: 1,
    block: 8,
    title: 'The app icon',
    description:
      'The app icon, 1024 square: the peach on the cream, as ' +
      `scripts/lib/icons.ts composes it (here at ${k} times its 512). The iOS ` +
      "icon is exactly this, and the web's home-screen icons are it at 512 " +
      '(and with more room for Android). The peach is the one the icons were ' +
      'last drawn from, ICON_PEACH in icons.ts: an edit to peach.svg reaches ' +
      'the icons only when they are redrawn, on request. The background ' +
      'colour here is the one thing of its own.',
    layers: [
      {
        id: 'art',
        label: 'The app icon',
        objs: [
          {
            id: 'background',
            label: 'background',
            tag: 'rect',
            attrs: [
              ['x', 0],
              ['y', 0],
              ['width', size],
              ['height', size],
            ],
            style: [['fill', background]],
          },
        ],
      },
      {
        id: 'art-peach',
        label: 'The peach the icons show (edit it in peach.svg, then redraw)',
        locked: true,
        transform: `matrix(${num(box / 100)} 0 0 ${num(box / 100)} ${num(pad)} ${num(pad)})`,
        objs: peachObjs('icon', ICON_PEACH),
      },
      guides([
        outline(
          'guide-peach-box',
          "the peach's 100 by 100 box",
          pad,
          pad,
          box,
          box,
          `The peach's box: ${ICON_SAFE_PADDING.standard} of the icon in from each edge.`,
          '#00A0FF',
          2,
        ),
        outline(
          'guide-mask-safe',
          'safe from a circular mask: the middle 80%',
          size * 0.1,
          size * 0.1,
          size * 0.8,
          size * 0.8,
          "Android's launchers crop to a circle or squircle, about a tenth in from each side.",
          '#E5007A',
          2,
        ),
        outline(
          'guide-maskable-box',
          "the peach's box in the maskable icon",
          maskPad,
          maskPad,
          size - 2 * maskPad,
          size - 2 * maskPad,
          `The web's maskable icon draws the peach smaller, ${ICON_SAFE_PADDING.maskable} in from each edge.`,
          '#E5007A',
          2,
        ),
      ]),
    ],
  };
}
