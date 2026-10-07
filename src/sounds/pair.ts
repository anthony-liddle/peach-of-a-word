import type { AudioEngine } from '@/audio/AudioEngine.ts';
import { SoundscapeAudioEngine } from '@/audio/SoundscapeAudioEngine.ts';
import { ReferenceAudioEngine } from '@/reference/ReferenceAudioEngine.ts';
import cues from '@/audio/peach.cues.json';

/**
 * The two engines the page compares: the game's sound before Soundscape, played
 * by ReferenceAudioEngine, and the same sound as a Soundscape cue.
 */
export interface Pair {
  before: AudioEngine;
  soundscape: AudioEngine;
}

/**
 * Both engines on one AudioContext, made by the first tap and resumed by every
 * tap that finds it suspended. A tap plays one engine and then the other, a
 * moment later; on iOS Safari a context made after the gesture would stay
 * locked, so the second sound needs the context the gesture unlocked.
 */
export function pairOnTap(): () => Pair | null {
  let context: AudioContext | null = null;
  let pair: Pair | null = null;
  return () => {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      pair = {
        before: new ReferenceAudioEngine(context),
        soundscape: new SoundscapeAudioEngine(context),
      };
    }
    if (context.state === 'suspended') void context.resume();
    return pair;
  };
}

/**
 * How long a sound lasts, in seconds: its last note's end, plus the 20 ms the
 * oscillators run on after it. Read off its cue, and the same for both engines.
 */
export function lengthOf(id: string): number {
  const cue = (
    cues.cues as Record<
      string,
      { notes: { start: number; duration: number }[] }
    >
  )[id];
  if (!cue) throw new Error(`no cue named ${id}`);
  return Math.max(...cue.notes.map((n) => n.start + n.duration)) + 0.02;
}
