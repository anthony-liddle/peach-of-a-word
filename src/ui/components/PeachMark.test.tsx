import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { COSTUMES, COSTUME_ORDER } from '../costumes.ts';
import { PeachMark, SourcePeach } from './PeachMark.tsx';

/**
 * The peach is one drawing wearing several hats: the tab icon, the OG card, the
 * share signature, and now the completion ornament. The component and the
 * shipped favicon file are two copies of the same geometry (an SVG asset cannot
 * import a component), so this reads the file and pins them together. Path data
 * only: the file spells attributes kebab-case and JSX spells them camelCase, so
 * a whole-string compare would fail on formatting rather than on drift.
 */
const FAVICON = resolve(process.cwd(), 'public/favicon-cute.svg');

/** Every `d` value in document order. */
function pathData(svg: string): string[] {
  return [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]!);
}

describe('PeachMark', () => {
  it('draws the same peach as the shipped favicon mark', () => {
    const { container } = render(<PeachMark />);
    const rendered = container.querySelector('svg')!.outerHTML;
    const shipped = readFileSync(FAVICON, 'utf8');
    expect(pathData(rendered)).toEqual(pathData(shipped));
  });

  it('compared real paths, so an equal result means something', () => {
    // Guards the pin above against two empty arrays quietly matching.
    expect(pathData(readFileSync(FAVICON, 'utf8')).length).toBeGreaterThan(2);
  });

  it('keeps the mark decorative and takes the caller class', () => {
    const { container } = render(<PeachMark className="edition__ornament" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.classList.contains('edition__ornament')).toBe(true);
  });
});

describe('SourcePeach', () => {
  /**
   * The source-word mark is drawn by index.css as a data URI, a different peach
   * from PeachMark. SourcePeach draws it as a component so a costume can sit on
   * it, and this pins the two together the way the favicon is pinned above.
   */
  it("draws the stylesheet's source-word peach", () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const rule = css.slice(css.indexOf("[data-theme='cute'] .mark--source {"));
    const uri = decodeURIComponent(
      rule.slice(rule.indexOf('data:image/svg+xml,') + 19, rule.indexOf('")')),
    );
    const fromCss = [...uri.matchAll(/\bd='([^']+)'/g)].map((m) => m[1]!);
    const { container } = render(<SourcePeach />);
    expect(fromCss.length).toBe(3);
    expect(pathData(container.querySelector('svg')!.outerHTML)).toEqual(
      fromCss,
    );
  });
});

describe('a peach in costume', () => {
  const circles = (el: HTMLElement) => el.querySelectorAll('circle').length;

  it.each(COSTUME_ORDER)('%s draws its parts over the plain peach', (id) => {
    const plain = render(<PeachMark />).container;
    const worn = render(<PeachMark costume={id} />).container;
    const added = COSTUMES[id].parts.length;
    // The face's four circles go when the costume brings its own face.
    const face = COSTUMES[id].replacesFace ? 4 : 0;
    expect(worn.querySelectorAll('path, circle').length).toBe(
      plain.querySelectorAll('path, circle').length +
        added -
        face -
        (COSTUMES[id].replacesFace ? 1 : 0),
    );
    expect(circles(worn)).toBe(COSTUMES[id].replacesFace ? 0 : 4);
  });

  it.each(COSTUME_ORDER)(
    '%s keeps to the mark-size parts without a face',
    (id) => {
      const { container } = render(<PeachMark costume={id} face={false} />);
      const markSize = COSTUMES[id].parts.filter((p) => !p.faceOnly).length;
      // Leaf, body and highlight, then the costume's parts that show at mark size.
      expect(container.querySelectorAll('path, circle').length).toBe(
        3 + markSize,
      );
    },
  );

  it('stays in the same box as the plain peach', () => {
    for (const id of COSTUME_ORDER) {
      const svg = render(<PeachMark costume={id} />).container.querySelector(
        'svg',
      )!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    }
  });
});
