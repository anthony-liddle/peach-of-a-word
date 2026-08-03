import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePatch } from '../../src/data/patch.ts';
import { assertBakedEquivalent, bakeLists, type ShippedLists } from './bake.ts';
import { PATCH_PATH } from './util.ts';

const base: ShippedLists = {
  enable: ['cat', 'dog', 'slur'],
  additions: ['blog', 'wart'],
  common: ['cat', 'rude'],
  beyond70: ['dog', 'slur'],
  beyond95: ['slur'],
};

const patch = parsePatch(
  [
    'app\tallow\tcommon',
    'blog\tallow\tcommon', // already in the additions complement
    'slur\tdeny\t',
    'wart\tdeny\t',
    'rude\tdemote\t',
  ].join('\n'),
);

describe('bakeLists', () => {
  const baked = bakeLists(base, patch);

  it('removes denied words from every list', () => {
    for (const list of Object.values(baked)) {
      expect(list).not.toContain('slur');
      expect(list).not.toContain('wart');
    }
  });

  it('adds an allowlisted word to validation and the common pool', () => {
    expect(baked.enable).toContain('app');
    expect(baked.common).toContain('app');
  });

  it('takes a demoted word out of common while leaving it valid', () => {
    expect(baked.common).not.toContain('rude');
    // Demotion is not denial: it never touched validation, so a word that was
    // only ever in the common pool stays exactly where the base list had it.
    expect(baked.common).not.toContain('slur');
  });

  it('keeps the complement pair listing each word exactly once', () => {
    // blog is allowlisted but already lives in the additions complement, so it
    // must not also be appended to enable. Both files ship, and the runtime
    // unions them, so a word in both would be listed twice.
    expect(baked.additions).toContain('blog');
    expect(baked.enable).not.toContain('blog');
    const both = baked.enable.filter((w) => baked.additions.includes(w));
    expect(both).toEqual([]);
  });

  it('leaves every list sorted, as the committed lists are', () => {
    for (const list of Object.values(baked)) {
      expect(list).toEqual([...list].sort());
    }
  });

  it('is idempotent, so re-running the bake is always safe', () => {
    expect(bakeLists(baked, patch)).toEqual(baked);
  });
});

describe('assertBakedEquivalent', () => {
  it('passes for a correct bake', () => {
    expect(() =>
      assertBakedEquivalent(base, patch, bakeLists(base, patch)),
    ).not.toThrow();
  });

  it('catches a bake that dropped a word it should have kept', () => {
    const baked = bakeLists(base, patch);
    const broken = {
      ...baked,
      common: baked.common.filter((w) => w !== 'cat'),
    };
    expect(() => assertBakedEquivalent(base, patch, broken)).toThrow(
      /changed the common pool/,
    );
  });

  it('catches a bake that kept a denied word', () => {
    const baked = bakeLists(base, patch);
    const broken = { ...baked, enable: [...baked.enable, 'slur'] };
    expect(() => assertBakedEquivalent(base, patch, broken)).toThrow(
      /changed the enable pool/,
    );
  });

  it('catches a word left in both halves of the complement pair', () => {
    const baked = bakeLists(base, patch);
    const broken = { ...baked, additions: [...baked.additions, 'cat'] };
    expect(() => assertBakedEquivalent(base, patch, broken)).toThrow(
      /exactly once/,
    );
  });

  it('never names a word, since these lists hold words players are spared', () => {
    const baked = bakeLists(base, patch);
    const broken = { ...baked, enable: [...baked.enable, 'slur'] };
    try {
      assertBakedEquivalent(base, patch, broken);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain('slur');
    }
  });
});

describe('the committed bake', () => {
  it('is already applied, so re-running data:bake would change nothing', () => {
    // The guard against a patch edit landing without the bake being run. If
    // someone adds a deny row and commits only the patch, the shipped lists
    // still hold the word and this fails.
    const committedPatch = parsePatch(readFileSync(PATCH_PATH, 'utf8'));
    const readList = (name: string) =>
      readFileSync(`public/data/${name}`, 'utf8')
        .split('\n')
        .map((w) => w.trim())
        .filter(Boolean);

    const shipped: ShippedLists = {
      enable: readList('enable.txt'),
      additions: readList('scowl95-additions.txt'),
      common: readList('common-pool.txt'),
      beyond70: readList('beyond-size-70.txt'),
      beyond95: readList('beyond-size-95.txt'),
    };

    expect(bakeLists(shipped, committedPatch)).toEqual(shipped);
  });
});
