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

  it('opens at the top of a long entry rather than scrolled to the close button', () => {
    // `.reveal` is both the dialog and the scroll container, and the close
    // button sits near its bottom. Focusing it on open let the browser scroll
    // it into view, so long entries opened at the bottom. jsdom has no layout,
    // so assert the mechanism: the open focus must decline to scroll.
    const focus = vi.spyOn(HTMLButtonElement.prototype, 'focus');
    render(
      <Reveal
        register="crown"
        theme="letterpress"
        word="withdraw"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('still gives the close button the focus on open', () => {
    // The other half of the contract: declining to scroll must not turn into
    // declining to focus, or the modal opens with focus left outside it.
    render(
      <Reveal
        register="crown"
        theme="letterpress"
        word="withdraw"
        entry={ENTRY}
        onClose={() => {}}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
});

describe('Reveal quiet register', () => {
  it('shows the gloss with the category accent and not the crown amber', () => {
    const { container } = render(
      <Reveal
        theme="letterpress"
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
        theme="letterpress"
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
        theme="letterpress"
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
        theme="letterpress"
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
          theme="letterpress"
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

  it('returns to the top when reopened on a different word without a remount', () => {
    // Both branches of the caller's ternary render <Reveal> at the same slot
    // with no key, so React reuses the instance and the DOM node. A scroll
    // position left over from the previous word survives into the next one.
    const { rerender, container } = render(
      <Reveal
        theme="letterpress"
        register="quiet"
        word="withdraw"
        category="rare"
        status="ready"
        definition="a long gloss"
        onClose={() => {}}
      />,
    );
    const dialog = container.querySelector('.reveal') as HTMLElement;
    dialog.scrollTop = 500;

    rerender(
      <Reveal
        theme="letterpress"
        register="quiet"
        word="remember"
        category="rare"
        status="ready"
        definition="another long gloss"
        onClose={() => {}}
      />,
    );

    // Same node, so this really is the no-remount path.
    expect(container.querySelector('.reveal')).toBe(dialog);
    expect(dialog.scrollTop).toBe(0);
  });

  it('returns focus to returnFocusTo on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const { unmount } = render(
      <Reveal
        theme="letterpress"
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
