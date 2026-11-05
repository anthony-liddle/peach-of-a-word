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

  it("measure a drawing to its leaf's tip, its body's foot and half a stroke", () => {
    // The peach's leaf and body as drawn on 24 October 2026, as a fixture: the
    // body spans 16 to 84 across and 16 to 90 down, and the leaf reaches up
    // to 3. A fixture, so an edit to the peach in Inkscape leaves it be.
    const peach = [
      { d: 'M50 12 C54 4 64 3 68 8 C66 14 59 17 54 16 Z' },
      {
        d: 'M50 16 C70 16 84 32 84 52 C84 74 68 90 50 90 C32 90 16 74 16 52 C16 32 30 16 50 16 Z',
      },
    ];
    expect(bounds(peach)).toEqual({ x: 16, y: 3, w: 68, h: 87 });
    const line = { d: 'M10 10 L20 10', stroke: '#7A4A33', strokeWidth: 4 };
    expect(bounds([line])).toEqual({ x: 8, y: 8, w: 14, h: 4 });
  });
});
