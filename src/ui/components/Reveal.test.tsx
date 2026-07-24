// src/ui/components/Reveal.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Reveal } from './Reveal.tsx';
import type { SourceEntry } from '@/data/types.ts';

const ENTRY: SourceEntry = {
  word: 'serenade',
  definition: 'noun. a love song.',
  etymology: 'From Italian serenata.',
};

afterEach(() => vi.restoreAllMocks());

describe('Reveal crown register', () => {
  it('shows the definition and etymology', () => {
    render(
      <Reveal
        register="crown"
        theme="letterpress"
        word="serenade"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('noun. a love song.')).toBeInTheDocument();
    expect(screen.getByText('From Italian serenata.')).toBeInTheDocument();
  });

  it('keeps the letterpress kicker exactly as it is', () => {
    render(
      <Reveal
        register="crown"
        theme="letterpress"
        word="serenade"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText('The word the type was cut for'),
    ).toBeInTheDocument();
  });

  it('grows the peach kicker in cute instead of borrowing the type metaphor', () => {
    render(
      <Reveal
        register="crown"
        theme="cute"
        word="serenade"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText('The peach every word grew from'),
    ).toBeInTheDocument();
    expect(screen.queryByText('The word the type was cut for')).toBeNull();
  });

  it('re-skins the kicker live on a theme switch, like the rank label', () => {
    // The kicker is a persistent label on the card, not an announcement, so it
    // describes the card under the theme showing now rather than the theme that
    // was up when the word landed.
    const { rerender } = render(
      <Reveal
        register="crown"
        theme="letterpress"
        word="serenade"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText('The word the type was cut for'),
    ).toBeInTheDocument();

    rerender(
      <Reveal
        register="crown"
        theme="cute"
        word="serenade"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText('The peach every word grew from'),
    ).toBeInTheDocument();
    expect(screen.queryByText('The word the type was cut for')).toBeNull();
  });
});

describe('Reveal quiet register', () => {
  it('shows the gloss with the category accent and not the crown amber', () => {
    const { container } = render(
      <Reveal
        register="quiet"
        word="sneer"
        category="rare"
        status="ready"
        definition="verb. to smile scornfully."
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('verb. to smile scornfully.')).toBeInTheDocument();
    expect(
      container.querySelector('.reveal--quiet.reveal--rare'),
    ).not.toBeNull();
    // The kicker is crown-only. Assert the element, not one theme's wording,
    // since the wording now depends on the theme and would go absent for free.
    expect(container.querySelector('.reveal__kicker')).toBeNull();
  });

  it('shows the exact no-definition copy when the gloss is null', () => {
    render(
      <Reveal
        register="quiet"
        word="udon"
        category="mythic"
        status="ready"
        definition={null}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText(
        'No definition on hand for this one. It is still a real word you found.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a loading state before the gloss resolves', () => {
    render(
      <Reveal
        register="quiet"
        word="sneer"
        category="rare"
        status="loading"
        definition={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Looking it up/i)).toBeInTheDocument();
  });

  it('is a dialog labelled by the word and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Reveal
        register="quiet"
        word="sneer"
        category="rare"
        status="ready"
        definition="x"
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('sneer');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it.each(['letterpress', 'cute'])(
    'renders the quiet register under the %s theme',
    (theme) => {
      document.documentElement.dataset.theme = theme;
      render(
        <Reveal
          register="quiet"
          word="sneer"
          category="rare"
          status="ready"
          definition="x"
          onClose={() => {}}
        />,
      );
      expect(screen.getByRole('dialog')).toHaveClass('reveal--quiet');
      delete document.documentElement.dataset.theme;
    },
  );

  it('returns focus to returnFocusTo on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const { unmount } = render(
      <Reveal
        register="quiet"
        word="sneer"
        category="rare"
        status="ready"
        definition="x"
        onClose={() => {}}
        returnFocusTo={trigger}
      />,
    );
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
