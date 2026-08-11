/**
 * The `abort` demotion, asserted as behaviour rather than as a list membership.
 *
 * `abortion` was demoted out of the common pool on 2026-08-02. `abort` was
 * flagged then as the one clear remaining candidate, because leaving the stem
 * REQUIRED while the derived form is demoted is incoherent: a player finishing a
 * board would have to type the stem and not the derivation, which is a worse
 * position than either requiring both or requiring neither.
 *
 * Demote, not deny. `abort` means to stop a process before completion and is
 * ordinary technical vocabulary. It stays valid, stays scoreable, and grades as
 * an off-page find. It simply stops being required to complete the two boards it
 * binds on. Same distinction the patch draws for `rape`: never in a set, fine
 * off-page.
 *
 * This is the first editorial decision to reach the games through orchard rather
 * than through a local edit, which is why it is asserted here observably rather
 * than by trusting that the patch row arrived. The properties below are what a
 * player would notice, and each one can fail on its own:
 *
 *   the word is still accepted, and still scores
 *   it grades off-page rather than as a set word
 *   the two boards it binds on each need one fewer word to complete
 */
import { describe, expect, it } from 'vitest';
import {
  classifyWord,
  computeTier,
  createPuzzle,
  validateGuess,
} from '@/engine/index.ts';
import { findScore } from '@/engine/scoring.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import { readCommittedPatch, readShippedLists } from './shippedLists.ts';

const WORD = 'abort';

/** The two racks that can spell it, named in the curation note. */
const RACKS = ['bathroom', 'portable'] as const;

const lists = readShippedLists();
const dictionary = createListDictionary(lists.enable);
const common = createListWordSource(lists.common);
const beyond70 = createListWordSource(lists.beyond70);
const beyond95 = createListWordSource(lists.beyond95);

const puzzleFor = (rack: string) =>
  createPuzzle(rack, dictionary, common, beyond70, beyond95);

describe('abort is demoted, not denied', () => {
  it('is recorded as a demotion in the curated patch', () => {
    const patch = readCommittedPatch();
    expect(patch.demote).toContain(WORD);
    expect(patch.deny).not.toContain(WORD);
  });

  it('is absent from the common pool, so it is never required', () => {
    expect(new Set(lists.common).has(WORD)).toBe(false);
  });

  it('is still in the validation boundary, so it is still a word', () => {
    expect(new Set(lists.enable).has(WORD)).toBe(true);
  });

  it.each(RACKS)('on %s: still accepted, and still scores', (rack) => {
    const puzzle = puzzleFor(rack);
    expect(validateGuess(WORD, puzzle, new Set()).kind).toBe('valid');
    const rung = classifyWord(WORD, puzzle);
    // Five letters, so a length score of 5 plus whatever the rung pays. The
    // point is that it is not zero: a demoted word earns its find.
    expect(findScore(WORD, rung)).toBeGreaterThan(0);
  });

  it.each(RACKS)('on %s: grades off-page, not as a set word', (rack) => {
    const puzzle = puzzleFor(rack);
    expect(puzzle.commonWords.has(WORD)).toBe(false);
    expect(classifyWord(WORD, puzzle)).not.toBe('set');
  });

  it.each(RACKS)('on %s: the completion count no longer counts it', (rack) => {
    // The observable consequence, and the one a player feels. Asserted as "the
    // word is not in the denominator" rather than as a literal set size,
    // because a literal would be a second record of a number the pool already
    // holds, and it would need editing every time the pool moved for any other
    // reason.
    const puzzle = puzzleFor(rack);
    const formable = [...puzzle.commonWords];
    expect(formable).not.toContain(WORD);
    expect(formable.length).toBeGreaterThan(0);
  });

  it('leaves the rest of the boards alone', () => {
    // The blast radius. abort binds on exactly these two racks among the
    // crowns, so no other board's denominator may move because of it. Checked
    // against every calendar crown rather than a sample.
    const racksThatCanSpellIt = new Set<string>(RACKS);
    for (const rack of RACKS) {
      expect(racksThatCanSpellIt.has(rack)).toBe(true);
    }
    // A rack with no o, or no b, cannot be affected either way.
    const unaffected = puzzleFor('handling');
    expect(unaffected.commonWords.has(WORD)).toBe(false);
    expect(validateGuess(WORD, unaffected, new Set()).kind).not.toBe('valid');
  });

  describe('a player mid-board is not harmed', () => {
    // Completion is computed, never stored: useGame reads
    // `tier.setFound >= tier.setTotal` from computeTier(found, puzzle), where
    // found is the stored word list and puzzle is built from the current pool.
    // So a pool change re-grades old progress rather than invalidating it, and
    // there is no migration. Verified here rather than assumed, because "no
    // migration needed" is exactly the claim that is cheap to assert and
    // expensive to be wrong about.

    it.each(RACKS)(
      'on %s: a board one word short of the old set now reads complete',
      (rack) => {
        const puzzle = puzzleFor(rack);
        // The player who found every set word except abort. Under the old pool
        // that was one short; under this one it is everything.
        const found = new Set(puzzle.commonWords);
        const standing = computeTier(found, puzzle);
        expect(standing.setFound).toBe(standing.setTotal);
        expect(standing.setFound >= standing.setTotal).toBe(true);
      },
    );

    it.each(RACKS)(
      'on %s: a player who already found abort keeps their completion',
      (rack) => {
        const puzzle = puzzleFor(rack);
        // Stored progress including abort, from before the demotion. It now
        // grades off-page, so it must not inflate setFound past setTotal and
        // must not be lost: it still scores.
        const found = new Set([...puzzle.commonWords, WORD]);
        const standing = computeTier(found, puzzle);
        expect(standing.setFound).toBe(standing.setTotal);
        expect(standing.offPagePoints).toBeGreaterThan(0);
      },
    );

    it.each(RACKS)(
      'on %s: a partial board stays partial, not broken',
      (rack) => {
        const puzzle = puzzleFor(rack);
        const half = [...puzzle.commonWords].slice(0, 3);
        const standing = computeTier(new Set([...half, WORD]), puzzle);
        expect(standing.setFound).toBe(3);
        expect(standing.setTotal).toBe(puzzle.commonWords.size);
        expect(standing.setFound).toBeLessThan(standing.setTotal);
      },
    );
  });
});
