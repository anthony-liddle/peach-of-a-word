import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { FlagControl } from './FlagControl.tsx';
import { FlagsContext, type FlagsUI } from '@/flags/context.ts';
import { createFlags, MAX_WAITING, type Board } from '@/flags/flags.ts';

/*
 * The flag at the foot of a card. Made-up words; every request goes to a
 * fetch the test holds, so nothing reaches a network.
 */

function harness(
  answers: number[] = [202],
  over: { board?: Board; mode?: 'daily' | 'endless' } = {},
) {
  const store = new Map<string, string>();
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  let n = 0;
  const fetchFn = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push({
        method: init?.method ?? 'GET',
        body: JSON.parse(String(init?.body)),
      });
      return new Response(null, {
        status: answers.length > 1 ? answers.shift()! : answers[0]!,
      });
    },
  );
  const flags = createFlags({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    fetch: fetchFn as unknown as typeof fetch,
    now: () => Date.UTC(2026, 6, 1),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    version: 'test',
  });
  const openYourFlags = vi.fn();
  const ui: FlagsUI = {
    flags,
    board: over.board ?? { day: '2026-07-01' },
    mode: over.mode ?? 'daily',
    openYourFlags,
  };
  return { ui, flags, sent, openYourFlags };
}

function card(
  ui: FlagsUI | null,
  props: Partial<React.ComponentProps<typeof FlagControl>> = {},
) {
  return render(
    <FlagsContext.Provider value={ui}>
      <FlagControl
        word="zorp"
        card="definition"
        grade="uncommon"
        theme="cute"
        {...props}
      />
    </FlagsContext.Provider>,
  );
}

const flagButton = () => screen.getByRole('button', { name: 'Flag this word' });
const picker = () => screen.getByRole('group', { name: 'Flag “zorp”' });

describe('the flag on a card', () => {
  it('shows nothing where no board is known, as on the dev probe', () => {
    card(null);
    expect(screen.queryByRole('button', { name: 'Flag this word' })).toBeNull();
  });

  it('opens the picker: the title, three groups for a found word, the short line, Cancel', () => {
    card(harness().ui);
    fireEvent.click(flagButton());
    const p = picker();
    expect(within(p).getByText('Take it out')).toBeInTheDocument();
    expect(within(p).getByText('Fix its card')).toBeInTheDocument();
    expect(within(p).getByText('Its grade')).toBeInTheDocument();
    expect(
      within(p)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      "It's not a real word",
      "It's offensive",
      'The definition is wrong',
      "It's rarer than Uncommon",
      "It's more common than Uncommon",
      'Cancel',
    ]);
    expect(
      within(p).getByText(
        'Sends the word, its day and your reason. Nothing about you.',
      ),
    ).toBeInTheDocument();
  });

  it('gives the peach card no grade', () => {
    card(harness().ui, { card: 'peach', grade: null });
    fireEvent.click(flagButton());
    expect(within(picker()).queryByText('Its grade')).toBeNull();
  });

  it('makes the flag, closes the picker, and says so on the card and aloud', async () => {
    const { ui, sent } = harness();
    card(ui);
    fireEvent.click(flagButton());
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: "It's rarer than Uncommon" }),
      );
    });
    expect(sent[0]!.body).toMatchObject({
      flags: [{ word: 'zorp', reason: 'rarer', day: '2026-07-01' }],
    });
    expect(screen.queryByRole('group', { name: /Flag/ })).toBeNull();
    expect(
      screen.getByText(/You flagged this: rarer\. Sent\./),
    ).toBeInTheDocument();
    expect(document.querySelector('.flag__spoken')).toHaveTextContent(
      'Flagged. Sent.',
    );
  });

  it('says Waiting to send when the flag could not go yet', async () => {
    const { ui } = harness([503]);
    card(ui);
    fireEvent.click(flagButton());
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'The definition is wrong' }),
      );
    });
    expect(
      screen.getByText(/You flagged this: its definition\. Waiting to send\./),
    ).toBeInTheDocument();
    expect(document.querySelector('.flag__spoken')).toHaveTextContent(
      'Flagged. Waiting to send.',
    );
  });

  it('takes the grade group away once a grade flag is made', async () => {
    const { ui } = harness();
    card(ui);
    fireEvent.click(flagButton());
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: "It's more common than Uncommon" }),
      );
    });
    fireEvent.click(flagButton());
    expect(within(picker()).queryByText('Its grade')).toBeNull();
  });

  it("opens Your flags from the card's line", async () => {
    const { ui, openYourFlags } = harness();
    card(ui);
    fireEvent.click(flagButton());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "It's offensive" }));
    });
    const link = screen.getByRole('button', { name: 'Your flags' });
    fireEvent.click(link);
    expect(openYourFlags).toHaveBeenCalledWith(link);
  });

  it('Cancel sends nothing and gives the focus back to the flag', () => {
    const { ui, sent } = harness();
    card(ui);
    fireEvent.click(flagButton());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(sent).toEqual([]);
    expect(flagButton()).toHaveFocus();
  });

  it("says the board, not the day, on the web's Endless, and sends the rack", async () => {
    const { ui, sent } = harness([202], {
      board: { rack: 'quazzorp' },
      mode: 'endless',
    });
    card(ui);
    fireEvent.click(flagButton());
    expect(
      screen.getByText(
        'Sends the word, its board and your reason. Nothing about you.',
      ),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "It's offensive" }));
    });
    expect(sent[0]!.body).toMatchObject({ flags: [{ rack: 'quazzorp' }] });
  });

  it(`gives way to a line when ${MAX_WAITING} flags are waiting`, async () => {
    const { ui, flags } = harness([503]);
    await act(async () => {
      for (let i = 0; i < MAX_WAITING; i++) {
        await flags.flag({
          word: `w${String.fromCharCode(97 + (i % 26))}${i}`,
          reason: 'definition',
          board: { day: '2026-07-01' },
        });
      }
    });
    card(ui);
    expect(screen.queryByRole('button', { name: 'Flag this word' })).toBeNull();
    expect(
      screen.getByText(
        "50 flags are waiting to send. They'll go once you're online.",
      ),
    ).toBeInTheDocument();
  });
});
