import type { Rung } from '@/engine/index.ts';
import type { Theme } from '@/ui/useTheme.ts';

/**
 * The audio interface the game plays against. v1 ships a small Web Audio synth;
 * the real Soundscape engine will implement this same shape later, so nothing
 * above this line needs to change when it does.
 */
export interface AudioEngine {
  /**
   * A found word lands. Pitch rises with length. The rung adds a small, optional
   * sparkle that grows by rarity, but the cue stays well below the source-word
   * and Edition Complete moments. Defaults to a plain set find.
   */
  playFound(length: number, rung?: Rung): void;
  /** The source word: the crown. A distinct, richer cue. */
  playSource(): void;
  /** Edition Complete: every word in the set found. A step above the rest. */
  playEdition(): void;
  /** A rejected guess. Gentle, never harsh. */
  playInvalid(): void;
  /** A small click for setting a tile. */
  tick(): void;
  /** Mute or unmute all cues. */
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /**
   * The theme the cues play in. Only one cue hears it: a mythic found word
   * plays a fifth note in cute, a glint at five times its pitch. The game keeps
   * the engine in step with the theme it shows, so nothing here reads the page.
   */
  setTheme(theme: Theme): void;
}

/** A silent engine for tests and for environments without Web Audio. */
export class NullAudioEngine implements AudioEngine {
  muted = false;
  playFound(): void {}
  playSource(): void {}
  playEdition(): void {}
  playInvalid(): void {}
  tick(): void {}
  setMuted(muted: boolean): void {
    this.muted = muted;
  }
  setTheme(): void {}
}
