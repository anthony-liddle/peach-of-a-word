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
 * word lands. Letterpress names the find plainly. Cute makes the game's own
 * joke: "a peach of a" is an old phrase for a fine example of a thing, which is
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

/**
 * The cute theme's container noun. Six strings below are built from it, so
 * swapping basket for crate (Bea's suggestion) is this one line. Basket reads
 * hand-picked; crate reads like a harvest haul. Whichever it is, it has to be
 * the same word in all six places, which is why none of them spell it out.
 */
const BASKET = 'basket';
const BASKET_CAP = BASKET[0]!.toUpperCase() + BASKET.slice(1);

/**
 * The cute glossary heading. Its own value because it is the least settled
 * change in the vocabulary pass: a glossary is a word list, which fits either
 * theme, and this is the app's most visible heading. Reverting is this line.
 */
const CUTE_GLOSSARY_TITLE = `The ${BASKET}`;

/**
 * The vocabulary each theme speaks. Letterpress sets type taken from a case;
 * cute picks peaches into a basket, completing the growth arc its tier names
 * already start (sprout, bud, blossom, ripening, sweet).
 *
 * Everything here is a label, resolved in the view, so a theme switch re-skins
 * it live. Nothing here may be resolved in the reducer: a string settled at find
 * time is frozen in the theme that was on screen then. That is the lesson of
 * PR #76, and it is why the find feedback is a function of the word rather than
 * a finished sentence.
 *
 * Strings that carry no metaphor stay shared and are deliberately absent:
 * SHUFFLE, CLEAR, DAILY, ENDLESS, Streak, Key, the rarity rung names, the
 * rejection messages, and the rest. Skinning those would double the surface to
 * maintain for nothing.
 */
export interface ThemeCopy {
  /** Under the masthead: what you do here. */
  readonly mastheadSubline: string;
  /** The submit control. Uppercased by CSS, so it is sentence case here. */
  readonly submitWord: string;
  /** The composing stick before a letter is picked. */
  readonly inputPlaceholder: string;
  /** The glossary with no finds in it yet. The metaphor inverts: see below. */
  readonly emptyGlossary: string;
  /** The glossary heading. */
  readonly glossaryTitle: string;
  /** The reveal card's way back to the board. */
  readonly revealClose: string;
  /** Bar legend, the points from words in the day's set. */
  readonly onPageLabel: string;
  /** Bar legend, the points from words beyond it. */
  readonly offPageLabel: string;
  /** Key entry for the on-page mark. */
  readonly keyOnPage: string;
  /** Shown in place of the next rank once the ladder is topped out. */
  readonly ladderPeak: string;
  /** Footer type credit. The typefaces differ per theme as well as the verb. */
  readonly typeCredit: string;
  /** The completion card's one line. */
  readonly completionLine: string;
  /** Visible feedback for a find inside the set. */
  readonly setFind: (word: string) => string;
}

export const THEME_COPY: Record<Theme, ThemeCopy> = {
  letterpress: {
    mastheadSubline: 'Set the type',
    submitWord: 'Set word',
    inputPlaceholder: 'Set letters to make a word',
    // A full case means none of the type has been set yet: it is all still in
    // its compartments. Cute mirrors this rather than translating it.
    emptyGlossary: 'No words set yet. The case is full.',
    glossaryTitle: 'The glossary',
    revealClose: 'Back to the case',
    onPageLabel: 'Set',
    offPageLabel: 'Off-page',
    keyOnPage: 'in the set',
    ladderPeak: 'Top rank. The full set is the peak.',
    typeCredit: 'Set in Fraunces and Spectral.',
    completionLine: 'Every common word the rack can spell, found.',
    setFind: (word) => `${word}, in the set.`,
  },
  cute: {
    mastheadSubline: 'Pick the peaches',
    submitWord: 'Pick word',
    inputPlaceholder: 'Pick letters to make a word',
    // Mirrored, not translated: fruit leaves the tree and goes into the basket,
    // so an empty basket is the state a full case describes.
    emptyGlossary: `No words picked yet. The ${BASKET} is empty.`,
    glossaryTitle: CUTE_GLOSSARY_TITLE,
    revealClose: `Back to the ${BASKET}`,
    onPageLabel: BASKET_CAP,
    // Words growing outside the cultivated set. The least literal substitution
    // in the pass, and the one most worth a second opinion.
    offPageLabel: 'Wild',
    keyOnPage: `in the ${BASKET}`,
    ladderPeak: `Top rank. The full ${BASKET} is the peak.`,
    typeCredit: 'Written in Fredoka and Nunito.',
    completionLine: 'Every common word these letters can grow, picked.',
    setFind: (word) => `${word}, in the ${BASKET}.`,
  },
};

/** The active theme's vocabulary. */
export function copy(theme: Theme): ThemeCopy {
  return THEME_COPY[theme];
}

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
