/**
 * The pipeline and the engine each carry their own copy of two game rules, and
 * this asserts the copies agree.
 *
 * Why there are two copies at all. `lib/formable.ts` says it plainly: "kept
 * local so the scripts have no dependency on the app's module graph." The
 * pipeline needs MIN_WORD_LENGTH to build the lists and the engine needs it to
 * play, and the dictionary half of the pipeline is being untangled from src/ so
 * it can be lifted into its own repository. Importing the engine's copy would
 * re-couple exactly what that work separated.
 *
 * So the duplication is deliberate and load-bearing, which is different from the
 * duplication this project keeps finding and fixing. The distinction that
 * matters is not "one copy good, two copies bad", it is whether anything checks.
 * An unchecked second copy drifts silently; a checked one cannot. This is the
 * check.
 *
 * A test is the only place the two may be imported together. Nothing shipped and
 * nothing in the pipeline may import across this line.
 *
 * If these ever legitimately diverge, do not delete this test. Change it to
 * assert the new relationship and say why, because a silent divergence is the
 * thing being prevented.
 */
import { describe, expect, it } from 'vitest';
import * as engine from '@/engine/config.ts';
import * as pipeline from './curation-config.ts';

describe('the pipeline and the engine agree about the shared game rules', () => {
  it('agrees on the minimum playable word length', () => {
    expect(pipeline.MIN_WORD_LENGTH).toBe(engine.MIN_WORD_LENGTH);
  });

  it('agrees on the source word length', () => {
    expect(pipeline.SOURCE_WORD_LENGTH).toBe(engine.SOURCE_WORD_LENGTH);
  });

  it('pins the values themselves, so a matched drift still fails', () => {
    // Equality alone would pass if both sides moved together, which is a real
    // possibility when someone edits "the constant" by search and replace. The
    // literals are the second opinion: changing the rule has to come here too,
    // deliberately, rather than sailing through on a coincidence of symmetry.
    expect(engine.MIN_WORD_LENGTH).toBe(3);
    expect(engine.SOURCE_WORD_LENGTH).toBe(8);
  });
});
