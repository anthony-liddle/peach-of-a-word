import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import { describeNotes, installFakeAudio } from '@/testing/fakeAudioContext.ts';
import {
  ENGINE_METHODS,
  describeCall,
  distinctSounds,
  type Call,
} from '@/testing/engineSweep.ts';
import { SoundsPage } from './SoundsPage.tsx';

/**
 * The page is complete: every sound the engine can make has a button, and so
 * does every method on the interface.
 *
 * What counts as a sound comes from playing the engine (see engineSweep), not
 * from the tables the page is built from, so the page is checked against the
 * engine rather than against itself. Every button is then pressed on a real
 * WebAudioEngine and the notes it schedules are compared with the sweep.
 */
const ENGINE = distinctSounds();

interface Press {
  label: string;
  calls: Call[];
  signature: string;
}

/** Press every button on the page, once, and record what each one did. */
function pressEverything(): { presses: Press[]; methods: Set<string> } {
  const { contexts } = installFakeAudio();
  const engine = new WebAudioEngine();

  // Record each call as the engine receives it, with the theme on the root at
  // that moment, then pass it through untouched.
  const log: Call[] = [];
  const methods = new Set<string>();
  const target = engine as unknown as Record<
    string,
    (...args: unknown[]) => void
  >;
  for (const method of ENGINE_METHODS) {
    const original = target[method]!.bind(engine);
    target[method] = (...args: unknown[]) => {
      methods.add(method);
      const [length, rung] = args as [number?, Call['rung']?];
      log.push({
        method,
        ...(method === 'playFound' && { length: length! }),
        ...(rung && { rung }),
        ...(document.documentElement.dataset.theme && {
          theme: document.documentElement.dataset.theme,
        }),
      });
      original(...args);
    };
  }

  render(<SoundsPage engine={engine} />);
  // The mute toggle goes last, on and off again: pressed first, it would
  // silence every button after it.
  const buttons = screen.getAllByRole('button');
  const toggles = buttons.filter((b) => b.hasAttribute('aria-pressed'));
  const sounds = buttons.filter((b) => !b.hasAttribute('aria-pressed'));
  const presses: Press[] = [];
  for (const button of [...sounds, ...toggles, ...toggles]) {
    const fromNote = contexts[0]?.oscillators.length ?? 0;
    const fromCall = log.length;
    fireEvent.click(button);
    presses.push({
      label: button.textContent ?? '',
      calls: log.slice(fromCall),
      signature: contexts[0]
        ? describeNotes(contexts[0], fromNote).join('\n')
        : '',
    });
  }
  return { presses, methods };
}

beforeEach(() => {
  // The page's document pins cute before the first paint.
  document.documentElement.dataset.theme = 'cute';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('the sounds page is complete', () => {
  test(`the engine makes ${ENGINE.size} distinct sounds, and each has a button`, () => {
    const { presses } = pressEverything();
    const pressed = new Set(presses.map((p) => p.signature));
    const missing = [...ENGINE]
      .filter(([signature]) => !pressed.has(signature))
      .map(([, calls]) => describeCall(calls[0]!));
    expect(missing, 'sounds the engine makes with no button').toEqual([]);
  });

  test('every AudioEngine method has a button', () => {
    const { methods } = pressEverything();
    const missing = ENGINE_METHODS.filter((m) => !methods.has(m));
    expect(missing, 'methods with no button').toEqual([]);
  });

  test('no two buttons play the same sound', () => {
    const { presses } = pressEverything();
    const sounding = presses.filter((p) => p.signature !== '');
    const repeats = sounding.filter(
      (p, i) => sounding.findIndex((q) => q.signature === p.signature) !== i,
    );
    expect(repeats.map((p) => p.label)).toEqual([]);
    expect(sounding).toHaveLength(ENGINE.size);
  });

  test('each found button names the length and rung it plays, and the theme where the engine hears it', () => {
    // Where the sweep put the cute and letterpress plays of one length and rung
    // into different sounds, the theme is part of what the button plays.
    const heard = new Map<string, Set<string>>();
    for (const [signature, calls] of ENGINE)
      for (const c of calls)
        if (c.method === 'playFound' && c.rung && c.theme) {
          const key = `${c.length} ${c.rung}`;
          heard.set(key, (heard.get(key) ?? new Set()).add(signature));
        }

    const { presses } = pressEverything();
    const found = presses.filter((p) => p.calls[0]?.method === 'playFound');
    expect(found.length).toBeGreaterThan(0);
    for (const { label, calls } of found) {
      expect(calls).toHaveLength(1);
      const { length, rung, theme } = calls[0]!;
      expect(label).toContain(`Length ${length}, ${rung}`);
      const themed = (heard.get(`${length} ${rung}`)?.size ?? 0) > 1;
      if (themed) expect(label).toContain(`, ${theme}`);
      else expect(label).toBe(`Length ${length}, ${rung}`);
    }
  });
});
