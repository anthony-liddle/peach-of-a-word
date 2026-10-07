import type { AudioEngine } from '@/audio/AudioEngine.ts';
import {
  FOUND_NOTES,
  FOUND_SHORTEST,
  GLINT_SPARKLE,
  RUNG_SPARKLE,
} from '@/reference/ReferenceAudioEngine.ts';
import type { Rung } from '@/engine/index.ts';
import type { Theme } from '@/ui/useTheme.ts';

/**
 * Every sound the game makes today, built from the engine's own tables so the
 * list cannot fall behind it.
 *
 * Five cues, but not five sounds. A found word's pitch comes from its length and
 * its sparkle from its rung, and the mythic sparkle also depends on the theme
 * the engine is given. So the mythic rows are played once per theme, each
 * giving the engine its theme first.
 */

/** The cues that make a sound: every AudioEngine method but the mute and the theme. */
export type SoundCue = Exclude<
  keyof AudioEngine,
  'muted' | 'setMuted' | 'setTheme'
>;

export interface Sound {
  /** Stable, for file names and fixture keys. */
  id: string;
  cue: SoundCue;
  /** The button's whole name, visible and spoken: what it plays. */
  label: string;
  /** What the cue is called with, and the theme it is played in where that matters. */
  params: { length?: number; rung?: Rung; theme?: Theme };
  play: (engine: AudioEngine) => void;
}

export interface CueSection {
  cue: SoundCue;
  title: string;
  /** The call, as the interface names it. */
  call: string;
  sounds: Sound[];
}

/**
 * Keyed by cue, so adding a method to AudioEngine fails the typecheck here
 * until the page has a section for it.
 */
const CUES: Record<SoundCue, { title: string; call: string }> = {
  playFound: { title: 'Found word', call: 'playFound(length, rung)' },
  playSource: { title: 'Source word', call: 'playSource()' },
  playEdition: { title: 'Edition Complete', call: 'playEdition()' },
  playInvalid: { title: 'Rejected guess', call: 'playInvalid()' },
  tick: { title: 'Tile tap', call: 'tick()' },
};

/** Keyed rather than listed, so a new theme fails the typecheck here too. */
const THEME_NAMES: Record<Theme, true> = { letterpress: true, cute: true };
export const THEMES = Object.keys(THEME_NAMES) as Theme[];

/** Does the theme change this rung's sound? Only from the glint up. */
export function themeMatters(rung: Rung): boolean {
  return RUNG_SPARKLE[rung] >= GLINT_SPARKLE;
}

export interface LengthRow {
  length: number;
  hz: number;
  sounds: Sound[];
}

/** One row per found note, one button per rung, two for a themed rung. */
export const FOUND_ROWS: LengthRow[] = FOUND_NOTES.map((hz, i) => {
  const length = FOUND_SHORTEST + i;
  const rungs = Object.keys(RUNG_SPARKLE) as Rung[];
  const sounds = rungs.flatMap((rung): Sound[] => {
    if (!themeMatters(rung)) {
      return [
        {
          id: `found-${length}-${rung}`,
          cue: 'playFound',
          label: `Length ${length}, ${rung}`,
          params: { length, rung },
          play: (engine) => engine.playFound(length, rung),
        },
      ];
    }
    return THEMES.map((theme) => ({
      id: `found-${length}-${rung}-${theme}`,
      cue: 'playFound',
      label: `Length ${length}, ${rung}, ${theme}`,
      params: { length, rung, theme },
      play: (engine) => {
        engine.setTheme(theme);
        engine.playFound(length, rung);
      },
    }));
  });
  return { length, hz, sounds };
});

/** The other cues take no arguments, so each is one sound: playSource is "source". */
export const SECTIONS: CueSection[] = (Object.keys(CUES) as SoundCue[]).map(
  (cue) => ({
    cue,
    ...CUES[cue],
    sounds:
      cue === 'playFound'
        ? FOUND_ROWS.flatMap((row) => row.sounds)
        : [
            {
              id: cue.replace(/^play/, '').toLowerCase(),
              cue,
              label: CUES[cue].title,
              params: {},
              play: (engine) => engine[cue](),
            },
          ],
  }),
);

/** Every sound, in page order. */
export const SOUNDS: Sound[] = SECTIONS.flatMap((s) => s.sounds);
