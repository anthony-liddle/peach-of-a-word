import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EditionCard } from './EditionCard.tsx';

describe('EditionCard', () => {
  it('shows the themed completion crown, re-skinning per theme', () => {
    const { container, rerender } = render(
      <EditionCard theme="letterpress" onClose={() => {}} />,
    );
    expect(container.querySelector('.edition__title')?.textContent).toBe(
      'The Complete Works',
    );
    rerender(<EditionCard theme="cute" onClose={() => {}} />);
    expect(container.querySelector('.edition__title')?.textContent).toBe(
      'Peachy Keen Supreme',
    );
  });
});

describe('the completion ornament', () => {
  const ornamentOf = (container: HTMLElement) =>
    container.querySelector('.edition__ornament');

  it('is the printer fleuron on letterpress', () => {
    const { container } = render(
      <EditionCard theme="letterpress" onClose={() => {}} />,
    );
    const mark = ornamentOf(container)!;
    expect(mark.textContent).toBe('❧');
    expect(container.querySelector('.edition__ornament--peach')).toBeNull();
  });

  it('is the peach mark on cute, drawn rather than typed', () => {
    const { container } = render(
      <EditionCard theme="cute" onClose={() => {}} />,
    );
    const mark = ornamentOf(container)!;
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark.classList.contains('edition__ornament--peach')).toBe(true);
    // No printer vocabulary anywhere in the cute card.
    expect(container.textContent).not.toContain('❧');
  });

  it('re-skins live on a theme switch, in both directions', () => {
    const { container, rerender } = render(
      <EditionCard theme="letterpress" onClose={() => {}} />,
    );
    expect(ornamentOf(container)?.textContent).toBe('❧');

    rerender(<EditionCard theme="cute" onClose={() => {}} />);
    expect(ornamentOf(container)?.tagName.toLowerCase()).toBe('svg');

    rerender(<EditionCard theme="letterpress" onClose={() => {}} />);
    expect(ornamentOf(container)?.textContent).toBe('❧');
  });

  it('stays decorative in both themes, and the card keeps its crown name', () => {
    for (const theme of ['letterpress', 'cute'] as const) {
      const { container } = render(
        <EditionCard theme={theme} onClose={() => {}} />,
      );
      expect(ornamentOf(container)?.getAttribute('aria-hidden')).toBe('true');
      // The accessible name comes from the crown, never from the ornament.
      // Scoped to this render: both cards share the document body.
      const region = container.querySelector('[role="region"]')!;
      expect(region.getAttribute('aria-label')).toBe(
        theme === 'cute' ? 'Peachy Keen Supreme' : 'The Complete Works',
      );
    }
  });

  it('renders the peach whatever the motion preference, so nothing hides it', () => {
    // The entrance is CSS only, and the peach is in the tree either way. The
    // stylesheet side of reduced motion is pinned in indexCss.test.ts.
    const { container } = render(
      <EditionCard theme="cute" onClose={() => {}} />,
    );
    const mark = ornamentOf(container)!;
    expect(mark.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
