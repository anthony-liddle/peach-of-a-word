import { AudioEngine as Soundscape } from 'soundscape-engine';
import type { Rung } from '@/engine/index.ts';
import { DEFAULT_THEME, type Theme } from '@/ui/useTheme.ts';
import type { AudioEngine } from './AudioEngine.ts';
import cues from './peach.cues.json';

/**
 * The game's audio on Soundscape, Antoine's engine: every sound is a cue in
 * peach.cues.json, written from the game's previous engine,
 * ReferenceAudioEngine, which stays as the reference the cues are held to.
 *
 * It keeps that engine's lifecycle. Nothing exists until the first cue, which
 * must come from a gesture: that cue creates the AudioContext and resumes it in
 * the same call, which is what unlocks audio on iOS Safari, and every later cue
 * resumes it again if the browser has suspended it since. While muted, a cue
 * creates nothing and plays nothing. Muting does not cut a cue already ringing,
 * as it never did.
 */
export class SoundscapeAudioEngine implements AudioEngine {
  muted = false;
  private theme: Theme = DEFAULT_THEME;
  private context: BaseAudioContext | null = null;
  private engine: Soundscape | null = null;

  /**
   * The game passes nothing, and the engine makes its own AudioContext on the
   * first cue. `given` plays into a context the caller owns instead, such as an
   * OfflineAudioContext for a render, which is never resumed.
   */
  constructor(private readonly given?: BaseAudioContext) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  playFound(length: number, rung: Rung = 'set'): void {
    const found = Math.min(Math.max(length, SHORTEST), LONGEST);
    this.play(
      rung === 'mythic'
        ? `found-${found}-mythic-${this.theme}`
        : `found-${found}-${rung}`,
    );
  }

  playSource(): void {
    this.play('source');
  }

  playEdition(): void {
    this.play('edition');
  }

  playInvalid(): void {
    this.play('invalid');
  }

  tick(): void {
    this.play('tick');
  }

  private play(cue: string): void {
    this.ready()?.playCue(cue);
  }

  /** The engine, made on the first cue that is not muted. */
  private ready(): Soundscape | null {
    if (this.muted) return null;
    if (!this.engine) {
      const context = this.given ?? newAudioContext();
      if (!context) return null;
      const engine = new Soundscape({ context });
      // initialize() builds the whole graph before it waits for anything: what
      // it then awaits is its scheduler worklet, which only music uses. So the
      // cues load and the first one plays now, inside the gesture, not after.
      void engine.initialize();
      engine.loadCues(cues);
      this.context = context;
      this.engine = engine;
    }
    if (!this.given && this.context?.state === 'suspended') {
      void (this.context as AudioContext).resume();
    }
    return this.engine;
  }
}

/** The browser's AudioContext, or Safari's older prefixed one, or none. */
function newAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/** The lengths the found cues cover, read off their names: 3 to 8. */
const FOUND_LENGTHS = Object.keys(cues.cues)
  .map((name) => /^found-(\d+)-set$/.exec(name)?.[1])
  .filter((n): n is string => n !== undefined)
  .map(Number);
const SHORTEST = Math.min(...FOUND_LENGTHS);
const LONGEST = Math.max(...FOUND_LENGTHS);
