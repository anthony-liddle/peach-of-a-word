import { useEffect, useId, useRef, useState } from 'react';
import { useFlagList, useFlagsUI } from '@/flags/context.ts';
import { MAX_WAITING } from '@/flags/flags.ts';
import {
  choiceText,
  groupsFor,
  pickerNote,
  pickerTitle,
  shortForm,
  type CardKind,
  type FlagReason,
  type Grade,
} from '@/flags/model.ts';
import type { Theme } from '../useTheme.ts';

/**
 * The flag at the foot of a card's scrolling content, under the credit and
 * never in the pinned way out: the icon alone, 44px to a finger, named "Flag
 * this word". It opens the picker in place, in the card. Once a word is
 * flagged, a line above the icon says what and whether it went, with a way to
 * Your flags, where a flag is taken back.
 *
 * The words are the wording pass's, with Antoine's lines (22 and 23 November).
 */
export function FlagControl({
  word,
  card,
  grade,
  theme,
}: {
  word: string;
  card: CardKind;
  /** A found word's grade. The peach card has none. */
  grade: Grade | null;
  theme: Theme;
}) {
  const ui = useFlagsUI();
  const list = useFlagList(ui?.flags ?? null);
  const [asking, setAsking] = useState(false);
  const [spoken, setSpoken] = useState('');
  const [focusBack, setFocusBack] = useState(false);
  const flagRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const noteId = useId();

  // After the picker closes, the focus goes back to the flag, or, once every
  // reason is used, to the way to Your flags.
  useEffect(() => {
    if (!focusBack) return;
    setFocusBack(false);
    (flagRef.current ?? linkRef.current)?.focus({ preventScroll: true });
  }, [focusBack]);

  if (!ui || !ui.board) return null;
  const { flags, board, mode } = ui;

  const mine = list.filter((f) => f.word === word);
  const groups = groupsFor(card, grade, new Set(mine.map((f) => f.reason)));
  const waiting = mine.some((f) => f.state === 'waiting');

  const pick = async (reason: FlagReason) => {
    setAsking(false);
    await flags.flag({ word, reason, board });
    const made = flags
      .list()
      .find((f) => f.word === word && f.reason === reason);
    setSpoken(
      `Flagged. ${made?.state === 'sent' ? 'Sent.' : 'Waiting to send.'}`,
    );
    setFocusBack(true);
  };

  return (
    <div className="flag">
      {mine.length > 0 && (
        <p className="flag__card-line">
          <span aria-hidden="true">{waiting ? '◷' : '✓'}</span> You flagged
          this: {mine.map((f) => shortForm(f.reason)).join(', ')}.{' '}
          {waiting ? 'Waiting to send.' : 'Sent.'}{' '}
          <button
            ref={linkRef}
            type="button"
            className="flag__link"
            onClick={(e) => ui.openYourFlags(e.currentTarget)}
          >
            Your flags
          </button>
        </p>
      )}
      {groups.length > 0 &&
        !asking &&
        (flags.full() ? (
          <p className="flag__card-line">
            {`${MAX_WAITING} flags are waiting to send. They'll go once you're online.`}
          </p>
        ) : (
          <button
            ref={flagRef}
            type="button"
            className="flag__button"
            aria-label="Flag this word"
            onClick={() => setAsking(true)}
          >
            <FlagIcon />
          </button>
        ))}
      {asking && (
        <div
          className="flag__ask"
          role="group"
          aria-labelledby={titleId}
          aria-describedby={noteId}
        >
          <p className="flag__title" id={titleId}>
            {pickerTitle(word)}
          </p>
          {groups.map((g) => (
            <div className="flag__group" key={g.heading}>
              <p className="flag__heading">{g.heading}</p>
              {g.reasons.map((r) => (
                <button
                  type="button"
                  key={r}
                  className="flag__reason"
                  onClick={() => void pick(r)}
                >
                  {choiceText(r, card, grade, theme)}
                </button>
              ))}
            </div>
          ))}
          <p className="flag__note" id={noteId}>
            {pickerNote(mode)}
          </p>
          <button
            type="button"
            className="flag__cancel"
            onClick={() => {
              setAsking(false);
              setFocusBack(true);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {/* A live region of its own, there from the card's opening so its first
          words are heard. Not role="status": the game's own region keeps that
          role, the one place a find is announced. */}
      <div className="visually-hidden flag__spoken" aria-live="polite">
        {spoken}
      </div>
    </div>
  );
}

/** A pennant on a pole, drawn in the text's colour. */
export function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3.5 1.5v13M3.5 2.5h8.2l-1.9 3 1.9 3H3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
