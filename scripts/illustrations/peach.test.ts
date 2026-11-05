import { describe, expect, it } from 'vitest';
import { GROWTH_STAGES } from '@/storeArt/growthStages.ts';
import { PEACH_BODY, PEACH_FACE } from '@/ui/peachArt.ts';
import { circlePath, formatPath, parsePath } from './pathData.ts';

/**
 * The web draws its peach from peachArt.ts, in relative path data and
 * circles, as the favicon has it. iOS draws the growing peach's Perfectly
 * Peachy stage, which both apps pin by hash, and the costumes that follow the
 * peach draw that stage's outlines. This holds the web's own peach to the same
 * stage, part for part, so the two can't drift apart unseen.
 */
describe('the web’s peach', () => {
  it('is the shared table’s Perfectly Peachy, part for part and paint for paint', () => {
    const table = GROWTH_STAGES.find((s) => s.id === 'perfectly-peachy')!.parts;
    const web = [...PEACH_BODY, ...PEACH_FACE];
    expect(web).toHaveLength(table.length);
    web.forEach((p, i) => {
      const t = table[i]!;
      const d = p.circle
        ? formatPath(circlePath(...p.circle))
        : formatPath(parsePath(p.d!));
      expect(d, `part ${i}'s outline`).toBe(t.d);
      expect(
        {
          fill: p.fill,
          opacity: p.opacity,
          stroke: p.stroke,
          width: p.strokeWidth,
        },
        `part ${i}'s paint`,
      ).toEqual({
        fill: t.fill,
        opacity: t.opacity,
        stroke: t.stroke,
        width: t.strokeWidth,
      });
      // The face is the web's PEACH_FACE, and the table's face-only parts.
      expect(!!t.faceOnly, `part ${i}'s face`).toBe(i >= PEACH_BODY.length);
    });
  });
});
