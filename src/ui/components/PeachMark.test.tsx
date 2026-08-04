import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PeachMark } from './PeachMark.tsx';

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
