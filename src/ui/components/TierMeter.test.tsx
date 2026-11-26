import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import { TierMeter } from './TierMeter.tsx';
import type { TierStanding } from '@/engine/index.ts';

function standing(over: Partial<TierStanding> = {}): TierStanding {
  return {
    index: 2,
    id: 'tier-2',
    score: 30,
    reachable: 100,
    fraction: 0.3,
    setPoints: 18,
    offPagePoints: 12,
    setFound: 4,
    setTotal: 10,
    next: { index: 3, threshold: 0.4 },
    isTop: false,
    ...over,
  };
}

/** Whether a screen reader reaches this node: nothing above it hides it. */
function readable(node: Element | null, root: Element): boolean {
  for (let n = node; n && n !== root; n = n.parentElement)
    if (n.getAttribute('aria-hidden') === 'true') return false;
  return node !== null;
}

describe('TierMeter', () => {
  it('shows the themed rank name for the active theme', () => {
    const { rerender, container } = render(
      <TierMeter tier={standing()} theme="letterpress" />,
    );
    expect(container.querySelector('.tier__label')?.textContent).toBe(
      'Galley Proof',
    );
    rerender(<TierMeter tier={standing()} theme="cute" />);
    expect(container.querySelector('.tier__label')?.textContent).toBe(
      'Blossom',
    );
  });

  it('preserves the two-color set-versus-off-page composition', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="letterpress" />,
    );
    const set = container.querySelector<HTMLElement>('.tier__seg--set');
    const off = container.querySelector<HTMLElement>('.tier__seg--offpage');
    expect(set).not.toBeNull();
    expect(off).not.toBeNull();
    // Each segment grows by its own points, so the fill is two-color by source.
    expect(set!.style.flexGrow).toBe('18');
    expect(off!.style.flexGrow).toBe('12');
  });

  // TalkBack read the bar's new value, a bare "3", before each find's line
  // (Antoine, 26 November). The percentage beside it says the same, so the bar
  // is hidden from screen readers and the percentage and the next rank are
  // read instead, as the app does since its fix 4.
  it('hides the bar from screen readers, and reads the percentage and the next rank', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="letterpress" />,
    );
    expect(within(container).queryByRole('progressbar')).toBeNull();
    expect(readable(container.querySelector('.tier__track'), container)).toBe(
      false,
    );
    const caption = container.querySelector('.tier__ticks') as HTMLElement;
    expect(readable(within(caption).getByText('30%'), container)).toBe(true);
    const next = container.querySelector('.tier__next')!;
    expect(next.textContent).toMatch(/^Next: .+ at 40%$/);
    expect(readable(next, container)).toBe(true);
  });

  it('prints the explicit set and off-page point numbers beneath the bar', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="letterpress" />,
    );
    // The breakdown the glossary bar used to carry now lives on the one bar:
    // the bold total above, the named set-versus-off-page split below.
    const meter = container.querySelector('.tier') as HTMLElement;
    expect(within(meter).getByText(/set\s+18/i)).toBeInTheDocument();
    expect(within(meter).getByText(/off-page\s+12/i)).toBeInTheDocument();
  });

  it('holds the themed completion crown once every common word is found', () => {
    const done = standing({ setFound: 10, setTotal: 10, index: 5 });
    const { container, rerender } = render(
      <TierMeter tier={done} theme="letterpress" />,
    );
    // The label becomes the crown, not the top named rank.
    expect(container.querySelector('.tier__label')?.textContent).toBe(
      'The Complete Works',
    );
    rerender(<TierMeter tier={done} theme="cute" />);
    expect(container.querySelector('.tier__label')?.textContent).toBe(
      'Peachy Keen Supreme',
    );
  });
});

describe('TierMeter streak', () => {
  it('prints the flame and what it counts', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="cute" streak={6} />,
    );
    const streak = container.querySelector('.tier__streak') as HTMLElement;
    expect(streak.querySelector('.tier__flame')).not.toBeNull();
    // A flame and a number said nothing about what it counted, so the word is
    // printed, the way the app prints it.
    expect(streak.textContent).toMatch(/6 days/);
  });

  it('says one day, not one days', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="cute" streak={1} />,
    );
    expect(container.querySelector('.tier__streak')?.textContent).toMatch(
      /1 day\b/,
    );
  });

  it('renders nothing where there is no streak', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="cute" streak={0} />,
    );
    expect(container.querySelector('.tier__streak')).toBeNull();
  });

  it('omits the streak entirely when none is passed', () => {
    // The two-column placement passes none: the toolbar pill is the streak's
    // home at that width, and two homes at one width is the thing to avoid.
    const { container } = render(<TierMeter tier={standing()} theme="cute" />);
    expect(container.querySelector('.tier__streak')).toBeNull();
  });

  // The caption row hides the percent and the next-rank note per child rather
  // than hiding the row, so the streak inside it stays readable. Hiding the row
  // would take the streak down with it, and the pill it replaces is text.
  it('keeps the streak out of any aria-hidden subtree', () => {
    const { container } = render(
      <TierMeter tier={standing()} theme="cute" streak={6} />,
    );
    const streak = container.querySelector('.tier__streak') as HTMLElement;
    for (
      let node: HTMLElement | null = streak;
      node !== null && node !== container;
      node = node.parentElement
    ) {
      expect(node.getAttribute('aria-hidden')).not.toBe('true');
    }
    // And the percent and the next rank beside it are read, now that the bar
    // is hidden.
    expect(readable(container.querySelector('.tier__next'), container)).toBe(
      true,
    );
  });
});
