import { describe, expect, it } from 'vitest';
import {
  CROWN_RANK,
  TIER_NAMES,
  crownName,
  revealKicker,
  sourceFoundAnnouncement,
  sourceFoundMessage,
  tierName,
} from './tierNames.ts';

describe('theme-skinned tier names', () => {
  it('shows the letterpress name on classic and the cute name on cute, same rung', () => {
    expect(tierName('letterpress', 0)).toBe('Blank Page');
    expect(tierName('cute', 0)).toBe('First Sprout');
    expect(tierName('letterpress', 5)).toBe('Fine Press');
    expect(tierName('cute', 5)).toBe('Perfectly Peachy');
  });

  it('has exactly six named ranks per theme, the ladder structure', () => {
    expect(TIER_NAMES.letterpress).toHaveLength(6);
    expect(TIER_NAMES.cute).toHaveLength(6);
  });

  it('skins the completion crown above the six named ranks', () => {
    expect(crownName('letterpress')).toBe('The Complete Works');
    expect(crownName('cute')).toBe('Peachy Keen Supreme');
    // The crown sits one rung above the top named rank (index 5).
    expect(CROWN_RANK).toBe(6);
  });
});

describe('theme-skinned source-word celebration', () => {
  it('names the peach in cute and leaves the classic wording untouched', () => {
    // Pinned verbatim: classic must never drift, cute makes the game's own joke.
    expect(sourceFoundMessage('letterpress')).toBe(
      'You found the source word.',
    );
    expect(sourceFoundMessage('cute')).toBe('You found the Peach of a Word!');
  });

  it('announces the find in the framing the screen shows, and names the word', () => {
    expect(sourceFoundAnnouncement('letterpress', 'serenade')).toBe(
      'Source word found: serenade.',
    );
    expect(sourceFoundAnnouncement('cute', 'serenade')).toBe(
      'You found the Peach of a Word: serenade.',
    );
  });

  it('closes the announcement so the rank and completion cues can follow', () => {
    // The live region appends " New rank." or the completion line to this base,
    // so every skin has to end in a full stop or the two cues would run together.
    expect(sourceFoundAnnouncement('letterpress', 'serenade')).toMatch(/\.$/);
    expect(sourceFoundAnnouncement('cute', 'serenade')).toMatch(/\.$/);
  });
});

describe('theme-skinned reveal kicker', () => {
  it('grows the peach in cute and leaves the letterpress line untouched', () => {
    // Classic is pinned verbatim. Cute stops borrowing the metal-type metaphor
    // and says the same thing about the rack in its own register.
    expect(revealKicker('letterpress')).toBe('The word the type was cut for');
    expect(revealKicker('cute')).toBe('The peach every word grew from');
  });

  it('keeps the kicker a kicker: no closing punctuation in either skin', () => {
    // It sits above the word as a label, not a sentence, and the stylesheet
    // sets it in spaced small caps where a full stop would read as a speck.
    expect(revealKicker('letterpress')).not.toMatch(/[.!?]$/);
    expect(revealKicker('cute')).not.toMatch(/[.!?]$/);
  });
});
