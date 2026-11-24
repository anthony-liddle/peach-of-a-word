import { useEffect, useId, useRef } from 'react';
import {
  SUGGEST_CANCEL,
  SUGGEST_SEND,
  suggestQuestion,
} from '@/flags/model.ts';

/**
 * The refused word's popup: the flag at the well's edge asks first, so a word
 * is never suggested by a stray tap (Antoine, 21 November). Only Suggest
 * makes the flag; Cancel, Escape and a tap outside send nothing.
 *
 * Cancel holds the focus as it opens, so a habitual Enter cancels rather than
 * sends. The page's keys stand down while it's open (`Game` tells
 * `useGlobalKeys`), as they do for the other dialogs, so a letter typed now
 * never lands in the well behind it. The quiet card's skin, with Your flags'
 * focus trap; the caller decides where the focus goes after.
 *
 * The words are the wording pass's (22 November).
 */
export function SuggestAsk({
  word,
  onSuggest,
  onCancel,
}: {
  word: string;
  onSuggest: () => void;
  onCancel: () => void;
}) {
  const askRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const questionId = useId();

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const buttons = askRef.current?.querySelectorAll<HTMLElement>('button');
    if (!buttons || buttons.length === 0) return;
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="reveal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={askRef}
        className="reveal reveal--quiet suggest-ask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={questionId}
        onKeyDown={onKeyDown}
      >
        <p className="suggest-ask__question" id={questionId}>
          {suggestQuestion(word)}
        </p>
        <div className="suggest-ask__buttons">
          <button
            ref={cancelRef}
            type="button"
            className="suggest-ask__cancel"
            onClick={onCancel}
          >
            {SUGGEST_CANCEL}
          </button>
          <button
            type="button"
            className="suggest-ask__send"
            onClick={onSuggest}
          >
            {SUGGEST_SEND}
          </button>
        </div>
      </div>
    </div>
  );
}
