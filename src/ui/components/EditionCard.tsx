import type { Theme } from '../useTheme.ts';
import { crownName, copy } from '../themeCopy.ts';

interface Props {
  theme: Theme;
  onClose: () => void;
}

/**
 * The completion peak: finding every common word the rack can spell. A sibling
 * to the source-word reveal, but ornamental rather than a definition, and in
 * ink and oxblood (letterpress) or composed with the confetti burst (cute). The
 * title is the theme-skinned crown. Non-blocking on purpose: no backdrop, no
 * focus trap, so play continues. The screen-reader announcement is carried by
 * the live region in Game. Stage 4's personal flourishes attach to the ornament.
 */
export function EditionCard({ theme, onClose }: Props) {
  const crown = crownName(theme);
  return (
    <div className="edition" role="region" aria-label={crown}>
      <p className="edition__ornament" aria-hidden="true">
        ❧
      </p>
      <h2 className="edition__title">{crown}</h2>
      <p className="edition__line">{copy(theme).completionLine}</p>
      <button className="edition__close" onClick={onClose}>
        Keep going
      </button>
    </div>
  );
}
