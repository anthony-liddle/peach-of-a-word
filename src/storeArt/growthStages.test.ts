import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GROWTH_STAGES, bounds, canonicalGrowthTable } from './growthStages.ts';

/** The iOS app's `GrowthStageTests.tableSHA256`. */
const GROWTH_TABLE_SHA256 =
  '4ec330c3fd5adf0d79a06be20e67fa2acfae5ba620d1bd7e61acb4221108ee1d';

describe('the growth stages', () => {
  it('are the table the iOS app pins', () => {
    const hash = createHash('sha256')
      .update(canonicalGrowthTable())
      .digest('hex');
    expect(hash).toBe(GROWTH_TABLE_SHA256);
  });

  it('run from the first sprout to the crown', () => {
    expect(GROWTH_STAGES.map((s) => s.id)).toEqual([
      'first-sprout',
      'little-bud',
      'blossom',
      'ripening',
      'sweet',
      'perfectly-peachy',
      'crown',
    ]);
  });

  it("measure the peach to its leaf's tip and its body's foot", () => {
    // PeachMark's body spans 16 to 84 across and 16 to 90 down, and its leaf
    // reaches up to 3.
    const peach = GROWTH_STAGES.find((s) => s.id === 'perfectly-peachy')!;
    expect(bounds(peach.parts)).toEqual({ x: 16, y: 3, w: 68, h: 87 });
  });
});
