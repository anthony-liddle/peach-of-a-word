import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Decorations } from './Decorations.tsx';
import { PeachMark } from './PeachMark.tsx';

describe('Decorations', () => {
  it("floats the game's own peach, not a copy of it", () => {
    // It carried its own inline copy of the peach's paths, which an edit to
    // the peach would have left behind. Now it is PeachMark, part for part.
    const floating = render(<Decorations />).container.querySelector(
      'svg.deco--peach1',
    )!;
    const peach = render(<PeachMark />).container.querySelector('svg')!;
    expect(floating).not.toBeNull();
    expect(floating.innerHTML).toBe(peach.innerHTML);
    expect(floating.querySelectorAll('path, circle').length).toBe(8);
  });
});
