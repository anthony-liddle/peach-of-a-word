import { describe, expect, it } from 'vitest';
import { MIN_SET_SIZE } from '../../src/engine/config.ts';
import { sourceSetSize } from '../../src/engine/eligibility.ts';
import { loadPatchedPools } from './pools.ts';

/**
 * The pools the calendar derives eligibility from, read from the committed
 * assets. Deriving through the engine's own createPuzzle, never reimplemented.
 */
const pools = await loadPatchedPools();
const setSize = (word: string) =>
  sourceSetSize(
    word,
    pools.dictionary,
    pools.commonPool,
    pools.beyond70Pool,
    pools.beyond95Pool,
  );

describe('loadPatchedPools', () => {
  it('counts the allowlist, so appalled clears the floor', () => {
    // The allowlist used to be subtracted here, to hold the derivation exactly
    // where it was while the patch moved to build time. That was an
    // implementation-level choice recorded in a comment, and the comment said
    // what it cost: it held back "two crowns nobody asked for". These are the
    // two, and they are ordinary clean base words that pass every other gate.
    // Both sat at 14 against a floor of 15, and the allowlist lifts each to
    // exactly 15, so the special case existed to hold back two words on a
    // technicality. Counting the allowlist retires the special case.
    // approach cleared it too, until crap left every basket in orchard
    // v1.10.0 and took it back to 14. It keeps its day; see demotion.test.ts.
    expect(setSize('appalled')).toBeGreaterThanOrEqual(MIN_SET_SIZE);
    expect(setSize('approach')).toBe(MIN_SET_SIZE - 1);
  });

  it('matches the runtime, which has always counted the allowlist', () => {
    // The divergence this closes: the runtime validates against the patched
    // lists, so a player could already find an allowlisted word in these racks
    // and have it counted. The build was the half that disagreed.
    expect(setSize('appalled')).toBe(15);
    expect(setSize('approach')).toBe(14);
  });
});
