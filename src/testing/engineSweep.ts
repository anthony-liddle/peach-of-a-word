import { vi } from 'vitest';
import { NullAudioEngine, type AudioEngine } from '@/audio/AudioEngine.ts';
import {
  RUNG_SPARKLE,
  ReferenceAudioEngine,
} from '@/reference/ReferenceAudioEngine.ts';
import type { Rung } from '@/engine/index.ts';
import { describeNotes, installFakeAudio } from './fakeAudioContext.ts';

/**
 * What the engine itself can tell apart, found by playing it rather than by
 * reading the tables the sounds page is built from. A check that compared the
 * page against the page's own derivation would pass however wrong both were.
 *
 * Every cue is played at every input the sweep can name: lengths well past both
 * ends of the found notes, every rung and no rung, every theme and no theme.
 * Each call gets a fresh engine on a recording context, reached through the
 * same no-argument path the game uses, and two calls that schedule the same
 * notes are the same sound.
 */

/**
 * The interface's methods. AudioEngine is a type and has no runtime form, so
 * this reads them off NullAudioEngine, which implements exactly the interface
 * and nothing else.
 */
export const ENGINE_METHODS = Object.getOwnPropertyNames(
  NullAudioEngine.prototype,
).filter((name) => name !== 'constructor') as (keyof AudioEngine)[];

export type Call = {
  method: keyof AudioEngine;
  length?: number;
  rung?: Rung;
  theme?: string;
};

const LENGTHS = Array.from({ length: 23 }, (_, i) => i - 2); // -2 to 20
const RUNGS = [undefined, ...(Object.keys(RUNG_SPARKLE) as Rung[])];
const THEMES = [undefined, 'cute', 'letterpress'];

export function setRootTheme(theme: string | undefined): void {
  if (theme === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function play(engine: AudioEngine, call: Call): void {
  if (call.method === 'playFound') {
    if (call.rung === undefined) engine.playFound(call.length!);
    else engine.playFound(call.length!, call.rung);
  } else if (
    call.method !== 'setMuted' &&
    call.method !== 'muted' &&
    call.method !== 'setTheme'
  ) {
    engine[call.method]();
  }
}

function sweepCalls(): Call[] {
  const calls: Call[] = [];
  for (const method of ENGINE_METHODS) {
    // Not sounds: the mute, and the theme, which the sweep sets on the root
    if (method === 'setMuted' || method === 'muted' || method === 'setTheme')
      continue;
    for (const theme of THEMES) {
      if (method !== 'playFound') {
        calls.push({ method, ...(theme && { theme }) });
        continue;
      }
      for (const length of LENGTHS)
        for (const rung of RUNGS)
          calls.push({
            method,
            length,
            ...(rung && { rung }),
            ...(theme && { theme }),
          });
    }
  }
  return calls;
}

/** The notes a call schedules, as one string: equal strings, equal sounds. */
export type Signature = string;

/**
 * Every distinct sound, keyed by what it schedules, with every call that
 * produces it. Leaves the root theme and the global AudioContext as it found
 * neither: unset.
 */
export function distinctSounds(): Map<Signature, Call[]> {
  const sounds = new Map<Signature, Call[]>();
  try {
    for (const call of sweepCalls()) {
      const { contexts } = installFakeAudio();
      setRootTheme(call.theme);
      play(new ReferenceAudioEngine(), call);
      const signature = describeNotes(contexts[0]!).join('\n');
      sounds.set(signature, [...(sounds.get(signature) ?? []), call]);
      vi.unstubAllGlobals();
    }
  } finally {
    vi.unstubAllGlobals();
    setRootTheme(undefined);
  }
  return sounds;
}

/** A call, written the way a person would say it. */
export function describeCall(call: Call): string {
  const args =
    call.method === 'playFound'
      ? `(${call.length}${call.rung ? `, '${call.rung}'` : ''})`
      : '()';
  return `${call.method}${args} in ${call.theme ?? 'no theme'}`;
}
