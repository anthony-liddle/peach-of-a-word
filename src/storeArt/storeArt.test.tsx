import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Art } from './StoreArtPage.tsx';
import {
  DIRECTIONS,
  PLACEMENTS,
  type DirectionId,
  type PlacementId,
} from './storeArtSpec.ts';

describe('the store art page', () => {
  it('is a development page only, never a build entry', () => {
    const config = readFileSync(
      resolve(process.cwd(), 'vite.config.ts'),
      'utf8',
    );
    const inputs = config.slice(config.indexOf('input: {'));
    expect(inputs.slice(0, inputs.indexOf('}'))).not.toMatch(/store/i);
  });

  const every = (Object.keys(DIRECTIONS) as DirectionId[]).flatMap((d) =>
    (Object.keys(PLACEMENTS) as PlacementId[]).map((p) => [d, p] as const),
  );

  it.each(every)('draws %s at the %s size, without guides', (d, p) => {
    const { container } = render(<Art direction={d} placement={p} />);
    const art = container.querySelector<HTMLElement>('.store-art')!;
    expect(art.style.width).toBe(`${PLACEMENTS[p].width}px`);
    expect(art.style.height).toBe(`${PLACEMENTS[p].height}px`);
    expect(art.querySelector('.store-art__safe')).toBeNull();
  });

  it('draws the safe area only when asked', () => {
    const { container } = render(
      <Art direction="a" placement="header" guides />,
    );
    const safe = container.querySelectorAll<HTMLElement>('.store-art__safe');
    expect(safe.length).toBe(1);
    expect(safe[0]!.style.left).toBe(`${PLACEMENTS.header.safe.x}px`);
    expect(safe[0]!.style.width).toBe(`${PLACEMENTS.header.safe.w}px`);
  });

  it("shows no word but industry, the screenshots' word", () => {
    for (const [d, p] of every) {
      const { container, unmount } = render(
        <Art direction={d} placement={p} />,
      );
      const tiles = [...container.querySelectorAll('[data-tile]')];
      if (tiles.length)
        expect(tiles.map((t) => t.textContent).join('')).toBe('industry');
      unmount();
    }
  });
});
