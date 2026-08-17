import { useEffect, useId, useRef } from 'react';
import type { SourceEntry } from '@/data/types.ts';
import { copy, revealKicker } from '../themeCopy.ts';
import type { Theme } from '../useTheme.ts';

export type QuietCategory = 'set' | 'uncommon' | 'rare' | 'mythic';

type RevealProps = {
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  // Both registers now: the close button speaks the theme's vocabulary, and
  // that button is shared. The kicker below is still crown-only.
  theme: Theme;
} & (
  | {
      register: 'crown';
      word: string;
      entry: SourceEntry | undefined;
    }
  | {
      register: 'quiet';
      word: string;
      category: QuietCategory;
      status: 'loading' | 'ready';
      definition: string | null;
    }
);

const NO_DEFINITION =
  'No definition on hand for this one. It is still a real word you found.';

export function Reveal(props: RevealProps) {
  const { onClose, returnFocusTo } = props;
  const wordId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const capturedRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    capturedRef.current = document.activeElement;
    // The card is its own scroll container and this button sits near its
    // bottom, so a plain focus() would scroll a long entry to the end. Take the
    // focus without the scroll; the effect below owns the position.
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const target =
        returnFocusTo ??
        (capturedRef.current instanceof HTMLElement
          ? capturedRef.current
          : null);
      target?.focus();
    };
  }, [onClose, returnFocusTo]);

  // Every entry opens at its own beginning. Keyed on the word and register
  // because the card can be reused rather than remounted: the two registers
  // render at the same slot with no key, so React keeps the node and the scroll
  // position along with it. Keying on the register as well means the reset does
  // not quietly depend on the caller's guarantee that a quiet word is never the
  // source word. Deliberately not folded into the effect above, whose cleanup
  // returns focus to the opener and would then re-capture the close button as
  // the thing to return to.
  useEffect(() => {
    if (dialogRef.current) dialogRef.current.scrollTop = 0;
  }, [props.word, props.register]);

  const className =
    props.register === 'crown'
      ? 'reveal'
      : `reveal reveal--quiet reveal--${props.category}`;

  return (
    <div
      className="reveal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={wordId}
      >
        {props.register === 'crown' ? (
          <p className="reveal__kicker">{revealKicker(props.theme)}</p>
        ) : null}
        <h2 className="reveal__word" id={wordId}>
          {props.word}
        </h2>
        <div className="reveal__sep" />

        {props.register === 'crown' ? (
          <>
            {props.entry?.definition && (
              <div className="reveal__section">
                <p className="reveal__h">Definition</p>
                <p className="reveal__def">{props.entry.definition}</p>
              </div>
            )}
            {props.entry?.etymology && (
              <div className="reveal__section">
                <p className="reveal__h">Etymology</p>
                <p className="reveal__ety">{props.entry.etymology}</p>
              </div>
            )}
          </>
        ) : (
          <div className="reveal__section">
            {props.status === 'loading' ? (
              <p className="reveal__def reveal__def--loading">Looking it up.</p>
            ) : props.definition !== null ? (
              <p className="reveal__def">{props.definition}</p>
            ) : (
              <p className="reveal__def reveal__def--none">{NO_DEFINITION}</p>
            )}
          </div>
        )}

        <button ref={closeRef} className="reveal__close" onClick={onClose}>
          {copy(props.theme).revealClose}
        </button>
        <p className="reveal__attribution">
          Definition{props.register === 'crown' ? ' and etymology' : ''} from
          Wiktionary, CC BY-SA 4.0.
        </p>
      </div>
    </div>
  );
}
