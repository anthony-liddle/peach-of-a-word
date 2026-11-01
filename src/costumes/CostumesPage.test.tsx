import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CostumesPage } from './CostumesPage.tsx';
import { COSTUME_ORDER } from '@/ui/costumes.ts';

/** The ghost sheet's lilac edge, which no other part of any peach draws. */
const GHOST_EDGE = 'path[stroke="#D6C9EE"]';

describe('the costume page, on the two cards', () => {
  const rows = () => {
    const { container } = render(<CostumesPage />);
    return [...container.querySelectorAll('.costumes__row')];
  };
  const cell = (row: Element, label: RegExp) =>
    [...row.querySelectorAll('figure')].find((f) =>
      label.test(f.querySelector('figcaption')?.textContent ?? ''),
    );

  it("shows the reveal card's peach, beside today's card with none", () => {
    for (const row of rows()) {
      const today = cell(row, /^Reveal card today/);
      const now = cell(row, /^Reveal card, this pass/);
      expect(today?.querySelector('.reveal__kicker')).toBeTruthy();
      expect(today?.querySelector('svg')).toBeNull();
      expect(now?.querySelector('svg.reveal__peach')).toBeTruthy();
    }
  });

  it("shows the crowned completion peach, beside today's uncrowned one", () => {
    for (const row of rows()) {
      const today = cell(row, /^Completion card today/);
      const now = cell(row, /^Completion card, this pass/);
      expect(today?.querySelector('svg')).toBeTruthy();
      expect(today?.querySelector('.crowned__crown')).toBeNull();
      expect(now?.querySelector('svg.crowned__crown')).toBeTruthy();
    }
  });

  it('shows both plain and in each costume', () => {
    const all = rows();
    // The plain peach, then one row per costume.
    expect(all).toHaveLength(1 + COSTUME_ORDER.length);
    const ghost = all.find((r) => /ghost sheet/.test(r.textContent ?? ''))!;
    expect(
      cell(ghost, /^Reveal card, this pass/)?.querySelector(GHOST_EDGE),
    ).toBeTruthy();
    expect(
      cell(ghost, /^Completion card, this pass/)?.querySelector(GHOST_EDGE),
    ).toBeTruthy();
    const plain = all[0]!;
    expect(plain.querySelector(GHOST_EDGE)).toBeNull();
  });
});
