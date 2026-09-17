import type { PlayApi } from '../useGame.ts';
import { useTheme } from '../useTheme.ts';
import { copy } from '../themeCopy.ts';

/**
 * Two clusters, grouped by what each action does:
 *
 *   Shuffle   Submit
 *   Clear     Delete
 *
 * **This replaced a grouping by frequency, and both groupings are Bea's.** The
 * clusters used to be the utility pair (Shuffle, Clear), quiet and set apart,
 * and the primary pair (Delete, then Submit), prominent and in thumb reach.
 * Delete came before Submit because she said delete was one of the most-used
 * buttons and was in the wrong place.
 *
 * She then asked for this arrangement, on 2026-08-27: Delete and Clear are both
 * undo, so they belong together. Delete sits on the right of that pair, being
 * the more used of the two, and the undo pair sits after the pair carrying
 * Submit, because Submit is the most obvious action on the screen. The axis
 * changed rather than the taste, from how often you press a thing to what
 * pressing it does.
 *
 * A consequence worth having: the DOM order is now the visual order. The old
 * arrangement put the utility pair first in the DOM and used `order: -1` in the
 * narrow layout to lift the primary pair above it, so a keyboard tabbed
 * Shuffle, Clear, Delete, Submit through a screen that read Delete, Submit,
 * Shuffle, Clear. That hack is gone with the regrouping rather than by being
 * fixed separately.
 *
 * One shared structure drives both themes: the skin changes with the theme, the
 * layout never does, so the two rows break at exactly the same widths.
 */
export function Controls({ game }: { game: PlayApi }) {
  const [theme] = useTheme();
  const { composedWord } = game;
  const empty = composedWord.length === 0;
  return (
    <div className="controls">
      <div className="controls__group controls__group--primary">
        <button className="btn btn--utility" onClick={game.shuffle}>
          Shuffle
        </button>
        <button
          className="btn btn--primary"
          onClick={game.submit}
          disabled={composedWord.length < 3}
        >
          {copy(theme).submitWord}
        </button>
      </div>
      <div className="controls__group controls__group--undo">
        <button
          className="btn btn--utility"
          onClick={game.clear}
          disabled={empty}
        >
          Clear
        </button>
        <button
          className="btn btn--delete"
          onClick={game.removeLast}
          disabled={empty}
          aria-label="Delete last letter"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
