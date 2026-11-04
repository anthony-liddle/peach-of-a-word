/**
 * Writes an Inkscape SVG: the page is the illustration's own box at 1:1, in
 * px, with no transform on any layer that comes back, so the numbers Inkscape
 * shows are the numbers in the code.
 *
 * Three kinds of layer, by id:
 * - `art`, and any other id starting `art`: the drawing, one named object per
 *   part, in the apps' draw order. This is what comes back.
 * - `reference`: locked, drawn beneath, never comes back.
 * - `guides`: locked, drawn on top, never comes back.
 */

export const INKSCAPE_VERSION = '1.4.4 (dcaf3e7, 2026-05-05)';

export interface Obj {
  id: string;
  label: string;
  /** The element: path, circle, rect, polygon, ellipse. */
  tag: string;
  /** Geometry attributes, written in this order. */
  attrs: [string, string | number][];
  /** Paint, written as one `style` attribute, as Inkscape writes it. */
  style: [string, string | number][];
  /** Shown in Inkscape's Object Properties, for guides that need words. */
  title?: string;
}

export interface Layer {
  id: string;
  label: string;
  locked?: boolean;
  /** Only for reference layers: never on a layer that comes back. */
  transform?: string;
  objs: Obj[];
}

export interface Doc {
  name: string;
  width: number;
  height: number;
  /** Defaults to `0 0 width height`. */
  viewBox?: string;
  /** Shown as the document's title in Inkscape's Document Properties. */
  title: string;
  description: string;
  layers: Layer[];
  /** Gradients and the like, written inside <defs>. */
  defs?: string;
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function obj(o: Obj, indent: string): string {
  const lines = [`${indent}<${o.tag}`];
  lines.push(`${indent}   id="${esc(o.id)}"`);
  lines.push(`${indent}   inkscape:label="${esc(o.label)}"`);
  for (const [k, v] of o.attrs)
    lines.push(`${indent}   ${k}="${esc(String(v))}"`);
  if (o.style.length)
    lines.push(
      `${indent}   style="${esc(o.style.map(([k, v]) => `${k}:${v}`).join(';'))}"`,
    );
  if (!o.title) return `${lines.join('\n')} />`;
  return `${lines.join('\n')}>\n${indent}  <title\n${indent}     id="${esc(o.id)}-title">${esc(o.title)}</title>\n${indent}</${o.tag}>`;
}

/** The document, as Inkscape 1.4 writes one. */
export function inkscapeSvg(doc: Doc): string {
  const viewBox = doc.viewBox ?? `0 0 ${doc.width} ${doc.height}`;
  const ids = new Set<string>();
  for (const l of doc.layers)
    for (const id of [l.id, ...l.objs.map((o) => o.id)]) {
      if (ids.has(id)) throw new Error(`${doc.name}: duplicate id ${id}`);
      ids.add(id);
    }
  const layers = doc.layers.map((l) => {
    const head = [
      '  <g',
      '     inkscape:groupmode="layer"',
      `     id="${esc(l.id)}"`,
      `     inkscape:label="${esc(l.label)}"`,
    ];
    if (l.locked) head.push('     sodipodi:insensitive="true"');
    if (l.transform) head.push(`     transform="${esc(l.transform)}"`);
    return `${head.join('\n')}>\n${l.objs.map((o) => obj(o, '    ')).join('\n')}\n  </g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="${doc.width}"
   height="${doc.height}"
   viewBox="${viewBox}"
   version="1.1"
   id="svg1"
   inkscape:version="${INKSCAPE_VERSION}"
   sodipodi:docname="${esc(doc.name)}.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <title
     id="title1">${esc(doc.title)}</title>
  <metadata
     id="metadata1">
    <rdf:RDF>
      <cc:Work
         rdf:about="">
        <dc:title>${esc(doc.title)}</dc:title>
        <dc:description>${esc(doc.description)}</dc:description>
      </cc:Work>
    </rdf:RDF>
  </metadata>
${doc.defs ? `  <defs\n     id="defs1">\n${doc.defs}  </defs>` : `  <defs\n     id="defs1" />`}
  <sodipodi:namedview
     id="namedview1"
     pagecolor="#ffffff"
     bordercolor="#000000"
     borderopacity="0.25"
     inkscape:showpageshadow="2"
     inkscape:pageopacity="0.0"
     inkscape:pagecheckerboard="0"
     inkscape:deskcolor="#d1d1d1"
     inkscape:document-units="px"
     showgrid="false">
    <inkscape:grid
       id="grid1"
       units="px"
       originx="0"
       originy="0"
       spacingx="1"
       spacingy="1"
       empcolor="#0099e5"
       empopacity="0.30196078"
       color="#0099e5"
       opacity="0.14901961"
       empspacing="10"
       enabled="true"
       visible="false" />
  </sodipodi:namedview>
${layers.join('\n')}
</svg>
`;
}

/** A number as the code writes it: no trailing zeros, at most 3 decimals. */
export function num(n: number): string {
  const s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** A path-data part's paint, as the apps draw it: round caps and joins. */
export function partStyle(p: {
  fill?: string | undefined;
  opacity?: number | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
}): [string, string | number][] {
  const s: [string, string | number][] = [];
  if (p.opacity !== undefined) s.push(['opacity', p.opacity]);
  s.push(['fill', p.fill ?? 'none']);
  if (p.stroke) {
    s.push(['stroke', p.stroke]);
    s.push(['stroke-width', p.strokeWidth ?? 1]);
    s.push(['stroke-linecap', 'round']);
    s.push(['stroke-linejoin', 'round']);
  }
  return s;
}

/** An id from a label: lowercase words joined by hyphens. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const GUIDE = '#00A0FF';
const LIMIT = '#E5007A';

/** The box, drawn as a dashed outline. */
export function boxGuide(w: number, h: number): Obj {
  return {
    id: 'guide-box',
    label: 'the box',
    tag: 'rect',
    attrs: [
      ['x', 0],
      ['y', 0],
      ['width', w],
      ['height', h],
    ],
    style: [
      ['fill', 'none'],
      ['stroke', GUIDE],
      ['stroke-width', num(w / 400)],
      ['stroke-dasharray', `${num(w / 100)},${num(w / 200)}`],
    ],
    title: `The illustration's own box, ${w} by ${h}.`,
  };
}

/**
 * The footprint guard's limit for a stroke of width `sw`: every point of the
 * path, curve handles included, at least half the stroke inside the box.
 */
export function limitGuide(sw: number, w = 100, h = 100): Obj {
  const pad = sw / 2;
  return {
    id: `guide-limit-${slug(num(sw))}`,
    label: `limit for a stroke of ${num(sw)}`,
    tag: 'rect',
    attrs: [
      ['x', num(pad)],
      ['y', num(pad)],
      ['width', num(w - sw)],
      ['height', num(h - sw)],
    ],
    style: [
      ['fill', 'none'],
      ['stroke', LIMIT],
      ['stroke-width', num(w / 500)],
      ['stroke-dasharray', `${num(w / 200)},${num(w / 200)}`],
      ['stroke-opacity', 0.8],
    ],
    title:
      `The footprint guard: a part with a stroke of ${num(sw)} keeps every ` +
      `point, its curve handles included, at least ${num(pad)} inside the box. ` +
      'Filled parts keep every point inside the box itself.',
  };
}

/**
 * The crown's band on the completion card, in the peach's box: the crown
 * stands in front of any costume there, so anything tall is hidden.
 */
export function crownBandGuide(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Obj {
  const bottom = box.y + box.height;
  return {
    id: 'guide-crown-band',
    label: `the crown's band: x ${num(box.x)} to ${num(box.x + box.width)}, above y ${num(bottom)}`,
    tag: 'rect',
    attrs: [
      ['x', num(box.x)],
      ['y', num(box.y)],
      ['width', num(box.width)],
      ['height', num(box.height)],
    ],
    style: [
      ['fill', '#FF9E58'],
      ['fill-opacity', 0.14],
      ['stroke', '#FF9E58'],
      ['stroke-width', 0.25],
      ['stroke-dasharray', '1,0.5'],
    ],
    title:
      "On the completion card the crown stands here, in front of the peach's " +
      `costume: anything drawn between x ${num(box.x)} and ` +
      `${num(box.x + box.width)}, above y ${num(bottom)}, is hidden behind it.`,
  };
}
