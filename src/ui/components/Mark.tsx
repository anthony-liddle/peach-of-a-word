import type { CostumeId } from '../costumes.ts';
import type { LadderRung } from '../rarity.ts';
import { SourcePeach } from './PeachMark.tsx';

/** What a mark stands for: the source word, the set, or a rarity rung. */
export type MarkCategory = 'source' | 'set' | LadderRung;

/**
 * A word's mark. The stylesheet draws every mark, the source word's peach
 * included, except on a board where the peach wears a costume: that one is
 * drawn here, the source mark's own peach with the costume on it.
 *
 * Its own module since the well's line leads with one too, so the found list
 * and the well draw the same mark rather than two that could drift.
 */
export function Mark({
  category,
  costume,
  glint = null,
}: {
  category: MarkCategory;
  costume: CostumeId | null;
  /** The glint's count, when this mark glints: a new count is a new sweep. */
  glint?: number | null;
}) {
  if (category === 'source' && costume) {
    return <SourcePeach className="mark mark--source-worn" costume={costume} />;
  }
  return (
    <span className={`mark mark--${category}`} aria-hidden="true">
      {glint !== null && <span key={glint} className="mark__glint" />}
    </span>
  );
}
