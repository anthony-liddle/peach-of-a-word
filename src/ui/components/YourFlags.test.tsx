import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { YourFlags } from './YourFlags.tsx';
import { FlagsContext, type FlagsUI } from '@/flags/context.ts';
import { createFlags, type Flags } from '@/flags/flags.ts';
import type { FlagReason } from '@/flags/model.ts';

/** Made-up words, a fetch the test holds. */
function harness(status = 202) {
  const store = new Map<string, string>();
  let n = 0;
  let now = Date.UTC(2026, 6, 1);
  const sent: { method: string; body: unknown }[] = [];
  const flags = createFlags({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    fetch: (async (_u: unknown, init?: RequestInit) => {
      sent.push({
        method: init?.method ?? 'GET',
        body: JSON.parse(String(init?.body)),
      });
      return new Response(null, {
        status: init?.method === 'DELETE' ? 204 : status,
      });
    }) as unknown as typeof fetch,
    now: () => (now += 1000),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    version: 'test',
  });
  const ui: FlagsUI = {
    flags,
    board: { day: '2026-07-01' },
    mode: 'daily',
    openYourFlags: () => {},
  };
  return { flags, ui, sent };
}

async function make(flags: Flags, word: string, reason: FlagReason) {
  await act(async () => {
    await flags.flag({ word, reason, board: { day: '2026-07-01' } });
  });
}

function panel(ui: FlagsUI, onClose = vi.fn()) {
  render(
    <FlagsContext.Provider value={ui}>
      <YourFlags onClose={onClose} overCard={false} />
    </FlagsContext.Provider>,
  );
  return onClose;
}

const dialog = () => screen.getByRole('dialog', { name: 'Your flags' });

describe('Your flags', () => {
  it('lists each flag, newest first, with its reason, its state and Take back', async () => {
    const { flags, ui } = harness();
    await make(flags, 'zorp', 'rarer');
    await make(flags, 'grelt', 'definition');
    panel(ui);
    const rows = within(dialog()).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      '✓grelt, its definitionSentTake back',
      '✓zorp, rarerSentTake back',
    ]);
    expect(
      within(dialog()).getByText(
        "Flags send right away, or once you're back online. You can take one back for 60 days.",
      ),
    ).toBeInTheDocument();
  });

  it('says Waiting to send for a flag that has not gone', async () => {
    const { flags, ui } = harness(503);
    await make(flags, 'zorp', 'more-common');
    panel(ui);
    expect(within(dialog()).getByText('Waiting to send')).toBeInTheDocument();
    expect(within(dialog()).getByText(/zorp/).parentElement).toHaveTextContent(
      'zorp, more common',
    );
  });

  it('takes a flag back, and asks the server to forget it', async () => {
    const { flags, ui, sent } = harness();
    await make(flags, 'zorp', 'rarer');
    await make(flags, 'grelt', 'offensive');
    panel(ui);
    const [first] = within(dialog()).getAllByRole('button', {
      name: 'Take back',
    });
    await act(async () => {
      fireEvent.click(first!);
    });
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(1);
    expect(sent.at(-1)).toMatchObject({ method: 'DELETE' });
  });

  it('closes when the last flag is taken back', async () => {
    const { flags, ui } = harness();
    await make(flags, 'zorp', 'rarer');
    const onClose = panel(ui);
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Take back' }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('takes the focus when it opens, and closes on Escape, on Close, and on a tap outside', async () => {
    const { flags, ui } = harness();
    await make(flags, 'zorp', 'rarer');
    const onClose = panel(ui);
    expect(dialog()).toHaveFocus();
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    fireEvent.click(dialog().parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
