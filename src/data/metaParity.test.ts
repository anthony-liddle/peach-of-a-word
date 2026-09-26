/**
 * The attribution strings in the two games' meta.json files must agree.
 *
 * `public/data/meta.json` here and `Data/meta.json` in peach-of-a-word-swift
 * used to be held byte-identical, on the grounds that they were one file kept
 * in two places. They are not, and holding them to it cost a hand step every
 * release.
 *
 * WHAT THE TWO GENUINELY SHARE: the `attribution` strings, the credit each
 * game carries for ENABLE, SCOWL and Wiktionary. That is one fact about one
 * corpus, and a game that drifted from the other would be crediting its
 * sources differently, which is worth a red test. It is all this compares.
 *
 * WHAT THEY DO NOT: `counts.definitionsCovered` counts words carrying a gloss
 * in this game's per-rack bundles across the 793 source-pool racks. The Swift
 * app ships neither the bundles nor the source pool, reads nothing in
 * meta.json at runtime, and stopped shipping the field on 2026-09-26. Keeping
 * it byte-identical meant copying a web-only number into the app by hand at
 * every orchard release (v1.6.0, v1.7.0, v1.8.0), for a value the app never
 * read. `src/data/meta.test.ts` still asserts it here, against the bundles,
 * which is where it is true. The six list counts are asserted in each
 * repository against its own lists, by `meta.test.ts` here and by
 * `SmokeTests.metaJSONMatchesShippedLists` there.
 *
 * `scripts/data-raw/swift-meta.json` is a committed copy of the Swift
 * repository's `Data/meta.json`. Update it when the Swift attribution
 * strings change, with the bytes the Swift pull request writes.
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

type Attribution = Record<string, string>;
const webAttribution = (JSON.parse(web) as { attribution: Attribution })
  .attribution;
const swiftAttribution = (JSON.parse(swift) as { attribution: Attribution })
  .attribution;

describe('the two games credit their sources the same way', () => {
  it('has a fixture with attribution in it', () => {
    // Guards the whole file: an absent or emptied fixture, or one with no
    // attribution block, must not read as agreement.
    expect(Object.keys(swiftAttribution ?? {}).length).toBeGreaterThanOrEqual(
      3,
    );
    for (const value of Object.values(swiftAttribution)) {
      expect(value.length).toBeGreaterThan(10);
    }
  });

  it('carries the same attribution strings as peach-of-a-word-swift', () => {
    expect(swiftAttribution).toEqual(webAttribution);
  });

  it('is exactly what serialiseMeta writes, with no trailing newline', () => {
    // The format authority for this repository's file, asserted against the
    // file rather than trusted. A writer that inlines JSON.stringify instead
    // of calling serialiseMeta fails here.
    expect(web).toBe(serialiseMeta(JSON.parse(web) as Meta));
    expect(web.endsWith('\n')).toBe(false);
  });
});
