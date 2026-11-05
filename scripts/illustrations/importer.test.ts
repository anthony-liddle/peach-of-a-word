import { describe, expect, it } from 'vitest';
import {
  COSTUME_ORDER,
  COSTUMES,
  PEACH_OUTLINE,
  type CostumeId,
} from '@/ui/costumes.ts';
import { costumeFile } from './export.ts';
import { plan, readFile, type Flags } from './importer.ts';
import { formatPath, parsePath, transformPath } from './pathData.ts';
import { COSTUME_LABELS } from './labels.ts';

/**
 * Every file here is written in memory from the repo's own tables by the
 * export, then edited as Inkscape would edit it. No drawing is kept in the
 * repo.
 */
const file = (id: CostumeId) => costumeFile(id).svg;

const run = (id: CostumeId, svg: string, flags: Flags = {}) =>
  plan(
    id,
    readFile(svg),
    readFile(file(id)),
    COSTUMES[id].parts,
    COSTUME_LABELS[id],
    flags,
  );

/** One object's attribute, replaced, found by the object's id. */
function set(svg: string, id: string, attr: string, value: string): string {
  const re = new RegExp(`(<[a-z]+\\s+id="${id}"[^>]*?\\s${attr}=")[^"]*(")`);
  if (!re.test(svg)) throw new Error(`no ${attr} on ${id}`);
  return svg.replace(re, `$1${value}$2`);
}

/** One object, removed, found by its id. */
const remove = (svg: string, id: string) =>
  svg.replace(new RegExp(`\\s*<[a-z]+\\s+id="${id}"[^>]*/>`), '');

describe('the way back, for the costumes', () => {
  it.each(COSTUME_ORDER)('reads %s’s own file back unchanged', (id) => {
    const p = run(id, file(id));
    expect(p.problems).toEqual([]);
    expect(p.changes).toEqual([]);
    expect(p.parts).toEqual(COSTUMES[id].parts.map((part) => ({ ...part })));
  });

  it('reads a part moved as Inkscape saves one: relative, with commas, to six places', () => {
    const svg = set(
      file('witch-hat'),
      'witch-hat-star-face-only',
      'd',
      'm 53.000001,9 1.6,3.6 3.8,0.3 -2.9,2.5 0.9,3.7 -3.4,-2 -3.4,2 0.9,-3.7 -2.9,-2.5 3.8,-0.3 z',
    );
    const p = run('witch-hat', svg);
    expect(p.changes).toEqual(['"star"\'s outline changed']);
    expect(p.parts[5]!.d).toBe(
      'M53 9 L54.6 12.6 L58.4 12.9 L55.5 15.4 L56.4 19.1 L53 17.1 L49.6 19.1 L50.5 15.4 L47.6 12.9 L51.4 12.6 Z',
    );
    expect(p.parts[5]!.faceOnly).toBe(true);
  });

  it('keeps the table’s own text for an outline that reads the same', () => {
    // Inkscape rewrote it absolute with commas, but the points are the code's.
    const svg = set(
      file('witch-hat'),
      'witch-hat-fold',
      'd',
      'M 47,7 C 54,2 63,1 72,3 64,5 57,8 52,14 Z',
    );
    expect(run('witch-hat', svg).changes).toEqual([]);
  });

  // These take each part as the table has it now, so they hold whatever
  // colours and shapes the costumes are given later.
  const hat = COSTUMES['witch-hat'].parts;

  it('puts colours back in capitals, and ignores a width with no stroke', () => {
    // Inkscape lowercases, and its "Scale stroke width" writes a width onto a
    // filled part that has no stroke.
    const svg = set(
      file('witch-hat'),
      'witch-hat-cone',
      'style',
      'fill:#123abc;stroke-width:1.1',
    );
    const p = run('witch-hat', svg);
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0]).toMatch(
      /^"cone": fill #[0-9A-F]{6}.*, now fill #123ABC, no stroke$/,
    );
    expect(p.parts[0]).toEqual({ d: hat[0]!.d, fill: '#123ABC' });
  });

  it('applies a transform left on a part, and scales its stroke with it', () => {
    const edge = hat[4]!;
    const moved = file('witch-hat').replace(
      'id="witch-hat-brim-edge"',
      'id="witch-hat-brim-edge"\n       transform="translate(0,-1)"',
    );
    expect(run('witch-hat', moved).parts[4]!.d).toBe(
      formatPath(transformPath(parsePath(edge.d), [1, 0, 0, 1, 0, -1])),
    );
    const scaled = file('witch-hat').replace(
      'id="witch-hat-brim-edge"',
      'id="witch-hat-brim-edge"\n       transform="matrix(0.5,0,0,0.5,25,13.5)"',
    );
    expect(run('witch-hat', scaled).parts[4]!.strokeWidth).toBe(
      edge.strokeWidth! / 2,
    );
  });

  it('says when a part changes kind, a line gaining a fill', () => {
    // The first part anywhere that is a line, stroked and not filled.
    const [id, i] = COSTUME_ORDER.flatMap((c) =>
      COSTUMES[c].parts.map((q, k) => [c, k, q] as const),
    ).find(([, , q]) => q.stroke && !q.fill)!;
    const line = COSTUMES[id].parts[i]!;
    const label = COSTUME_LABELS[id][i]!;
    const svg = file(id).replace(
      new RegExp(
        `(inkscape:label="${label}${line.faceOnly ? ' \\(face only\\)' : ''}"[^>]*?\\sstyle=")[^"]*`,
      ),
      `$1fill:#484537;stroke:${line.stroke};stroke-width:${line.strokeWidth}` +
        (line.opacity ? `;opacity:${line.opacity}` : ''),
    );
    const p = run(id, svg);
    expect(p.problems).toEqual([]);
    expect(p.notes.join()).toContain(`"${label}" changed kind: it was a line`);
    expect(p.parts[i]!.fill).toBe('#484537');
  });

  it('folds a colour’s own alpha into the part’s opacity, where it is the only paint', () => {
    const svg = set(
      file('witch-hat'),
      'witch-hat-band',
      'style',
      'fill:#8FD3B6;fill-opacity:0.5',
    );
    expect(run('witch-hat', svg).parts[2]!.opacity).toBe(0.5);
  });

  it('refuses to reshape a part that follows the peach, but takes its paint', () => {
    // The ghost's leaf is drawn on the peach's own leaf.
    const leaf = COSTUME_LABELS.ghost.indexOf('leaf');
    expect(COSTUMES.ghost.parts[leaf]!.d).toBe(PEACH_OUTLINE.leaf);
    const moved = set(
      file('ghost'),
      'ghost-leaf',
      'd',
      'M51 12 C55 4 65 3 69 8 C67 14 60 17 55 16 Z',
    );
    expect(run('ghost', moved).problems.join()).toContain(
      '"leaf" is drawn on the peach\'s own leaf, so it follows the peach',
    );
    const recoloured = set(
      file('ghost'),
      'ghost-leaf',
      'style',
      'fill:#123456',
    );
    const p = run('ghost', recoloured);
    expect(p.problems).toEqual([]);
    expect(p.parts[leaf]).toEqual({ d: PEACH_OUTLINE.leaf, fill: '#123456' });
  });

  describe('stops, writing nothing, and says what to do', () => {
    const stops = (svg: string, flags: Flags = {}) =>
      run('witch-hat', svg, flags).problems.join('\n');

    it('on an object the costume doesn’t have', () => {
      const svg = file('witch-hat').replace(
        '\n  </g>\n  <g\n     inkscape:groupmode="layer"\n     id="reference-crown"',
        '\n    <path id="path1" d="M40 40 L45 45" style="fill:none;stroke:#000000" />' +
          '\n  </g>\n  <g\n     inkscape:groupmode="layer"\n     id="reference-crown"',
      );
      expect(stops(svg)).toContain(
        '"path1" (path1) is not a part of this drawing',
      );
      const added = run('witch-hat', svg, { allowNewParts: true });
      expect(added.problems).toEqual([]);
      expect(added.labels.at(-1)).toBe('path1');
      expect(added.parts.at(-1)).toEqual({
        d: 'M40 40 L45 45',
        stroke: '#000000',
        strokeWidth: 1,
      });
    });

    it('on a part with no object', () => {
      const svg = remove(file('witch-hat'), 'witch-hat-band');
      expect(stops(svg)).toContain('"band" has no object in the file');
      const p = run('witch-hat', svg, { allowDeletedParts: true });
      expect(p.problems).toEqual([]);
      expect(p.labels).not.toContain('band');
      expect(p.changes).toContain('"band" was deleted');
    });

    it('on an edit to a locked layer, which would otherwise vanish', () => {
      const svg = remove(file('witch-hat'), 'ref-leaf');
      expect(stops(svg)).toContain(
        'the locked layer "reference" was edited ("leaf" was deleted)',
      );
      expect(
        run('witch-hat', svg, { allowReferenceChanges: true }).problems,
      ).toEqual([]);
    });

    it('on two objects with one label, as a duplicate has', () => {
      const svg = set(
        file('witch-hat'),
        'witch-hat-band',
        'inkscape:label',
        'fold',
      );
      expect(stops(svg)).toContain('2 objects are labelled "fold"');
    });

    it('on a group, text, a gradient, a changed page, or two opacities in one part', () => {
      expect(
        stops(
          file('witch-hat').replace(
            /(<path\s+id="witch-hat-band"[^>]*\/>)/,
            '<g id="g1">$1</g>',
          ),
        ),
      ).toContain('a group');
      expect(
        stops(
          file('witch-hat').replace(
            /(<path\s+id="witch-hat-band"[^>]*\/>)/,
            '$1<text id="text1">Boo</text>',
          ),
        ),
      ).toContain('text: turn it into a path');
      expect(
        stops(
          set(
            file('witch-hat'),
            'witch-hat-band',
            'style',
            'fill:url(#linearGradient1)',
          ),
        ),
      ).toContain('flat colours');
      expect(
        stops(file('witch-hat').replace('width="100"', 'width="120"')),
      ).toContain('the page changed');
      expect(
        stops(file('witch-hat').replaceAll('inkscape:groupmode="layer"', '')),
      ).toContain('saved as Plain SVG');
      expect(
        stops(
          set(
            file('witch-hat'),
            'witch-hat-band',
            'style',
            'fill:#8FD3B6;stroke:#000000;fill-opacity:0.5',
          ),
        ),
      ).toContain('different opacities');
    });
  });

  it('takes the file’s draw order, and says which parts moved (answer 2)', () => {
    const svg = file('witch-hat');
    const band = /\s*<path\s+id="witch-hat-band"[^>]*\/>/.exec(svg)![0];
    const moved = svg
      .replace(band, '')
      .replace(/(\s*<path\s+id="witch-hat-cone")/, `${band}$1`);
    const p = run('witch-hat', moved);
    expect(p.labels.slice(0, 3)).toEqual(['band', 'cone', 'fold']);
    expect(p.from.slice(0, 3)).toEqual([2, 0, 1]);
    expect(p.changes).toContain('"band" moved in the draw order: 3rd to 1st');
  });
});
