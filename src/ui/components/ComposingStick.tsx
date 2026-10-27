import { useId } from 'react';
import { messageText, type Glint, type PlayApi } from '../useGame.ts';
import { useTheme } from '../useTheme.ts';
import { copy } from '../themeCopy.ts';
import { Mark } from './Mark.tsx';

/**
 * The stick: the letters placed so far, in order, **and the feedback message**.
 *
 * **Three states, one slot, and the composed word wins.** Letters if there are
 * letters, otherwise the message, otherwise the placeholder. The well is the
 * composing surface and a slot holds one thing, so the only question is which
 * thing, and the answer is what the player is doing now rather than what they
 * did last. This is the app's arrangement, brought across on request.
 *
 * That is why the reducer clears `message` when a tile lands. Leaving the value
 * set and merely hiding it here looks equivalent and is not: deleting back to an
 * empty stick would bring a stale rejection back. See `ADD_TILE`.
 *
 * **What this costs.** The message used to have a row of its own below the
 * controls, and it survived there while composing, so a rejection could still be
 * read while retyping. It cannot now. That affordance is the price of the app's
 * placement, and it is the reason the app's own notes declined to port this
 * behaviour to the web in the first place.
 *
 * `aria-hidden` carries over from that row unchanged. The message is already
 * spoken by the live region at the moment it lands, and hearing every rejection
 * twice, once when it happens and again on the next swipe, is exactly what the
 * old row's `aria-hidden` was avoiding.
 *
 * The height is fixed at every state, so the rack cannot shift when the first
 * letter lands. That was already true of this element and it stays true: the
 * message is clamped rather than allowed to grow the well, because a well that
 * grows breaks the one promise the whole arrangement rests on.
 *
 * **An Uncommon, Rare or Mythic find leads with its rarity's mark,** the found
 * list's own, in the active theme's drawing: `❖ tel, 5 points`. Beside the
 * text rather than inside it, so it stays with the word when the line wraps,
 * and outside the clamp's `overflow: hidden`, which would cut the Mythic
 * glint's halo. The app's well is built the same way.
 *
 * **A Mythic find's mark glints with the list's,** and only on the line of the
 * find that set the glint. `Game` keeps the glint a moment past its sweep, and
 * a Rare find made inside that moment draws its own mark here, freshly, which a
 * glint passed on whole would play over.
 *
 * **A find's line opens that word's card,** the one its chip in the found list
 * opens, through the same `onWordTap`: the quiet card, or the crown's reveal
 * for the source word. The line is a button only while it reports a find; the
 * placeholder, a rejection and the letters being composed are not buttons at
 * all. The button is laid over the well rather than in its flow, so the whole
 * well is the target and the well's fixed height is untouched. Spans rather
 * than a paragraph inside it, since a button holds phrasing content only.
 *
 * **To a screen reader it is a real button only while it shows a find,**
 * named by what the live region said ("Mythic find: tel, 5 points") and
 * hinted as a chip is. Its own text stays hidden, so the name alone speaks for
 * it, and nothing moves focus to it: the find is still heard once, from the
 * live region, as it lands. Enter on it is its own, which the page's Enter,
 * the one that submits a word, would otherwise take: the line is gone the
 * moment a letter is placed, so there is never a word for it to submit.
 */
export function ComposingStick({
  game,
  glint = null,
  onWordTap,
}: {
  game: PlayApi;
  /** A Mythic find to glint, from `Game`: null whenever nothing should. */
  glint?: Glint | null;
  /** What a tap on a find's line does, which is what a tap on its chip does. */
  onWordTap?: (word: string, trigger: HTMLElement) => void;
}) {
  const { state, composedWord } = game;
  const [theme] = useTheme();
  const hintId = useId();
  const empty = composedWord.length === 0;
  const body = state.message?.body;
  const glintSeq =
    body?.kind === 'find' &&
    body.line.mark === 'mythic' &&
    glint?.word === body.word
      ? glint.seq
      : null;
  // The find the line reports, whose card a tap on it opens. Null for the
  // placeholder, a rejection, and a word being composed.
  const opens =
    empty && (body?.kind === 'find' || body?.kind === 'source-found')
      ? body.word
      : null;
  const line =
    state.message &&
    (body?.kind === 'find' && body.line.mark ? (
      <span className="message__line" aria-hidden="true">
        <Mark category={body.line.mark} costume={null} glint={glintSeq} />
        <span className="message">{messageText(state.message, theme)}</span>
      </span>
    ) : (
      <span className="message" aria-hidden="true">
        {messageText(state.message, theme)}
      </span>
    ));
  return (
    <div className="stick" data-tone={state.message?.tone ?? 'info'}>
      {!empty ? (
        [...composedWord].map((letter, i) => (
          <span className="stick__slot" key={i}>
            {letter}
          </span>
        ))
      ) : opens && onWordTap ? (
        <button
          type="button"
          className="stick__open"
          aria-label={
            body?.kind === 'find'
              ? body.line.name
              : messageText(state.message!, theme)
          }
          aria-describedby={hintId}
          onClick={(e) => {
            // Safari does not focus a button on click; the card returns
            // focus here when it closes, as it does to a chip.
            e.currentTarget.focus();
            onWordTap(opens, e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation();
          }}
        >
          {line}
          <span id={hintId} hidden>
            Shows the definition
          </span>
        </button>
      ) : (
        (line ?? (
          <span className="stick__empty">{copy(theme).inputPlaceholder}</span>
        ))
      )}
    </div>
  );
}
