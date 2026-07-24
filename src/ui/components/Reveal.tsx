import { useEffect, useId, useRef } from 'react';
import type { SourceEntry } from '@/data/types.ts';
import { revealKicker } from '../tierNames.ts';
import type { Theme } from '../useTheme.ts';

export type QuietCategory = 'set' | 'uncommon' | 'rare' | 'mythic';

type RevealProps = {
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
} &
  // The theme rides with the crown alone: it skins the kicker, which the quiet
  // register does not have. The quiet card takes its accent from the category.
  (
    | {
        register: 'crown';
        theme: Theme;
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

  useEffect(() => {
    capturedRef.current = document.activeElement;
    closeRef.current?.focus();
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
          Back to the case
        </button>
        <p className="reveal__attribution">
          Definition{props.register === 'crown' ? ' and etymology' : ''} from
          Wiktionary, CC BY-SA 4.0.
        </p>
      </div>
    </div>
  );
}
