import type { Rung } from '@/engine/index.ts';
import type { AudioEngine } from './AudioEngine.ts';

/**
 * How much extra sparkle a found cue earns, by rung. The set gets none.
 *
 * Exported, with the tables and thresholds below it, so the sounds page builds
 * one button per sound from the engine itself: a new rung or length appears
 * there without anyone remembering to add it.
 */
export const RUNG_SPARKLE: Record<Rung, number> = {
  set: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
};

/**
 * The sparkle at which a found cue earns its extra glints. The second glint
 * plays only in the cute theme, so from here up the theme changes the sound.
 */
export const GLINT_SPARKLE = 3;

/** A note as a frequency in hertz. */
type Hz = number;

/**
 * The length that takes the first found note. Shorter lengths share it, and
 * lengths past the end of the table share the last.
 */
export const FOUND_SHORTEST = 3;

// A small pentatonic-ish set keeps cues consonant and lo-fi, never jarring.
export const FOUND_NOTES: readonly Hz[] = [
  392.0, // G4  (length 3)
  440.0, // A4  (4)
  523.25, // C5 (5)
  587.33, // D5 (6)
  659.25, // E5 (7)
  783.99, // G5 (8, though the source cue usually takes over here)
];

/** The crown: a gentle rising arpeggio, brighter than any found cue. */
const SOURCE_ARPEGGIO: readonly Hz[] = [523.25, 659.25, 783.99, 1046.5];

/** Edition Complete: a fuller rising run that settles onto a sustained chord. */
const EDITION_RUN: readonly Hz[] = [523.25, 659.25, 783.99, 1046.5, 1318.51];
const EDITION_CHORD: readonly Hz[] = [523.25, 659.25, 783.99]; // a C-major close

const INVALID_NOTES: readonly Hz[] = [196.0, 174.61]; // a soft descending pair

/** Every cue passes through one master gain at this level. Keep it gentle. */
export const MASTER_GAIN = 0.18;

/**
 * Prototype-level synth built on the Web Audio API. Quiet, lo-fi, behind the
 * AudioEngine interface. The context is created lazily on the first cue, since
 * browsers only allow audio to start from a user gesture.
 */
export class WebAudioEngine implements AudioEngine {
  private context: AudioContext | OfflineAudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /**
   * The game passes nothing, and the engine makes its own AudioContext on the
   * first cue, exactly as it always has.
   *
   * `given` plays the cues into a context the caller made instead, so they can
   * be rendered offline and recorded. The master gain is built on it the same
   * way, on the first cue. The caller owns that context, so the engine never
   * resumes it: an OfflineAudioContext starts when it is rendered, and rejects a
   * resume before then.
   */
  constructor(private readonly given?: AudioContext | OfflineAudioContext) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private ensureContext(): AudioContext | OfflineAudioContext | null {
    if (this.muted) return null;
    if (!this.context) {
      if (this.given) {
        this.context = this.given;
      } else {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return null;
        this.context = new Ctor();
      }
      this.master = this.context.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.context.destination);
    }
    if (!this.given && this.context.state === 'suspended')
      void this.context.resume();
    return this.context;
  }

  /** Play one enveloped note. Short attack, smooth exponential release. */
  private note(
    freq: Hz,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    peak = 1,
  ): void {
    const ctx = this.context;
    const master = this.master;
    if (!ctx || !master) return;

    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  playFound(length: number, rung: Rung = 'set'): void {
    if (!this.ensureContext()) return;
    const i = Math.min(
      Math.max(length - FOUND_SHORTEST, 0),
      FOUND_NOTES.length - 1,
    );
    const freq = FOUND_NOTES[i]!;
    this.note(freq, 0, 0.28, 'sine', 0.9);
    this.note(freq * 2, 0, 0.18, 'sine', 0.18); // soft octave shimmer

    // A small, pleasant rarity sparkle that grows a touch by rung. Gains stay
    // tiny next to the found note, and far below the source-word arpeggio and
    // the Edition Complete run, so the ladder is seasoning, never the main cue.
    const sparkle = RUNG_SPARKLE[rung];
    if (sparkle > 0) {
      this.note(freq * 3, 0.04, 0.12, 'sine', 0.04 + sparkle * 0.02);
      // Mythic earns one extra high glint, and a touch more sparkle in cute.
      if (sparkle >= GLINT_SPARKLE) {
        this.note(freq * 4, 0.09, 0.1, 'sine', 0.05);
        if (this.isCute()) this.note(freq * 5, 0.13, 0.1, 'sine', 0.05);
      }
    }
  }

  /** The active theme, read from the root where useTheme keeps it before paint. */
  private isCute(): boolean {
    return (
      typeof document !== 'undefined' &&
      document.documentElement.dataset.theme === 'cute'
    );
  }

  playSource(): void {
    if (!this.ensureContext()) return;
    SOURCE_ARPEGGIO.forEach((freq, i) => {
      this.note(freq, i * 0.1, 0.5, 'triangle', 0.8);
    });
  }

  playEdition(): void {
    if (!this.ensureContext()) return;
    // A step above the source cue: a longer run, then a held chord to close.
    EDITION_RUN.forEach((freq, i) => {
      this.note(freq, i * 0.1, 0.5, 'triangle', 0.85);
    });
    const chordAt = EDITION_RUN.length * 0.1;
    EDITION_CHORD.forEach((freq) => {
      this.note(freq, chordAt, 1.1, 'triangle', 0.7);
    });
  }

  playInvalid(): void {
    if (!this.ensureContext()) return;
    INVALID_NOTES.forEach((freq, i) => {
      this.note(freq, i * 0.08, 0.16, 'sine', 0.5);
    });
  }

  tick(): void {
    if (!this.ensureContext()) return;
    this.note(880, 0, 0.03, 'square', 0.12);
  }
}
