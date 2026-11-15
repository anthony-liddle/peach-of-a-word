import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GROWTH_STAGES } from './growthStages.ts';
import { CONFETTI_AT, CONFETTI_PEACH, PIECE_COUNT } from './confetti.ts';
import { ARRIVALS, POSTERS, RETURN_AT, SETTLED_S } from './motion.ts';
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
      expect(shown).toEqual(['soil', 'soil-face']);
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
      expect(layers.map((l) => l.getAttribute('data-stage'))).toEqual(
        id === 'first-sprout' ? [id, 'soil', 'soil-face'] : [id],
      );
      for (const l of layers) expect(l.getAttribute('opacity')).toBe('1');
      const box = (c: HTMLElement) =>
        c.querySelector('[data-focal]')!.getAttribute('viewBox');
      expect(box(settled)).toBe(box(at(0)));
    },
  );

  it.each(['header', 'search'] as const)(
    'throws the confetti over the %s as the crown lands, outside the focal peach, and has it gone before the sink',
    (p) => {
      const at = (t: number) =>
        render(<MotionFrame placement={p} t={t} bare />).container;
      expect(at(CONFETTI_AT - 0.01).querySelector('[data-piece]')).toBeNull();
      const mid = at(CONFETTI_AT + 1.2);
      const pieces = [...mid.querySelectorAll<HTMLElement>('[data-piece]')];
      expect(pieces.length).toBeGreaterThan(PIECE_COUNT / 2);
      expect(new Set(pieces.map((e) => e.dataset.piece))).toEqual(
        new Set(['peach', 'heart', 'star', 'sparkle']),
      );
      expect(mid.querySelector('[data-focal] [data-piece]')).toBeNull();
      // The glyphs are the app's, and nothing else is text.
      expect(mid.textContent!.replace(/[✿♥★✦]/g, '')).toBe('');
      // The peach in the burst shows no face.
      const peach = mid.querySelector('[data-piece="peach"] svg')!;
      expect(peach.querySelectorAll('path')).toHaveLength(
        CONFETTI_PEACH.length,
      );
      expect(at(RETURN_AT).querySelector('[data-piece]')).toBeNull();
      expect(at(POSTERS.clear).querySelector('[data-piece]')).toBeNull();
    },
  );
});
