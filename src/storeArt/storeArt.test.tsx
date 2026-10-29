import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GROWTH_STAGES } from './growthStages.ts';
import { ARRIVALS, SETTLED_S } from './motion.ts';
import { Art, MotionFrame } from './StoreArtPage.tsx';
import { PLACEMENTS, type PlacementId } from './storeArtSpec.ts';

const PLACES = Object.keys(PLACEMENTS) as PlacementId[];

describe('the store art page', () => {
  it('is a development page only, never a build entry', () => {
    const config = readFileSync(
      resolve(process.cwd(), 'vite.config.ts'),
      'utf8',
    );
    const inputs = config.slice(config.indexOf('input: {'));
    expect(inputs.slice(0, inputs.indexOf('}'))).not.toMatch(/store/i);
  });

  it.each(PLACES)('draws the %s at its size, without guides', (p) => {
    const { container } = render(<Art placement={p} />);
    const art = container.querySelector<HTMLElement>('.store-art')!;
    expect(art.style.width).toBe(`${PLACEMENTS[p].width}px`);
    expect(art.style.height).toBe(`${PLACEMENTS[p].height}px`);
    expect(art.querySelector('.store-art__safe')).toBeNull();
  });

  it.each(PLACES)(
    'shows every stage in order, and no words, in the %s',
    (p) => {
      const { container } = render(<Art placement={p} />);
      const shown = [...container.querySelectorAll('[data-stage]')].map((e) =>
        e.getAttribute('data-stage'),
      );
      expect(shown).toEqual(GROWTH_STAGES.map((s) => s.id));
      // Only the florettes are text: the app's name sits beside the art.
      const text = container.textContent!.replace(/✿/g, '');
      expect(text).toBe('');
    },
  );

  it('draws the safe area only when asked', () => {
    const { container } = render(<Art placement="header" guides />);
    const safe = container.querySelectorAll<HTMLElement>('.store-art__safe');
    expect(safe.length).toBe(1);
    expect(safe[0]!.style.left).toBe(`${PLACEMENTS.header.safe.x}px`);
    expect(safe[0]!.style.width).toBe(`${PLACEMENTS.header.safe.w}px`);
  });

  it.each(PLACES)(
    'draws the %s in motion at its size, on the soil at the start',
    (p) => {
      const { container } = render(<MotionFrame placement={p} t={0} />);
      const art = container.querySelector<HTMLElement>('.store-art')!;
      expect(art.style.width).toBe(`${PLACEMENTS[p].width}px`);
      expect(art.querySelectorAll('[data-focal]').length).toBe(1);
      const shown = [...art.querySelectorAll('[data-stage]')].map((e) =>
        e.getAttribute('data-stage'),
      );
      expect(shown).toEqual(['soil']);
      expect(container.textContent!.replace(/✿/g, '')).toBe('');
    },
  );

  it.each(GROWTH_STAGES.map((s, i) => [s.id, i] as const))(
    'grows to %s, drawn whole, in one box that never moves',
    (id, i) => {
      const at = (t: number) =>
        render(<MotionFrame placement="search" t={t} />).container;
      const settled = at(ARRIVALS[i]! + SETTLED_S);
      const layers = [...settled.querySelectorAll<SVGGElement>('[data-stage]')];
      expect(layers.at(-1)!.getAttribute('data-stage')).toBe(id);
      expect(layers.at(-1)!.getAttribute('opacity')).toBe('1');
      const box = (c: HTMLElement) =>
        c.querySelector('[data-focal]')!.getAttribute('viewBox');
      expect(box(settled)).toBe(box(at(0)));
    },
  );
});
