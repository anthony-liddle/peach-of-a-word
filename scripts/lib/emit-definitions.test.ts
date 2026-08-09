import { describe, expect, it } from 'vitest';
import {
  assertNoDeniedGlosses,
  bundleStats,
  buildBundles,
  coverage,
  shardProjection,
} from './emit-definitions.ts';

const enable = ['ace', 'cab', 'bead', 'deed'];
const defs = new Map([
  ['ace', 'a single pip'],
  ['cab', 'a taxi'],
  ['bead', 'a small ball'],
  // "deed" intentionally has no definition.
]);

describe('buildBundles', () => {
  it('puts each formable defined word in every rack that can form it', () => {
    const bundles = buildBundles(['abcdef', 'abdeed'], enable, defs);
    // rack "abcdef": a,b,c,d,e,f (one each) -> ace, cab, bead all formable; deed needs 2d+2e, no.
    // bead = b,e,a,d - all present. Brief comment was wrong; corrected here.
    expect(bundles.get('abcdef')).toEqual({
      ace: 'a single pip',
      cab: 'a taxi',
      bead: 'a small ball',
    });
    // rack "abdeed": a:1,b:1,d:2,e:2 -> bead formable, deed formable but no def.
    expect(bundles.get('abdeed')).toEqual({ bead: 'a small ball' });
  });

  it('omits words that have no definition', () => {
    const bundles = buildBundles(['deed'], enable, defs);
    expect(bundles.get('deed')).toEqual({});
  });
});

describe('assertNoDeniedGlosses', () => {
  const bundlesOf = (
    ...entries: [string, Record<string, string>][]
  ): Map<string, Record<string, string>> => new Map(entries);

  it('passes when a bundle carries only words the denylist leaves alone', () => {
    // The shape a correct bake produces: the denied word is absent from the
    // boundary buildBundles was handed, so it never reached a bundle.
    const boundary = enable.filter((w) => w !== 'cab');
    const bundles = buildBundles(['abcdef'], boundary, defs);
    expect(() => assertNoDeniedGlosses(bundles, ['cab'])).not.toThrow();
  });

  it('throws when a bundle carries a gloss for a denied word', () => {
    const bundles = buildBundles(['abcdef'], enable, defs);
    expect(() => assertNoDeniedGlosses(bundles, ['cab'])).toThrow(
      /1 denied gloss across 1 bundle/,
    );
  });

  it('counts every occurrence across every bundle', () => {
    const bundles = bundlesOf(
      ['one', { cab: 'a taxi', ace: 'a single pip' }],
      ['two', { cab: 'a taxi' }],
      ['three', { ace: 'a single pip' }],
    );
    expect(() => assertNoDeniedGlosses(bundles, ['cab', 'ace'])).toThrow(
      /4 denied glosses across 3 bundles/,
    );
  });

  it('names the racks but never the words', () => {
    // These are words a player is protected from. A build log is not the place
    // to reprint them, so the message carries counts and racks only.
    const bundles = bundlesOf(['one', { cab: 'a taxi' }]);
    let message = '';
    try {
      assertNoDeniedGlosses(bundles, ['cab']);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('one');
    expect(message).not.toContain('cab');
  });
});

describe('coverage', () => {
  it('counts union words that have a definition', () => {
    expect(coverage(['ace', 'cab', 'deed'], defs)).toEqual({
      union: 3,
      defined: 2,
      percent: 67,
    });
  });
});

describe('bundleStats and shardProjection', () => {
  it('reports combined, average, and max bundle byte sizes', () => {
    const bundles = new Map<string, Record<string, string>>([
      ['x', { ace: 'a single pip' }],
      ['y', { cab: 'a taxi' }],
    ]);
    const stats = bundleStats(bundles);
    expect(stats.count).toBe(2);
    expect(stats.combined).toBeGreaterThan(0);
    expect(stats.max).toBeGreaterThanOrEqual(stats.average);
  });

  it('projects per-first-letter shard sizes', () => {
    const shards = shardProjection(defs);
    expect(Object.keys(shards.perShard).sort()).toEqual(['a', 'b', 'c']);
    expect(shards.combined).toBeGreaterThan(0);
  });
});
