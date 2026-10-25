import type { CostumeId } from '../costumes.ts';
import type { Theme } from '../useTheme.ts';
import { crownName, copy, ornament } from '../themeCopy.ts';
import { CompletionOrnament, SaysWhatThePeachWears } from './PeachMark.tsx';

interface Props {
  theme: Theme;
  /** What the peach is wearing on this board, if anything. See costumes.ts. */
  costume?: CostumeId | null;
  onClose: () => void;
}

/**
 * The completion peak: finding every common word the rack can spell. A sibling
 * to the source-word reveal, but ornamental rather than a definition, and in
 * ink and oxblood (letterpress) or composed with the confetti burst (cute). The
 * title is the theme-skinned crown. Non-blocking on purpose: no backdrop, no
 * focus trap, so play continues. The screen-reader announcement is carried by
 * the live region in Game.
 *
 * The ornament is theme-skinned too: the printer's fleuron on letterpress, the
 * peach mark on cute, with the iPhone's drawn crown on its head. Decorative in
 * both, so the card's accessible name comes from the crown title alone. On a
 * costume day the peach wears it under the drawn crown, and a sentence a screen
 * reader can find says what it is wearing.
 */
export function EditionCard({ theme, costume = null, onClose }: Props) {
  const crown = crownName(theme);
  const mark = ornament(theme);
  return (
    <div className="edition" role="region" aria-label={crown}>
      {mark.kind === 'peach' ? (
        <>
          <CompletionOrnament
            className="edition__ornament edition__ornament--peach"
            costume={costume}
          />
          <SaysWhatThePeachWears costume={costume} />
        </>
      ) : (
        <p className="edition__ornament" aria-hidden="true">
          {mark.glyph}
        </p>
      )}
      <h2 className="edition__title">{crown}</h2>
      <p className="edition__line">{copy(theme).completionLine}</p>
      <button className="edition__close" onClick={onClose}>
        Keep going
      </button>
    </div>
  );
}
