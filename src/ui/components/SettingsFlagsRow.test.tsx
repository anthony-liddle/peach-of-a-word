import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SettingsMenu } from './SettingsMenu.tsx';
import { FlagsContext, type FlagsUI } from '@/flags/context.ts';
import { createFlags } from '@/flags/flags.ts';

/** Settings shows a row with the count, never the flagged words (Antoine, 22 November). */
function harness() {
  const store = new Map<string, string>();
  let n = 0;
  const flags = createFlags({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    fetch: (async () =>
      new Response(null, { status: 202 })) as unknown as typeof fetch,
    now: () => Date.UTC(2026, 6, 1),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    version: 'test',
  });
  const ui: FlagsUI = {
    flags,
    board: { day: '2026-07-01' },
    mode: 'daily',
    openYourFlags: () => {},
  };
  return { flags, ui };
}

function settings(ui: FlagsUI, onOpenFlags = vi.fn()) {
  render(
    <FlagsContext.Provider value={ui}>
      <SettingsMenu
        open
        onOpenChange={() => {}}
        muted={false}
        onToggleMute={() => {}}
        onOpenFlags={onOpenFlags}
      />
    </FlagsContext.Provider>,
  );
  return onOpenFlags;
}

describe("Settings' Your flags row", () => {
  it('is not there until something is flagged', () => {
    settings(harness().ui);
    expect(screen.queryByRole('button', { name: /Your flags/ })).toBeNull();
  });

  it('shows the count, never the flagged words, and opens the list on its own', async () => {
    const { flags, ui } = harness();
    await act(async () => {
      await flags.flag({
        word: 'zorp',
        reason: 'rarer',
        board: { day: '2026-07-01' },
      });
      await flags.flag({
        word: 'grelt',
        reason: 'definition',
        board: { day: '2026-07-01' },
      });
    });
    const onOpenFlags = settings(ui);
    const row = screen.getByRole('button', { name: /Your flags/ });
    expect(row).toHaveTextContent('Your flags2');
    expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByText(/zorp|grelt/)).toBeNull();
    fireEvent.click(row);
    expect(onOpenFlags).toHaveBeenCalled();
  });
});
