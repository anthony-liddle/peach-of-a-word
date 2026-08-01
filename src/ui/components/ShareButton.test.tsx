import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Puzzle } from '@/engine/index.ts';
import { APP_DISPLAY_NAME } from '@/displayName.ts';
import { ShareButton } from './ShareButton.tsx';

function testPuzzle(): Puzzle {
  const commonWords = new Set(['NOTECASE', 'NOTE', 'TONE', 'CAT']);
  const uncommonWords = new Set(['OCAS']);
  const rareWords = new Set(['NAE']);
  const mythicWords = new Set(['ETA']);
  return {
    sourceWord: 'NOTECASE',
    letters: 'ACENOST',
    validationWords: new Set([
      ...commonWords,
      ...uncommonWords,
      ...rareWords,
      ...mythicWords,
    ]),
    commonWords,
    uncommonWords,
    rareWords,
    mythicWords,
    reachableScore: 0,
  };
}

describe('ShareButton', () => {
  let originalShare: unknown;
  let originalClipboard: unknown;

  beforeEach(() => {
    originalShare = (navigator as { share?: unknown }).share;
    originalClipboard = (navigator as { clipboard?: unknown }).clipboard;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: originalShare,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    // The share reads the active theme from the document root; reset it so a
    // theme set by one test never leaks into the next.
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  function setShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
    Object.defineProperty(navigator, 'share', {
      value: fn,
      configurable: true,
    });
  }

  test('shares the built block via the Web Share API when present', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    render(
      <ShareButton
        puzzle={testPuzzle()}
        found={['NOTECASE', 'OCAS']}
        mode="daily"
        date={new Date(2026, 5, 18)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]![0] as ShareData;
    // The title is read from the display-name constant, not hardcoded here, and
    // the copied text carries the peach mark that leads the share.
    expect(payload.text?.startsWith(`🍑 ${APP_DISPLAY_NAME}`)).toBe(true);
    expect(payload.text).toContain('🟥');
  });

  test('headlines the theme-skinned tier the player earned', async () => {
    // The share must match the theme the player saw. With one common word found
    // (not the full set), the headline is the current rank, letterpress-skinned.
    document.documentElement.dataset.theme = 'letterpress';
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    render(
      <ShareButton
        puzzle={testPuzzle()}
        found={['NOTECASE', 'OCAS']}
        mode="daily"
        date={new Date(2026, 5, 18)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const payload = share.mock.calls[0]![0] as ShareData;
    // The rank is letterpress-skinned, and the tier line carries the completion
    // count beside it: one of the four common words found.
    expect(payload.text?.split('\n')[1]).toBe('Blank Page · 1 of 4 words');
  });

  test('shares an endless block labeled Endless, with the found source word', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    render(
      <ShareButton
        puzzle={testPuzzle()}
        found={['NOTECASE', 'OCAS']}
        mode="endless"
        date={new Date(2026, 5, 18)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const payload = share.mock.calls[0]![0] as ShareData;
    const first = payload.text?.split('\n')[0] ?? '';
    // Endless, never a date; and the found source word rides the identifier.
    expect(first).toContain('Endless');
    expect(first).toContain('NOTECASE');
    expect(first).not.toMatch(/Jun|Jul/);
  });

  test('endless withholds the source word until it is found', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    render(
      <ShareButton
        puzzle={testPuzzle()}
        found={['NOTE', 'OCAS']}
        mode="endless"
        date={new Date(2026, 5, 18)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const payload = share.mock.calls[0]![0] as ShareData;
    const first = payload.text?.split('\n')[0] ?? '';
    expect(first).toContain('Endless');
    expect(first).not.toContain('NOTECASE');
  });

  test('falls back to clipboard and shows the confirmation', async () => {
    setShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <ShareButton
        puzzle={testPuzzle()}
        found={['NOTECASE', 'OCAS']}
        mode="daily"
        date={new Date(2026, 5, 18)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.getByText('Copied. Paste it wherever your people are.'),
      ).toBeInTheDocument();
    });
  });
});
