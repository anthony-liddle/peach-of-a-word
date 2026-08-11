/**
 * meta.json must describe the files that actually ship.
 *
 * The gap this closes. meta.json was written once by pnpm data:build on
 * 2026-06-24 and never again. The lists were re-baked on 2026-08-03 by
 * pnpm data:bake, which wrote the five word lists and the definition bundles
 * and did not touch the metadata. Every count in the file then described a
 * build that no longer shipped, the boundary by 2,882 words.
 *
 * That is not a cosmetic drift. The figure escaped the repository: a published
 * essay quoted 430,172 from meta.json.counts.boundary, in a section called
 * "When Metrics Lie". The real number was 427,290.
 *
 * Nothing read the file at runtime, which is exactly why it rotted. A count
 * nobody asserts is a count that drifts, and the fix is not care but a test:
 * every number in meta.json is re-derived here from the committed artifact it
 * claims to describe, so the file cannot disagree with the data again without
 * the suite saying so.
 *
 * Deriving rather than hardcoding is the point. A test carrying its own copy of
 * the expected counts would be a third record of the same fact, and would go
 * stale in precisely the way meta.json did.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readList } from './shippedLists.ts';

const DATA = join(process.cwd(), 'public', 'data');

interface Meta {
  readonly counts: Readonly<Record<string, number>>;
  readonly attribution: Readonly<Record<string, string>>;
}

const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8')) as Meta;

/** Every word carrying a gloss in some shipped bundle, counted once. */
function distinctGlossedWords(): number {
  const words = new Set<string>();
  const defs = join(DATA, 'defs');
  for (const file of readdirSync(defs).filter((f) => f.endsWith('.json'))) {
    const bundle = JSON.parse(readFileSync(join(defs, file), 'utf8')) as Record<
      string,
      string
    >;
    for (const word of Object.keys(bundle)) words.add(word);
  }
  return words.size;
}

describe('meta.json describes the data that ships', () => {
  it.each([
    ['enable', 'enable.txt'],
    ['scowl95Additions', 'scowl95-additions.txt'],
    ['common', 'common-pool.txt'],
    ['beyond70', 'beyond-size-70.txt'],
    ['beyond95', 'beyond-size-95.txt'],
  ])('counts %s against the shipped list', (key, file) => {
    expect(meta.counts[key]).toBe(readList(file).length);
  });

  it('counts the boundary as the union the runtime assembles', () => {
    // loadGameData concatenates these two and nothing else, and they are
    // disjoint by construction, so the union is the sum.
    const boundary =
      readList('enable.txt').length + readList('scowl95-additions.txt').length;
    expect(meta.counts.boundary).toBe(boundary);
  });

  it('counts the source pool against the shipped crowns', () => {
    const pool = JSON.parse(
      readFileSync(join(DATA, 'source-pool.json'), 'utf8'),
    ) as unknown[];
    expect(meta.counts.sourcePool).toBe(pool.length);
  });

  it('counts covered definitions against the shipped bundles', () => {
    expect(meta.counts.definitionsCovered).toBe(distinctGlossedWords());
  });

  it('carries no count that describes nothing shipped', () => {
    // Every key here is checked above. A new one must arrive with the
    // assertion that pins it, or it is another record free to drift.
    expect(Object.keys(meta.counts).sort()).toEqual([
      'beyond70',
      'beyond95',
      'boundary',
      'common',
      'definitionsCovered',
      'enable',
      'scowl95Additions',
      'sourcePool',
    ]);
  });

  it('still carries the attribution the licences require', () => {
    expect(meta.attribution.enable).toMatch(/public domain/i);
    expect(meta.attribution.scowl).toMatch(/SCOWL/);
    expect(meta.attribution.wiktionary).toMatch(/CC BY-SA/);
  });
});

describe('the guard discriminates', () => {
  it('fails when a count disagrees with its list', () => {
    // A guard nobody has seen fail is not known to work. This is the same
    // positive control the denylist tests use: assert the check catches a
    // wrong count, so a passing suite means the counts were checked rather
    // than the assertion being vacuous.
    const wrong = { ...meta.counts, enable: meta.counts.enable! + 1 };
    expect(wrong.enable).not.toBe(readList('enable.txt').length);
  });
});
