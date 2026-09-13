/**
 * The two meta.json files must be byte-identical, and nothing asserted it.
 *
 * `public/data/meta.json` here and `Data/meta.json` in peach-of-a-word-swift
 * are one file kept in two places. `tools/update-lexicon.sh` says so twice, in
 * its own comments, and acts on it: it carries `sourcePool` and
 * `definitionsCovered` through untouched rather than recomputing them, and
 * declines to add a key, both on the stated grounds that the file "has to stay
 * byte-identical with the web's serialiseMeta output".
 *
 * No test held either repository to that, so both halves drifted, in opposite
 * directions and for different reasons.
 *
 *   definitionsCovered  24,596 here against 24,833 there. `pnpm data:rebundle`
 *                       owns this count and rewrote it when orchard v1.4.0's
 *                       392 denials shrank the bundles. The Swift copy carries
 *                       the value through, on the reasoning that "the stale
 *                       figure is the web's to move". The web moved it and the
 *                       Swift copy was never told.
 *
 *   trailing newline    present here, absent there. `serialiseMeta` is
 *                       documented as the one format authority and writes
 *                       `JSON.stringify(meta, null, 2)` and nothing after it,
 *                       and `update-lexicon.sh` matches it deliberately, with a
 *                       comment naming the reason. So the SWIFT copy was right
 *                       and this one was wrong. `scripts/refresh-bundles.ts`
 *                       wrote this file last and inlined the format with a
 *                       `\n` appended instead of calling `serialiseMeta`. That
 *                       is precisely the defect `scripts/lib/meta.ts` exists to
 *                       prevent, arriving through a third writer it was written
 *                       before.
 *
 * WHY THE TEST LIVES HERE, AND WHAT IT COMPARES AGAINST.
 *
 * It has to live in one repository, so it lives in the one that WRITES the
 * file. Both writers are here (`update-lexicon.ts` and `refresh-bundles.ts`);
 * the Swift side only ever receives a copy. That is also the direction the
 * observed drift ran: the web moved a count and the Swift copy did not follow.
 * A test in the Swift repository would have been comparing that repository
 * against a number only it believed.
 *
 * `scripts/data-raw/swift-meta.json` is a committed copy of the Swift
 * repository's `Data/meta.json`, as it stands there. It is duplication on
 * purpose: it makes "remember to update the other repository" into a red test
 * rather than a step in a runbook, which is the same move step 12 made for the
 * bundles. Update it in the same pull request that moves `public/data/meta.json`,
 * with the same bytes the Swift pull request writes.
 *
 * The fixture's own existence is asserted first, because a missing or empty
 * fixture would otherwise make this file pass by comparing nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serialiseMeta, type Meta } from '../../scripts/lib/meta.ts';

const WEB_META = join(process.cwd(), 'public', 'data', 'meta.json');
const SWIFT_COPY = join(
  process.cwd(),
  'scripts',
  'data-raw',
  'swift-meta.json',
);

const web = readFileSync(WEB_META, 'utf8');
const swift = readFileSync(SWIFT_COPY, 'utf8');

describe('the two meta.json copies agree', () => {
  it('has a fixture with something in it', () => {
    // Guards the whole file: an absent or emptied fixture must not read as
    // agreement. Two closing braces and a count key is the least this can be.
    expect(swift.length).toBeGreaterThan(200);
    expect(JSON.parse(swift).counts.definitionsCovered).toEqual(
      expect.any(Number),
    );
  });

  it('is byte-identical to the copy peach-of-a-word-swift ships', () => {
    expect(web).toBe(swift);
  });

  it('is exactly what serialiseMeta writes, with no trailing newline', () => {
    // The format authority, asserted against the file rather than trusted.
    // A writer that inlines JSON.stringify instead of calling serialiseMeta
    // fails here even when both copies happen to agree with each other.
    expect(web).toBe(serialiseMeta(JSON.parse(web) as Meta));
    expect(web.endsWith('\n')).toBe(false);
  });
});
