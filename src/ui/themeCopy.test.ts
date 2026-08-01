import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CROWN_RANK,
  TIER_NAMES,
  crownName,
  revealKicker,
  sourceFoundAnnouncement,
  sourceFoundMessage,
  tierName,
  copy,
} from './themeCopy.ts';

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
    // Letterpress is pinned verbatim. Cute stops borrowing the metal-type
    // metaphor and says the same thing about the rack in its own register.
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

/**
 * The vocabulary skin. Letterpress sets type out of a case; cute picks peaches
 * into a basket. Every pair below is asserted in both directions, and the
 * letterpress side is asserted against its exact shipped wording, so a future
 * edit to the cute side cannot drift the letterpress one with it.
 */
describe('theme-skinned vocabulary', () => {
  const lp = copy('letterpress');
  const cute = copy('cute');

  it('keeps every letterpress string byte-identical to what shipped', () => {
    expect(lp.mastheadSubline).toBe('Set the type');
    expect(lp.submitWord).toBe('Set word');
    expect(lp.inputPlaceholder).toBe('Set letters to make a word');
    expect(lp.emptyGlossary).toBe('No words set yet. The case is full.');
    expect(lp.glossaryTitle).toBe('The glossary');
    expect(lp.revealClose).toBe('Back to the case');
    expect(lp.onPageLabel).toBe('Set');
    expect(lp.offPageLabel).toBe('Off-page');
    expect(lp.keyOnPage).toBe('in the set');
    expect(lp.ladderPeak).toBe('Top rank. The full set is the peak.');
    expect(lp.typeCredit).toBe('Set in Fraunces and Spectral.');
    expect(lp.completionLine).toBe(
      'Every common word the rack can spell, found.',
    );
    expect(lp.setFind('sea')).toBe('sea, in the set.');
    expect(lp.loadingLine).toBe('Setting the type.');
  });

  it('gives cute its own vocabulary for the same fourteen strings', () => {
    expect(cute.mastheadSubline).toBe('Pick the peaches');
    expect(cute.submitWord).toBe('Pick word');
    expect(cute.inputPlaceholder).toBe('Pick letters to make a word');
    expect(cute.emptyGlossary).toBe(
      'No words picked yet. The basket is empty.',
    );
    expect(cute.glossaryTitle).toBe('The basket');
    expect(cute.revealClose).toBe('Back to the basket');
    expect(cute.onPageLabel).toBe('Basket');
    expect(cute.offPageLabel).toBe('Wild');
    expect(cute.keyOnPage).toBe('in the basket');
    expect(cute.ladderPeak).toBe('Top rank. The full basket is the peak.');
    expect(cute.typeCredit).toBe('Written in Fredoka and Nunito.');
    expect(cute.completionLine).toBe(
      'Every common word these letters can grow, picked.',
    );
    expect(cute.setFind('sea')).toBe('sea, in the basket.');
    expect(cute.loadingLine).toBe('Picking the peaches.');
  });

  it('pairs the loading line with the masthead subline in both themes', () => {
    // The first line the app ever shows is the subline in the continuous
    // present. Both skins have to move together or the app opens in one
    // vocabulary and settles into another a moment later.
    expect(lp.mastheadSubline).toBe('Set the type');
    expect(lp.loadingLine).toBe('Setting the type.');
    expect(cute.mastheadSubline).toBe('Pick the peaches');
    expect(cute.loadingLine).toBe('Picking the peaches.');
  });

  it('does not translate the empty state literally, because the metaphor inverts', () => {
    // A full case means no type has been set yet; a full basket would mean the
    // opposite. Same idea, mirrored, so cute reads empty where letterpress
    // reads full.
    expect(lp.emptyGlossary).toMatch(/case is full/);
    expect(cute.emptyGlossary).toMatch(/basket is empty/);
    expect(cute.emptyGlossary).not.toMatch(/full/);
  });

  it('spells the container noun one way everywhere it appears', () => {
    // Six strings share it, so swapping basket for crate has to be one edit.
    const noun = cute.onPageLabel.toLowerCase();
    const carriers = [
      cute.emptyGlossary,
      cute.glossaryTitle,
      cute.revealClose,
      cute.keyOnPage,
      cute.ladderPeak,
      cute.setFind('sea'),
    ];
    for (const s of carriers) expect(s.toLowerCase()).toContain(noun);
    expect(carriers).toHaveLength(6);
  });
});

/**
 * The skin has to live in one place. A string spelled out in a component would
 * render the same under both themes and no per-theme test would catch it, so
 * this reads the source and asserts absence at the point it could go wrong.
 */
describe('the vocabulary lives only in the copy module', () => {
  const uiDir = resolve(process.cwd(), 'src/ui');
  const sources = readdirSync(uiDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
    .filter((f) => f !== 'themeCopy.ts')
    .map((f) => ({ file: f, text: readFileSync(resolve(uiDir, f), 'utf8') }));

  // The distinctive half of each pair. Short shared words ("Set", "Wild") are
  // omitted: they appear in class names and comments and would only add noise.
  const literals = [
    'Set the type',
    'Pick the peaches',
    'Set letters to make a word',
    'Pick letters to make a word',
    'No words set yet',
    'No words picked yet',
    'Back to the case',
    'Back to the basket',
    'The glossary',
    'in the set.',
    'in the basket.',
    'is the peak.',
    'Set in Fraunces',
    'Written in Fredoka',
    'can spell, found.',
    'can grow, picked.',
  ];

  it('finds none of the skinned strings spelled out in a component', () => {
    const offenders = sources.flatMap(({ file, text }) =>
      literals.filter((l) => text.includes(l)).map((l) => `${file}: ${l}`),
    );
    expect(offenders).toEqual([]);
  });

  it('scanned the real sources, so an empty result means something', () => {
    // Guards the test above against a bad glob quietly passing on zero files.
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.map((s) => s.file)).toContain('Game.tsx');
  });
});
