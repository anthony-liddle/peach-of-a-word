import type { AudioEngine } from '@/audio/AudioEngine.ts';
import {
  FOUND_NOTES,
  FOUND_SHORTEST,
  GLINT_SPARKLE,
  RUNG_SPARKLE,
} from '@/audio/WebAudioEngine.ts';
import type { Rung } from '@/engine/index.ts';
import type { Theme } from '@/ui/useTheme.ts';

/**
 * Every sound the game makes today, built from the engine's own tables so the
 * list cannot fall behind it.
 *
 * Five cues, but not five sounds. A found word's pitch comes from its length and
 * its sparkle from its rung, and the mythic sparkle also depends on the theme:
 * `playFound` reads the theme off the document root, which nothing in its
 * signature says. So the mythic rows are played once per theme, each with the
 * theme set for the length of the call.
 */

/** The cues that make a sound: every AudioEngine method except the mute. */
export type SoundCue = Exclude<keyof AudioEngine, 'muted' | 'setMuted'>;

export interface Sound {
  /** Stable, for file names and fixture keys. */
  id: string;
  cue: SoundCue;
  /** The button's whole name, visible and spoken: what it plays. */
  label: string;
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

/**
 * Run `play` with the document root set to `theme`, then put back whatever was
 * there.
 *
 * The engine reads the theme once, synchronously, while it schedules the cue,
 * and the attribute is restored before this returns, so nothing paints in
 * between and the page never shows the other theme. It writes the attribute
 * directly rather than through useTheme's setter, which would also save the
 * choice to the game's storage and change the player's theme.
 */
export function inTheme(theme: Theme, play: () => void): void {
  const root = document.documentElement;
  const before = root.dataset.theme;
  root.dataset.theme = theme;
  try {
    play();
  } finally {
    if (before === undefined) delete root.dataset.theme;
    else root.dataset.theme = before;
  }
}

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
          play: (engine) => engine.playFound(length, rung),
        },
      ];
    }
    return THEMES.map((theme) => ({
      id: `found-${length}-${rung}-${theme}`,
      cue: 'playFound',
      label: `Length ${length}, ${rung}, ${theme}`,
      play: (engine) => inTheme(theme, () => engine.playFound(length, rung)),
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
              play: (engine) => engine[cue](),
            },
          ],
  }),
);

/** Every sound, in page order. */
export const SOUNDS: Sound[] = SECTIONS.flatMap((s) => s.sounds);
