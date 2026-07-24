import type { Theme } from './useTheme.ts';

/**
 * The six named ranks of the points ladder, skinned per theme. Keyed by rank
 * index (0 to 5), the same six rungs the engine's TIERS define by threshold, so
 * the ladder structure is one thing and the names are a skin over it, exactly as
 * the rarity marks swap per theme. The completion crown names (The Complete
 * Works, Peachy Keen Supreme) are Stage 2 and sit above these six; the data
 * shape is ready for a seventh rank above the named ladder.
 */
export const TIER_NAMES: Record<Theme, readonly string[]> = {
  letterpress: [
    'Blank Page',
    'First Impression',
    'Galley Proof',
    'Press Run',
    'Bound Edition',
    'Fine Press',
  ],
  cute: [
    'First Sprout',
    'Little Bud',
    'Blossom',
    'Ripening',
    'Sweet',
    'Perfectly Peachy',
  ],
};

/**
 * The completion crown: the rank above the six named ranks, reached not by
 * points but by finding every common word (the Stage 2 peak). Same per-theme
 * structure as the ladder, so a theme switch re-skins the crown label live.
 */
export const CROWN_NAMES: Record<Theme, string> = {
  letterpress: 'The Complete Works',
  cute: 'Peachy Keen Supreme',
};

/**
 * The source-word celebration, the visible line at the moment the eight-letter
 * word lands. Classic names the find plainly. Cute makes the game's own joke:
 * "a peach of a" is an old phrase for a fine example of a thing, which is
 * exactly what the source word is in a rack. Same per-theme structure as the
 * ladder and the crown, so a theme switch re-skins the line live.
 */
export const SOURCE_FOUND_MESSAGES: Record<Theme, string> = {
  letterpress: 'You found the source word.',
  cute: 'You found the Peach of a Word!',
};

/**
 * The spoken form of the same celebration: the theme's framing, plus the word
 * itself, which the visible line leaves to the reveal card. Every skin ends in a
 * full stop because the live region appends the rank and completion cues to it.
 */
const SOURCE_FOUND_ANNOUNCEMENTS: Record<Theme, (word: string) => string> = {
  letterpress: (word) => `Source word found: ${word}.`,
  cute: (word) => `You found the Peach of a Word: ${word}.`,
};

/**
 * The kicker above the word on the source-word reveal card. Letterpress names
 * the rack as the type a word was cut for. Cute says the same thing about the
 * same rack in its own register: the eight letters every other find grew out
 * of. A label, not a sentence, so neither skin closes with a full stop.
 */
export const REVEAL_KICKERS: Record<Theme, string> = {
  letterpress: 'The word the type was cut for',
  cute: 'The peach every word grew from',
};

/** The crown's rank index, one above the top named rank (5). */
export const CROWN_RANK = TIER_NAMES.letterpress.length;

/** The themed completion-crown name for the active theme. */
export function crownName(theme: Theme): string {
  return CROWN_NAMES[theme];
}

/** The themed reveal-card kicker for the active theme. */
export function revealKicker(theme: Theme): string {
  return REVEAL_KICKERS[theme];
}

/** The themed source-word celebration for the active theme. */
export function sourceFoundMessage(theme: Theme): string {
  return SOURCE_FOUND_MESSAGES[theme];
}

/** The themed source-word celebration as the screen reader hears it. */
export function sourceFoundAnnouncement(theme: Theme, word: string): string {
  return SOURCE_FOUND_ANNOUNCEMENTS[theme](word);
}

/** The themed name for a rank index, clamped to the top name past the ladder. */
export function tierName(theme: Theme, index: number): string {
  const names = TIER_NAMES[theme];
  return names[index] ?? names[names.length - 1]!;
}
