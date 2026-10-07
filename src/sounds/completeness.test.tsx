import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SoundscapeAudioEngine } from '@/audio/SoundscapeAudioEngine.ts';
import { ReferenceAudioEngine } from '@/reference/ReferenceAudioEngine.ts';
import { FakeAudioContext, describeNotes } from '@/testing/fakeAudioContext.ts';
import {
  ENGINE_METHODS,
  describeCall,
  distinctSounds,
  type Call,
} from '@/testing/engineSweep.ts';
import { SoundsPage } from './SoundsPage.tsx';

/**
 * The page is complete: every sound the engine can make has a button, and so
 * does every method on the interface, and every one of those sounds has a
 * Soundscape cue that its button plays.
 *
 * What counts as a sound comes from playing the engine (see engineSweep), not
 * from the tables the page is built from, so the page is checked against the
 * engine rather than against itself. Every button is then pressed with a real
 * ReferenceAudioEngine on a recording context, and the notes it schedules are
 * compared with the sweep. The Soundscape side is recorded by name: which cue
 * each button plays. The browser tests hold each cue's sound to the engine's.
 */
const ENGINE = distinctSounds();

const CUE_NAMES = Object.keys(
  (
    JSON.parse(
      readFileSync(resolve(__dirname, '../audio/peach.cues.json'), 'utf8'),
    ) as { cues: Record<string, unknown> }
  ).cues,
);

const { cuesPlayed } = vi.hoisted(() => ({ cuesPlayed: [] as string[] }));
vi.mock('soundscape-engine', () => ({
  AudioEngine: class {
    initialize(): Promise<void> {
      return new Promise(() => {});
    }
    loadCues(): void {}
    playCue(name: string): void {
      cuesPlayed.push(name);
    }
  },
}));

interface Press {
  label: string;
  sound: string | undefined;
  calls: Call[];
  signature: string;
  cues: string[];
}

/** Press every button on the page, once, and record what each one did. */
function pressEverything(): { presses: Press[]; methods: Set<string> } {
  vi.useFakeTimers();
  cuesPlayed.length = 0;
  const context = new FakeAudioContext();
  const engine = new ReferenceAudioEngine(context as unknown as AudioContext);
  const soundscape = new SoundscapeAudioEngine(
    context as unknown as BaseAudioContext,
  );

  // Record each call as the engine receives it, with the theme the engine was
  // last given, then pass it through untouched. Giving the theme is not a
  // sound, so it is noted rather than logged.
  const log: Call[] = [];
  const methods = new Set<string>();
  let theme: string | undefined;
  const target = engine as unknown as Record<
    string,
    (...args: unknown[]) => void
  >;
  for (const method of ENGINE_METHODS) {
    const original = target[method]!.bind(engine);
    target[method] = (...args: unknown[]) => {
      methods.add(method);
      if (method === 'setTheme') {
        theme = args[0] as string;
        original(...args);
        return;
      }
      const [length, rung] = args as [number?, Call['rung']?];
      log.push({
        method,
        ...(method === 'playFound' && { length: length! }),
        ...(rung && { rung }),
        ...(theme && { theme }),
      });
      original(...args);
    };
  }

  render(<SoundsPage pair={() => ({ before: engine, soundscape })} />);
  // The toggles go last, on and off again: the mute pressed first would
  // silence every button after it.
  const buttons = screen.getAllByRole('button');
  const toggles = buttons.filter((b) => b.hasAttribute('aria-pressed'));
  const sounds = buttons.filter((b) => b.hasAttribute('data-sound'));
  const presses: Press[] = [];
  for (const button of [...sounds, ...toggles, ...toggles]) {
    const fromNote = context.oscillators.length;
    const fromCall = log.length;
    const fromCue = cuesPlayed.length;
    fireEvent.click(button);
    // The second of the tap's two sounds, a moment later
    act(() => vi.runAllTimers());
    presses.push({
      label: button.textContent ?? '',
      sound: button.dataset.sound,
      calls: log.slice(fromCall),
      signature: describeNotes(context, fromNote).join('\n'),
      cues: cuesPlayed.slice(fromCue),
    });
  }
  vi.useRealTimers();
  return { presses, methods };
}

beforeEach(() => {
  // The page's document pins cute before the first paint.
  document.documentElement.dataset.theme = 'cute';
});

afterEach(() => {
  vi.useRealTimers();
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

  test('every sound has a Soundscape cue, which its button plays, and every cue is reachable', () => {
    const { presses } = pressEverything();
    const sounding = presses.filter((p) => p.sound !== undefined);
    expect(sounding).toHaveLength(ENGINE.size);
    for (const press of sounding) {
      expect(press.cues, press.label).toEqual([press.sound]);
    }
    expect(new Set(sounding.flatMap((p) => p.cues))).toEqual(
      new Set(CUE_NAMES),
    );
    expect(CUE_NAMES).toHaveLength(ENGINE.size);
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
